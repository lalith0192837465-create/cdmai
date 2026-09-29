import axios from "axios";

export async function generateTestCallReport(transcript: string, customerName?: string | null) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { summary: "Transcript captured successfully. Add ANTHROPIC_API_KEY to generate the AI report.", closedWon: false, keyTerms: [], teamNotes: { finance: [], engineering: [], legal: [] } };
  }
  const response = await axios.post("https://api.anthropic.com/v1/messages", {
    model: "claude-opus-4-6", max_tokens: 1800,
    system: `Create a concise customer-facing report from a ten-minute sales-call transcript. Return ONLY JSON: {"summary":"...","closedWon":false,"customerName":"...","keyTerms":["..."],"risks":["..."],"teamNotes":{"finance":["..."],"engineering":["..."],"legal":["..."]},"nextSteps":["..."]}. Do not invent facts.`,
    messages: [{ role: "user", content: `Customer: ${customerName || "Unknown"}\nTranscript:\n${transcript}` }]
  }, { headers: { Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json", "anthropic-version": "2023-06-01" } });
  const text = response.data.content?.[0]?.text || ""; const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI report was not valid JSON");
  return JSON.parse(match[0]);
}
