import { Types } from "mongoose";
import { Merchant } from "@/models/Merchant";
import { QR } from "@/models/QR";

export type MerchantDetails = { mobile: string; ownerName: string; businessName: string };

/**
 * Finds the merchant for a mobile number, creating the record on first use.
 * The mobile number is the identity and the source of truth for the record, so
 * the stored details are never overwritten here — callers refresh them only
 * after they own a QR code.
 */
export async function findOrCreateMerchant(details: MerchantDetails) {
  const result = await Merchant.findOneAndUpdate(
    { mobile: details.mobile },
    { $setOnInsert: { name: details.ownerName, businessName: details.businessName } },
    { upsert: true, returnDocument: "after", includeResultMetadata: true, setDefaultsOnInsert: true },
  );

  const merchant = (result.value ?? null) as Awaited<ReturnType<typeof findMerchantById>>;
  if (!merchant) throw new Error("Merchant upsert returned no document");

  const metadata = result.lastErrorObject as { updatedExisting?: boolean } | undefined;
  return { merchant, created: metadata?.updatedExisting === false };
}

/** Called after a QR code is successfully claimed, so the shop can rename itself. */
export async function refreshMerchantDetails(merchantId: Types.ObjectId, details: MerchantDetails) {
  await Merchant.updateOne({ _id: merchantId }, { $set: { name: details.ownerName, businessName: details.businessName } });
}

/** Removes a shop created for a claim that lost a race, provided nothing owns it. */
export async function deleteMerchantIfUnused(merchantId: Types.ObjectId) {
  if (await QR.exists({ merchantId })) return;
  await Merchant.deleteOne({ _id: merchantId });
}

export async function findMerchantById(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return Merchant.findById(id).lean();
}
