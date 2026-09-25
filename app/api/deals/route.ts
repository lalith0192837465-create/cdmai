import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deals = await prisma.deal.findMany({
      where: { createdBy: (session.user as any).id },
      orderBy: { createdAt: "desc" },
    });
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
    const { zoomUrl, zoomMeetingId } = body;

    if (!zoomUrl) {
      return NextResponse.json({ error: "zoomUrl is required" }, { status: 400 });
    }

    const deal = await prisma.deal.create({
      data: {
        zoomUrl,
        zoomMeetingId: zoomMeetingId || null,
        customerName: "Pending extraction",
        createdBy: (session.user as any).id,
        extractionStatus: "pending",
        confirmationStatus: "pending",
      },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    console.error("Failed to create deal:", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
