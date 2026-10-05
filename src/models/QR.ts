import { Schema, model, models, type InferSchemaType } from "mongoose";
import { DESTINATION_TYPES, QR_STATUSES } from "@/types";

const qrSchema = new Schema(
  {
    /** Permanent physical identity of the card. Never changes, always unique. */
    qrId: { type: String, required: true, trim: true, uppercase: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", default: null },
    /**
     * The template this QR is printed from. A reference only: the artwork itself
     * stays on the template document, so a thousand QRs on one template still
     * mean a single stored image.
     */
    templateId: { type: Schema.Types.ObjectId, ref: "Template", default: null },
    type: { type: String, enum: [...DESTINATION_TYPES, null], default: null },
    destinationUrl: { type: String, default: null },
    status: { type: String, enum: QR_STATUSES, required: true, default: "GENERATED" },
    activatedAt: { type: Date, default: null },
    lastScannedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "qrs" },
);

qrSchema.index({ qrId: 1 }, { unique: true });
qrSchema.index({ merchantId: 1 });
qrSchema.index({ templateId: 1 });
qrSchema.index({ status: 1 });
qrSchema.index({ type: 1 });
qrSchema.index({ createdAt: -1 });

export type QrDoc = InferSchemaType<typeof qrSchema>;

export const QR = models.QR ?? model("QR", qrSchema);
