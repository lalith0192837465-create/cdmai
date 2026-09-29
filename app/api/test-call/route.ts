import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { startBot } from "@/lib/recall";

export async function POST(request: NextRequest) {
  if (process.env.TEST_CALL_ENABLED === "false") return NextResponse.json({ error: "Test calls are temporarily unavailable" }, { status: 503 });
  const body = await request.json().catch(() => ({})); const zoomUrl = String(body.zoomUrl || "");
  try { const u = new URL(zoomUrl); if (u.protocol !== "https:" || !/(zoom\.us|zoom\.com)$/.test(u.hostname)) throw new Error("Use a valid Zoom meeting link"); } catch { return NextResponse.json({ error: "Enter a valid Zoom meeting link" }, { status: 400 }); }
  const accessToken = crypto.randomBytes(24).toString("base64url");
  const testCall = await prisma.testCall.create({ data: { accessToken, zoomUrl, customerName: body.customerName ? String(body.customerName).slice(0,120) : null, contactEmail: body.contactEmail ? String(body.contactEmail).slice(0,200) : null, expiresAt: new Date(Date.now()+60*60*1000) } });
  try { const bot = await startBot(zoomUrl); await prisma.testCall.update({ where: { id: testCall.id }, data: { recallBotId: bot.id, status: "waiting" } }); return NextResponse.json({ token: accessToken, status: "waiting", reportUrl: `/test-call?token=${accessToken}` }); }
  catch (e) { await prisma.testCall.update({ where: { id: testCall.id }, data: { status: "failed", error: "Recall.ai could not join this meeting" } }); return NextResponse.json({ error: "Could not start the test call. Check the meeting link and try again." }, { status: 502 }); }
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token"); if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  const call = await prisma.testCall.findUnique({ where: { accessToken: token } }); if (!call || call.expiresAt < new Date()) return NextResponse.json({ error: "This test link has expired" }, { status: 404 });
  return NextResponse.json({ status: call.status, report: call.report ? JSON.parse(call.report) : null, error: call.error });
}
