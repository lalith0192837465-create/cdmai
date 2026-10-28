import axios from "axios";
import { GoogleGenAI } from "@google/genai";

export interface ExtractedDeal {
  customerName: string;
  dealName: string;
  dealAmount: number;
  dealTerm: string;
  discount?: number;
  trialDays?: number;
  customRequirements?: string;
  financeNotes: string[];
  engineeringNotes: string[];
  legalNotes: string[];
  confidence: Record<string, number>;
}

const SYSTEM_PROMPT = `You are a deal extraction AI. Return ONLY valid JSON with customerName, dealName, dealAmount, dealTerm, discount, trialDays, customRequirements, financeNotes, engineeringNotes, legalNotes, confidence. If no clearly closed deal, return {"uncertain":true}.`;

export async function extractDealFromTranscript(
  transcript: string
): Promise<ExtractedDeal | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const models = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
      for (const model of models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: `Extract deal information from this transcript:\n\n${transcript}`,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              responseMimeType: "application/json",
              temperature: 0.1,
              abortSignal: AbortSignal.timeout(15000),
            },
          });
          const text = response.text || "";
          if (!text) continue;
          const parsed = JSON.parse(text);
          if (parsed.uncertain) return null;
          return parsed as ExtractedDeal;
        } catch {
          // Try next model on transient 503
        }
      }
    } catch (error) {
      console.error("Gemini extraction error:", error);
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("GEMINI_API_KEY or ANTHROPIC_API_KEY not set");
    return null;
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-opus-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extract deal information from this transcript:\n\n${transcript}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
      }
    );

    const content = response.data.content?.[0]?.text;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.uncertain) return null;

    return parsed as ExtractedDeal;
  } catch (error) {
    console.error("Anthropic extraction error:", error);
    return null;
  }
}
