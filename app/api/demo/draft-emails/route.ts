import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript = String(body?.transcript || "").trim();
    if (!transcript || transcript.length < 15) {
      return NextResponse.json(
        { error: "Paste at least a sentence or two from a sales call." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI key is not configured on the server." },
        { status: 503 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You extract closed B2B sales call details and draft 3 concise, ready-to-send internal handoff emails for Finance, Engineering, and Legal.
Return ONLY valid JSON with this exact shape:
{
  "customerName": "Company Name",
  "dealSummary": "$120,000 / yr · 2-year term · 10% discount",
  "finance": {
    "subject": "Action Required: Invoice & Billing Setup — Company Name",
    "body": "Plain text email body with concrete billing amount, payment terms, discounts, and start date."
  },
  "engineering": {
    "subject": "Provisioning Handoff — Company Name",
    "body": "Plain text email body with concrete technical setup, integrations, seats, sandbox/trial dates, and SLAs."
  },
  "legal": {
    "subject": "Contract & Compliance Review — Company Name",
    "body": "Plain text email body with concrete contract term, redlines, security/DPA/BAA clauses, or custom commitments."
  }
}
Keep each email crisp, factual, and tailored strictly to that department's work so nobody has to read the whole call transcript.`;

    const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
    let text = "";
    let lastErr: any = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `Draft department handoff emails from this call transcript:\n\n${transcript.slice(0, 20000)}`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            temperature: 0.15,
            abortSignal: AbortSignal.timeout(9000),
          },
        });
        text = response.text || "";
        if (text) break;
      } catch (e: any) {
        lastErr = e;
      }
    }

    if (!text) {
      throw lastErr || new Error("No response from AI.");
    }
    const parsed = JSON.parse(text);
    return NextResponse.json({ ok: true, draft: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not generate department emails." },
      { status: 500 }
    );
  }
}
