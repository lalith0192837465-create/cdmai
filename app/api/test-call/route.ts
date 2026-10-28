import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { detectMeetingPlatform, startSkribbyBot } from "@/lib/skribby";

function webhookUrl(request: NextRequest) {
  const base = process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const secret = process.env.WEBHOOK_SECRET;
  return `${base.replace(/\/$/, "")}/api/webhooks/recall${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
}

export async function POST(request: NextRequest) {
  if (process.env.TEST_CALL_ENABLED === "false") {
    return NextResponse.json({ error: "Test calls are temporarily unavailable" }, { status: 503 });
  }
  if (process.env.WEBHOOK_SECRET && !process.env.WEBHOOK_SECRET.trim()) {
    return NextResponse.json({ error: "Webhook secret required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const rawMeetingUrl = String(body.meetingUrl || body.zoomUrl || "").trim();
  if (!rawMeetingUrl) {
    return NextResponse.json(
      { error: "Paste a Google Meet, Zoom, or Microsoft Teams link" },
      { status: 400 }
    );
  }

  const detected = detectMeetingPlatform(rawMeetingUrl);
  if (!detected) {
    return NextResponse.json(
      {
        error:
          "Enter a valid https:// link for Google Meet (meet.google.com), Zoom (zoom.us), or Microsoft Teams (teams.microsoft.com / teams.live.com).",
      },
      { status: 400 }
    );
  }

  const suppliedToken = String(body.accessToken || "");
  if (suppliedToken && !/^[A-Za-z0-9_-]{32,64}$/.test(suppliedToken)) {
    return NextResponse.json({ error: "Invalid request token" }, { status: 400 });
  }
  const accessToken = suppliedToken || crypto.randomBytes(32).toString("base64url");
  const existing = await prisma.testCall.findUnique({ where: { accessToken } });
  if (existing) {
    if (existing.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This test link has expired. Start a new test." },
        { status: 410 }
      );
    }
    const existingPlatform = detectMeetingPlatform(existing.zoomUrl)?.label || "Meeting";
    return NextResponse.json({
      token: accessToken,
      status: existing.status,
      botId: existing.recallBotId,
      meetingUrl: existing.zoomUrl,
      platform: existingPlatform,
      report: existing.report ? JSON.parse(existing.report) : null,
      error: existing.error,
      reportUrl: `/test-call?token=${accessToken}`,
      resumed: true,
    });
  }

  let testCall;
  try {
    testCall = await prisma.testCall.create({
      data: {
        accessToken,
        zoomUrl: detected.normalizedUrl,
        customerName: body.customerName ? String(body.customerName).slice(0, 120) : null,
        contactEmail: body.contactEmail ? String(body.contactEmail).slice(0, 200) : null,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if ((error as any)?.code === "P2002") {
      const duplicate = await prisma.testCall.findUnique({ where: { accessToken } });
      if (duplicate) {
        return NextResponse.json({
          token: accessToken,
          status: duplicate.status,
          botId: duplicate.recallBotId,
          meetingUrl: duplicate.zoomUrl,
          platform: detectMeetingPlatform(duplicate.zoomUrl)?.label || detected.label,
          report: duplicate.report ? JSON.parse(duplicate.report) : null,
          error: duplicate.error,
          reportUrl: `/test-call?token=${accessToken}`,
          resumed: true,
        });
      }
    }
    throw error;
  }

  try {
    const bot = await startSkribbyBot(detected.normalizedUrl, webhookUrl(request), detected.service);
    await prisma.testCall.update({
      where: { id: testCall.id },
      data: { recallBotId: bot.id, status: "waiting" },
    });
    return NextResponse.json({
      token: accessToken,
      status: "waiting",
      botId: bot.id,
      meetingUrl: detected.normalizedUrl,
      platform: detected.label,
      reportUrl: `/test-call?token=${accessToken}`,
    });
  } catch (error) {
    const providerError = error as any;
    const status = Number(providerError?.response?.status) || 502;
    const providerMessage = String(
      providerError?.response?.data?.message ||
        providerError?.response?.data?.error ||
        providerError?.message ||
        "Skribby rejected the bot request"
    ).slice(0, 300);
    console.error("CDM test meeting creation failed", {
      status,
      providerMessage,
      providerBody: providerError?.response?.data,
    });
    await prisma.testCall
      .update({
        where: { id: testCall.id },
        data: { status: "failed", error: providerMessage },
      })
      .catch((dbError: unknown) => console.error("Could not save failed test-call status", dbError));
    return NextResponse.json(
      { error: `Could not start the ${detected.label} bot: ${providerMessage}` },
      { status }
    );
  }
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  let call = await prisma.testCall.findUnique({ where: { accessToken: token } });
  if (!call || call.expiresAt < new Date()) {
    return NextResponse.json({ error: "This test link has expired" }, { status: 404 });
  }

  const platformLabel = detectMeetingPlatform(call.zoomUrl)?.label || "meeting";

  if (call.recallBotId && call.status !== "complete" && call.status !== "failed") {
    try {
      const { getSkribbyBot, getSkribbyTranscriptText } = await import("@/lib/skribby");
      const bot = await getSkribbyBot(String(call.recallBotId));
      const providerStatus = String(bot.status || "")
        .toLowerCase()
        .replace(/[.\s-]+/g, "_");
      const failureStatuses = [
        "not_admitted",
        "failed",
        "error",
        "auth_required",
        "invalid_credentials",
      ];
      const terminal = [
        "completed",
        "complete",
        "finished",
        "finished_successfully",
        "stopped",
        "ended",
        ...failureStatuses,
      ].includes(providerStatus);

      if (terminal) {
        if (failureStatuses.includes(providerStatus)) {
          const errorMessage =
            providerStatus === "not_admitted"
              ? `CDM Assistant was not admitted from the ${platformLabel} waiting room / lobby.`
              : providerStatus === "auth_required" || providerStatus === "invalid_credentials"
                ? `${platformLabel} blocked guest entry (check passcode in URL or host guest/lobby settings).`
                : `Meeting bot ended with status: ${providerStatus}`;
          call = await prisma.testCall.update({
            where: { id: call.id },
            data: { status: "failed", error: errorMessage },
          });
        } else {
          const transcript = await getSkribbyTranscriptText(String(call.recallBotId));
          if (!transcript.trim()) {
            call = await prisma.testCall.update({
              where: { id: call.id },
              data: {
                status: "failed",
                error: "The meeting ended, but no spoken transcript was captured.",
              },
            });
          } else {
            const { generateTestCallReport } = await import("@/lib/test-report");
            const report = await generateTestCallReport(transcript, call.customerName);
            call = await prisma.testCall.update({
              where: { id: call.id },
              data: {
                transcript,
                report: JSON.stringify(report),
                status: "complete",
                error: null,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error("CDM test status polling failed", error);
    }
  }

  return NextResponse.json({
    status: call.status,
    meetingUrl: call.zoomUrl,
    platform: detectMeetingPlatform(call.zoomUrl)?.label || "Meeting",
    report: call.report ? JSON.parse(call.report) : null,
    error: call.error,
  });
}