import Link from "next/link";
import DepartmentEmailDemo from "../components/DepartmentEmailDemo";

export default function DemoPage() {
  return (
    <div>
      <nav className="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand">
            <span className="dot" />
            CDM
          </Link>
          <div className="navlinks">
            <Link href="/">Home</Link>
            <Link href="/test-call">10-minute test</Link>
            <Link href="/auth/signin">Sign In</Link>
          </div>
        </div>
      </nav>

      <section className="section" style={{ borderTop: 0 }}>
        <div className="wrap">
          <h2>Department Email Handoff Demo</h2>
          <p className="lede">
            See how CDM turns one closed Google Meet, Zoom, or Microsoft Teams call into three focused handoff emails
            for Finance, Engineering, and Legal — ready to review, edit, and send in seconds.
          </p>
          <DepartmentEmailDemo />
        </div>
      </section>
    </div>
  );
}
