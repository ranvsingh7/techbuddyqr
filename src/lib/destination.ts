import { DESTINATION_CONFIG, QR_ID_REGEX, type DestinationType } from "@/types";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Returns a canonical http(s) URL, or null when the input is unusable or unsafe. */
export function sanitizeHttpUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 2048 || CONTROL_CHARS.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;

  return url.toString();
}

/** Returns country-code digits only, or null when the number is implausible. */
export function sanitizePhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Converts a merchant supplied destination into the exact string stored in the
 * database and later used for the redirect.
 */
export function sanitizeDestination(type: DestinationType, input: string): string | null {
  if (DESTINATION_CONFIG[type].input === "phone") {
    const digits = sanitizePhoneNumber(input);
    return digits ? `https://wa.me/${digits}` : null;
  }
  return sanitizeHttpUrl(input);
}

/** Accepts a pasted link, a /q/QRXXXX link, or a bare QR ID typed by hand. */
export function extractQrId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (QR_ID_REGEX.test(raw)) return raw.toUpperCase();

  const candidate = /\/q\/([A-Za-z0-9]+)/.exec(raw) ?? /[?&]qr=([A-Za-z0-9]+)/.exec(raw);
  const fromUrl = candidate?.[1]?.toUpperCase();
  return fromUrl && QR_ID_REGEX.test(fromUrl) ? fromUrl : null;
}
