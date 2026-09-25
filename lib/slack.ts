import axios from "axios";

function buildMessage(emoji: string, title: string, deal: any, notes: string[], extraFields: any[] = []) {
  return {
    text: `${title}: ${deal.customerName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${emoji} ${title}`, emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Customer:*\n${deal.customerName}` },
          { type: "mrkdwn", text: `*Deal:*\n${deal.dealName || "N/A"}` },
          ...extraFields,
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Tasks:*\n${notes?.map((n) => `• ${n}`).join("\n") || "No notes"}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View in CDM", emoji: true },
            url: `https://trycdm.vercel.app/dashboard`,
          },
        ],
      },
    ],
  };
}

async function send(message: any) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, message);
  } catch (error) {
    console.error("Slack notification failed:", error);
  }
}

export async function notifyFinance(deal: any): Promise<void> {
  const notes = deal.extractedTerms ? JSON.parse(deal.extractedTerms).financeNotes : [];
  await send(
    buildMessage("📄", "Finance Action Required", deal, notes, [
      { type: "mrkdwn", text: `*Amount:*\n$${(deal.dealAmount || 0).toLocaleString()}` },
      { type: "mrkdwn", text: `*Discount:*\n${deal.discount || 0}%` },
    ])
  );
}

export async function notifyEngineering(deal: any): Promise<void> {
  const notes = deal.extractedTerms ? JSON.parse(deal.extractedTerms).engineeringNotes : [];
  await send(buildMessage("⚙️", "Engineering Action Required", deal, notes));
}

export async function notifyLegal(deal: any): Promise<void> {
  const notes = deal.extractedTerms ? JSON.parse(deal.extractedTerms).legalNotes : [];
  await send(
    buildMessage("📋", "Legal Review Required", deal, notes, [
      { type: "mrkdwn", text: `*Amount:*\n$${(deal.dealAmount || 0).toLocaleString()}` },
    ])
  );
}
