import "dotenv/config";
import { hash } from "bcryptjs";
import { 
  connectMongoDB, 
  closeMongoDB, 
  ObjectId,
  User,
  ProductCategory,
  Product,
  Dealer,
  Zone,
  District,
  Order,
  Invoice
} from "../lib/mongodb";

async function seedMongoDB() {
  console.log("Starting MongoDB seed...");
  
  const db = await connectMongoDB();
  
  const usersCol = db.collection<User>("users");
  const categoriesCol = db.collection<ProductCategory>("productCategories");
  const productsCol = db.collection<Product>("products");
  const dealersCol = db.collection<Dealer>("dealers");
  const zonesCol = db.collection<Zone>("zones");
  const districtsCol = db.collection<District>("districts");
  const ordersCol = db.collection<Order>("orders");
  const invoicesCol = db.collection<Invoice>("invoices");

  const existingUser = await usersCol.findOne({ email: "admin@xenvolt.com" });
  if (existingUser) {
    console.log("Database already seeded. Skipping...");
    await closeMongoDB();
    return;
  }

  console.log("Seeding users...");
  const hashedPassword = await hash("password123", 12);
  
  const puneZoneId = new ObjectId();
  const nashikZoneId = new ObjectId();
  
  const users: User[] = [
    {
      _id: new ObjectId(),
      employeeId: "EMP001",
      email: "sales@xenvolt.com",
      password: hashedPassword,
      fullName: "Rajesh Patil",
      phone: "9876543210",
      role: "SALES_MARKETING",
      status: "ACTIVE",
      zoneId: puneZoneId.toString(),
      zoneName: "Pune Zone",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      employeeId: "EMP002",
      email: "admin@xenvolt.com",
      password: hashedPassword,
      fullName: "Suresh Kumar",
      phone: "9876543211",
      role: "MANAGEMENT_ADMIN",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      employeeId: "EMP003",
      email: "logistics@xenvolt.com",
      password: hashedPassword,
      fullName: "Amit Sharma",
      phone: "9876543212",
      role: "PRODUCTION_LOGISTICS",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      employeeId: "EMP004",
      email: "account@xenvolt.com",
      password: hashedPassword,
      fullName: "Priya Deshmukh",
      phone: "9876543213",
      role: "ACCOUNT",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  await usersCol.insertMany(users);
  console.log(`Created ${users.length} users`);

  const salesUser = users[0];
  const adminUser = users[1];

  console.log("Seeding zones and districts...");
  const zones: Zone[] = [
    {
      _id: puneZoneId,
      name: "Pune Zone",
      code: "PUNE",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: nashikZoneId,
      name: "Nashik Zone",
      code: "NASH",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  await zonesCol.insertMany(zones);

  const puneDistrictId = new ObjectId();
  const kolhapurDistrictId = new ObjectId();
  const nashikDistrictId = new ObjectId();
  
  const districts: District[] = [
    { _id: puneDistrictId, name: "Pune", code: "PUN", zoneId: puneZoneId, zoneName: "Pune Zone", createdAt: new Date(), updatedAt: new Date() },
    { _id: kolhapurDistrictId, name: "Kolhapur", code: "KOL", zoneId: puneZoneId, zoneName: "Pune Zone", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), name: "Satara", code: "SAT", zoneId: puneZoneId, zoneName: "Pune Zone", createdAt: new Date(), updatedAt: new Date() },
    { _id: nashikDistrictId, name: "Nashik", code: "NSK", zoneId: nashikZoneId, zoneName: "Nashik Zone", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), name: "Ahmednagar", code: "AHM", zoneId: nashikZoneId, zoneName: "Nashik Zone", createdAt: new Date(), updatedAt: new Date() },
  ];
  
  await districtsCol.insertMany(districts);
  console.log(`Created ${zones.length} zones and ${districts.length} districts`);

  console.log("Seeding product categories and products...");
  const fertilizerCatId = new ObjectId();
  const pesticidesId = new ObjectId();
  const micronutrientsId = new ObjectId();
  const bioproductsId = new ObjectId();
  const pgrsId = new ObjectId();
  
  const categories: ProductCategory[] = [
    { _id: fertilizerCatId, name: "Water Soluble Fertilizers", description: "NPK and specialty water soluble fertilizers", createdAt: new Date(), updatedAt: new Date() },
    { _id: pesticidesId, name: "Crop Protection", description: "Insecticides, fungicides and herbicides", createdAt: new Date(), updatedAt: new Date() },
    { _id: micronutrientsId, name: "Micronutrients", description: "Plant micronutrient supplements and chelates", createdAt: new Date(), updatedAt: new Date() },
    { _id: bioproductsId, name: "Bio Products", description: "Organic and biological products", createdAt: new Date(), updatedAt: new Date() },
    { _id: pgrsId, name: "Plant Growth Regulators", description: "Hormones and growth promoters", createdAt: new Date(), updatedAt: new Date() },
  ];
  
  await categoriesCol.insertMany(categories);

  const products: Product[] = [
    // Water Soluble Fertilizers (12 products)
    { _id: new ObjectId(), productCode: "DI-NPK-191919-25", name: "NPK 19:19:19", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1450, mrp: 1680, gstRate: 5, hsnCode: "31052000", packingSize: "25 Kg", lotSize: "50 Bags", description: "Balanced NPK for vegetative growth", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-NPK-201020-25", name: "NPK 20:10:20", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1380, mrp: 1590, gstRate: 5, hsnCode: "31052000", packingSize: "25 Kg", lotSize: "50 Bags", description: "High N & K for leafy crops", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-NPK-121232-25", name: "NPK 12:12:32", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1520, mrp: 1750, gstRate: 5, hsnCode: "31052000", packingSize: "25 Kg", lotSize: "50 Bags", description: "High potash for fruiting stage", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-NPK-130040-25", name: "NPK 13:00:45 (SOP)", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1650, mrp: 1900, gstRate: 5, hsnCode: "31052000", packingSize: "25 Kg", lotSize: "50 Bags", description: "Potassium nitrate based, chloride free", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MKP-005234-25", name: "MKP 00:52:34", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 2850, mrp: 3280, gstRate: 5, hsnCode: "31054000", packingSize: "25 Kg", lotSize: "40 Bags", description: "Mono Potassium Phosphate for flowering", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MAP-126100-25", name: "MAP 12:61:00", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 2650, mrp: 3050, gstRate: 5, hsnCode: "31054000", packingSize: "25 Kg", lotSize: "40 Bags", description: "Mono Ammonium Phosphate for root development", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-UREA-460000-25", name: "Urea 46:00:00", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 420, mrp: 480, gstRate: 5, hsnCode: "31021000", packingSize: "25 Kg", lotSize: "100 Bags", description: "High nitrogen source", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-SOP-000050-25", name: "SOP 00:00:50", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1250, mrp: 1440, gstRate: 5, hsnCode: "31043000", packingSize: "25 Kg", lotSize: "50 Bags", description: "Sulphate of Potash, chloride free K", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-CAN-260000-25", name: "Calcium Ammonium Nitrate", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 980, mrp: 1120, gstRate: 5, hsnCode: "31026000", packingSize: "25 Kg", lotSize: "50 Bags", description: "Calcium with nitrate nitrogen", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MOP-000060-50", name: "MOP 00:00:60", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1750, mrp: 2010, gstRate: 5, hsnCode: "31042000", packingSize: "50 Kg", lotSize: "25 Bags", description: "Muriate of Potash", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-SSP-000016-50", name: "SSP 00:00:16", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 450, mrp: 520, gstRate: 5, hsnCode: "31031000", packingSize: "50 Kg", lotSize: "25 Bags", description: "Single Super Phosphate with sulphur", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-DAP-184600-50", name: "DAP 18:46:00", categoryId: fertilizerCatId, categoryName: "Water Soluble Fertilizers", unitOfMeasure: "Bag", basePrice: 1450, mrp: 1670, gstRate: 5, hsnCode: "31053000", packingSize: "50 Kg", lotSize: "25 Bags", description: "Di-ammonium Phosphate", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    
    // Micronutrients (12 products)
    { _id: new ObjectId(), productCode: "DI-ZINC-EDTA-12-1", name: "Zinc EDTA 12%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Kg", basePrice: 420, mrp: 480, gstRate: 12, hsnCode: "28332990", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Chelated zinc for foliar spray", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-ZINC-SULF-21-25", name: "Zinc Sulphate 21%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Bag", basePrice: 850, mrp: 980, gstRate: 12, hsnCode: "28332990", packingSize: "25 Kg", lotSize: "40 Bags", description: "Zinc sulphate heptahydrate", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-FE-EDTA-12-1", name: "Iron EDTA 12%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Kg", basePrice: 380, mrp: 440, gstRate: 12, hsnCode: "28332990", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Chelated iron for chlorosis control", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-FE-SULF-19-25", name: "Ferrous Sulphate 19%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Bag", basePrice: 550, mrp: 630, gstRate: 12, hsnCode: "28332990", packingSize: "25 Kg", lotSize: "40 Bags", description: "Iron sulphate for soil application", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MN-EDTA-12-1", name: "Manganese EDTA 12%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Kg", basePrice: 450, mrp: 520, gstRate: 12, hsnCode: "28332990", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Chelated manganese for deficiency", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MN-SULF-30-25", name: "Manganese Sulphate 30.5%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Bag", basePrice: 720, mrp: 830, gstRate: 12, hsnCode: "28332990", packingSize: "25 Kg", lotSize: "40 Bags", description: "Manganese for soil application", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-BORON-20-1", name: "Boron 20%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Kg", basePrice: 380, mrp: 440, gstRate: 12, hsnCode: "28100010", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Disodium octaborate for flowering", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-CU-EDTA-14-1", name: "Copper EDTA 14%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Kg", basePrice: 520, mrp: 600, gstRate: 12, hsnCode: "28332990", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Chelated copper for foliar", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MOLYBDENUM-52-250", name: "Ammonium Molybdate 52%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Gm", basePrice: 280, mrp: 320, gstRate: 12, hsnCode: "28417000", packingSize: "250 Gm", lotSize: "200 Pcs", description: "Molybdenum for legumes", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-CA-EDTA-10-1", name: "Calcium EDTA 10%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Kg", basePrice: 350, mrp: 400, gstRate: 12, hsnCode: "28332990", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Chelated calcium for blossom end rot", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MG-SULF-9-25", name: "Magnesium Sulphate 9.5%", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Bag", basePrice: 580, mrp: 670, gstRate: 12, hsnCode: "28332100", packingSize: "25 Kg", lotSize: "40 Bags", description: "Epsom salt for Mg deficiency", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-SULPHUR-90-25", name: "Sulphur 90% WDG", categoryId: micronutrientsId, categoryName: "Micronutrients", unitOfMeasure: "Bag", basePrice: 480, mrp: 550, gstRate: 12, hsnCode: "28020000", packingSize: "25 Kg", lotSize: "40 Bags", description: "Micronized sulphur for soil health", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    
    // Bio Products (7 products)
    { _id: new ObjectId(), productCode: "DI-HUMIC-12-5", name: "Humic Acid 12%", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Ltr", basePrice: 180, mrp: 210, gstRate: 12, hsnCode: "38249990", packingSize: "5 Ltr", lotSize: "50 Cans", description: "Soil conditioner for root growth", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-FULVIC-5-5", name: "Fulvic Acid 5%", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Ltr", basePrice: 220, mrp: 250, gstRate: 12, hsnCode: "38249990", packingSize: "5 Ltr", lotSize: "50 Cans", description: "Nutrient uptake enhancer", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-SEAWEED-1", name: "Seaweed Extract", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Ltr", basePrice: 450, mrp: 520, gstRate: 12, hsnCode: "13023990", packingSize: "1 Ltr", lotSize: "100 Btl", description: "Natural biostimulant from kelp", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-AMINO-80-1", name: "Amino Acid 80%", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Kg", basePrice: 650, mrp: 750, gstRate: 12, hsnCode: "29224990", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Plant-derived amino acids", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-TRICHO-CFU-1", name: "Trichoderma Viride", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Kg", basePrice: 280, mrp: 320, gstRate: 5, hsnCode: "30029090", packingSize: "1 Kg", lotSize: "100 Pcs", description: "Bio-fungicide, 2x10^9 CFU/g", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-PSB-CFU-1", name: "Phosphate Solubilizing Bacteria", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Kg", basePrice: 250, mrp: 290, gstRate: 5, hsnCode: "30029090", packingSize: "1 Kg", lotSize: "100 Pcs", description: "PSB for P availability, 2x10^9 CFU/g", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-AZOTO-CFU-1", name: "Azotobacter", categoryId: bioproductsId, categoryName: "Bio Products", unitOfMeasure: "Kg", basePrice: 220, mrp: 250, gstRate: 5, hsnCode: "30029090", packingSize: "1 Kg", lotSize: "100 Pcs", description: "N-fixing bacteria, 2x10^9 CFU/g", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    
    // Crop Protection (3 products)
    { _id: new ObjectId(), productCode: "DI-IMID-17-250", name: "Imidacloprid 17.8% SL", categoryId: pesticidesId, categoryName: "Crop Protection", unitOfMeasure: "Btl", basePrice: 380, mrp: 440, gstRate: 18, hsnCode: "38089190", packingSize: "250 ml", lotSize: "100 Btl", description: "Systemic insecticide for sucking pests", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-MANCO-75-500", name: "Mancozeb 75% WP", categoryId: pesticidesId, categoryName: "Crop Protection", unitOfMeasure: "Pkt", basePrice: 280, mrp: 320, gstRate: 18, hsnCode: "38089290", packingSize: "500 Gm", lotSize: "100 Pkt", description: "Contact fungicide for leaf diseases", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-CARBEN-50-500", name: "Carbendazim 50% WP", categoryId: pesticidesId, categoryName: "Crop Protection", unitOfMeasure: "Pkt", basePrice: 320, mrp: 370, gstRate: 18, hsnCode: "38089290", packingSize: "500 Gm", lotSize: "100 Pkt", description: "Systemic fungicide for soil-borne diseases", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    
    // Plant Growth Regulators (3 products)
    { _id: new ObjectId(), productCode: "DI-GA3-90-1", name: "Gibberellic Acid 90%", categoryId: pgrsId, categoryName: "Plant Growth Regulators", unitOfMeasure: "Gm", basePrice: 850, mrp: 980, gstRate: 18, hsnCode: "29379090", packingSize: "1 Gm", lotSize: "500 Pcs", description: "GA3 for cell elongation and fruit sizing", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-NAA-4.5-100", name: "NAA 4.5% SL", categoryId: pgrsId, categoryName: "Plant Growth Regulators", unitOfMeasure: "Btl", basePrice: 180, mrp: 210, gstRate: 18, hsnCode: "29163990", packingSize: "100 ml", lotSize: "200 Btl", description: "Auxin for rooting and fruit set", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId(), productCode: "DI-ETHREL-39-500", name: "Ethephon 39% SL", categoryId: pgrsId, categoryName: "Plant Growth Regulators", unitOfMeasure: "Btl", basePrice: 420, mrp: 480, gstRate: 18, hsnCode: "29310090", packingSize: "500 ml", lotSize: "100 Btl", description: "Ethylene releaser for ripening", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
  ];
  
  await productsCol.insertMany(products);
  console.log(`Created ${categories.length} categories and ${products.length} products`);

  console.log("Seeding dealers...");
  const dealers: Dealer[] = [
    {
      _id: new ObjectId(),
      dealerCode: "DI/PUN/0001",
      firmName: "Krishi Seva Kendra",
      proprietorName: "Ramesh Jadhav",
      contactNumber: "9822334455",
      email: "krishi.seva@gmail.com",
      gstNumber: "27AABCU9603R1ZM",
      panNumber: "AABCU9603R",
      businessAddress: "Shop No. 12, Krishi Market, Shivajinagar",
      city: "Pune",
      state: "Maharashtra",
      districtId: puneDistrictId.toString(),
      districtName: "Pune",
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
      currentOutstanding: 0,
      createdById: salesUser._id!,
      createdByName: salesUser.fullName,
      approvedById: adminUser._id!,
      approvedByName: adminUser.fullName,
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      dealerCode: "DI/KOL/0001",
      firmName: "Farmer Agro Traders",
      proprietorName: "Sunil Patil",
      contactNumber: "9833445566",
      email: "farmer.agro@gmail.com",
      gstNumber: "27AABCU9604R1ZM",
      panNumber: "AABCU9604R",
      businessAddress: "Market Yard, Shop No. 5",
      city: "Kolhapur",
      state: "Maharashtra",
      districtId: kolhapurDistrictId.toString(),
      districtName: "Kolhapur",
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
      currentOutstanding: 0,
      createdById: salesUser._id!,
      createdByName: salesUser.fullName,
      approvedById: adminUser._id!,
      approvedByName: adminUser.fullName,
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      firmName: "Nashik Agri Supplies",
      proprietorName: "Vijay Wagh",
      contactNumber: "9844556677",
      email: "nashik.agri@gmail.com",
      gstNumber: "27AABCU9605R1ZM",
      panNumber: "AABCU9605R",
      businessAddress: "APMC Market, Gate No. 3",
      city: "Nashik",
      state: "Maharashtra",
      districtId: nashikDistrictId.toString(),
      districtName: "Nashik",
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
      currentOutstanding: 0,
      createdById: salesUser._id!,
      createdByName: salesUser.fullName,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      dealerCode: "DI/PUN/0002",
      firmName: "Shree Krishna Fertilizers",
      proprietorName: "Krishna Patole",
      contactNumber: "9855667788",
      email: "shreekrishna@gmail.com",
      gstNumber: "27AABCU9606R1ZM",
      panNumber: "AABCU9606R",
      businessAddress: "Main Road, Near Bus Stand",
      city: "Satara",
      state: "Maharashtra",
      pinCode: "415001",
      bankName: "ICICI Bank",
      bankAccountNumber: "60145678904",
      ifscCode: "ICIC0001234",
      yearsInBusiness: 12,
      annualTurnover: "1Cr-5Cr",
      creditPeriod: "DAYS_60",
      godownAvailable: true,
      godownSize: 800,
      vehicleAvailable: true,
      status: "APPROVED",
      creditLimit: 800000,
      currentOutstanding: 125000,
      createdById: salesUser._id!,
      createdByName: salesUser.fullName,
      approvedById: adminUser._id!,
      approvedByName: adminUser.fullName,
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  await dealersCol.insertMany(dealers);
  console.log(`Created ${dealers.length} dealers`);

  console.log("Seeding orders...");
  const product1 = products[0];
  const product2 = products[1];
  const dealer1 = dealers[0];
  const dealer2 = dealers[1];

  const order1Items = [
    {
      productId: product1._id!,
      productName: product1.name,
      productCode: product1.productCode,
      quantity: 20,
      unitPrice: product1.basePrice,
      gstRate: product1.gstRate,
      taxAmount: 20 * product1.basePrice * (product1.gstRate / 100),
      totalAmount: 20 * product1.basePrice * (1 + product1.gstRate / 100),
    },
    {
      productId: product2._id!,
      productName: product2.name,
      productCode: product2.productCode,
      quantity: 10,
      unitPrice: product2.basePrice,
      gstRate: product2.gstRate,
      taxAmount: 10 * product2.basePrice * (product2.gstRate / 100),
      totalAmount: 10 * product2.basePrice * (1 + product2.gstRate / 100),
    },
  ];

  const order1Subtotal = order1Items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const order1Tax = order1Items.reduce((sum, item) => sum + item.taxAmount, 0);
  const order1Total = order1Items.reduce((sum, item) => sum + item.totalAmount, 0);

  const orders: Order[] = [
    {
      _id: new ObjectId(),
      orderNumber: "DI/ORD/2026-06/00001",
      orderDate: new Date(),
      dealerId: dealer1._id!,
      dealerName: dealer1.firmName,
      dealerCity: dealer1.city,
      deliveryAddress: `${dealer1.businessAddress}, ${dealer1.city}`,
      items: order1Items,
      subtotal: order1Subtotal,
      taxAmount: order1Tax,
      totalAmount: order1Total,
      status: "DELIVERED",
      createdById: salesUser._id!,
      createdByName: salesUser.fullName,
      approvedById: adminUser._id!,
      approvedByName: adminUser.fullName,
      approvedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      _id: new ObjectId(),
      orderNumber: "DI/ORD/2026-06/00002",
      orderDate: new Date(),
      dealerId: dealer2._id!,
      dealerName: dealer2.firmName,
      dealerCity: dealer2.city,
      deliveryAddress: `${dealer2.businessAddress}, ${dealer2.city}`,
      items: [
        {
          productId: product1._id!,
          productName: product1.name,
          productCode: product1.productCode,
          quantity: 30,
          unitPrice: product1.basePrice,
          gstRate: product1.gstRate,
          taxAmount: 30 * product1.basePrice * (product1.gstRate / 100),
          totalAmount: 30 * product1.basePrice * (1 + product1.gstRate / 100),
        },
      ],
      subtotal: 30 * product1.basePrice,
      taxAmount: 30 * product1.basePrice * (product1.gstRate / 100),
      totalAmount: 30 * product1.basePrice * (1 + product1.gstRate / 100),
      status: "PENDING_APPROVAL",
      createdById: salesUser._id!,
      createdByName: salesUser.fullName,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  await ordersCol.insertMany(orders);
  console.log(`Created ${orders.length} orders`);

  console.log("Seeding invoices...");
  const order1 = orders[0];
  
  const invoices: Invoice[] = [
    {
      _id: new ObjectId(),
      invoiceNumber: "DI/INV/2026-06/00001",
      invoiceDate: new Date(),
      orderId: order1._id!,
      orderNumber: order1.orderNumber,
      dealerId: dealer1._id!,
      dealerName: dealer1.firmName,
      dealerGst: dealer1.gstNumber,
      dealerAddress: dealer1.businessAddress,
      dealerCity: dealer1.city,
      items: order1.items.map((item) => ({
        ...item,
        hsnCode: products.find((p) => p._id?.equals(item.productId))?.hsnCode || "",
        description: item.productName,
        discount: 0,
        taxableValue: item.quantity * item.unitPrice,
        cgstRate: item.gstRate / 2,
        cgstAmount: item.taxAmount / 2,
        sgstRate: item.gstRate / 2,
        sgstAmount: item.taxAmount / 2,
        igstRate: 0,
        igstAmount: 0,
      })),
      subtotal: order1.subtotal,
      cgstAmount: order1.taxAmount / 2,
      sgstAmount: order1.taxAmount / 2,
      igstAmount: 0,
      totalTax: order1.taxAmount,
      totalAmount: order1.totalAmount,
      dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      paidAmount: 0,
      balanceAmount: order1.totalAmount,
      status: "SENT",
      placeOfSupply: dealer1.city,
      reverseCharge: false,
      shippingName: dealer1.firmName,
      shippingAddress: dealer1.businessAddress,
      shippingCity: dealer1.city,
      shippingState: "Maharashtra",
      shippingPincode: dealer1.pinCode,
      shippingGstn: dealer1.gstNumber,
      termsAndConditions: "1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged on overdue payments.\n3. Subject to local jurisdiction.",
      bankDetails: "Bank: State Bank of India\nA/C No: 32145678901\nIFSC: SBIN0001234\nBranch: Shivajinagar, Pune",
      createdById: users[2]._id!,
      createdByName: users[2].fullName,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  await invoicesCol.insertMany(invoices);
  console.log(`Created ${invoices.length} invoices`);

  console.log("\n✅ MongoDB seed completed successfully!");
  console.log("\nTest accounts:");
  console.log("  - admin@xenvolt.com / password123 (MANAGEMENT_ADMIN)");
  console.log("  - sales@xenvolt.com / password123 (SALES_MARKETING)");
  console.log("  - logistics@xenvolt.com / password123 (PRODUCTION_LOGISTICS)");
  console.log("  - account@xenvolt.com / password123 (ACCOUNT)");
  
  await closeMongoDB();
}

seedMongoDB().catch(console.error);
