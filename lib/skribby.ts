import axios from "axios";

const BASE = process.env.SKRIBBY_BASE_URL || "https://platform.skribby.io/api/v1";

function headers() {
  if (!process.env.SKRIBBY_API_KEY) throw new Error("SKRIBBY_API_KEY is not set");
  return { Authorization: `Bearer ${process.env.SKRIBBY_API_KEY}`, "Content-Type": "application/json" };
}

function safeId(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid Skribby bot ID");
  return id;
}

export async function startSkribbyBot(meetingUrl: string, webhookUrl: string) {
  const response = await axios.post(`${BASE}/bot`, {
    transcription_model: "groq/whisper-large-v3-turbo",
    service: "gmeet",
    meeting_url: meetingUrl,
    bot_name: "CDM Test Assistant",
    lang: "en",
    webhook_url: webhookUrl,
    stop_options: {
      time_limit: 60, // Provider safety cap is 60 minutes; the guided product test remains presented as a 10-minute test.
      waiting_room_timeout: 10,
      recording_start_timeout: 10,
      empty_meeting_timeout: 10,
      last_person_detection: 2,
    },
  }, { headers: headers(), timeout: 30000 });
  const bot = response.data?.bot || response.data;
  if (!bot?.id || typeof bot.id !== "string") {
    throw new Error("Skribby accepted the request but did not return a bot ID");
  }
  return bot;
}

export async function getSkribbyBot(botId: string) {
  const response = await axios.get(`${BASE}/bot/${encodeURIComponent(safeId(botId))}`, { headers: headers(), timeout: 30000 });
  return response.data;
}

export async function getSkribbyTranscriptText(botId: string): Promise<string> {
  const bot = await getSkribbyBot(botId);
  const segments = Array.isArray(bot.transcript) ? bot.transcript : [];
  return segments.map((segment: any) => {
    const speaker = segment.speaker_name || segment.speaker || "Unknown";
    const text = segment.transcript || segment.text || segment.content || (Array.isArray(segment.words) ? segment.words.map((word: any) => word.text || "").join(" ") : "");
    return `${speaker}: ${text}`;
  }).filter(Boolean).join("\n");
}
