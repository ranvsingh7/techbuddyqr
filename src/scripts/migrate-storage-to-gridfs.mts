import { dbConnect } from "../lib/db.ts";
import { migrateTemplateImagesToGridfs } from "../services/migration.ts";

/**
 * Copies legacy filesystem artwork into GridFS.
 *
 * Safe to re-run, and never deletes the original files: verify the templates
 * render correctly, then remove storage/templates by hand.
 *
 *   npm run migrate:gridfs              # migrate everything left over
 *   npm run migrate:gridfs -- --dry-run # only report what would move
 */

const dryRun = process.argv.includes("--dry-run");
const say = (line = "") => console.error(line);

await dbConnect();

const report = await migrateTemplateImagesToGridfs({ dryRun, log: say });

say(`Scanned ${report.scanned} template(s) still using filesystem artwork.${dryRun ? " (dry run, nothing changed)" : ""}`);
say(`${report.migrated.length} migrated, ${report.failures.length} failed, ${report.remaining} still on the filesystem.`);

if (report.failures.length > 0) {
  say();
  say("Failures. These templates still read from their original file:");
  for (const failure of report.failures) say(`  ${failure.id}  ${failure.name}  ${failure.reason}`);
}

if (!dryRun && report.migrated.length > 0) {
  say();
  say("Confirm the templates still render, then the old files in storage/templates can be removed.");
}

process.exit(report.failures.length > 0 ? 1 : 0);