# QR Business Manager

Print-friendly QR and NFC cards whose destination lives in a database. A shop prints its
cards once; the owner activates the card from a phone and sets where it leads (WhatsApp,
Google review, Instagram, or any URL). From then on the admin can change that destination
at any time **without reprinting anything**, because the printed QR only contains a
permanent ID.

```
QR ID  ≠  Merchant  ≠  Destination
QRA7K29X4P   Corner Shop   https://wa.me/919876543210
```

- **Permanent ID.** `QR` plus 8 unambiguous characters (`QRA7K29X4P`). No `I`, `O`, `0`, `1`,
  so a customer can read it out loud and a shopkeeper can retype it.
- **Live redirect.** The card encodes `https://your-app/q/QRA7K29X4P`. Scanning looks the ID
  up in MongoDB and answers with a 302. The database is the only source of truth.
- **Self-service activation.** The owner scans the card with the phone camera, lands on
  `/activate`, and claims it. The claim is atomic, so two shops activating the same card at
  the same moment cannot both win.
- **Print tooling.** Upload artwork once, drag a QR area onto it, then generate finished
  designs per QR ID as PNGs or one ZIP.

## Requirements

- Node.js 20.9 or newer (developed on 22)
- A MongoDB instance. Local, Atlas, or a container:

  ```bash
  docker run -d --name qrbuilder-mongo -p 27018:27017 mongo:8
  ```

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string, including the database name. |
| `NEXT_PUBLIC_APP_URL` | Public base URL. Every printed QR contains it, so set it to your real domain and never change it afterwards. |
| `AUTH_SECRET` | Signs the admin session cookie and salts IP hashes. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ADMIN_EMAIL` | Email of the single admin account. |
| `ADMIN_PASSWORD_HASH` | Run `npm run hash-password -- "your-password"` and paste the printed value. The plaintext password is never stored. |
| `STORAGE_DIR` | Folder for template artwork. Defaults to `./storage` locally, and to `/tmp/qr-builder-storage` on a read-only deployment such as Vercel. |

> The password hash uses dots (`scrypt.salt.hash`) rather than `$`. Next.js expands `$VAR`
> references while loading `.env.local`, which would silently corrupt a `$`-separated hash.

Then:

```bash
npm run dev
```

- `http://localhost:3000` → activation page (the shop owner starts here)
- `http://localhost:3000/admin` → admin dashboard

On first use the app connects to MongoDB and creates its indexes. No migration step.

## How a card works

### 1. Generate IDs

`/admin/qr-generator` creates up to 1000 unique IDs per batch. Candidate IDs are checked
against the database and inserted with `ordered: false`, and the unique index on `qrId` is
the final guard, so two people generating at the same time never receive the same ID.

### 2. Print the designs

`/admin/templates` → create a template → upload artwork → place the two layers. The QR
square and the printed ID are placed independently, each in original-image pixels: move and
resize the QR with its corner handles, select the ID to move it, resize it from any corner,
and turn it with the handle above it. Both layers are kept inside the artwork, and the white
plate follows the QR only, so the ID can sit anywhere a shop wants it.

`/admin/templates/<id>` then renders one finished design per QR ID and downloads the batch
as a ZIP of `PNG` files named after their ID.

Printing details that matter:

- The QR uses error correction level `Q` and a four-module quiet zone.
- Modules are rendered at exact integer pixels. Resizing a finished symbol distorts the
  module grid, so the tests decode the printed result with a real scanner instead.
- Tests render at several sizes and simulate a photographed print, then decode with ZXing.

### 3. The shop activates a card

Scanning an unactivated card shows a neutral page with a link to `/activate`. The owner
enters business name, mobile, and a destination, or scans the code with the phone camera
(`BarcodeDetector`, with manual ID entry as the fallback).

Activation:

1. looks the QR up, and refuses anything already claimed;
2. finds or creates the merchant by mobile number — the mobile number is the identity;
3. claims the QR with a single atomic update requiring `status: GENERATED` and no merchant;
4. refreshes the merchant's name only after the claim succeeded, so a losing attempt cannot
   rename an existing shop.

### 4. The admin manages the fleet

| Page | What it does |
| --- | --- |
| `/admin` | Counts and recent scans. |
| `/admin/qr` | Search, filter by status or type, open one code, bulk delete the rows you select. |
| `/admin/qr/<id>` | Edit the destination, pause or resume, reassign to another merchant, view a design. |
| `/admin/qr-generator` | Bulk ID generation. |
| `/admin/templates` | Template CRUD and bulk design downloads. |
| `/admin/merchants` | Every shop, with its QR codes. |
| `/admin/settings` | Public URLs, limits, environment reference. |

Editing a destination never changes the status on its own: a code that is not yet assigned
cannot go live by accident, and resuming requires a merchant and a destination.

Bulk delete takes the IDs ticked on the current page, shows what is about to go, and warns
when an active code is included. It removes only those QR records: merchants, templates and
scan history are kept, and a deleted code immediately stops redirecting.

## Redirect behaviour

`GET /q/<qrId>`:

- `302` with the stored destination for an active code, `cache-control: no-store` so no
  device or proxy caches an old destination;
- a self-contained `404` page for unknown, unassigned, or paused codes, which reveals nothing
  about the record;
- scan analytics written with `after()`, so they never delay the redirect. Only a salted
  hash of the IP is stored, never the address itself.

## Project layout

```
src/
  app/
    q/[qrId]/route.ts        public scan endpoint (302 or 404)
    activate/                mobile activation page
    api/merchant/activate/   public activation API
    api/admin/**             admin API, every handler session checked
    admin/(protected)/**     admin UI (layout enforces the session)
  auth/                      password hashing, session signing
  components/                UI, client components only where interaction demands it
  image/compose.ts           Sharp composition: artwork + QR + ID
  models/                    Mongoose models and indexes
  qr/                        ID generation and PNG rendering
  services/                  business logic (QR, merchant, template, design)
  validation/schemas.ts      every request body and query
tests/                       image scanability, placement geometry, save/reopen round trips,
                             redirect, activation, admin API, bulk delete UI, auth
```

Template artwork lives on the filesystem (or any mounted volume) and never inside MongoDB.
Only its key, size, and placement are stored, as an overlay of the two layers:

```ts
overlay: {
  qr:   { x, y, size },                                   // square, original-image pixels
  text: { x, y, fontSize, rotation, alignment },          // x/y is the unrotated top-left
}
```

The ID is centred inside its own text box, so each alignment (`left`, `center`, `right`) moves
the visible characters rather than the empty space around them. Templates saved before the
two-layer editor keep working: their rectangle is read as the QR square with the ID centred
underneath it, and both shapes are written on every save so old clients still see a rectangle.

Uploads are re-encoded by Sharp, so a file that is not really the image it claims to be
cannot be stored, and a template that fails validation leaves nothing on disk.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm start` | Serves the production build. |
| `npm test` | Full test suite (needs MongoDB; uses `qrbuilder_test`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run hash-password -- "pw"` | Prints a hash for `.env.local`. |

## Testing

```bash
docker run -d --name qrbuilder-mongo -p 27018:27017 mongo:8   # if not already up
npm test
```

`tests/setup.ts` points `MONGODB_URI` at `TEST_MONGODB_URI` (default
`mongodb://127.0.0.1:27018/qrbuilder_test`) so a test run can never touch a real database.

The suite covers:

- **Image pipeline** — designs decode with ZXing at several sizes and after a simulated
  printed photo, so the QR area really is readable.
- **Redirects** — active codes redirect, unknown and paused codes return the plain 404 page,
  and analytics are written after the response.
- **Activation** — concurrent claims on one card, refused attempts leaving no data behind,
  one merchant record per mobile number.
- **Admin API** — session enforcement, template uploads, one design per QR ID, ZIP contents.
- **Auth** — hashing, tamper detection, cookie session.

## Production notes

- Set `NEXT_PUBLIC_APP_URL` to the real HTTPS origin. The session cookie becomes `Secure`
  automatically, and the `secure` flag on printed cards depends on it.
- `MONGODB_URI` should use a replica set if you want multi-document transactions later;
  the current flows use single-document atomic updates only.
- `STORAGE_DIR` must be writable and persistent. On a platform with an ephemeral filesystem
  the app falls back to `/tmp` so uploads keep working, but that folder is per instance and
  is wiped on redeploy. For a permanent fleet, point `STORAGE_DIR` at a mounted volume or
  swap the implementation in `src/lib/storage.ts` for object storage — the rest of the app
  only depends on that interface.
- Rate limiting is in-process. Behind more than one instance, move it to a shared store.
- Security headers are set in `next.config.ts`, and `/admin`, `/api` and `/q` are kept out of
  search results through `src/app/robots.ts` plus `noindex` on the admin layout.

## Vercel Production Deployment

1. **Create the database.** Make a MongoDB Atlas cluster (a free M0 tier is enough to start),
   add a database user, and allow Vercel's egress addresses in *Network Access*.
2. **Add the connection string.** Copy the Atlas SRV string and put it in `MONGODB_URI`. Keep
   the database name at the end of the string. Indexes are created automatically on the first
   request; `qrId` is unique.
3. **Add the Vercel environment variables.** In *Project Settings → Environment Variables*,
   add these for Production (and Preview if you want previews to work):
   `MONGODB_URI`, `NEXT_PUBLIC_APP_URL` (your production domain, no trailing slash),
   `AUTH_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`),
   `ADMIN_EMAIL`, and `ADMIN_PASSWORD_HASH` (`npm run hash-password -- "your-password"`).
   Leave `STORAGE_DIR` unset so the app uses its temporary directory. No secret is ever
   prefixed with `NEXT_PUBLIC_`, and the admin cookie becomes `Secure` automatically on HTTPS.
4. **Deploy the application.** Import the repository into Vercel. The framework preset is
   detected automatically; the build command is `npm run build`. Nothing else is needed —
   Sharp and the MongoDB driver are ordinary dependencies.
5. **Configure the custom domain.** Add the domain, point the records at Vercel, then set
   `NEXT_PUBLIC_APP_URL` to that domain and redeploy. This matters: the URL is encoded inside
   every printed QR code, so cards printed before the change keep pointing at the old host.
6. **Verify on the live domain.** Sign in at `/admin`, generate a batch, activate one card,
   scan it, upload a template and move the QR and the printed ID on it, download a bulk ZIP,
   and delete a QR code to confirm it stops redirecting. `GET /robots.txt` should list
   `/admin`, `/api` and `/q` as disallowed.

The first template upload on a fresh deployment writes to that instance's `/tmp`. If you run
more than one instance, replace `src/lib/storage.ts` with object storage before you rely on
template artwork staying put.
- Add a reverse proxy or CDN in front for TLS, compression, and request logs. The app reads
  the client address from `x-forwarded-for`, so make sure the proxy sets that header and
  strips any value a client sends.
