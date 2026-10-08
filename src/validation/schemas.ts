import { z } from "zod";
import { DESTINATION_TYPES, QR_PRINT_STATUSES, QR_STATUSES, QR_ID_PATTERN } from "@/types";
import { MIN_QR_SIZE, MIN_TEXT_SIZE, TEXT_ALIGNMENTS } from "@/qr/overlay";

export const MAX_BULK_COUNT = 1000;
/** ZIP batches are rendered in memory, so keep the ceiling conservative. */
export const MAX_ZIP_COUNT = 100;

export const qrIdSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => QR_ID_PATTERN.test(value), "Invalid QR ID");

/** Digits only, country code included, so one shop is always one record. */
const mobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => /^\d{10,15}$/.test(value), "Enter a valid mobile number with country code");

const nameSchema = z.string().trim().min(2, "Too short").max(120, "Too long");

const destinationSchema = z.string().trim().min(3, "Required").max(2048, "Too long");

export const merchantDetailsSchema = z.object({
  mobile: mobileSchema,
  ownerName: nameSchema,
  businessName: nameSchema,
});

export const destinationTypeSchema = z.enum(DESTINATION_TYPES);
export const qrStatusSchema = z.enum(QR_STATUSES);
export const qrPrintStatusSchema = z.enum(QR_PRINT_STATUSES);

export const activateQrSchema = merchantDetailsSchema.extend({
  qrId: qrIdSchema,
  type: destinationTypeSchema,
  destination: destinationSchema,
});
export type ActivateQrInput = z.infer<typeof activateQrSchema>;

/** Same as activation, with the QR ID taken from the URL and merchant nested. */
export const adminActivateQrSchema = z.object({
  type: destinationTypeSchema,
  destination: destinationSchema,
  merchant: merchantDetailsSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Too short").max(200, "Too long"),
});

export const bulkGenerateSchema = z.object({
  count: z.coerce.number().int().min(1).max(MAX_BULK_COUNT),
});

export const updatePrintStatusSchema = z.object({
  qrIds: z.array(qrIdSchema).min(1).max(MAX_BULK_COUNT),
  printStatus: qrPrintStatusSchema,
});

/**
 * Bulk delete. IDs are trimmed, upper-cased and validated one by one, then
 * de-duplicated so the same code can never be counted twice.
 */
export const deleteQrCodesSchema = z.object({
  qrIds: z
    .array(qrIdSchema)
    .min(1, "Select at least one QR code")
    .max(MAX_BULK_COUNT)
    .transform((qrIds) => [...new Set(qrIds)]),
});

export const qrListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: qrStatusSchema.optional(),
  type: destinationTypeSchema.optional(),
  merchantId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const destinationFieldsSchema = z.object({
  type: destinationTypeSchema,
  destination: destinationSchema,
});

/**
 * Admin edits: the destination type and value move together, the status can be
 * paused or resumed on its own. Status changes never touch the destination.
 */
export const editQrSchema = z
  .object({
    type: destinationTypeSchema.optional(),
    destination: destinationSchema.optional(),
    status: qrStatusSchema.optional(),
  })
  .refine((value) => (value.type === undefined) === (value.destination === undefined), {
    message: "Provide the destination type and value together",
    path: ["type"],
  })
  .refine((value) => value.type !== undefined || value.status !== undefined, {
    message: "Nothing to update",
    path: ["status"],
  });
export type EditQrInput = z.infer<typeof editQrSchema>;

export const reassignQrSchema = z
  .object({
    merchantId: z.string().trim().min(1).optional(),
    mobile: mobileSchema.optional(),
    ownerName: nameSchema.optional(),
    businessName: nameSchema.optional(),
    type: destinationTypeSchema.optional(),
    destination: destinationSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.merchantId) || Boolean(value.mobile && value.ownerName && value.businessName),
    "Provide an existing merchant or full merchant details",
  );

/** Layer 1. A square, so there is no separate width and height. */
export const qrLayerSchema = z.object({
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
  size: z.coerce.number().int().min(MIN_QR_SIZE),
  dotStyle: z.enum(["square", "round"]).optional(),
  icon: z.union([
    z.enum(["none", "instagram", "google", "whatsapp", "link"]),
    z.object({ type: z.literal("custom"), dataUrl: z.string().max(500_000) }),
  ]).optional(),
});

/** Layer 2. Placed anywhere on the artwork, independent of the QR. */
export const textLayerSchema = z.object({
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
  fontSize: z.coerce.number().int().min(MIN_TEXT_SIZE),
  rotation: z.coerce.number().int().min(-360).max(360).default(0),
  alignment: z.enum(TEXT_ALIGNMENTS).default("center"),
});

export const overlaySchema = z.object({
  qr: qrLayerSchema,
  text: textLayerSchema,
});

/** Either layer may be sent on its own when editing. */
export const overlayPatchSchema = z.object({
  qr: qrLayerSchema.partial().optional(),
  text: textLayerSchema.partial().optional(),
});

/** Pre-overlay templates only; still accepted so old clients keep working. */
export const qrPositionSchema = z.object({
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
  width: z.coerce.number().int().min(32),
  height: z.coerce.number().int().min(32),
});

/** Either shape is accepted: the two-layer overlay, or a pre-overlay rectangle. */
const withOverlay = { overlay: overlaySchema.optional(), qrPosition: qrPositionSchema.optional() };

export const createTemplateSchema = z
  .object({
    name: nameSchema,
    type: destinationTypeSchema.nullable().default(null),
    lightPlate: z.boolean().default(true),
    ...withOverlay,
  })
  .refine((value) => Boolean(value.overlay ?? value.qrPosition), {
    message: "Place the QR code and the QR ID on the artwork",
    path: ["overlay"],
  });

export const updateTemplateSchema = z.object({
  name: nameSchema.optional(),
  type: destinationTypeSchema.nullable().optional(),
  lightPlate: z.boolean().optional(),
  overlay: overlayPatchSchema.optional(),
  qrPosition: qrPositionSchema.optional(),
});

export const downloadDesignsSchema = z.object({
  templateId: z.string().trim().min(1),
  qrIds: z.array(qrIdSchema).min(1).max(MAX_ZIP_COUNT),
});

/** Flattens a ZodError into a small field -> message map for form display. */
export function formatZodError(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    details[key] ??= issue.message;
  }
  return details;
}
