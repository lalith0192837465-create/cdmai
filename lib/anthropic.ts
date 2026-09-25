import axios from "axios";

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

export async function extractDealFromTranscript(
  transcript: string
): Promise<ExtractedDeal | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    return null;
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-opus-4-6",
        max_tokens: 2000,
        system: `You are a deal extraction AI. Analyze sales call transcripts and extract structured deal information.

Return ONLY valid JSON with this structure, nothing else:
{
  "customerName": "company name",
  "dealName": "deal title",
  "dealAmount": 250000,
  "dealTerm": "3 years",
  "discount": 15,
  "trialDays": 30,
  "customRequirements": "any custom terms",
  "financeNotes": ["invoice for $250K annually", "apply 15% discount"],
  "engineeringNotes": ["provision 24/7 support", "custom SSO integration"],
  "legalNotes": ["review SLA terms", "check data residency"],
  "confidence": { "customerName": 99, "dealAmount": 99, "dealTerm": 95, "discount": 87 }
}

Only extract if a deal was clearly closed. If uncertain, return {"uncertain": true}.`,
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
