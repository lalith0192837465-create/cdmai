const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@trycdm.com" },
    update: {},
    create: {
      email: "demo@trycdm.com",
      name: "Demo Sales Rep",
      roles: "sales",
    },
  });

  const deals = [
    {
      zoomUrl: "https://zoom.us/j/demo1",
      customerName: "Northwind Bank",
      dealName: "Custom SSO integration",
      dealAmount: 250000,
      dealTerm: "3 years",
      discount: 15,
      trialDays: 30,
      extractionStatus: "completed",
      confirmationStatus: "pending",
      createdBy: user.id,
    },
    {
      zoomUrl: "https://zoom.us/j/demo2",
      customerName: "Vale Logistics",
      dealName: "New enterprise deal",
      dealAmount: 125000,
      dealTerm: "1 year",
      discount: 10,
      trialDays: 14,
      extractionStatus: "completed",
      confirmationStatus: "pending",
      createdBy: user.id,
    },
    {
      zoomUrl: "https://zoom.us/j/demo3",
      customerName: "Harborline Retail",
      dealName: "Multi-region rollout",
      dealAmount: 400000,
      dealTerm: "2 years",
      discount: 20,
      extractionStatus: "completed",
      confirmationStatus: "confirmed",
      financeStatus: "invoiced",
      engineeringStatus: "in_progress",
      legalStatus: "signed",
      createdBy: user.id,
    },
    {
      zoomUrl: "https://zoom.us/j/demo4",
      customerName: "Solace Health",
      dealName: "HIPAA-compliant deployment",
      dealAmount: 180000,
      dealTerm: "18 months",
      extractionStatus: "completed",
      confirmationStatus: "confirmed",
      financeStatus: "pending",
      engineeringStatus: "pending",
      legalStatus: "review",
      createdBy: user.id,
    },
  ];

  for (const deal of deals) {
    await prisma.deal.create({ data: deal });
  }

  console.log("Seed complete:", deals.length, "deals created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
