import type { NextConfig } from "next";

/**
 * Baseline hardening for every response.
 *
 * Deliberately conservative: nothing here may block a QR image, a design or ZIP
 * download, or the camera-based card scanner on `/activate` (hence `camera=(self)`
 * instead of a blanket deny). `Strict-Transport-Security` is ignored over plain
 * HTTP, so it is safe to send in local development too.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** A scan must never leak which card was visited to the destination it opens. */
const scanHeaders = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  // Do not advertise the framework version.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Listed after the catch-all so the stricter value wins on /q/<qrId>.
      { source: "/q/:path*", headers: scanHeaders },
    ];
  },
};

export default nextConfig;
