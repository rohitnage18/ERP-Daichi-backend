export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function generateInvoiceNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `XV/INV/${year}-${month}/${seq}`;
}

export function generateCreditNoteNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `XV/CN/${year}-${month}/${seq}`;
}

export function generateDebitNoteNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `XV/DN/${year}-${month}/${seq}`;
}

export function generateOrderNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `XV/ORD/${year}-${month}/${seq}`;
}

export function generateDispatchNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `XV/DSP/${year}-${month}/${seq}`;
}

export function generateDealerCode(districtCode: string, sequence: number): string {
  const seq = String(sequence).padStart(4, "0");
  return `XV/${districtCode}/${seq}`;
}

export function calculateDueDate(invoiceDate: Date, creditPeriod: string): Date {
  const days = creditPeriod === "DAYS_45" ? 45 : 60;
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + days);
  return dueDate;
}

export function getAgingBucket(dueDate: Date): string {
  const today = new Date();
  const diffTime = today.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Current";
  if (diffDays <= 30) return "0-30 Days";
  if (diffDays <= 45) return "31-45 Days";
  if (diffDays <= 60) return "46-60 Days";
  return "60+ Days";
}

export const INDIAN_STATE_CODES: Record<string, { code: string; name: string }> = {
  "01": { code: "01", name: "Jammu & Kashmir" },
  "02": { code: "02", name: "Himachal Pradesh" },
  "03": { code: "03", name: "Punjab" },
  "04": { code: "04", name: "Chandigarh" },
  "05": { code: "05", name: "Uttarakhand" },
  "06": { code: "06", name: "Haryana" },
  "07": { code: "07", name: "Delhi" },
  "08": { code: "08", name: "Rajasthan" },
  "09": { code: "09", name: "Uttar Pradesh" },
  "10": { code: "10", name: "Bihar" },
  "11": { code: "11", name: "Sikkim" },
  "12": { code: "12", name: "Arunachal Pradesh" },
  "13": { code: "13", name: "Nagaland" },
  "14": { code: "14", name: "Manipur" },
  "15": { code: "15", name: "Mizoram" },
  "16": { code: "16", name: "Tripura" },
  "17": { code: "17", name: "Meghalaya" },
  "18": { code: "18", name: "Assam" },
  "19": { code: "19", name: "West Bengal" },
  "20": { code: "20", name: "Jharkhand" },
  "21": { code: "21", name: "Odisha" },
  "22": { code: "22", name: "Chhattisgarh" },
  "23": { code: "23", name: "Madhya Pradesh" },
  "24": { code: "24", name: "Gujarat" },
  "26": { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  "27": { code: "27", name: "Maharashtra" },
  "28": { code: "28", name: "Andhra Pradesh (Old)" },
  "29": { code: "29", name: "Karnataka" },
  "30": { code: "30", name: "Goa" },
  "31": { code: "31", name: "Lakshadweep" },
  "32": { code: "32", name: "Kerala" },
  "33": { code: "33", name: "Tamil Nadu" },
  "34": { code: "34", name: "Puducherry" },
  "35": { code: "35", name: "Andaman & Nicobar Islands" },
  "36": { code: "36", name: "Telangana" },
  "37": { code: "37", name: "Andhra Pradesh" },
  "38": { code: "38", name: "Ladakh" },
  "97": { code: "97", name: "Other Territory" },
  "99": { code: "99", name: "Centre Jurisdiction" },
};

export function getStateCodeFromGSTIN(gstin: string): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.substring(0, 2);
  return INDIAN_STATE_CODES[code] ? code : null;
}

export function getStateNameFromCode(code: string): string {
  return INDIAN_STATE_CODES[code]?.name || code;
}

export function getStateFromGSTIN(gstin: string): { code: string; name: string } | null {
  const code = getStateCodeFromGSTIN(gstin);
  if (!code) return null;
  return INDIAN_STATE_CODES[code] || null;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function convertToWords(num: number): string {
  if (num === 0) return "";
  if (num < 20) return ONES[num];
  if (num < 100) return TENS[Math.floor(num / 10)] + (num % 10 ? " " + ONES[num % 10] : "");
  if (num < 1000) return ONES[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convertToWords(num % 100) : "");
  if (num < 100000) return convertToWords(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convertToWords(num % 1000) : "");
  if (num < 10000000) return convertToWords(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convertToWords(num % 100000) : "");
  return convertToWords(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + convertToWords(num % 10000000) : "");
}

export function amountToWords(amount: number): string {
  if (amount === 0) return "Zero Rupees Only";
  
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  
  let words = convertToWords(rupees) + " Rupees";
  if (paise > 0) {
    words += " and " + convertToWords(paise) + " Paise";
  }
  words += " Only";
  
  return words;
}

export const UQC_CODES: Record<string, string> = {
  "BAG": "BAG-BAGS",
  "BAL": "BAL-BALE",
  "BDL": "BDL-BUNDLES",
  "BKL": "BKL-BUCKLES",
  "BOU": "BOU-BILLION OF UNITS",
  "BOX": "BOX-BOX",
  "BTL": "BTL-BOTTLES",
  "BUN": "BUN-BUNCHES",
  "CAN": "CAN-CANS",
  "CBM": "CBM-CUBIC METERS",
  "CCM": "CCM-CUBIC CENTIMETERS",
  "CMS": "CMS-CENTIMETERS",
  "CTN": "CTN-CARTONS",
  "DOZ": "DOZ-DOZENS",
  "DRM": "DRM-DRUMS",
  "GGK": "GGK-GREAT GROSS",
  "GMS": "GMS-GRAMMES",
  "GRS": "GRS-GROSS",
  "GYD": "GYD-GROSS YARDS",
  "KGS": "KGS-KILOGRAMS",
  "KLR": "KLR-KILOLITRE",
  "KME": "KME-KILOMETRE",
  "LTR": "LTR-LITRES",
  "MLT": "MLT-MILILITRE",
  "MTR": "MTR-METERS",
  "MTS": "MTS-METRIC TON",
  "NOS": "NOS-NUMBERS",
  "OTH": "OTH-OTHERS",
  "PAC": "PAC-PACKS",
  "PCS": "PCS-PIECES",
  "PRS": "PRS-PAIRS",
  "QTL": "QTL-QUINTAL",
  "ROL": "ROL-ROLLS",
  "SET": "SET-SETS",
  "SQF": "SQF-SQUARE FEET",
  "SQM": "SQM-SQUARE METERS",
  "SQY": "SQY-SQUARE YARDS",
  "TBS": "TBS-TABLETS",
  "TGM": "TGM-TEN GROSS",
  "THD": "THD-THOUSANDS",
  "TON": "TON-TONNES",
  "TUB": "TUB-TUBES",
  "UGS": "UGS-US GALLONS",
  "UNT": "UNT-UNITS",
  "YDS": "YDS-YARDS",
};

export function getUQCCode(unit: string): string {
  const upperUnit = (unit || "").toUpperCase();
  if (UQC_CODES[upperUnit]) return upperUnit;
  
  if (upperUnit.includes("KG") || upperUnit.includes("KILOGRAM")) return "KGS";
  if (upperUnit.includes("BAG")) return "BAG";
  if (upperUnit.includes("LTR") || upperUnit.includes("LITR")) return "LTR";
  if (upperUnit.includes("BOX")) return "BOX";
  if (upperUnit.includes("PACK")) return "PAC";
  if (upperUnit.includes("PC") || upperUnit.includes("PIECE")) return "PCS";
  if (upperUnit.includes("BOTTLE")) return "BTL";
  if (upperUnit.includes("TON")) return "MTS";
  if (upperUnit.includes("QUINTAL") || upperUnit.includes("QTL")) return "QTL";
  
  return "NOS";
}
