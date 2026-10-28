import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { detectMeetingPlatform, startSkribbyBot } from "@/lib/skribby";
import { startBot } from "@/lib/recall";
import { extractDealFromTranscript } from "@/lib/anthropic";

function buildWebhookUrl(request: NextRequest) {
  const base = process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const secret = process.env.WEBHOOK_SECRET;
  return `${base.replace(/\/$/, "")}/api/webhooks/recall${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let deals = await prisma.deal.findMany({
      where: { createdBy: (session.user as any).id },
      orderBy: { createdAt: "desc" },
    });

    // Active polling fallback for pending Skribby bots when webhooks cannot reach private preview environments
    if (process.env.SKRIBBY_API_KEY) {
      const pendingBotDeals = deals.filter(
        (d: any) => d.recallBotId && d.extractionStatus === "pending"
      );
      if (pendingBotDeals.length > 0) {
        const { getSkribbyBot, getSkribbyTranscriptText } = await import("@/lib/skribby");
        let changed = false;
        for (const d of pendingBotDeals) {
          try {
            const bot = await getSkribbyBot(String(d.recallBotId));
            const st = String(bot.status || "")
              .toLowerCase()
              .replace(/[.\s-]+/g, "_");
            if (["completed", "complete", "finished", "finished_successfully", "stopped", "ended"].includes(st)) {
              const transcript = await getSkribbyTranscriptText(String(d.recallBotId));
              if (transcript.trim()) {
                const extracted = await extractDealFromTranscript(transcript);
                if (extracted) {
                  await prisma.deal.update({
                    where: { id: d.id },
                    data: {
                      customerName: extracted.customerName,
                      dealName: extracted.dealName,
                      dealAmount: extracted.dealAmount,
                      dealTerm: extracted.dealTerm,
                      discount: extracted.discount,
                      trialDays: extracted.trialDays,
                      customRequirements: extracted.customRequirements,
                      transcriptUrl: "extracted",
                      extractedTerms: JSON.stringify({
                        financeNotes: extracted.financeNotes,
                        engineeringNotes: extracted.engineeringNotes,
                        legalNotes: extracted.legalNotes,
                        confidence: extracted.confidence,
                      }),
                      extractionStatus: "completed",
                      confirmationStatus: "pending",
                    },
                  });
                  changed = true;
                }
              }
            } else if (["not_admitted", "failed", "error", "auth_required", "invalid_credentials"].includes(st)) {
              await prisma.deal.update({
                where: { id: d.id },
                data: { extractionStatus: "failed" },
              });
              changed = true;
            }
          } catch {
            // Keep pending if transient poll error
          }
        }
        if (changed) {
          deals = await prisma.deal.findMany({
            where: { createdBy: (session.user as any).id },
            orderBy: { createdAt: "desc" },
          });
        }
      }
    }

    return NextResponse.json(deals);
  } catch (error) {
    console.error("Failed to fetch deals:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawMeetingUrl = String(body.meetingUrl || body.zoomUrl || "").trim();
    const zoomMeetingId = body.zoomMeetingId;

    if (!rawMeetingUrl) {
      return NextResponse.json(
        { error: "Paste a Google Meet, Zoom, or Microsoft Teams link." },
        { status: 400 }
      );
    }

    const detected = detectMeetingPlatform(rawMeetingUrl);
    if (!detected) {
      return NextResponse.json(
        {
          error:
            "Use a valid https:// link for Google Meet (meet.google.com), Zoom (zoom.us), or Microsoft Teams (teams.microsoft.com / teams.live.com).",
        },
        { status: 400 }
      );
    }

    if (!process.env.SKRIBBY_API_KEY && !process.env.RECALL_API_KEY) {
      return NextResponse.json(
        {
          error:
            "SKRIBBY_API_KEY is not configured yet. Add your Skribby API key in Settings → Secrets to send bots into live Google Meet, Zoom, or Microsoft Teams calls.",
        },
        { status: 503 }
      );
    }

    let botId: string;
    if (process.env.SKRIBBY_API_KEY) {
      const bot = await startSkribbyBot(
        detected.normalizedUrl,
        buildWebhookUrl(request),
        detected.service
      );
      botId = bot.id;
    } else {
      const bot = await startBot(detected.normalizedUrl);
      botId = bot.id;
    }

    const deal = await prisma.deal.create({
      data: {
        zoomUrl: detected.normalizedUrl,
        zoomMeetingId: zoomMeetingId || null,
        recallBotId: botId,
        customerName: body.customerName
          ? String(body.customerName).trim()
          : `${detected.label} call (listening...)`,
        createdBy: (session.user as any).id,
        extractionStatus: "pending",
        confirmationStatus: "pending",
      },
    });

    return NextResponse.json({ ...deal, platform: detected.label }, { status: 201 });
  } catch (error: any) {
    const providerMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Failed to launch meeting bot";
    console.error("Failed to create deal / launch bot:", providerMessage);
    return NextResponse.json({ error: String(providerMessage) }, { status: 502 });
  }
}
