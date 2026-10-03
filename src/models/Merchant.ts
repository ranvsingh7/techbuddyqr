import { Schema, model, models, type InferSchemaType } from "mongoose";

const merchantSchema = new Schema(
  {
    /** Owner / contact person name. */
    name: { type: String, required: true, trim: true, maxlength: 120 },
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    /** Digits only, country code included (e.g. 919876543210). */
    mobile: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { timestamps: true, collection: "merchants" },
);

merchantSchema.index({ mobile: 1 });

export type MerchantDoc = InferSchemaType<typeof merchantSchema>;

export const Merchant = models.Merchant ?? model("Merchant", merchantSchema);
