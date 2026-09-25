"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

type Deal = {
  id: string;
  customerName: string;
  dealName: string | null;
  dealAmount: number | null;
  dealTerm: string | null;
  discount: number | null;
  extractedTerms: string | null;
  confirmationStatus: string;
  financeStatus: string;
  engineeringStatus: string;
  legalStatus: string;
};

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<"awaiting" | "queue" | "custom">("awaiting");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/auth/signin");
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") fetchDeals();
  }, [status]);

  const fetchDeals = async () => {
    try {
      const response = await fetch("/api/deals");
      const data = await response.json();
      setDeals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch deals:", error);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeal = async (dealId: string) => {
    try {
      const response = await fetch(`/api/deals/${dealId}/confirm`, { method: "POST" });
      if (response.ok) {
        fetchDeals();
        setExpandedDealId(null);
      }
    } catch (error) {
      console.error("Failed to confirm deal:", error);
    }
  };

  const toggleDeal = (dealId: string) => {
    setExpandedDealId(expandedDealId === dealId ? null : dealId);
  };

  if (status === "loading" || loading) {
    return <div style={{ padding: "4rem", textAlign: "center" }}>Loading...</div>;
  }
  if (!session) return null;

  const pending = deals.filter((d) => d.confirmationStatus === "pending");
  const confirmed = deals.filter((d) => d.confirmationStatus === "confirmed");

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", padding: "2rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 600, marginBottom: "8px" }}>Deal coordination</h1>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Manage your pipeline in real time</p>
        </div>

        <div style={{ display: "flex", gap: "2rem", marginBottom: "2rem", borderBottom: "1px solid #e0e0e0" }}>
          {(["awaiting", "queue", "custom"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 0",
                borderBottom: activeTab === tab ? "3px solid #3b82f6" : "none",
                color: activeTab === tab ? "#3b82f6" : "#6b7280",
                fontWeight: activeTab === tab ? 500 : 400,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {tab === "awaiting" && "Awaiting confirmation"}
              {tab === "queue" && "Task queue"}
              {tab === "custom" && "Everything custom"}
            </div>
          ))}
        </div>

        {activeTab === "awaiting" && (
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "1.5rem" }}>
              {pending.length} deal{pending.length !== 1 ? "s" : ""} waiting for review
            </h2>
            {pending.length === 0 ? (
              <EmptyState text="No deals awaiting confirmation yet" />
            ) : (
              pending.map((deal) => (
                <div key={deal.id} style={{ marginBottom: "1rem" }}>
                  {expandedDealId !== deal.id ? (
                    <div onClick={() => toggleDeal(deal.id)} style={cardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                            <Badge>Pending</Badge>
                            <span style={{ color: "#6b7280", fontSize: "13px" }}>{deal.customerName}</span>
                          </div>
                          <h3 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "12px" }}>
                            {deal.dealName || "Deal"}
                          </h3>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", fontSize: "13px" }}>
                            {deal.dealAmount && <Field label="Amount" value={`$${deal.dealAmount.toLocaleString()}`} />}
                            {deal.dealTerm && <Field label="Term" value={deal.dealTerm} />}
                          </div>
                        </div>
                        <span style={{ color: "#6b7280" }}>▼</span>
                      </div>
                    </div>
                  ) : (
                    <div style={cardStyle}>
                      <div onClick={() => toggleDeal(deal.id)} style={{ cursor: "pointer", marginBottom: "1.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <h3 style={{ fontSize: "16px", fontWeight: 500 }}>{deal.dealName || "Deal"}</h3>
                            <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "0.5rem" }}>{deal.customerName}</p>
                          </div>
                          <span style={{ color: "#6b7280", transform: "rotate(180deg)", display: "inline-block" }}>▼</span>
                        </div>
                      </div>

                      <div style={{ marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid #e0e0e0" }}>
                        <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px", fontWeight: 500 }}>
                          Deal details
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", fontSize: "13px" }}>
                          {deal.dealAmount && <Field label="Amount" value={`$${deal.dealAmount.toLocaleString()}`} />}
                          {deal.dealTerm && <Field label="Term" value={deal.dealTerm} />}
                          {deal.discount != null && <Field label="Discount" value={`${deal.discount}%`} />}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "12px" }}>
                        <button onClick={() => confirmDeal(deal.id)} style={primaryButton}>
                          Confirm &amp; route
                        </button>
                        <button style={secondaryButton}>Edit</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "queue" && (
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "1.5rem" }}>
              Tasks for confirmed deals
            </h2>
            {confirmed.length === 0 ? (
              <EmptyState text="No confirmed deals yet" />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
                {[
                  { dept: "Finance", key: "financeStatus", emoji: "📄", color: "#dbeafe" },
                  { dept: "Engineering", key: "engineeringStatus", emoji: "⚙️", color: "#dcf5e6" },
                  { dept: "Legal", key: "legalStatus", emoji: "📋", color: "#fee2e2" },
                ].map((dept) => (
                  <div key={dept.dept} style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem" }}>
                      <span style={{ fontSize: "20px" }}>{dept.emoji}</span>
                      <h3 style={{ fontSize: "14px", fontWeight: 500 }}>{dept.dept}</h3>
                      <span style={{ background: dept.color, padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500, marginLeft: "auto" }}>
                        {confirmed.length} task{confirmed.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {confirmed.map((deal) => (
                        <div key={deal.id} style={{ padding: "10px", background: "#f3f4f6", borderRadius: "8px", fontSize: "12px" }}>
                          <p style={{ fontWeight: 500, marginBottom: "4px" }}>{deal.customerName}</p>
                          <p style={{ color: "#6b7280", fontSize: "11px" }}>
                            {deal.dealName || "Deal"} — ${deal.dealAmount?.toLocaleString() || "TBD"}
                          </p>
                          <p style={{ color: "#6b7280", fontSize: "11px", marginTop: "4px" }}>
                            Status: {(deal as any)[dept.key]}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "custom" && (
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "1.5rem" }}>
              All deals — complete data view
            </h2>
            {deals.length === 0 ? (
              <EmptyState text="No deals yet" />
            ) : (
              deals.map((deal) => (
                <div key={deal.id} style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2rem", fontSize: "13px" }}>
                    <div>
                      <Field label="Customer" value={deal.customerName} big />
                      <div style={{ height: "1rem" }} />
                      <Field label="Deal name" value={deal.dealName || "N/A"} big />
                    </div>
                    <div>
                      <Field label="Amount" value={`$${deal.dealAmount?.toLocaleString() || "TBD"}`} big />
                      <div style={{ height: "1rem" }} />
                      <Field label="Term" value={deal.dealTerm || "N/A"} big />
                    </div>
                  </div>
                  <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid #e0e0e0" }}>
                    <p style={{ color: "#6b7280", marginBottom: "8px", fontWeight: 500, fontSize: "13px" }}>Status</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                      <div><span style={{ fontSize: "12px" }}>Finance:</span> <strong>{deal.financeStatus}</strong></div>
                      <div><span style={{ fontSize: "12px" }}>Engineering:</span> <strong>{deal.engineeringStatus}</strong></div>
                      <div><span style={{ fontSize: "12px" }}>Legal:</span> <strong>{deal.legalStatus}</strong></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "3rem", textAlign: "center", color: "#6b7280" }}>
      <p>{text}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: "#dcf5e6", color: "#15803d", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }}>
      {children}
    </span>
  );
}

function Field({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <span style={{ color: "#6b7280" }}>{label}:</span>{" "}
      <span style={{ fontWeight: 500, fontSize: big ? "14px" : "13px" }}>{value}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e0e0e0",
  borderRadius: "12px",
  padding: "1.5rem",
  cursor: "pointer",
};

const primaryButton: React.CSSProperties = {
  flex: 1,
  padding: "12px",
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: "8px",
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  flex: 1,
  padding: "12px",
  background: "white",
  border: "1px solid #e0e0e0",
  borderRadius: "8px",
  fontWeight: 500,
  cursor: "pointer",
};
