/** True for a MongoDB unique-index violation, independent of driver version. */
export function isDuplicateKeyError(error: unknown): boolean {
  const candidate = error as { code?: unknown; codeName?: unknown } | null;
  if (!candidate || typeof candidate !== "object") return false;
  return candidate.code === 11000 || candidate.codeName === "DuplicateKey";
}
