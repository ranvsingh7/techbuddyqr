import { Schema, model, models, type InferSchemaType } from "mongoose";
import { DESTINATION_TYPES } from "@/types";

/**
 * A reusable design. The base image lives in the storage layer, never in MongoDB.
 *
 * `overlay` holds the two independent layers placed on that artwork, both in the
 * natural pixel size of the stored image. `qrPosition` is the older single-block
 * shape: it is still written for backwards compatibility and is used to give
 * pre-overlay templates a sensible text layer, but new code reads `overlay`.
 */
const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Suggested destination type for QRs printed from this template. */
    type: { type: String, enum: [...DESTINATION_TYPES, null], default: null },
    /** Storage key, resolved through the storage layer. */
    imageKey: { type: String, required: true },
    imageWidth: { type: Number, required: true, min: 1 },
    imageHeight: { type: Number, required: true, min: 1 },
    /** Layer 1: the QR code. Always square, so width and height are both `size`. */
    overlay: {
      qr: {
        x: { type: Number, default: null },
        y: { type: Number, default: null },
        size: { type: Number, default: null },
      },
      /** Layer 2: the printed QR ID, placed anywhere on its own. */
      text: {
        x: { type: Number, default: null },
        y: { type: Number, default: null },
        fontSize: { type: Number, default: null },
        rotation: { type: Number, default: null },
        alignment: { type: String, enum: ["left", "center", "right", null], default: null },
      },
    },
    /** Legacy single QR block, kept in sync for older readers. */
    qrPosition: {
      x: { type: Number, required: true, min: 0 },
      y: { type: Number, required: true, min: 0 },
      width: { type: Number, required: true, min: 32 },
      height: { type: Number, required: true, min: 32 },
    },
    /** Draw a white plate behind the QR square so dark artwork stays readable. */
    lightPlate: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "templates" },
);

templateSchema.index({ name: 1 });

export type TemplateDoc = InferSchemaType<typeof templateSchema>;

export const Template = models.Template ?? model("Template", templateSchema);
