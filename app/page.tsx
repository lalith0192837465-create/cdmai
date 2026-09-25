import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import DownloadButtons from "./components/DownloadButtons";

export default async function Home() {
  const session = await getServerSession(authOptions);

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
            <Link href="/demo">Demo</Link>
            {session ? <Link href="/dashboard">Dashboard</Link> : <Link href="/auth/signin">Sign In</Link>}
          </div>
        </div>
      </nav>

      <div className="wrap">
        <section className="hero">
          <span className="hero-badge">Bring your own cloud</span>
          <h1>Deal coordination, without the handoff</h1>
          <p>
            CDM listens to your Zoom sales calls, extracts the terms that matter, and routes the right
            work to Engineering, Finance, and Legal — with one human confirmation before anything fires.
          </p>
          <div className="cta-row">
            <Link href="/demo" className="btn btn-primary">
              Try the demo →
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
              { num: "01", title: "Listen", desc: "CDM joins your Zoom sales calls" },
              { num: "02", title: "Understand", desc: "AI extracts the deal terms" },
              { num: "03", title: "Confirm", desc: "One human approves the action" },
              { num: "04", title: "Route", desc: "Teams get their specific work" },
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
            Download the installer — it checks for Docker, asks a few setup questions, and brings the
            whole stack up on your machine. No terminal required.
          </p>
          <DownloadButtons />
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.85rem", marginTop: "24px" }}>
            Prefer to configure it by hand instead?{" "}
            <a href="https://github.com/lalith0192837465-create/cdm#byoc-deployment-docker-compose" style={{ color: "var(--accent)" }}>
              See the manual Docker Compose steps
            </a>
            .
          </p>
        </div>
      </section>

      <footer>
        <div className="wrap">CDM — deal coordination without the handoff</div>
      </footer>
    </div>
  );
}
