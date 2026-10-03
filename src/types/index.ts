/**
 * Destination types are declared once here so the database enums, the validation
 * schemas and the UI all stay in sync. Adding a new type means adding one entry.
 */
export const DESTINATION_TYPES = [
  "INSTAGRAM",
  "GOOGLE_REVIEW",
  "WHATSAPP",
  "CUSTOM",
] as const;

export type DestinationType = (typeof DESTINATION_TYPES)[number];

export const QR_STATUSES = ["GENERATED", "ACTIVE", "INACTIVE"] as const;
export type QrStatus = (typeof QR_STATUSES)[number];

type DestinationConfig = {
  label: string;
  /** `phone` fields accept a bare number, `url` fields require a full http(s) URL. */
  input: "url" | "phone";
  placeholder: string;
  help: string;
};

export const DESTINATION_CONFIG: Record<DestinationType, DestinationConfig> = {
  INSTAGRAM: {
    label: "Instagram",
    input: "url",
    placeholder: "https://instagram.com/yourbusiness",
    help: "Full URL of your Instagram profile.",
  },
  GOOGLE_REVIEW: {
    label: "Google Review",
    input: "url",
    placeholder: "https://g.page/r/xxxxx/review",
    help: "Google review link (Google Maps → your business → Share → Copy review link).",
  },
  WHATSAPP: {
    label: "WhatsApp",
    input: "phone",
    placeholder: "919876543210",
    help: "WhatsApp number with country code, digits only.",
  },
  CUSTOM: {
    label: "Custom URL",
    input: "url",
    placeholder: "https://example.com",
    help: "Any http or https address.",
  },
};
/** Unambiguous alphabet: no I/O/0/1 so IDs can be read aloud and retyped. */
export const QR_ID_PREFIX = "QR";
export const QR_ID_BODY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const QR_ID_BODY_LENGTH = 8;
export const QR_ID_PATTERN = /^QR[A-Z0-9]{6,10}$/;
export const QR_ID_REGEX = new RegExp(QR_ID_PATTERN.source, "i");

export const isDestinationType = (value: unknown): value is DestinationType =>
  typeof value === "string" && (DESTINATION_TYPES as readonly string[]).includes(value);

/** Display label for a destination type, safe for values read straight from Mongo. */
export function destinationLabel(type: unknown): string {
  return isDestinationType(type) ? DESTINATION_CONFIG[type].label : "—";
}
