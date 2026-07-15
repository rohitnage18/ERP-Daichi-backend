import "dotenv/config";
import { connectMongoDB, closeMongoDB, ObjectId, Product, ProductCategory } from "../lib/mongodb";

async function updateProducts() {
  console.log("Updating products in MongoDB...");
  
  const db = await connectMongoDB();
  
  const categoriesCol = db.collection<ProductCategory>("productCategories");
  const productsCol = db.collection<Product>("products");

  // Clear existing products and categories
  await productsCol.deleteMany({});
  await categoriesCol.deleteMany({});
  console.log("Cleared existing products and categories");

  // Create categories
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
  console.log(`Created ${categories.length} categories`);

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
  console.log(`Created ${products.length} products in ${categories.length} categories`);

  await closeMongoDB();
  console.log("Products updated successfully!");
}

updateProducts().catch(console.error);
