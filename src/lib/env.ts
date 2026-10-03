import path from "node:path";

type Env = {
  mongodbUri: string;
  appUrl: string;
  authSecret: string;
  adminEmail: string;
  adminPasswordHash: string;
  storageDir: string;
};

let cached: Env | null = null;

/** Writable per-instance directory used when the deployment has no persistent disk. */
export const TEMPORARY_STORAGE_DIR = "/tmp/qr-builder-storage";

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Missing required environment variable: ${name}`);
  return trimmed;
}

/**
 * Where template artwork lives.
 *
 * An explicit `STORAGE_DIR` always wins, so local development and any mounted
 * volume keep working exactly as before. Otherwise the default `./storage` folder
 * is only usable when the filesystem is writable: Vercel mounts the deployment
 * read-only and only `/tmp` can be written, so uploads would fail with EROFS.
 * `turbopackIgnore` keeps these paths from being pulled into the serverless trace.
 */
export function resolveStorageDir(source: Record<string, string | undefined>): string {
  const configured = source.STORAGE_DIR?.trim();
  if (configured) return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);

  const readOnlyDeployment = Boolean(source.VERCEL) || Boolean(source.AWS_LAMBDA_FUNCTION_NAME);
  if (readOnlyDeployment) return TEMPORARY_STORAGE_DIR;

  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "./storage");
}

/** Reads and validates environment variables lazily so `next build` never needs them. */
export function env(): Env {
  if (cached) return cached;

  const appUrl = required("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "");

  cached = {
    mongodbUri: required("MONGODB_URI", process.env.MONGODB_URI),
    appUrl,
    authSecret: required("AUTH_SECRET", process.env.AUTH_SECRET),
    adminEmail: required("ADMIN_EMAIL", process.env.ADMIN_EMAIL).toLowerCase(),
    adminPasswordHash: required("ADMIN_PASSWORD_HASH", process.env.ADMIN_PASSWORD_HASH),
    storageDir: resolveStorageDir(process.env),
  };

  return cached;
}

/** Public redirect URL for a QR ID. */
export function qrRedirectUrl(qrId: string): string {
  return `${env().appUrl}/q/${qrId}`;
}
