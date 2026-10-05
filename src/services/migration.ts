import { storage } from "@/lib/storage";
import { deleteTemplateImage, uploadTemplateImage } from "@/lib/gridfs";
import { Template } from "@/models/Template";

/**
 * One-off copy of pre-GridFS filesystem artwork into the bucket.
 *
 * Each template's image is uploaded once and the document is repointed at the
 * new file. Old files are never deleted here: they are left in place until the
 * run has been verified, so a bad run is always recoverable.
 *
 * Re-runnable. A template already pointing at GridFS is skipped, and one whose
 * file is missing is reported rather than marked as migrated.
 */

export type MigrationFailure = { id: string; name: string; reason: string };
export type MigratedTemplate = { id: string; name: string; from: string; bytes: number };

export type MigrationReport = {
  /** Templates found using filesystem artwork. */
  scanned: number;
  migrated: MigratedTemplate[];
  failures: MigrationFailure[];
  /** Templates still on the filesystem afterwards. */
  remaining: number;
};

/** A filesystem key is `<uuid>.png`; the stored type follows the extension. */
function contentTypeFor(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "image/png";
}

export async function migrateTemplateImagesToGridfs(options: { dryRun?: boolean; log?: (line: string) => void } = {}): Promise<MigrationReport> {
  const log = options.log ?? (() => {});
  const pending = await Template.find({ imageFileId: null, imageKey: { $ne: null } }).select("_id name imageKey");

  const migrated: MigratedTemplate[] = [];
  const failures: MigrationFailure[] = [];

  for (const template of pending) {
    const key = template.imageKey!;

    try {
      const buffer = await storage.readTemplateImage(key);

      if (options.dryRun) {
        log(`  would migrate ${template.name} (${template.id}) from ${key} (${buffer.length} bytes)`);
        continue;
      }

      const imageFileId = await uploadTemplateImage(buffer, contentTypeFor(key), key.split("/").pop() ?? key);

      // The document is repointed only after the upload lands, so an interrupted
      // run leaves templates still resolvable from their original file.
      const updated = await Template.updateOne({ _id: template._id }, { $set: { imageFileId } });

      if (updated.matchedCount !== 1) {
        await deleteTemplateImage(imageFileId);
        throw new Error("template disappeared before it could be updated");
      }

      migrated.push({ id: String(template._id), name: template.name, from: key, bytes: buffer.length });
      log(`  migrated ${template.name} (${template.id}) from ${key}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ id: String(template._id), name: template.name, reason });
      log(`  FAILED   ${template.name} (${template._id}): ${reason}`);
    }
  }

  const remaining = await Template.countDocuments({ imageFileId: null, imageKey: { $ne: null } });

  return { scanned: pending.length, migrated, failures, remaining };
}