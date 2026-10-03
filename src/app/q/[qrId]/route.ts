import { NextResponse, after } from "next/server";
import { dbConnect } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { hashIp } from "@/lib/hash";
import { sanitizeHttpUrl } from "@/lib/destination";
import { QR } from "@/models/QR";
import { ScanEvent } from "@/models/ScanEvent";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 240;
const SCAN_WINDOW_MS = 60_000;

/**
 * Plain, self-contained error page. Served straight from the route so an
 * inactive code costs a single database lookup and never reveals any detail
 * about the record behind the ID.
 */
function inactivePage(): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>QR code not active</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f7f7f8;color:#171717;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       padding:24px;text-align:center}
  .box{max-width:420px}
  h1{font-size:20px;margin:0 0 8px}
  p{margin:0;color:#555;font-size:15px;line-height:1.5}
  a{display:inline-block;margin-top:14px;color:#171717;font-weight:600;text-decoration:underline}
</style></head>
<body><div class="box">
  <h1>This QR code is not active.</h1>
  <p>Please contact the business that gave you this card.</p>
  <p><a href="/activate">Are you the shop owner? Activate your card</a></p>
</div></body></html>`;

  return new Response(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

/**
 * Public scan endpoint. The QR code only contains this URL; the destination is
 * always resolved from the database so it can be changed without reprinting.
 */
export async function GET(request: Request, ctx: RouteContext<"/q/[qrId]">): Promise<Response> {
  const { qrId } = await ctx.params;
  const id = typeof qrId === "string" ? qrId.toUpperCase() : "";

  if (!rateLimit(`scan:${clientIp(request)}`, SCAN_LIMIT, SCAN_WINDOW_MS).allowed) {
    return inactivePage();
  }

  await dbConnect();
  const qr = await QR.findOne({ qrId: id }, { status: 1, destinationUrl: 1 }).lean();

  if (!qr || qr.status !== "ACTIVE" || !qr.destinationUrl) return inactivePage();

  const destination = sanitizeHttpUrl(qr.destinationUrl);
  if (!destination) return inactivePage();

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  // Analytics must never delay the redirect: the event is written after the response.
  after(async () => {
    try {
      const timestamp = new Date();
      await ScanEvent.create({ qrId: id, timestamp, userAgent, ipHash: hashIp(ip) });
      await QR.updateOne({ qrId: id }, { $set: { lastScannedAt: timestamp } });
    } catch (error) {
      console.error("scan event failed", error);
    }
  });

  return NextResponse.redirect(destination, {
    status: 302,
    headers: { "cache-control": "no-store, max-age=0", "referrer-policy": "no-referrer" },
  });
}
