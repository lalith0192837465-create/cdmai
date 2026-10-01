import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTranscriptText } from "@/lib/recall";
import { extractDealFromTranscript } from "@/lib/anthropic";
import { notifyFinance, notifyEngineering, notifyLegal } from "@/lib/slack";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const bot_id = payload.bot_id || payload.bot?.id || payload.data?.bot_id || payload.data?.bot?.id;
    const status = payload.status || payload.event || payload.data?.status || payload.data?.status?.code;

    if (!bot_id) {
      return NextResponse.json({ error: "Missing bot_id" }, { status: 400 });
    }

    await prisma.recallWebhookLog.create({
      data: { botId: bot_id, status, payload: JSON.stringify(payload) },
    });

    if (!(["done", "completed", "bot.completed", "transcript.completed"].includes(String(status)))) {
      return NextResponse.json({ success: true, status: "waiting" });
    }

    const testCall = await prisma.testCall.findFirst({ where: { recallBotId: bot_id } });
    if (testCall) {
      let transcript = "";
      const directSegments = Array.isArray(payload.transcript) ? payload.transcript : Array.isArray(payload.data?.transcript) ? payload.data.transcript : [];
      if (directSegments.length) transcript = directSegments.map((x: any) => `${x.speaker_name || x.speaker || "Unknown"}: ${x.transcript || x.text || ""}`).join("\n");
      if (!transcript) {
        const { getSkribbyTranscriptText } = await import("@/lib/skribby");
        try { transcript = await getSkribbyTranscriptText(bot_id); } catch { transcript = ""; }
      }
      if (!transcript) {
        await prisma.testCall.update({ where: { id: testCall.id }, data: { status: "failed", error: "No transcript was returned by Skribby" } });
        return NextResponse.json({ success: true, status: "no_transcript" });
      }
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

    const transcript = await getTranscriptText(bot_id);
      if (!transcript) {
        await prisma.testCall.update({ where: { id: testCall.id }, data: { status: "failed", error: "No transcript was returned by Recall.ai" } });
        return NextResponse.json({ success: true, status: "no_transcript" });
      }
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

    const transcript = await getTranscriptText(bot_id);
    if (!transcript) {
      return NextResponse.json({ success: true, status: "no_transcript" });
    }

    const extracted = await extractDealFromTranscript(transcript);
    if (!extracted) {
      return NextResponse.json({ success: true, status: "no_deal_detected" });
    }

    const deal = await prisma.deal.findFirst({ where: { recallBotId: bot_id } });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const updatedDeal = await prisma.deal.update({
      where: { id: deal.id },
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

    await notifyFinance(updatedDeal);
    await notifyEngineering(updatedDeal);
    await notifyLegal(updatedDeal);

    return NextResponse.json({
      success: true,
      status: "deal_extracted_and_notified",
      dealId: updatedDeal.id,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
