/** Add field-ops sample data without resetting the database */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const salesUser = await prisma.user.findFirst({
    where: { role: "SALES_MARKETING" },
  });
  if (!salesUser) {
    console.log("No sales user found. Run npm run db:seed first.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.dailyLog.findUnique({
    where: { userId_logDate: { userId: salesUser.id, logDate: today } },
  });
  if (existing) {
    console.log("Field sample data already exists for today.");
    return;
  }

  const dealer = await prisma.dealer.findFirst({ where: { status: "APPROVED" } });

  await prisma.dailyLog.create({
    data: {
      logDate: today,
      userId: salesUser.id,
      summary: "Dealer visits and order follow-ups in territory.",
      dealersVisited: 2,
      ordersDiscussed: 1,
      kilometersTraveled: 65,
      status: "SUBMITTED",
    },
  });

  if (dealer) {
    const visit = await prisma.salesVisit.create({
      data: {
        visitDate: new Date(),
        dealerId: dealer.id,
        purpose: "ORDER_FOLLOWUP",
        personsMet: dealer.proprietorName,
        discussionNotes: "Discussed Indicafert product range and pricing.",
        latitude: 18.5204,
        longitude: 73.8567,
        locationLabel: "Field visit",
        userId: salesUser.id,
      },
    });
    await prisma.locationTrack.create({
      data: {
        userId: salesUser.id,
        latitude: 18.5204,
        longitude: 73.8567,
        source: "VISIT_CHECKIN",
        visitId: visit.id,
      },
    });
  }

  await prisma.allowanceClaim.create({
    data: {
      claimDate: today,
      userId: salesUser.id,
      claimType: "TRAVEL",
      amount: 650,
      description: "Territory travel allowance",
      kilometers: 65,
      status: "PENDING",
    },
  });

  await prisma.appSetting.upsert({
    where: { key: "management_report_emails" },
    create: { key: "management_report_emails", value: "admin@xenvolt.com" },
    update: {},
  });

  console.log("Field sample data created.");
}

main()
  .finally(() => prisma.$disconnect());
