import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getTranscriptText } from "@/lib/recall";
import { extractDealFromTranscript } from "@/lib/anthropic";
import { notifyFinance, notifyEngineering, notifyLegal } from "@/lib/slack";

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.WEBHOOK_SECRET;
    const suppliedSecret = new URL(request.url).searchParams.get("secret");
    // Validate query-param secret only when provided (test-call flow).
    // If WEBHOOK_SECRET is set but request omits it, allow (Recall.ai production webhooks).
    if (suppliedSecret && (!secret || suppliedSecret.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(secret)))) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }
    const payload = await request.json();
    const bot_id = payload.bot_id || payload.bot?.id || payload.data?.bot_id || payload.data?.bot?.id || payload.data?.id;
    const rawStatus = payload.data?.new_status || payload.new_status || payload.status || payload.event || payload.type || payload.data?.status || payload.data?.status?.code;
    const status = typeof rawStatus === "object" ? (rawStatus.code || rawStatus.name || rawStatus.status || "unknown") : String(rawStatus || "unknown");
    if (!bot_id) return NextResponse.json({ error: "Missing bot_id" }, { status: 400 });
    await prisma.recallWebhookLog.create({ data: { botId: String(bot_id), status: String(status), payload: JSON.stringify(payload) } });
    const normalizedStatus = String(status).toLowerCase().replace(/[ _-]+/g, ".");
    const done = ["done", "finished", "completed", "stopped", "ended", "bot.completed", "bot.finished", "bot.stopped", "transcript.completed"].includes(normalizedStatus);
    const providerFailed = ["not_admitted", "failed", "error", "auth_required", "invalid_credentials"].includes(normalizedStatus);
    if (!done && !providerFailed) return NextResponse.json({ success: true, status: "waiting" });

    const testCall = await prisma.testCall.findFirst({ where: { recallBotId: String(bot_id) } });
    if (testCall) {
      if (testCall.status === "complete" || testCall.status === "failed") return NextResponse.json({ success: true, status: "already_processed" });
      if (providerFailed) {
        const errorMessage = normalizedStatus === "not_admitted"
          ? "CDM was not admitted to the Google Meet"
          : normalizedStatus === "auth_required" || normalizedStatus === "invalid_credentials"
            ? "Google Meet requires the host to admit or authorize CDM"
            : `Skribby ended the bot with status: ${normalizedStatus}`;
        await prisma.testCall.update({ where: { id: testCall.id }, data: { status: "failed", error: errorMessage } });
        return NextResponse.json({ success: true, status: "test_call_failed" });
      }
      let transcript = "";
      const segments = Array.isArray(payload.transcript) ? payload.transcript : Array.isArray(payload.data?.transcript) ? payload.data.transcript : [];
      if (segments.length) transcript = segments.map((x: any) => `${x.speaker_name || x.speaker || "Unknown"}: ${x.transcript || x.text || x.content || ""}`).filter((line: string) => !line.endsWith(": ")).join("\n");
      if (!transcript) { try { const { getSkribbyTranscriptText } = await import("@/lib/skribby"); transcript = await getSkribbyTranscriptText(String(bot_id)); } catch { transcript = ""; } }
      if (!transcript) { await prisma.testCall.update({ where: { id: testCall.id }, data: { status: "failed", error: "No transcript was returned by Skribby" } }); return NextResponse.json({ success: true, status: "no_transcript" }); }
      try {
        const { generateTestCallReport } = await import("@/lib/test-report");
        const report = await generateTestCallReport(transcript, testCall.customerName);
        await prisma.testCall.update({ where: { id: testCall.id }, data: { transcript, report: JSON.stringify(report), status: "complete" } });
        return NextResponse.json({ success: true, status: "test_call_complete" });
      } catch (error) {
        console.error("Test call report error:", error);
        await prisma.testCall.update({ where: { id: testCall.id }, data: { status: "failed", error: "The call was captured but the report could not be generated" } });
        return NextResponse.json({ success: true, status: "report_failed" });
      }
    }

    const transcript = await getTranscriptText(String(bot_id));
    if (!transcript) return NextResponse.json({ success: true, status: "no_transcript" });
    const extracted = await extractDealFromTranscript(transcript);
    if (!extracted) return NextResponse.json({ success: true, status: "no_deal_detected" });
    const deal = await prisma.deal.findFirst({ where: { recallBotId: String(bot_id) } });
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    const updatedDeal = await prisma.deal.update({ where: { id: deal.id }, data: { customerName: extracted.customerName, dealName: extracted.dealName, dealAmount: extracted.dealAmount, dealTerm: extracted.dealTerm, discount: extracted.discount, trialDays: extracted.trialDays, customRequirements: extracted.customRequirements, transcriptUrl: "extracted", extractedTerms: JSON.stringify({ financeNotes: extracted.financeNotes, engineeringNotes: extracted.engineeringNotes, legalNotes: extracted.legalNotes, confidence: extracted.confidence }), extractionStatus: "completed", confirmationStatus: "pending" } });
    await notifyFinance(updatedDeal); await notifyEngineering(updatedDeal); await notifyLegal(updatedDeal);
    return NextResponse.json({ success: true, status: "deal_extracted_and_notified", dealId: updatedDeal.id });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
