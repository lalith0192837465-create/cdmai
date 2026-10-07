"use client";
import { useEffect, useState } from "react";

const meetingUrl = "https://meet.google.com/ckx-kdzc-rdi";

export default function TestCallPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("token");
    if (t) { setToken(t); fetch(`/api/test-call?token=${encodeURIComponent(t)}`).then((r) => r.json()).then(setData); }
  }, []);

  useEffect(() => {
    if (!token || data?.status === "complete" || data?.status === "failed") return;
    const id = setInterval(() => fetch(`/api/test-call?token=${encodeURIComponent(token)}`).then((r) => r.json()).then(setData), 5000);
    return () => clearInterval(id);
  }, [token, data?.status]);

  async function start(e: any) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await fetch("/api/test-call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingUrl, customerName: name, contactEmail: email }) });
    const j = await r.json();
    if (!r.ok) setError(j.error || "Could not start test");
    else { setToken(j.token); history.replaceState(null, "", `/test-call?token=${j.token}`); setData(j); }
    setBusy(false);
  }

  const report = data?.report;
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px", fontFamily: "system-ui" }}>
    <a href="/">← CDM</a>
    <h1 style={{ fontSize: 42, marginTop: 40 }}>Run the 10-minute Google Meet test</h1>
    <p style={{ color: "#8F8F98", fontSize: 18 }}>Start the test first. CDM will then show you the Google Meet link to open.</p>
    {!token ? <form onSubmit={start} style={{ display: "grid", gap: 14, marginTop: 30 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name or company (optional)" style={input} />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for follow-up (optional)" style={input} />
      <button disabled={busy} style={button}>{busy ? "Starting…" : "Start test"}</button>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
    </form> : <section style={{ marginTop: 30, background: "#131316", border: "1px solid #26262C", borderRadius: 16, padding: 24 }}>
      <h2>{data?.status === "complete" ? "Your report is ready" : data?.status === "failed" ? "Test could not finish" : "Test started"}</h2>
      {data?.status === "waiting" && <><p style={{ color: "#8F8F98" }}>Now open this Google Meet link, admit CDM if asked, and speak normally. This is still the 10-minute test, but the meeting can run for up to one hour. Leave the meeting when finished.</p><a href={meetingUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#9aa7ff", wordBreak: "break-all" }}>{meetingUrl}</a></>}
      {data?.status === "complete" && <p style={{ color: "#8F8F98" }}>The call was captured and analyzed.</p>}
      {data?.status === "failed" && <p style={{ color: "#f87171" }}>{data.error}</p>}
      {report && <div style={{ marginTop: 24 }}><h3>Summary</h3><p>{report.summary}</p>{report.keyTerms?.length > 0 && <><h3>Key terms</h3><ul>{report.keyTerms.map((x: string) => <li key={x}>{x}</li>)}</ul></>}{report.nextSteps?.length > 0 && <><h3>Suggested next steps</h3><ul>{report.nextSteps.map((x: string) => <li key={x}>{x}</li>)}</ul></>}</div>}
    </section>}
  </main>;
}
const input = { padding: 14, borderRadius: 10, border: "1px solid #26262C", background: "#131316", color: "white", fontSize: 16 } as any;
const button = { padding: 14, border: 0, borderRadius: 10, background: "#5E6AD2", color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer" } as any;
