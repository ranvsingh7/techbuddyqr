"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DESTINATION_CONFIG, DESTINATION_TYPES, type DestinationType } from "@/types";
import { Card, buttonClass, inputClass, labelClass } from "@/components/ui";
import { OverlayEditor } from "@/components/overlay-editor";
import type { TemplateOverlay } from "@/qr/overlay";

export type EditableTemplate = {
  id: string;
  name: string;
  type: DestinationType | null;
  lightPlate: boolean;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  overlay: TemplateOverlay;
};

/** Edits the QR position and metadata. Artwork is replaced by creating a new template. */
export function TemplateEditForm({ template }: { template: EditableTemplate }) {
  const router = useRouter();

  const [name, setName] = useState(template.name);
  const [type, setType] = useState<DestinationType | "">(template.type ?? "");
  const [lightPlate, setLightPlate] = useState(template.lightPlate);
  const [overlay, setOverlay] = useState<TemplateOverlay>(template.overlay);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/templates/${template.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, type: type || null, lightPlate, overlay }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const details = body?.error?.details as Record<string, string> | undefined;
        setError(details ? Object.values(details)[0] : (body?.error?.message ?? "Save failed."));
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the template "${template.name}"? Designs already printed are not affected.`)) return;

    setPending(true);
    const response = await fetch(`/api/admin/templates/${template.id}`, { method: "DELETE" });
    setPending(false);

    if (response.ok) {
      router.push("/admin/templates");
      router.refresh();
      return;
    }
    setError("The template could not be deleted.");
  }

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <h2 className="text-base font-semibold">QR code and ID text</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          The QR code and the printed ID are placed independently. Artwork is fixed at {template.imageWidth} × {template.imageHeight} px, and
          both layers are saved in those original pixels.
        </p>

        <OverlayEditor
          image={{ url: template.imageUrl, width: template.imageWidth, height: template.imageHeight }}
          value={overlay}
          onChange={setOverlay}
        />
      </Card>

      <Card className="h-fit space-y-4 p-5">
        <h2 className="text-base font-semibold">Template details</h2>

        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="name" className={labelClass}>Template name</label>
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} required className={inputClass} />
        </div>

        <div>
          <label htmlFor="type" className={labelClass}>Destination type</label>
          <select id="type" value={type} onChange={(event) => setType(event.target.value as DestinationType | "")} className={inputClass}>
            <option value="">No preference</option>
            {DESTINATION_TYPES.map((option) => (
              <option key={option} value={option}>
                {DESTINATION_CONFIG[option].label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">A suggestion only. Shops pick their own destination when they activate.</p>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={lightPlate} onChange={(event) => setLightPlate(event.target.checked)} className="mt-0.5 h-4 w-4 accent-gray-900" />
          <span>
            White plate behind the QR code
            <span className="mt-0.5 block text-xs text-muted">Keeps the code readable on dark artwork. The ID text is not plated.</span>
          </span>
        </label>

        <div className="space-y-2 border-t border-line pt-4">
          <button type="submit" disabled={pending} className={`${buttonClass.primary} w-full`}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={remove} disabled={pending} className={`${buttonClass.danger} w-full`}>
            Delete template
          </button>
        </div>
      </Card>
    </form>
  );
}
