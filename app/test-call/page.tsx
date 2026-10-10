"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const meetingUrl = "https://meet.google.com/ckx-kdzc-rdi";
const activeTokenKey = "cdm:test-call:active-token";
const requestTokenKey = "cdm:test-call:request-token";
function createRequestToken() { const bytes = new Uint8Array(32); window.crypto.getRandomValues(bytes); return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const useful = (items: unknown) => Array.isArray(items) ? items.map(clean).filter((x) => x && !/^(none|n\/?a|not mentioned|not specified|no issues|no risks|no next steps|unknown|unclear)[.! ]*$/i.test(x)) : [];

export default function TestCallPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState("");
  const started = useRef(false);
  const starting = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const queryToken = new URLSearchParams(location.search).get("token");
    const savedToken = queryToken || window.localStorage.getItem(activeTokenKey);
    if (savedToken) {
      void resumeTest(savedToken, !queryToken);
    } else {
      void startTest();
    }
  }, []);

  async function resumeTest(savedToken: string, fromStorage: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/test-call?token=${encodeURIComponent(savedToken)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setToken(savedToken);
        setData(j);
        window.localStorage.setItem(activeTokenKey, savedToken);
        if (location.search !== `?token=${encodeURIComponent(savedToken)}`) {
          history.replaceState(null, "", `/test-call?token=${encodeURIComponent(savedToken)}`);
        }
        return;
      }
      if (r.status !== 404) {
        setError(j.error || "Could not reconnect to your existing test. Please try again.");
        return;
      }
      window.localStorage.removeItem(activeTokenKey);
      if (fromStorage && !queryTokenPresent()) void startTest();
      else setError(j.error || "This test link has expired. Start a new test to continue.");
    } catch {
      setError("Could not reconnect to your existing test. Check your connection and refresh this page.");
    } finally { setBusy(false); }
  }

  function queryTokenPresent() {
    return Boolean(new URLSearchParams(location.search).get("token"));
  }

  useEffect(() => {
    if (!token || data?.status === "complete" || data?.status === "failed") return;
    const id = setInterval(() => fetch(`/api/test-call?token=${encodeURIComponent(token)}`).then((r) => r.json()).then(setData).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [token, data?.status]);

  async function startTest() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    const requestToken = window.localStorage.getItem(requestTokenKey) || createRequestToken();
    window.localStorage.setItem(requestTokenKey, requestToken);
    try {
      const r = await fetch("/api/test-call", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl, accessToken: requestToken }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || `Could not start the test (HTTP ${r.status})`); return; }
      setToken(j.token || requestToken);
      window.localStorage.setItem(activeTokenKey, j.token || requestToken);
      history.replaceState(null, "", `/test-call?token=${encodeURIComponent(j.token || requestToken)}`);
      setData(j);
    } catch {
      // Keep this request token: retrying the POST is idempotent and cannot create another bot.
      setError("Could not reach CDM. Check your connection and retry safely.");
    } finally { setBusy(false); starting.current = false; }
  }

  function startAnotherTest() {
    window.localStorage.removeItem(activeTokenKey);
    window.localStorage.removeItem(requestTokenKey);
    setToken("");
    setData(null);
    setError("");
    history.replaceState(null, "", "/test-call");
    void startTest();
  }

  const report = data?.report;
  const teamNotes = report?.teamNotes || {};
  const sections = [
    ["Engineering", useful(teamNotes.engineering)],
    ["Finance", useful(teamNotes.finance)],
    ["Legal", useful(teamNotes.legal)],
  ].filter(([, items]) => (items as string[]).length > 0) as [string, string[]][];
  const keyTerms = useful(report?.keyTerms);
  const risks = useful(report?.risks);
  const nextSteps = useful(report?.nextSteps);

  function openGmailDraft() {
    if (!recipient.trim()) return;
    const lines = [
      `CDM test-call report${report?.customerName ? ` — ${report.customerName}` : ""}`,
      "",
      clean(report?.summary) ? `SUMMARY\n${clean(report.summary)}` : "",
      report?.closedWon === true ? "Deal outcome: Closed won" : report?.closedWon === false ? "Deal outcome: Not identified as closed won" : "",
      keyTerms.length ? `KEY TERMS\n${keyTerms.map((x: string) => `• ${x}`).join("\n")}` : "",
      nextSteps.length ? `NEXT STEPS\n${nextSteps.map((x: string) => `• ${x}`).join("\n")}` : "",
      risks.length ? `RISKS / OPEN QUESTIONS\n${risks.map((x: string) => `• ${x}`).join("\n")}` : "",
      ...sections.map(([team, items]) => `${team.toUpperCase()}\n${items.map((x) => `• ${x}`).join("\n")}`),
      "", "Prepared by CDM from the test-call transcript. Please verify before acting.",
    ].filter(Boolean).join("\n\n");
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient.trim())}&su=${encodeURIComponent(`CDM test-call report${report?.customerName ? ` — ${report.customerName}` : ""}`)}&body=${encodeURIComponent(lines)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return <main style={styles.page}>
    <header style={styles.top}><a href="/" style={styles.brand}>CDM</a><span style={styles.pill}>10-MINUTE PRODUCT TEST</span></header>
    {!report ? <section style={styles.waitCard}>
      <div style={styles.orbit}><span>CDM</span></div>
      <p style={styles.eyebrow}>{error ? "NEEDS ATTENTION" : data?.status === "failed" ? "TEST COULD NOT START" : "PLEASE WAIT"}</p>
      <h1 style={styles.title}>{error || data?.status === "failed" ? "We couldn’t start your test" : data?.status === "complete" ? "Preparing your report" : "We’re starting your test"}</h1>
      <p style={styles.sub}>{error || data?.error || (busy || !token ? "Connecting CDM to the meeting. This usually takes a few seconds." : "Your test is being prepared. This page will update automatically.")}</p>
      {error || data?.status === "failed" ? <button style={styles.button} disabled={busy} onClick={() => { setError(""); void startAnotherTest(); }}>{busy ? "Reconnecting…" : "Try again"}</button> : <div style={styles.steps}><div style={styles.step}><b style={styles.stepNum}>1</b><span>Start the meeting assistant</span></div><div style={styles.step}><b style={styles.stepNum}>2</b><span>Open the Meet link when it appears</span></div><div style={styles.step}><b style={styles.stepNum}>3</b><span>Finish the call to get your report</span></div></div>}
      {data?.status === "waiting" && <a href={meetingUrl} target="_blank" rel="noreferrer" style={styles.buttonLink}>Open Google Meet</a>}
      <p style={styles.fine}>The test is presented as 10 minutes. The assistant can remain connected for up to 60 minutes; leave the meeting when you’re done.</p>
    </section> : <>
      <section className="screen-only" style={styles.reportHead}>
        <div><p style={styles.eyebrow}>CDM · CALL INTELLIGENCE</p><h1 style={styles.title}>Call report</h1><p style={styles.sub}>{report.customerName || "Google Meet test"} · Generated from the meeting transcript</p></div>
        <button style={styles.printButton} onClick={() => window.print()}>Save as PDF</button>
      </section>
      <article id="report" style={styles.paper}>
        <div style={styles.paperTop}><div><span style={styles.reportBrand}>CDM</span><span style={styles.docLabel}>MEETING BRIEF</span></div><span style={styles.confidential}>CONFIDENTIAL</span></div>
        <h2 style={styles.paperTitle}>{report.customerName ? `${report.customerName} — Call Brief` : "Google Meet — Call Brief"}</h2>
        <div style={styles.metaRow}><span>Prepared by CDM AI</span><span>{report.closedWon === true ? "Closed won" : report.closedWon === false ? "Not marked closed won" : "Outcome not specified"}</span><span>Transcript-based summary</span></div>
        {clean(report.summary) && <section style={styles.reportSection}><h3 style={styles.sectionTitle}>Executive summary</h3><p style={styles.bodyText}>{clean(report.summary)}</p></section>}
        {keyTerms.length > 0 && <section style={styles.reportSection}><h3 style={styles.sectionTitle}>Agreed terms</h3><ul style={styles.list}>{keyTerms.map((x: string, i: number) => <li style={styles.listItem} key={`${i}-${x}`}>{x}</li>)}</ul></section>}
        {sections.map(([team, items]) => <section style={styles.reportSection} key={team}><h3 style={styles.sectionTitle}>{team} handoff</h3><ul style={styles.list}>{items.map((x, i) => <li style={styles.listItem} key={`${i}-${x}`}>{x}</li>)}</ul></section>)}
        {nextSteps.length > 0 && <section style={styles.reportSection}><h3 style={styles.sectionTitle}>Recommended next steps</h3><ol style={styles.list}>{nextSteps.map((x: string, i: number) => <li style={styles.listItem} key={`${i}-${x}`}>{x}</li>)}</ol></section>}
        {risks.length > 0 && <section style={styles.reportSection}><h3 style={styles.sectionTitle}>Open questions & risks</h3><ul style={styles.list}>{risks.map((x: string, i: number) => <li style={styles.listItem} key={`${i}-${x}`}>{x}</li>)}</ul></section>}
        <footer style={styles.paperFooter}>Generated from the call transcript. AI-extracted details should be checked against the original conversation before decisions are made.</footer>
      </article>
      <section className="screen-only" style={styles.emailCard}>
        <div><p style={styles.eyebrow}>SHARE A TEAM HANDOFF</p><h2 style={styles.emailTitle}>Send to Engineering</h2><p style={styles.emailCopy}>We’ll open a pre-filled Gmail draft with the relevant report details. Review it and click Send in Gmail.</p></div>
        <div style={styles.emailRow}><input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="engineering@company.com" style={styles.emailInput} aria-label="Engineering department email"/><button style={styles.button} disabled={!recipient.trim()} onClick={openGmailDraft}>Compose Gmail</button></div>
        <button style={styles.newTestButton} onClick={startAnotherTest}>Run another test</button>
      </section>
    </>}
    <style>{`@media print { body { background: white !important; } main { max-width: none !important; padding: 0 !important; color: #111 !important; background: white !important; } header, .no-print, .screen-only { display: none !important; } #report { border: 0 !important; box-shadow: none !important; margin: 0 !important; max-width: none !important; padding: 24px 30px !important; } }`}</style>
  </main>;
}

const styles: Record<string, CSSProperties> = {
  page:{minHeight:"100vh",maxWidth:920,margin:"0 auto",padding:"30px 24px 72px",fontFamily:"Inter,ui-sans-serif,system-ui,sans-serif",color:"#f4f4f5",background:"#09090b"},
  top:{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #24242b",paddingBottom:20}, brand:{color:"#fff",fontWeight:800,fontSize:20,textDecoration:"none",letterSpacing:"-.04em"},
  pill:{fontSize:10,letterSpacing:".14em",color:"#b8baff",background:"#17172a",border:"1px solid #303052",borderRadius:99,padding:"8px 12px",fontWeight:700},
  waitCard:{maxWidth:650,margin:"62px auto 0",padding:"42px 38px",background:"linear-gradient(145deg,#15151b,#101014)",border:"1px solid #292930",borderRadius:22,boxShadow:"0 24px 80px #0006"},orbit:{width:56,height:56,borderRadius:18,display:"grid",placeItems:"center",background:"#20213a",color:"#c3c5ff",fontWeight:800,marginBottom:30},
  eyebrow:{fontSize:10,letterSpacing:".16em",fontWeight:800,color:"#9999ac",margin:"0 0 12px"}, title:{fontSize:38,lineHeight:1.12,letterSpacing:"-.045em",margin:"0 0 12px",fontWeight:750}, sub:{color:"#aaaab5",fontSize:15,lineHeight:1.65,margin:"0 0 28px"},
  steps:{display:"grid",gap:12,marginTop:30},step:{display:"flex",alignItems:"center",gap:13,color:"#dedee4",fontSize:14},stepNum:{width:28,height:28,borderRadius:10,display:"grid",placeItems:"center",background:"#23233a",color:"#bfc1ff",fontSize:12},
  fine:{fontSize:12,lineHeight:1.6,color:"#777783",borderTop:"1px solid #292930",paddingTop:18,marginTop:30},button:{border:0,borderRadius:10,padding:"13px 18px",background:"#6969db",color:"white",fontWeight:750,fontSize:14,cursor:"pointer"},buttonLink:{display:"inline-block",marginTop:22,textDecoration:"none",borderRadius:10,padding:"13px 18px",background:"#6969db",color:"white",fontWeight:750,fontSize:14},
  reportHead:{display:"flex",justifyContent:"space-between",alignItems:"end",gap:20,padding:"42px 0 26px"}, printButton:{border:"1px solid #34343d",borderRadius:10,padding:"12px 16px",background:"#17171c",color:"white",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"},
  paper:{maxWidth:800,margin:"0 auto",background:"#fff",color:"#20212a",borderRadius:8,padding:"54px 62px",boxShadow:"0 22px 70px #0007"},paperTop:{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #e6e7eb",paddingBottom:19},reportBrand:{fontSize:18,fontWeight:850,color:"#5557c9",letterSpacing:"-.04em"},docLabel:{fontSize:10,fontWeight:700,letterSpacing:".15em",color:"#858694",marginLeft:14},confidential:{fontSize:9,fontWeight:800,letterSpacing:".12em",color:"#818391"},
  paperTitle:{fontSize:30,letterSpacing:"-.04em",lineHeight:1.2,margin:"32px 0 14px",color:"#1d1f29"},metaRow:{display:"flex",flexWrap:"wrap",gap:"8px 22px",paddingBottom:25,borderBottom:"1px solid #ececf0",fontSize:11,color:"#777986"},reportSection:{marginTop:28},sectionTitle:{fontSize:12,letterSpacing:".06em",textTransform:"uppercase",color:"#5557c9",margin:"0 0 10px",fontWeight:800},bodyText:{fontSize:14,lineHeight:1.8,color:"#363844",margin:0,whiteSpace:"pre-wrap"},list:{paddingLeft:20,margin:"4px 0 0",color:"#363844"},listItem:{fontSize:13,lineHeight:1.7,paddingLeft:3,marginBottom:6},paperFooter:{borderTop:"1px solid #e6e7eb",marginTop:36,paddingTop:16,fontSize:10,lineHeight:1.6,color:"#8a8c98"},
  emailCard:{maxWidth:800,margin:"22px auto 0",padding:24,borderRadius:16,background:"#141419",border:"1px solid #2b2b33"},newTestButton:{marginTop:16,padding:"10px 13px",borderRadius:9,border:"1px solid #34343d",background:"transparent",color:"#d0d0da",fontWeight:650,cursor:"pointer"},emailTitle:{fontSize:20,margin:"0 0 7px",letterSpacing:"-.03em"},emailCopy:{fontSize:13,color:"#a2a2ae",lineHeight:1.6,margin:"0 0 18px"},emailRow:{display:"flex",gap:10},emailInput:{flex:1,minWidth:0,padding:"13px 14px",borderRadius:10,border:"1px solid #34343d",background:"#0e0e12",color:"white",fontSize:14},
};
