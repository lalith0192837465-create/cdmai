"use client";

import { useState } from "react";

type DeptKey = "finance" | "engineering" | "legal";

interface DeptDraft {
  to: string;
  subject: string;
  body: string;
}

interface SampleScenario {
  id: string;
  label: string;
  customerName: string;
  dealSummary: string;
  transcriptSnippet: string;
  drafts: Record<DeptKey, DeptDraft>;
}

const SCENARIOS: SampleScenario[] = [
  {
    id: "acme",
    label: "Acme Corp · $240k Enterprise",
    customerName: "Acme Corp",
    dealSummary: "$240,000 total ($80k/yr) · 3-year term · Net-45 · 14-day SSO pilot",
    transcriptSnippet: `"Let's lock in the 3-year agreement at $80k annually with the 10% multi-year discount already baked in. Our CFO needs Net-45 invoicing split quarterly. On the tech side, we need Okta SAML SSO and EU data residency ready for our 14-day pilot starting Monday, plus your standard DPA signed before production cutover."`,
    drafts: {
      finance: {
        to: "finance@yourcompany.com",
        subject: "Invoice Setup: Acme Corp — $80,000/yr (3-Year Term, Net-45)",
        body: `Hi Finance team,

Acme Corp just closed on our call. Please prepare billing with the confirmed terms below:

• Customer: Acme Corp
• Contract Value: $240,000 total ($80,000/year — includes 10% multi-year discount)
• Billing Cadence: Quarterly invoices, Net-45 payment terms
• Pilot Window: 14-day pilot begins Monday prior to first invoice trigger

Reply if you need PO contact details before issuing the initial schedule.`,
      },
      engineering: {
        to: "engineering@yourcompany.com",
        subject: "Provisioning Needed by Monday: Acme Corp (Okta SSO + EU Residency)",
        body: `Hi Engineering team,

Acme Corp signed off to kick off their 14-day production pilot this Monday. Technical commitments from the call:

• Tenant Region: EU data residency required
• Authentication: Configure Okta SAML 2.0 SSO with their IT lead
• Timeline: Sandbox + SSO ready before Monday 9:00 AM

No custom feature builds were promised outside standard enterprise tier.`,
      },
      legal: {
        to: "legal@yourcompany.com",
        subject: "DPA & Net-45 Addendum Review: Acme Corp (3-Year MSA)",
        body: `Hi Legal team,

Please send out the final paperwork for Acme Corp based on the terms agreed on today's call:

• Term: 36-month Enterprise MSA ($80,000/yr)
• Payment Clause: Update standard Net-30 to Net-45 quarterly billing
• Compliance: Attach standard EU Data Processing Addendum (DPA) — must execute prior to production cutover after their 14-day pilot.`,
      },
    },
  },
  {
    id: "northstar",
    label: "Northstar Health · $96k + BAA",
    customerName: "Northstar Health",
    dealSummary: "$96,000 / yr · Annual upfront · HIPAA BAA + Epic webhook",
    transcriptSnippet: `"We're good to move forward at $96,000 for the 12-month plan paid upfront. Before our clinical ops team logs in on the 1st, Legal has to countersign your HIPAA BAA, and we'll need your team to enable the audit-log export webhook into our security SIEM."`,
    drafts: {
      finance: {
        to: "finance@yourcompany.com",
        subject: "Upfront Annual Invoice: Northstar Health — $96,000",
        body: `Hi Finance team,

Northstar Health confirmed their annual agreement today:

• Customer: Northstar Health
• Amount: $96,000/year, billed 100% upfront (Net-30)
• Discount: None
• Target Start Date: 1st of next month`,
      },
      engineering: {
        to: "engineering@yourcompany.com",
        subject: "Tenant + SIEM Audit Webhook Setup: Northstar Health",
        body: `Hi Engineering team,

Northstar Health goes live on the 1st. Action items from the call:

• Provision HIPAA-isolated production workspace
• Enable real-time audit-log export webhook for their security SIEM
• Hold production data ingestion until Legal confirms BAA countersignature`,
      },
      legal: {
        to: "legal@yourcompany.com",
        subject: "HIPAA BAA Countersignature Needed: Northstar Health",
        body: `Hi Legal team,

Northstar Health approved the $96k annual order. One blocker before go-live on the 1st:

• Execute standard HIPAA Business Associate Agreement (BAA) alongside the 12-month order form
• No custom liability cap changes requested`,
      },
    },
  },
];

const DEPT_META: { key: DeptKey; title: string; role: string }[] = [
  { key: "finance", title: "Finance", role: "Billing, discounts & payment terms" },
  { key: "engineering", title: "Engineering", role: "Provisioning, SSO & technical SLAs" },
  { key: "legal", title: "Legal", role: "MSA terms, DPA/BAA & redlines" },
];

export default function DepartmentEmailDemo() {
  const [selectedId, setSelectedId] = useState<string>(SCENARIOS[0].id);
  const [activeDept, setActiveDept] = useState<DeptKey>("finance");
  const [customerName, setCustomerName] = useState<string>(SCENARIOS[0].customerName);
  const [dealSummary, setDealSummary] = useState<string>(SCENARIOS[0].dealSummary);
  const [transcript, setTranscript] = useState<string>(SCENARIOS[0].transcriptSnippet);
  const [drafts, setDrafts] = useState<Record<DeptKey, DeptDraft>>(SCENARIOS[0].drafts);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [sentDepts, setSentDepts] = useState<Record<DeptKey, boolean>>({
    finance: false,
    engineering: false,
    legal: false,
  });
  const [customMode, setCustomMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  function selectScenario(s: SampleScenario) {
    setCustomMode(false);
    setGenError(null);
    setSelectedId(s.id);
    setCustomerName(s.customerName);
    setDealSummary(s.dealSummary);
    setTranscript(s.transcriptSnippet);
    setDrafts({
      finance: { ...s.drafts.finance },
      engineering: { ...s.drafts.engineering },
      legal: { ...s.drafts.legal },
    });
    setSentAt(null);
    setSentDepts({ finance: false, engineering: false, legal: false });
  }

  function updateDraft(dept: DeptKey, field: keyof DeptDraft, value: string) {
    setSentAt(null);
    setDrafts((prev) => ({
      ...prev,
      [dept]: { ...prev[dept], [field]: value },
    }));
  }

  async function handleGenerateFromCustom() {
    setGenError(null);
    setGenerating(true);
    setSentAt(null);
    try {
      const res = await fetch("/api/demo/draft-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.draft) {
        throw new Error(data?.error || "Could not extract department emails.");
      }
      const d = data.draft;
      setCustomerName(d.customerName || "Custom Deal");
      setDealSummary(d.dealSummary || "Extracted from call notes");
      setDrafts((prev) => ({
        finance: {
          to: prev.finance.to,
          subject: d.finance?.subject || `Billing Setup — ${d.customerName || "New Deal"}`,
          body: d.finance?.body || "",
        },
        engineering: {
          to: prev.engineering.to,
          subject: d.engineering?.subject || `Provisioning — ${d.customerName || "New Deal"}`,
          body: d.engineering?.body || "",
        },
        legal: {
          to: prev.legal.to,
          subject: d.legal?.subject || `Legal Review — ${d.customerName || "New Deal"}`,
          body: d.legal?.body || "",
        },
      }));
    } catch (err: any) {
      setGenError(err?.message || "Failed to generate emails.");
    } finally {
      setGenerating(false);
    }
  }

  function handleSendAll() {
    const missingRecipient = DEPT_META.find((d) => !drafts[d.key].to.trim().includes("@"));
    if (missingRecipient) {
      setActiveDept(missingRecipient.key);
      setGenError(`Enter a valid ${missingRecipient.title} email address before sending.`);
      return;
    }
    setGenError(null);
    setSentDepts({ finance: true, engineering: true, legal: true });
    setSentAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }

  function buildGmailComposeUrl(d: DeptDraft) {
    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: d.to.trim(),
      su: d.subject,
      body: d.body,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  const current = drafts[activeDept];

  return (
    <div className="demo-shell">
      <div className="demo-toolbar">
        <div className="demo-tabs" role="tablist" aria-label="Sample calls">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectScenario(s)}
              className={`demo-tab${!customMode && selectedId === s.id ? " active" : ""}`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomMode(true);
              setSentAt(null);
              setGenError(null);
            }}
            className={`demo-tab${customMode ? " active" : ""}`}
          >
            Paste your own call notes
          </button>
        </div>
        <div className="demo-speed-stat">
          3 department handoffs in 15 sec · saves ~45 min per closed call
        </div>
      </div>

      <div className="demo-grid">
        {/* Left column: Call source + extracted deal summary */}
        <div className="demo-source">
          <div className="demo-kicker">1. Captured from Google Meet, Zoom, or Teams call</div>
          <h3 className="demo-deal-title">{customerName}</h3>
          <p className="demo-deal-meta">{dealSummary}</p>

          {customMode ? (
            <div style={{ marginTop: "14px" }}>
              <label className="demo-label" htmlFor="customTranscript">
                Paste rough sales call transcript or closing notes
              </label>
              <textarea
                id="customTranscript"
                className="demo-textarea"
                rows={7}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Example: Closed Globex at $60k/yr for 2 years, Net-60 billing, needs SOC2 report + custom SSO by May 15..."
              />
              <button
                type="button"
                onClick={handleGenerateFromCustom}
                disabled={generating}
                className="btn btn-primary"
                style={{ marginTop: "12px", width: "100%", justifyContent: "center" }}
              >
                {generating ? "Drafting 3 department emails..." : "Draft Finance, Engineering & Legal emails"}
              </button>
            </div>
          ) : (
            <div className="demo-quote">{transcript}</div>
          )}

          <div className="demo-routing-list">
            <div className="demo-kicker" style={{ marginBottom: "10px" }}>
              2. Routed recipients
            </div>
            {DEPT_META.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setActiveDept(d.key)}
                className={`demo-dept-row${activeDept === d.key ? " active" : ""}`}
              >
                <div>
                  <div className="demo-dept-name">{d.title}</div>
                  <div className="demo-dept-email">{drafts[d.key].to}</div>
                </div>
                <span className="demo-dept-state">
                  {sentDepts[d.key] ? "Sent ✓" : "Ready"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right column: Department email preview + 1-click approve & send */}
        <div className="demo-composer">
          <div className="demo-dept-switcher">
            {DEPT_META.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setActiveDept(d.key)}
                className={`demo-dept-tab${activeDept === d.key ? " active" : ""}`}
              >
                <span>{d.title} email</span>
                <small>{d.role}</small>
              </button>
            ))}
          </div>

          <div className="demo-email-fields">
            <div className="demo-field-row">
              <label htmlFor="deptTo">To</label>
              <input
                id="deptTo"
                value={current.to}
                onChange={(e) => updateDraft(activeDept, "to", e.target.value)}
                placeholder={`${activeDept}@yourcompany.com`}
              />
            </div>
            <div className="demo-field-row">
              <label htmlFor="deptSubject">Subject</label>
              <input
                id="deptSubject"
                value={current.subject}
                onChange={(e) => updateDraft(activeDept, "subject", e.target.value)}
              />
            </div>
            <div className="demo-body-wrap">
              <textarea
                aria-label="Email body"
                className="demo-email-body"
                rows={10}
                value={current.body}
                onChange={(e) => updateDraft(activeDept, "body", e.target.value)}
              />
            </div>
          </div>

          {genError && <p className="demo-error">{genError}</p>}

          {sentAt && (
            <div className="demo-sent-banner">
              Confirmed &amp; dispatched at {sentAt} — Finance ({drafts.finance.to}), Engineering ({drafts.engineering.to}), and Legal ({drafts.legal.to}) each received only their specific action items.
            </div>
          )}

          <div className="demo-actions">
            <a
              href={buildGmailComposeUrl(current)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Open {DEPT_META.find((d) => d.key === activeDept)?.title} draft in Gmail ↗
            </a>
            <button type="button" onClick={handleSendAll} className="btn btn-primary">
              {sentAt ? "Sent to all 3 departments ✓" : "Confirm & send all 3 emails →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
