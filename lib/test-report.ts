import axios from "axios";

export async function generateTestCallReport(transcript: string, customerName?: string | null) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      systemInstruction: { parts: [{ text: `Create a concise customer-facing report from a ten-minute sales-call transcript. Return ONLY valid JSON: {"summary":"...","closedWon":false,"customerName":"...","keyTerms":["..."],"risks":["..."],"teamNotes":{"finance":["..."],"engineering":["..."],"legal":["..."]},"nextSteps":["..."]}. Do not invent facts.` }] },
      contents: [{ role: "user", parts: [{ text: `Customer: ${customerName || "Unknown"}\nTranscript:\n${transcript}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    });
    const text = response.data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    if (!text) throw new Error("Gemini did not return a report");
    return JSON.parse(text);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { summary: "Transcript captured successfully. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to generate the AI report.", closedWon: false, keyTerms: [], teamNotes: { finance: [], engineering: [], legal: [] } };
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
