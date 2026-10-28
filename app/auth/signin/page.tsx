"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGoogle, setHasGoogle] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && data.google) {
          setHasGoogle(true);
        }
      })
      .catch(() => {
        // Optional Google SSO check
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Invalid workspace email or password.");
        setSubmitting(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <span className="dot" />
          CDM
        </Link>
        <h1>Sign in to your workspace</h1>
        <p className="auth-sub">
          Enter the admin email and password configured for your CDM deployment.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Workspace email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="admin@company.com"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-block"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {hasGoogle ? (
          <>
            <div className="auth-divider">or</div>
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="btn btn-ghost btn-block"
            >
              Continue with Google
            </button>
          </>
        ) : null}
      </div>

      <Link href="/" className="auth-back">
        Back to CDM home
      </Link>
    </main>
  );
}
