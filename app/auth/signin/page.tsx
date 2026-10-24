"use client";


export default function SignIn() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f8f9fa",
    }}>
      <div style={{
        background: "white", padding: "3rem", borderRadius: "12px",
        border: "1px solid #e0e0e0", textAlign: "center", maxWidth: "400px", width: "100%",
      }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "0.5rem" }}>CDM</h1>
        <p style={{ color: "#6b7280", marginBottom: "2rem", fontSize: "14px" }}>
          Sign in to manage your deal pipeline
        </p>
        <button
          onClick={async () => {
            const { signIn } = await import("next-auth/react");
            await signIn("credentials", { email: "demo@trycdm.com", callbackUrl: "/dashboard" });
          }}
          style={{
            width: "100%", padding: "12px", background: "#111827", color: "white",
            border: "none", borderRadius: "8px", fontWeight: 500, fontSize: "14px",
            cursor: "pointer", marginBottom: "10px",
          }}
        >
          Sign In as Demo Sales Rep
        </button>
        <button
          onClick={async () => { const { signIn } = await import("next-auth/react"); await signIn("google", { callbackUrl: "/dashboard" }); }}
          style={{
            width: "100%", padding: "12px", background: "#f3f4f6", color: "#374151",
            border: "1px solid #d1d5db", borderRadius: "8px", fontWeight: 500, fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}
