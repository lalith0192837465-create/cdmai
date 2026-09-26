import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyFinance, notifyEngineering, notifyLegal } from "@/lib/slack";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deal = await prisma.deal.findUnique({ where: { id } });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.createdBy !== (session.user as any).id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const confirmedDeal = await prisma.deal.update({
      where: { id },
      data: {
        confirmationStatus: "confirmed",
        financeStatus: "pending",
        engineeringStatus: "pending",
        legalStatus: "pending",
      },
    });

    await notifyFinance(confirmedDeal);
    await notifyEngineering(confirmedDeal);
    await notifyLegal(confirmedDeal);

    return NextResponse.json({ success: true, deal: confirmedDeal });
  } catch (error) {
    console.error("Failed to confirm deal:", error);
    return NextResponse.json({ error: "Failed to confirm deal" }, { status: 500 });
  }
}
