import axios from "axios";

const REGION = process.env.RECALL_REGION || "us-west-2";
const BASE = `https://${REGION}.recall.ai/api/v1`;

function authHeader() {
  return { Authorization: `Token ${process.env.RECALL_API_KEY}` };
}

function sanitizeBotId(botId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(botId)) {
    throw new Error("Invalid bot ID format");
  }
  return botId;
}

export async function startBot(meetingUrl: string) {
  if (!process.env.RECALL_API_KEY) {
    throw new Error("RECALL_API_KEY is not set");
  }

  const response = await axios.post(
    `${BASE}/bot/`,
    {
      meeting_url: meetingUrl,
      bot_name: "CDM Notetaker",
      recording_config: {
        transcript: { provider: { meeting_captions: {} } },
      },
    },
    { headers: { ...authHeader(), "Content-Type": "application/json" } }
  );

  return response.data;
}

export async function getBot(botId: string) {
  const safeBotId = sanitizeBotId(botId);
  const response = await axios.get(`${BASE}/bot/${safeBotId}/`, {
    headers: authHeader(),
  });
  return response.data;
}

export async function getTranscriptText(botId: string): Promise<string> {
  try {
    const bot = await getBot(botId);
    const recording = bot.recordings?.[0];
    const transcriptUrl =
      recording?.media_shortcuts?.transcript?.data?.download_url;

    if (!transcriptUrl) return "";

    let parsed: URL;
    try {
      parsed = new URL(transcriptUrl);
    } catch {
      throw new Error("Transcript URL from Recall.ai was not a valid URL");
    }

    const isTrusted =
      parsed.protocol === "https:" &&
      (parsed.hostname === "recall.ai" ||
        parsed.hostname.endsWith(".recall.ai") ||
        parsed.hostname === "recallai-production-bot-data.s3.amazonaws.com");

    if (!isTrusted) {
      throw new Error(
        `Refusing to fetch transcript from untrusted host: ${parsed.hostname}`
      );
    }

    const response = await axios.get(parsed.toString());
    const data = response.data || [];

    return data
      .map(
        (seg: any) =>
          `${seg.participant?.name || "Unknown"}: ${(seg.words || [])
            .map((w: any) => w.text)
            .join(" ")}`
      )
      .join("\n");
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return "";
  }
}
