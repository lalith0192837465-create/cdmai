import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { startSkribbyBot } from "@/lib/skribby";

function webhookUrl(request: NextRequest) {
  const base = process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const secret = process.env.WEBHOOK_SECRET;
  return `${base.replace(/\/$/, "")}/api/webhooks/recall${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
}

export async function POST(request: NextRequest) {
  if (process.env.TEST_CALL_ENABLED === "false") return NextResponse.json({ error: "Test calls are temporarily unavailable" }, { status: 503 });
  // Skip webhook secret validation if not configured for demo purposes
  if (process.env.WEBHOOK_SECRET) {
    if (!process.env.WEBHOOK_SECRET.trim()) {
      return NextResponse.json({ error: "Webhook secret required" }, { status: 400 });
    }
  }
  const body = await request.json().catch(() => ({}));
  const meetingUrl = String(body.meetingUrl || body.zoomUrl || "").trim();
  if (!meetingUrl) return NextResponse.json({ error: "A Google Meet link is required" }, { status: 400 });
  try {
    const u = new URL(meetingUrl);
    if (u.protocol !== "https:" || u.hostname !== "meet.google.com") throw new Error();
  } catch {
    return NextResponse.json({ error: "Enter a valid Google Meet link" }, { status: 400 });
  }
  const accessToken = crypto.randomBytes(24).toString("base64url");
  const testCall = await prisma.testCall.create({ data: { accessToken, zoomUrl: meetingUrl, customerName: body.customerName ? String(body.customerName).slice(0, 120) : null, contactEmail: body.contactEmail ? String(body.contactEmail).slice(0, 200) : null, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
  try {
    const bot = await startSkribbyBot(meetingUrl, webhookUrl(request));
    await prisma.testCall.update({ where: { id: testCall.id }, data: { recallBotId: bot.id, status: "waiting" } });
    return NextResponse.json({ token: accessToken, status: "waiting", botId: bot.id, reportUrl: `/test-call?token=${accessToken}` });
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
    await prisma.testCall.update({
      where: { id: testCall.id },
      data: { status: "failed", error: providerMessage },
    }).catch((dbError) => console.error("Could not save failed test-call status", dbError));
    return NextResponse.json({ error: `Could not start the test: ${providerMessage}` }, { status });
  }
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  let call = await prisma.testCall.findUnique({ where: { accessToken: token } });
  if (!call || call.expiresAt < new Date()) return NextResponse.json({ error: "This test link has expired" }, { status: 404 });

  // Poll the meeting provider as a fallback when a webhook is delayed or missed.
  // This keeps the report on the same page the user is already watching.
  if (call.recallBotId && call.status !== "complete" && call.status !== "failed") {
    try {
      const { getSkribbyBot, getSkribbyTranscriptText } = await import("@/lib/skribby");
      const bot = await getSkribbyBot(String(call.recallBotId));
      const providerStatus = String(bot.status || "").toLowerCase();
      const failureStatuses = ["not_admitted", "failed", "error", "auth_required", "invalid_credentials"];
      const terminal = ["completed", "complete", "finished", "finished_successfully", "stopped", "ended", ...failureStatuses].includes(providerStatus);
      if (terminal) {
        if (failureStatuses.includes(providerStatus)) {
          const errorMessage = providerStatus === "not_admitted"
            ? "CDM was not admitted to the Google Meet"
            : providerStatus === "auth_required" || providerStatus === "invalid_credentials"
              ? "Google Meet requires the host to admit or authorize CDM"
              : `Skribby ended the bot with status: ${providerStatus}`;
          call = await prisma.testCall.update({ where: { id: call.id }, data: { status: "failed", error: errorMessage } });
        } else {
          const transcript = await getSkribbyTranscriptText(String(call.recallBotId));
          if (!transcript.trim()) {
            call = await prisma.testCall.update({ where: { id: call.id }, data: { status: "failed", error: "The meeting ended but no transcript was returned" } });
          } else {
            const { generateTestCallReport } = await import("@/lib/test-report");
            const report = await generateTestCallReport(transcript, call.customerName);
            call = await prisma.testCall.update({ where: { id: call.id }, data: { transcript, report: JSON.stringify(report), status: "complete", error: null } });
          }
        }
      }
    } catch (error) {
      console.error("CDM test status polling failed", error);
    }
  }
  return NextResponse.json({ status: call.status, report: call.report ? JSON.parse(call.report) : null, error: call.error });
}