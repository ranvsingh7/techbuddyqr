import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One row per scan of a QR code. `ipHash` is a salted one-way hash so raw IP
 * addresses are never stored. Writes happen after the redirect response is sent.
 */
const scanEventSchema = new Schema(
  {
    qrId: { type: String, required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
    userAgent: { type: String, default: null, maxlength: 512 },
    ipHash: { type: String, default: null },
  },
  { timestamps: false, collection: "scan_events" },
);

scanEventSchema.index({ qrId: 1 });
scanEventSchema.index({ timestamp: -1 });

export type ScanEventDoc = InferSchemaType<typeof scanEventSchema>;

export const ScanEvent = models.ScanEvent ?? model("ScanEvent", scanEventSchema);
