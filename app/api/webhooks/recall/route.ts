import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTranscriptText } from "@/lib/recall";
import { extractDealFromTranscript } from "@/lib/anthropic";
import { notifyFinance, notifyEngineering, notifyLegal } from "@/lib/slack";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { bot_id, status } = payload;

    if (!bot_id) {
      return NextResponse.json({ error: "Missing bot_id" }, { status: 400 });
    }

    await prisma.recallWebhookLog.create({
      data: { botId: bot_id, status, payload: JSON.stringify(payload) },
    });

    if (status !== "done") {
      return NextResponse.json({ success: true, status: "waiting" });
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
