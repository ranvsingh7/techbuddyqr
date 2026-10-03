"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DESTINATION_CONFIG, DESTINATION_TYPES, type DestinationType } from "@/types";
import { Card, buttonClass, inputClass, labelClass } from "@/components/ui";
import { OverlayEditor, useLocalImage } from "@/components/overlay-editor";
import { defaultOverlay, type TemplateOverlay } from "@/qr/overlay";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/limits";

export function TemplateCreateForm() {
  const router = useRouter();
  const { image, load } = useLocalImage();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<DestinationType | "">("");
  const [overlay, setOverlay] = useState<TemplateOverlay | null>(null);
  const [lightPlate, setLightPlate] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function pickFile(selected: File | null) {
    setError("");
    if (!selected) return;

    try {
      const size = await load(selected);
      setFile(selected);
      setOverlay(defaultOverlay(size));
      if (!name) setName(selected.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    } catch (thrown) {
      setFile(null);
      setError(thrown instanceof Error ? thrown.message : "That file could not be read as an image.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !overlay) return;

    setPending(true);
    setError("");

    const body = new FormData();
    body.set("image", file);
    body.set("name", name);
    body.set("type", type);
    body.set("lightPlate", String(lightPlate));
    // Two independent layers, sent as their own coordinate sets.
    body.set("qr.x", String(overlay.qr.x));
    body.set("qr.y", String(overlay.qr.y));
    body.set("qr.size", String(overlay.qr.size));
    body.set("text.x", String(overlay.text.x));
    body.set("text.y", String(overlay.text.y));
    body.set("text.fontSize", String(overlay.text.fontSize));
    body.set("text.rotation", String(overlay.text.rotation));
    body.set("text.alignment", overlay.text.alignment);

    try {
      const response = await fetch("/api/admin/templates", { method: "POST", body });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const details = payload?.error?.details;
        setError(details ? Object.values(details as Record<string, string>)[0] : (payload?.error?.message ?? "Upload failed."));
        return;
      }

      router.push(`/admin/templates/${payload.data._id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="p-5">
        <h2 className="text-base font-semibold">1 · Upload the artwork</h2>
        <p className="mt-1 mb-4 text-sm text-muted">PNG, JPG or WEBP. Up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB.</p>

        <input
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          onChange={(event) => void pickFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
        />

        {image && overlay ? (
          <p className="mt-3 text-xs text-muted">
            {image.width} × {image.height} px original · stored coordinates are in image pixels, not screen pixels
          </p>
        ) : null}

        <h2 className="mt-8 text-base font-semibold">2 · Place the QR code and the ID text</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          The QR code and the printed ID are two separate layers. Select a layer to move, resize or rotate it. The code always stays square;
          the text can be placed anywhere on the artwork.
        </p>

        {image && overlay ? (
          <OverlayEditor image={image} value={overlay} onChange={setOverlay} />
        ) : (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-line bg-canvas p-6 text-center text-sm text-muted">
            {image ? "Loading the editor…" : "Choose an artwork file above to place the QR code."}
          </div>
        )}
      </Card>

      <Card className="h-fit space-y-4 p-5">
        <h2 className="text-base font-semibold">3 · Template details</h2>

        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="name" className={labelClass}>Template name</label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Instagram card"
            required
            className={inputClass}
          />
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
          <p className="mt-1 text-xs text-muted">Only a suggestion. Shops choose their own destination when they activate.</p>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={lightPlate} onChange={(event) => setLightPlate(event.target.checked)} className="mt-0.5 h-4 w-4 accent-gray-900" />
          <span>
            White plate behind the QR
            <span className="mt-0.5 block text-xs text-muted">Keeps the code readable on dark artwork.</span>
          </span>
        </label>

        <div className="border-t border-line pt-4">
          <button type="submit" disabled={pending || !file || !overlay || !name} className={`${buttonClass.primary} w-full`}>
            {pending ? "Saving…" : "Save template"}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            {overlay
              ? `QR ${overlay.qr.size} × ${overlay.qr.size} px at ${overlay.qr.x}, ${overlay.qr.y} · ID text ${overlay.text.fontSize} px at ${overlay.text.x}, ${overlay.text.y}`
              : "Upload artwork and place the QR code to continue"}
          </p>
        </div>
      </Card>
    </form>
  );
}
