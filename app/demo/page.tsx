"use client";

import { useState } from "react";

const sampleDeals = [
  {
    id: "demo-1",
    customerName: "Northwind Bank",
    dealName: "Custom SSO integration",
    dealAmount: 250000,
    dealTerm: "3 years",
    discount: 15,
    confidence: { amount: 99, term: 95, discount: 87 },
  },
  {
    id: "demo-2",
    customerName: "Vale Logistics",
    dealName: "New enterprise deal",
    dealAmount: 125000,
    dealTerm: "1 year",
    discount: 10,
    confidence: { amount: 92, term: 88, discount: 78 },
  },
];

export default function Demo() {
  const [activeTab, setActiveTab] = useState<"awaiting" | "queue" | "custom">("awaiting");
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);

  const toggleDeal = (dealId: string) => {
    setExpandedDealId(expandedDealId === dealId ? null : dealId);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", padding: "2rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 600, marginBottom: "8px" }}>Deal coordination</h1>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Explore sample data — no login required</p>
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
              {sampleDeals.length} deals waiting for review
            </h2>
            {sampleDeals.map((deal) => (
              <div key={deal.id} style={{ marginBottom: "1rem" }}>
                {expandedDealId !== deal.id ? (
                  <div onClick={() => toggleDeal(deal.id)} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                          <span style={badgeStyle}>High priority</span>
                          <span style={{ color: "#6b7280", fontSize: "13px" }}>{deal.customerName}</span>
                        </div>
                        <h3 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "12px" }}>{deal.dealName}</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", fontSize: "13px" }}>
                          <div><span style={{ color: "#6b7280" }}>Amount:</span> <strong>${deal.dealAmount.toLocaleString()}</strong></div>
                          <div><span style={{ color: "#6b7280" }}>Term:</span> <strong>{deal.dealTerm}</strong></div>
                          <div><span style={{ color: "#6b7280" }}>Discount:</span> <strong>{deal.discount}%</strong></div>
                        </div>
                      </div>
                      <span style={{ color: "#6b7280" }}>▼</span>
                    </div>
                  </div>
                ) : (
                  <div style={cardStyle}>
                    <div onClick={() => toggleDeal(deal.id)} style={{ cursor: "pointer", marginBottom: "1.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 500 }}>{deal.dealName}</h3>
                        <span style={{ color: "#6b7280", transform: "rotate(180deg)", display: "inline-block" }}>▼</span>
                      </div>
                    </div>

                    <div style={{ marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid #e0e0e0" }}>
                      <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "12px", fontWeight: 500 }}>
                        Confidence scores
                      </p>
                      {Object.entries(deal.confidence).map(([key, value]) => (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
                          <span style={{ color: "#6b7280", textTransform: "capitalize" }}>{key}</span>
                          <span style={{ color: "#15803d", fontWeight: 500 }}>{value}%</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: "12px" }}>
                      <button style={primaryButton}>Confirm &amp; route</button>
                      <button style={secondaryButton}>Edit</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "queue" && (
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "1.5rem" }}>Sample task queue</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
              {[
                { dept: "Finance", emoji: "📄", color: "#dbeafe" },
                { dept: "Engineering", emoji: "⚙️", color: "#dcf5e6" },
                { dept: "Legal", emoji: "📋", color: "#fee2e2" },
              ].map((dept) => (
                <div key={dept.dept} style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem" }}>
                    <span style={{ fontSize: "20px" }}>{dept.emoji}</span>
                    <h3 style={{ fontSize: "14px", fontWeight: 500 }}>{dept.dept}</h3>
                    <span style={{ background: dept.color, padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500, marginLeft: "auto" }}>
                      {sampleDeals.length} tasks
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {sampleDeals.map((deal) => (
                      <div key={deal.id} style={{ padding: "10px", background: "#f3f4f6", borderRadius: "8px", fontSize: "12px" }}>
                        <input type="checkbox" style={{ marginRight: "8px" }} />
                        <strong>{deal.customerName}</strong>
                        <p style={{ margin: "4px 0 0 28px", color: "#6b7280", fontSize: "11px" }}>{deal.dealName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "custom" && (
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "1.5rem" }}>Complete data view</h2>
            {sampleDeals.map((deal) => (
              <div key={deal.id} style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2rem", fontSize: "13px" }}>
                  <div>
                    <p style={{ color: "#6b7280", marginBottom: "8px", fontWeight: 500 }}>Customer</p>
                    <p style={{ marginBottom: "1.5rem", fontSize: "14px", fontWeight: 500 }}>{deal.customerName}</p>
                    <p style={{ color: "#6b7280", marginBottom: "8px", fontWeight: 500 }}>Amount</p>
                    <p style={{ fontSize: "14px", fontWeight: 500 }}>${deal.dealAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p style={{ color: "#6b7280", marginBottom: "8px", fontWeight: 500 }}>Deal</p>
                    <p style={{ marginBottom: "1.5rem", fontSize: "14px", fontWeight: 500 }}>{deal.dealName}</p>
                    <p style={{ color: "#6b7280", marginBottom: "8px", fontWeight: 500 }}>Term</p>
                    <p style={{ fontSize: "14px", fontWeight: 500 }}>{deal.dealTerm}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

const badgeStyle: React.CSSProperties = {
  background: "#dcf5e6",
  color: "#15803d",
  padding: "4px 10px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 500,
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
