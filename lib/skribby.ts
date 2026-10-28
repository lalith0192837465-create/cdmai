import axios from "axios";

const BASE = process.env.SKRIBBY_BASE_URL || "https://platform.skribby.io/api/v1";

export type SkribbyService = "gmeet" | "zoom" | "teams";

export interface DetectedMeeting {
  service: SkribbyService;
  label: "Google Meet" | "Zoom" | "Microsoft Teams";
  normalizedUrl: string;
}

export function detectMeetingPlatform(rawUrl: string): DetectedMeeting | null {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();

  // Google Meet: https://meet.google.com/xxx-xxxx-xxx
  if (host === "meet.google.com" && parsed.pathname.length > 1) {
    return { service: "gmeet", label: "Google Meet", normalizedUrl: parsed.toString() };
  }

  // Zoom: https://zoom.us/j/... or https://us06web.zoom.us/j/... or https://company.zoom.us/w/...
  if (
    (host === "zoom.us" ||
      host.endsWith(".zoom.us") ||
      host === "zoomgov.com" ||
      host.endsWith(".zoomgov.com")) &&
    parsed.pathname.length > 1
  ) {
    return { service: "zoom", label: "Zoom", normalizedUrl: parsed.toString() };
  }

  // Microsoft Teams: https://teams.microsoft.com/l/meetup-join/... or https://teams.live.com/meet/...
  if (
    (host === "teams.microsoft.com" ||
      host.endsWith(".teams.microsoft.com") ||
      host === "teams.live.com" ||
      host === "gov.teams.microsoft.us") &&
    parsed.pathname.length > 1
  ) {
    return { service: "teams", label: "Microsoft Teams", normalizedUrl: parsed.toString() };
  }

  return null;
}

function headers() {
  if (!process.env.SKRIBBY_API_KEY) throw new Error("SKRIBBY_API_KEY is not set");
  return {
    Authorization: `Bearer ${process.env.SKRIBBY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function safeId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid Skribby bot ID");
  return id;
}

export async function startSkribbyBot(
  meetingUrl: string,
  webhookUrl: string,
  explicitService?: SkribbyService
) {
  const detected = detectMeetingPlatform(meetingUrl);
  const service = explicitService || detected?.service;
  if (!service) {
    throw new Error("Unsupported meeting URL. Provide a Google Meet, Zoom, or Microsoft Teams link.");
  }

  const response = await axios.post(
    `${BASE}/bot`,
    {
      transcription_model: "groq/whisper-large-v3-turbo",
      service,
      meeting_url: detected ? detected.normalizedUrl : meetingUrl,
      bot_name: "CDM Assistant", // <= 50 chars so valid across Teams (50), Meet (60), and Zoom (64)
      lang: "en",
      webhook_url: webhookUrl,
      stop_options: {
        time_limit: 60,
        waiting_room_timeout: 10,
        recording_start_timeout: 10,
        empty_meeting_timeout: 10,
        last_person_detection: 2,
      },
    },
    { headers: headers(), timeout: 30000 }
  );

  const bot = response.data?.bot || response.data;
  if (!bot?.id || typeof bot.id !== "string") {
    throw new Error("Skribby accepted the request but did not return a bot ID");
  }
  return bot;
}

export async function getSkribbyBot(botId: string) {
  const response = await axios.get(`${BASE}/bot/${encodeURIComponent(safeId(botId))}`, {
    headers: headers(),
    timeout: 30000,
  });
  return response.data;
}

export async function getSkribbyTranscriptText(botId: string): Promise<string> {
  const bot = await getSkribbyBot(botId);
  const segments = Array.isArray(bot.transcript) ? bot.transcript : [];
  return segments
    .map((segment: any) => {
      const speaker = segment.speaker_name || segment.speaker || "Unknown";
      const text =
        segment.transcript ||
        segment.text ||
        segment.content ||
        (Array.isArray(segment.words)
          ? segment.words.map((word: any) => word.text || "").join(" ")
          : "");
      return text ? `${speaker}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
