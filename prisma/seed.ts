import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { seedIndicafertCatalog } from "./lib/seed-indicafert";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create Divisions
  const divisions = await Promise.all([
    prisma.division.create({ data: { name: "Konkan", code: "KON" } }),
    prisma.division.create({ data: { name: "Pune", code: "PUN" } }),
    prisma.division.create({ data: { name: "Nashik", code: "NAS" } }),
    prisma.division.create({ data: { name: "Aurangabad", code: "AUR" } }),
    prisma.division.create({ data: { name: "Amravati", code: "AMR" } }),
    prisma.division.create({ data: { name: "Nagpur", code: "NAG" } }),
  ]);

  // Create Zones with Districts
  const zones = [];

  // Pune Division Zones
  const puneZone = await prisma.zone.create({
    data: {
      name: "Pune Zone",
      code: "PUNE",
      divisionId: divisions[1].id,
      districts: {
        create: [
          { name: "Pune", code: "PUN" },
          { name: "Satara", code: "SAT" },
          { name: "Sangli", code: "SAN" },
          { name: "Solapur", code: "SOL" },
          { name: "Kolhapur", code: "KOL" },
        ],
      },
    },
    include: { districts: true },
  });
  zones.push(puneZone);

  const nashikZone = await prisma.zone.create({
    data: {
      name: "Nashik Zone",
      code: "NASH",
      divisionId: divisions[2].id,
      districts: {
        create: [
          { name: "Nashik", code: "NSK" },
          { name: "Ahmednagar", code: "AHM" },
          { name: "Dhule", code: "DHU" },
          { name: "Jalgaon", code: "JAL" },
        ],
      },
    },
    include: { districts: true },
  });
  zones.push(nashikZone);

  const aurangabadZone = await prisma.zone.create({
    data: {
      name: "Aurangabad Zone",
      code: "AURA",
      divisionId: divisions[3].id,
      districts: {
        create: [
          { name: "Aurangabad", code: "AUR" },
          { name: "Jalna", code: "JLN" },
          { name: "Beed", code: "BED" },
          { name: "Latur", code: "LAT" },
        ],
      },
    },
    include: { districts: true },
  });
  zones.push(aurangabadZone);

  const nagpurZone = await prisma.zone.create({
    data: {
      name: "Nagpur Zone",
      code: "NAGP",
      divisionId: divisions[5].id,
      districts: {
        create: [
          { name: "Nagpur", code: "NGP" },
          { name: "Wardha", code: "WAR" },
          { name: "Chandrapur", code: "CHA" },
        ],
      },
    },
    include: { districts: true },
  });
  zones.push(nagpurZone);

  console.log("Created zones and districts");

  // Create Users
  const hashedPassword = await hash("password123", 12);

  const salesUser = await prisma.user.create({
    data: {
      employeeId: "EMP001",
      email: "sales@xenvolt.com",
      password: hashedPassword,
      fullName: "Rajesh Patil",
      phone: "9876543210",
      role: "SALES_MARKETING",
      status: "ACTIVE",
      zoneId: puneZone.id,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      employeeId: "EMP002",
      email: "admin@xenvolt.com",
      password: hashedPassword,
      fullName: "Suresh Kumar",
      phone: "9876543211",
      role: "MANAGEMENT_ADMIN",
      status: "ACTIVE",
    },
  });

  const logisticsUser = await prisma.user.create({
    data: {
      employeeId: "EMP003",
      email: "logistics@xenvolt.com",
      password: hashedPassword,
      fullName: "Amit Sharma",
      phone: "9876543212",
      role: "PRODUCTION_LOGISTICS",
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      employeeId: "EMP004",
      email: "account@xenvolt.com",
      password: hashedPassword,
      fullName: "Priya Deshmukh",
      phone: "9876543213",
      role: "ACCOUNT",
      status: "ACTIVE",
    },
  });

  console.log("Created users (including ACCOUNT role)");

  // Indicafert / Daichi International product catalog
  const products = await seedIndicafertCatalog(prisma);
  const activeProducts = products.filter((p) => p.status === "ACTIVE");

  console.log(`Created ${products.length} Indicafert products (${activeProducts.length} active)`);

  // Create Inventory (active SKUs only)
  await Promise.all(
    activeProducts.map((product) =>
      prisma.inventoryItem.create({
        data: {
          productId: product.id,
          warehouseCode: "WH-PUNE-01",
          quantity: Math.floor(Math.random() * 500) + 100,
          reorderLevel: 50,
        },
      })
    )
  );

  console.log("Created inventory");

  // Create Sample Dealers
  const puneDistrict = puneZone.districts.find((d) => d.code === "PUN")!;
  const kolapurDistrict = puneZone.districts.find((d) => d.code === "KOL")!;
  const nashikDistrict = nashikZone.districts.find((d) => d.code === "NSK")!;

  const dealers = await Promise.all([
    prisma.dealer.create({
      data: {
        dealerCode: "XV/PUN/0001",
        firmName: "Krishi Seva Kendra",
        proprietorName: "Ramesh Jadhav",
        contactNumber: "9822334455",
        email: "krishi.seva@gmail.com",
        gstNumber: "27AABCU9603R1ZM",
        panNumber: "AABCU9603R",
        businessAddress: "Shop No. 12, Krishi Market, Shivajinagar",
        city: "Pune",
        districtId: puneDistrict.id,
        pinCode: "411005",
        bankName: "State Bank of India",
        bankAccountNumber: "32145678901",
        ifscCode: "SBIN0001234",
        yearsInBusiness: 15,
        annualTurnover: "50L-1Cr",
        creditPeriod: "DAYS_45",
        godownAvailable: true,
        godownSize: 500,
        vehicleAvailable: true,
        status: "APPROVED",
        creditLimit: 500000,
        createdById: salesUser.id,
        approvedById: adminUser.id,
        approvedAt: new Date(),
      },
    }),
    prisma.dealer.create({
      data: {
        dealerCode: "XV/KOL/0001",
        firmName: "Farmer Agro Traders",
        proprietorName: "Sunil Patil",
        contactNumber: "9833445566",
        email: "farmer.agro@gmail.com",
        gstNumber: "27AABCU9604R1ZM",
        panNumber: "AABCU9604R",
        businessAddress: "Market Yard, Shop No. 5",
        city: "Kolhapur",
        districtId: kolapurDistrict.id,
        pinCode: "416001",
        bankName: "Bank of Maharashtra",
        bankAccountNumber: "20145678902",
        ifscCode: "MAHB0001234",
        yearsInBusiness: 10,
        annualTurnover: "25L-50L",
        creditPeriod: "DAYS_60",
        godownAvailable: true,
        godownSize: 300,
        vehicleAvailable: false,
        status: "APPROVED",
        creditLimit: 300000,
        createdById: salesUser.id,
        approvedById: adminUser.id,
        approvedAt: new Date(),
      },
    }),
    prisma.dealer.create({
      data: {
        firmName: "Nashik Agri Supplies",
        proprietorName: "Vijay Wagh",
        contactNumber: "9844556677",
        email: "nashik.agri@gmail.com",
        gstNumber: "27AABCU9605R1ZM",
        panNumber: "AABCU9605R",
        businessAddress: "APMC Market, Gate No. 3",
        city: "Nashik",
        districtId: nashikDistrict.id,
        pinCode: "422001",
        bankName: "HDFC Bank",
        bankAccountNumber: "50145678903",
        ifscCode: "HDFC0001234",
        yearsInBusiness: 8,
        annualTurnover: "10L-25L",
        creditPeriod: "DAYS_45",
        godownAvailable: false,
        vehicleAvailable: false,
        status: "SUBMITTED",
        createdById: salesUser.id,
      },
    }),
  ]);

  console.log("Created dealers");

  // Create Sample Orders
  const sampleProductA = activeProducts[0];
  const sampleProductB = activeProducts[1] ?? activeProducts[0];
  const line1Total = 20 * sampleProductA.basePrice * (1 + sampleProductA.gstRate / 100);
  const line1Tax = 20 * sampleProductA.basePrice * (sampleProductA.gstRate / 100);
  const line2Total = 10 * sampleProductB.basePrice * (1 + sampleProductB.gstRate / 100);
  const line2Tax = 10 * sampleProductB.basePrice * (sampleProductB.gstRate / 100);
  const orderSubtotal =
    20 * sampleProductA.basePrice + 10 * sampleProductB.basePrice;
  const orderTax = line1Tax + line2Tax;
  const orderTotal = line1Total + line2Total;

  const order1 = await prisma.order.create({
    data: {
      orderNumber: "DI/ORD/2026-06/00001",
      dealerId: dealers[0].id,
      deliveryAddress: dealers[0].businessAddress + ", " + dealers[0].city,
      subtotal: orderSubtotal,
      taxAmount: orderTax,
      totalAmount: orderTotal,
      status: "DELIVERED",
      createdById: salesUser.id,
      approvedById: adminUser.id,
      approvedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      items: {
        create: [
          {
            productId: sampleProductA.id,
            quantity: 20,
            unitPrice: sampleProductA.basePrice,
            gstRate: sampleProductA.gstRate,
            taxAmount: line1Tax,
            totalAmount: line1Total,
          },
          {
            productId: sampleProductB.id,
            quantity: 10,
            unitPrice: sampleProductB.basePrice,
            gstRate: sampleProductB.gstRate,
            taxAmount: line2Tax,
            totalAmount: line2Total,
          },
        ],
      },
    },
  });

  const pendingLineTotal =
    30 * sampleProductA.basePrice * (1 + sampleProductA.gstRate / 100);
  const pendingLineTax =
    30 * sampleProductA.basePrice * (sampleProductA.gstRate / 100);

  await prisma.order.create({
    data: {
      orderNumber: "DI/ORD/2026-06/00002",
      dealerId: dealers[1].id,
      deliveryAddress: dealers[1].businessAddress + ", " + dealers[1].city,
      subtotal: 30 * sampleProductA.basePrice,
      taxAmount: pendingLineTax,
      totalAmount: pendingLineTotal,
      status: "PENDING_APPROVAL",
      createdById: salesUser.id,
      items: {
        create: [
          {
            productId: sampleProductA.id,
            quantity: 30,
            unitPrice: sampleProductA.basePrice,
            gstRate: sampleProductA.gstRate,
            taxAmount: pendingLineTax,
            totalAmount: pendingLineTotal,
          },
        ],
      },
    },
  });

  console.log("Created orders");

  // Create dispatch for delivered order
  await prisma.dispatch.create({
    data: {
      dispatchNumber: "DI/DSP/2026-06/00001",
      orderId: order1.id,
      logisticsPartner: "Blue Dart Logistics",
      vehicleNumber: "MH12AB1234",
      driverName: "Raju Singh",
      driverContact: "9855667788",
      status: "DELIVERED",
      dispatchDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      actualDeliveryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // Create Invoice for delivered order
  await prisma.invoice.create({
    data: {
      invoiceNumber: "DI/INV/2026-06/00001",
      orderId: order1.id,
      dealerId: dealers[0].id,
      subtotal: orderSubtotal,
      cgstAmount: orderTax / 2,
      sgstAmount: orderTax / 2,
      igstAmount: 0,
      totalTax: orderTax,
      totalAmount: orderTotal,
      dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      balanceAmount: orderTotal,
      status: "GENERATED",
      createdById: logisticsUser.id,
    },
  });

  console.log("Created dispatch and invoice");

  // Create Sample Recommendation
  await prisma.recommendation.create({
    data: {
      farmerName: "Ganesh Shinde",
      contactNumber: "9866778899",
      village: "Lonavla",
      taluka: "Maval",
      districtName: "Pune",
      cropType: "Tomato",
      landSize: 2,
      landUnit: "Acres",
      issueType: "PEST_DISEASE",
      issueDescription: "White spots on leaves, wilting of plants",
      symptomsObserved: "White powdery coating on leaves, yellowing",
      recommendationText: "Apply fungicide spray, improve air circulation",
      dosageApplication: "2ml per liter of water, spray every 7 days",
      expectedOutcome: "Control of fungal infection within 2 weeks",
      followUpRequired: true,
      followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      userId: salesUser.id,
      products: {
        create: [
          {
            productId: activeProducts[Math.min(5, activeProducts.length - 1)].id,
            reason: "Recommended micronutrient for deficiency correction",
          },
        ],
      },
    },
  });

  console.log("Created recommendation");

  // Field operations sample data
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyLog.create({
    data: {
      logDate: today,
      userId: salesUser.id,
      summary: "Visited Krishi Seva Kendra and 2 prospects in Pune. Discussed Indicafert NPK orders.",
      dealersVisited: 3,
      ordersDiscussed: 2,
      kilometersTraveled: 85,
      expensesSummary: "Fuel ₹800",
      status: "SUBMITTED",
    },
  });

  const visit = await prisma.salesVisit.create({
    data: {
      visitDate: new Date(),
      dealerId: dealers[0].id,
      purpose: "ORDER_FOLLOWUP",
      personsMet: "Ramesh Jadhav",
      discussionNotes: "Confirmed repeat order for NPK 19:19:19 pouch packing.",
      nextAction: "Send quotation by WhatsApp",
      latitude: 18.5204,
      longitude: 73.8567,
      locationLabel: "Shivajinagar, Pune",
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
      addressLabel: "Shivajinagar, Pune",
    },
  });

  await prisma.allowanceClaim.create({
    data: {
      claimDate: today,
      userId: salesUser.id,
      claimType: "TRAVEL",
      amount: 850,
      description: "Pune district dealer visits — fuel",
      kilometers: 85,
      status: "PENDING",
    },
  });

  await prisma.appSetting.upsert({
    where: { key: "management_report_emails" },
    create: { key: "management_report_emails", value: "admin@xenvolt.com" },
    update: { value: "admin@xenvolt.com" },
  });

  console.log("Created field operations sample data");
  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
