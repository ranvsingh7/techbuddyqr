import { randomInt } from "node:crypto";
import { QR_ID_BODY_ALPHABET, QR_ID_BODY_LENGTH, QR_ID_PREFIX } from "@/types";

/** Cryptographically random, human-readable ID such as `QRA7K29X4P`. */
export function generateQrIdCandidate(): string {
  let body = "";
  for (let index = 0; index < QR_ID_BODY_LENGTH; index += 1) {
    body += QR_ID_BODY_ALPHABET[randomInt(QR_ID_BODY_ALPHABET.length)];
  }
  return `${QR_ID_PREFIX}${body}`;
}
