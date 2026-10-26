import { PrismaClient } from "@prisma/client";

const DEMO_USER_ID = "user_demo_sales";

interface DealRecord {
  id: string;
  zoomUrl: string;
  zoomMeetingId: string | null;
  recallBotId: string | null;
  transcriptUrl: string | null;
  customerName: string;
  dealName: string | null;
  dealAmount: number | null;
  dealTerm: string | null;
  discount: number | null;
  trialDays: number | null;
  customRequirements: string | null;
  extractedTerms: string | null;
  extractionStatus: string;
  confirmationStatus: string;
  financeStatus: string;
  engineeringStatus: string;
  legalStatus: string;
  finalized: boolean;
  finalizedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestCallRecord {
  id: string;
  accessToken: string;
  zoomUrl: string;
  customerName: string | null;
  contactEmail: string | null;
  recallBotId: string | null;
  status: string;
  transcript: string | null;
  report: string | null;
  error: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory data store for ephemeral/demo execution when Postgres is not connected
const store = {
  users: [
    {
      id: DEMO_USER_ID,
      email: "demo@trycdm.com",
      name: "Demo Sales Rep",
      roles: "sales",
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  deals: [
    {
      id: "deal_demo_1",
      zoomUrl: "https://meet.google.com/ckx-kdzc-rdi",
      zoomMeetingId: "ckx-kdzc-rdi",
      recallBotId: "bot_demo_1",
      transcriptUrl: "extracted",
      customerName: "Northwind Bank",
      dealName: "Custom SSO integration",
      dealAmount: 250000,
      dealTerm: "3 years",
      discount: 15,
      trialDays: 30,
      customRequirements: "SAML 2.0 with Okta, 99.99% uptime SLA",
      extractedTerms: JSON.stringify({
        financeNotes: ["Invoice for $250K annually", "Apply 15% custom discount"],
        engineeringNotes: ["Provision 24/7 dedicated support", "Custom SAML/SSO integration"],
        legalNotes: ["Review standard enterprise SLA terms", "Confirm EU data residency"],
        confidence: { customerName: 99, dealAmount: 99, dealTerm: 95, discount: 87 },
      }),
      extractionStatus: "completed",
      confirmationStatus: "pending",
      financeStatus: "pending",
      engineeringStatus: "pending",
      legalStatus: "pending",
      finalized: false,
      finalizedAt: null,
      createdBy: DEMO_USER_ID,
      createdAt: new Date(Date.now() - 3600000 * 2),
      updatedAt: new Date(Date.now() - 3600000 * 2),
    },
    {
      id: "deal_demo_2",
      zoomUrl: "https://zoom.us/j/demo2",
      zoomMeetingId: "demo2",
      recallBotId: "bot_demo_2",
      transcriptUrl: "extracted",
      customerName: "Vale Logistics",
      dealName: "New enterprise deal",
      dealAmount: 125000,
      dealTerm: "1 year",
      discount: 10,
      trialDays: 14,
      customRequirements: "High throughput webhook ingestion",
      extractedTerms: JSON.stringify({
        financeNotes: ["Annual upfront payment", "Net 30 terms"],
        engineeringNotes: ["API rate limit upgrade (500 req/s)"],
        legalNotes: ["Standard mutual NDA required"],
        confidence: { customerName: 98, dealAmount: 95, dealTerm: 90, discount: 85 },
      }),
      extractionStatus: "completed",
      confirmationStatus: "pending",
      financeStatus: "pending",
      engineeringStatus: "pending",
      legalStatus: "pending",
      finalized: false,
      finalizedAt: null,
      createdBy: DEMO_USER_ID,
      createdAt: new Date(Date.now() - 3600000 * 4),
      updatedAt: new Date(Date.now() - 3600000 * 4),
    },
    {
      id: "deal_demo_3",
      zoomUrl: "https://zoom.us/j/demo3",
      zoomMeetingId: "demo3",
      recallBotId: "bot_demo_3",
      transcriptUrl: "extracted",
      customerName: "Harborline Retail",
      dealName: "Multi-region rollout",
      dealAmount: 400000,
      dealTerm: "2 years",
      discount: 20,
      trialDays: 0,
      customRequirements: "Dual-region redundancy",
      extractedTerms: JSON.stringify({
        financeNotes: ["Split billing across 2 entities", "20% multi-year discount"],
        engineeringNotes: ["Multi-region deployment (US + APAC)", "Custom webhook endpoints"],
        legalNotes: ["Custom DPA signed", "Penetration test report shared"],
        confidence: { customerName: 99, dealAmount: 98, dealTerm: 98, discount: 92 },
      }),
      extractionStatus: "completed",
      confirmationStatus: "confirmed",
      financeStatus: "invoiced",
      engineeringStatus: "in_progress",
      legalStatus: "signed",
      finalized: true,
      finalizedAt: new Date(Date.now() - 86400000),
      createdBy: DEMO_USER_ID,
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
    },
    {
      id: "deal_demo_4",
      zoomUrl: "https://zoom.us/j/demo4",
      zoomMeetingId: "demo4",
      recallBotId: "bot_demo_4",
      transcriptUrl: "extracted",
      customerName: "Solace Health",
      dealName: "HIPAA-compliant deployment",
      dealAmount: 180000,
      dealTerm: "18 months",
      discount: 0,
      trialDays: 14,
      customRequirements: "HIPAA BAA and customer-managed KMS",
      extractedTerms: JSON.stringify({
        financeNotes: ["Monthly invoicing via wire", "Purchase Order #8841"],
        engineeringNotes: ["Dedicated VPC peering", "Audit log streaming to Datadog"],
        legalNotes: ["BAA agreement review in progress"],
        confidence: { customerName: 99, dealAmount: 97, dealTerm: 95, discount: 99 },
      }),
      extractionStatus: "completed",
      confirmationStatus: "confirmed",
      financeStatus: "pending",
      engineeringStatus: "pending",
      legalStatus: "review",
      finalized: false,
      finalizedAt: null,
      createdBy: DEMO_USER_ID,
      createdAt: new Date(Date.now() - 86400000 * 2),
      updatedAt: new Date(Date.now() - 86400000 * 2),
    },
  ] as DealRecord[],
  testCalls: [] as TestCallRecord[],
  webhookLogs: [] as Array<{ id: string; botId: string; status: string; payload: string; processedAt: boolean; createdAt: Date }>,
};

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

// In-memory Prisma mock implementation per AI Studio guidelines
const mockPrisma = {
  user: {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
      return store.users.find((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email)) || null;
    },
    findFirst: async ({ where }: { where: { id?: string; email?: string } }) => {
      return store.users.find((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email)) || null;
    },
    upsert: async ({ where, update, create }: any) => {
      const idx = store.users.findIndex((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email));
      if (idx >= 0) {
        store.users[idx] = { ...store.users[idx], ...update, updatedAt: new Date() };
        return store.users[idx];
      }
      const newUser = { id: generateId("user"), ...create, createdAt: new Date(), updatedAt: new Date() };
      store.users.push(newUser);
      return newUser;
    },
    create: async ({ data }: any) => {
      const newUser = { id: generateId("user"), ...data, createdAt: new Date(), updatedAt: new Date() };
      store.users.push(newUser);
      return newUser;
    },
  },
  deal: {
    findMany: async ({ where, orderBy }: { where?: any; orderBy?: any } = {}) => {
      let results = [...store.deals];
      if (where?.createdBy) {
        const userDeals = results.filter((d) => d.createdBy === where.createdBy);
        // If demo deals match or user has deals, return them; otherwise return all demo deals
        if (userDeals.length > 0) results = userDeals;
      }
      if (where?.confirmationStatus) {
        results = results.filter((d) => d.confirmationStatus === where.confirmationStatus);
      }
      if (orderBy?.createdAt === "desc") {
        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return results;
    },
    findUnique: async ({ where }: { where: { id?: string } }) => {
      return store.deals.find((d) => d.id === where.id) || null;
    },
    findFirst: async ({ where }: { where: any }) => {
      return store.deals.find((d) => {
        if (where.id && d.id === where.id) return true;
        if (where.recallBotId && d.recallBotId === where.recallBotId) return true;
        return false;
      }) || null;
    },
    create: async ({ data }: any) => {
      const newDeal: DealRecord = {
        id: generateId("deal"),
        zoomUrl: data.zoomUrl || "",
        zoomMeetingId: data.zoomMeetingId || null,
        recallBotId: data.recallBotId || null,
        transcriptUrl: data.transcriptUrl || null,
        customerName: data.customerName || "Pending extraction",
        dealName: data.dealName || null,
        dealAmount: data.dealAmount || null,
        dealTerm: data.dealTerm || null,
        discount: data.discount || null,
        trialDays: data.trialDays || null,
        customRequirements: data.customRequirements || null,
        extractedTerms: data.extractedTerms || null,
        extractionStatus: data.extractionStatus || "pending",
        confirmationStatus: data.confirmationStatus || "pending",
        financeStatus: data.financeStatus || "pending",
        engineeringStatus: data.engineeringStatus || "pending",
        legalStatus: data.legalStatus || "pending",
        finalized: data.finalized || false,
        finalizedAt: data.finalizedAt || null,
        createdBy: data.createdBy || DEMO_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.deals.unshift(newDeal);
      return newDeal;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const idx = store.deals.findIndex((d) => d.id === where.id);
      if (idx === -1) {
        throw new Error(`Record to update not found: ${where.id}`);
      }
      store.deals[idx] = { ...store.deals[idx], ...data, updatedAt: new Date() };
      return store.deals[idx];
    },
  },
  testCall: {
    findUnique: async ({ where }: { where: { accessToken?: string; id?: string } }) => {
      return store.testCalls.find((t) => (where.accessToken && t.accessToken === where.accessToken) || (where.id && t.id === where.id)) || null;
    },
    findFirst: async ({ where }: { where: any }) => {
      return store.testCalls.find((t) => {
        if (where.accessToken && t.accessToken === where.accessToken) return true;
        if (where.recallBotId && t.recallBotId === where.recallBotId) return true;
        if (where.id && t.id === where.id) return true;
        return false;
      }) || null;
    },
    create: async ({ data }: any) => {
      const existing = store.testCalls.find((t) => t.accessToken === data.accessToken);
      if (existing) {
        const p2002Err = new Error("Unique constraint failed");
        (p2002Err as any).code = "P2002";
        throw p2002Err;
      }
      const newCall: TestCallRecord = {
        id: generateId("call"),
        accessToken: data.accessToken,
        zoomUrl: data.zoomUrl,
        customerName: data.customerName || null,
        contactEmail: data.contactEmail || null,
        recallBotId: data.recallBotId || null,
        status: data.status || "starting",
        transcript: data.transcript || null,
        report: data.report || null,
        error: data.error || null,
        expiresAt: data.expiresAt || new Date(Date.now() + 2 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.testCalls.push(newCall);
      return newCall;
    },
    update: async ({ where, data }: { where: { id?: string; accessToken?: string }; data: any }) => {
      const idx = store.testCalls.findIndex((t) => (where.id && t.id === where.id) || (where.accessToken && t.accessToken === where.accessToken));
      if (idx === -1) {
        throw new Error("TestCall record to update not found");
      }
      store.testCalls[idx] = { ...store.testCalls[idx], ...data, updatedAt: new Date() };
      return store.testCalls[idx];
    },
  },
  recallWebhookLog: {
    create: async ({ data }: any) => {
      const newLog = {
        id: generateId("log"),
        botId: data.botId,
        status: data.status,
        payload: data.payload,
        processedAt: false,
        createdAt: new Date(),
      };
      store.webhookLogs.push(newLog);
      return newLog;
    },
  },
  account: {
    findUnique: async () => null,
    create: async ({ data }: any) => ({ id: generateId("acc"), ...data }),
    delete: async () => ({}),
  },
  session: {
    findUnique: async () => null,
    create: async ({ data }: any) => ({ id: generateId("sess"), ...data }),
    update: async ({ data }: any) => ({ ...data }),
    delete: async () => ({}),
  },
  $disconnect: async () => {},
};

const isUnreachableDockerDb = Boolean(
  process.env.GOOGLE_RUNTIME && process.env.DATABASE_URL?.includes("@db:5432")
);

let realPrismaClient: PrismaClient | null = null;
if (process.env.DATABASE_URL && !isUnreachableDockerDb) {
  try {
    realPrismaClient = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : [],
    });
  } catch {
    console.warn("[AI Studio] Real PrismaClient initialization failed — using mock store");
  }
}

// Resilient proxy: routes queries to real Prisma if available and working,
// falling back transparently to in-memory store if database is offline or unconfigured.
export const prisma: any = new Proxy(mockPrisma, {
  get(target: any, prop: string | symbol) {
    if (prop in target) {
      const modelMock = target[prop as keyof typeof target];
      if (typeof modelMock === "function") {
        return modelMock;
      }
      if (typeof modelMock === "object" && modelMock !== null) {
        return new Proxy(modelMock, {
          get(subTarget, opName: string | symbol) {
            return async (...args: any[]) => {
              if (realPrismaClient && typeof (realPrismaClient as any)[prop]?.[opName] === "function") {
                try {
                  return await (realPrismaClient as any)[prop][opName](...args);
                } catch (err: any) {
                  if (err?.code === "P1001" || String(err?.message || "").includes("Can't reach database server")) {
                    realPrismaClient = null;
                  }
                  console.warn(`[AI Studio] Prisma ${String(prop)}.${String(opName)} failed (${err?.message}) — falling back to mock`);
                }
              }
              const mockFn = (subTarget as any)[opName];
              if (typeof mockFn === "function") {
                return mockFn(...args);
              }
              return null;
            };
          },
        });
      }
    }
    return (target as any)[prop];
  },
});
