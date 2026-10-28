import Link from "next/link";
import DownloadButtons from "./components/DownloadButtons";

export default async function Home() {
  return (
    <div>
      <nav className="nav">
        <div className="wrap nav-inner">
          <div className="brand">
            <span className="dot" />
            CDM
          </div>
          <div className="navlinks">
            <a href="#byoc">Self-host</a>
            <Link href="/auth/signin">Sign In</Link>
          </div>
        </div>
      </nav>

      <div className="wrap">
        <section className="hero">
          <h1>Deal coordination, without the handoff</h1>
          <p>
            CDM listens to your Google Meet, Zoom, and Microsoft Teams sales calls, extracts the terms that matter,
            and sends ready-to-act emails straight to Finance, Engineering, and Legal — with one human confirmation
            before anything goes out.
          </p>
          <div className="cta-row">
            <Link href="/test-call" className="btn btn-primary">
              Run the 10-minute test →
            </Link>
            <a href="#byoc" className="btn btn-ghost">
              Self-host it
            </a>
          </div>
        </section>
      </div>

      <section className="section">
        <div className="wrap">
          <h2>How it works</h2>
          <p className="lede">Four steps, one human in the loop.</p>
          <div className="grid-4">
            {[
              { num: "01", title: "Listen", desc: "CDM joins your Google Meet, Zoom, or Microsoft Teams calls" },
              { num: "02", title: "Understand", desc: "AI extracts closed terms for each department" },
              { num: "03", title: "Confirm", desc: "One human reviews and approves the drafts" },
              { num: "04", title: "Send", desc: "Finance, Engineering, and Legal get tailored emails" },
            ].map((step) => (
              <div key={step.num} className="card">
                <p className="num">{step.num}</p>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="byoc">
        <div className="wrap">
          <h2>Run it in your own cloud</h2>
          <p className="lede">
            Choose AWS, Google Cloud, or Azure. The guided setup asks for your own credentials and brings the current CDM stack up without requiring a terminal.
          </p>
          <DownloadButtons />
        </div>
      </section>

      <footer>
        <div className="wrap">CDM — deal coordination without the handoff</div>
      </footer>
    </div>
  );
}
