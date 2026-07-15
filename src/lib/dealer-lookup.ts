import { getDb, Dealer, DaichiDealer, ObjectId } from "./mongodb";

export interface ResolvedDealer {
  _id: ObjectId;
  firmName: string;
  city: string;
  businessAddress: string;
  state?: string;
  gstNumber?: string;
  contactPersonName?: string;
  contactNumber?: string;
  source: "dealers" | "daichiDealers";
}

export async function findDealerById(dealerId: string): Promise<ResolvedDealer | null> {
  const db = await getDb();
  const dealersCol = db.collection<Dealer>("dealers");
  const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");

  let dealer: Dealer | DaichiDealer | null = null;

  if (ObjectId.isValid(dealerId)) {
    dealer = await dealersCol.findOne({ _id: new ObjectId(dealerId) });
    if (!dealer) {
      dealer = await daichiDealersCol.findOne({ _id: new ObjectId(dealerId) });
    }
  }

  if (!dealer) {
    dealer = await daichiDealersCol.findOne({ externalId: dealerId });
  }

  if (!dealer) {
    return null;
  }

  if ("externalId" in dealer) {
    const d = dealer as DaichiDealer;
    return {
      _id: d._id!,
      firmName: d.firmName || "",
      city: d.city || "",
      businessAddress: d.firmAddress || d.contactPersonAddress || "",
      state: d.state,
      gstNumber: d.gstNumber,
      contactPersonName: d.contactPersonName,
      contactNumber: d.mobileNumber || d.telephoneNumber,
      source: "daichiDealers",
    };
  }

  const d = dealer as Dealer;
  return {
    _id: d._id!,
    firmName: d.firmName,
    city: d.city,
    businessAddress: d.businessAddress,
    state: d.state,
    gstNumber: d.gstNumber,
    contactPersonName: d.proprietorName,
    contactNumber: d.contactNumber || d.alternateContact,
    source: "dealers",
  };
}
