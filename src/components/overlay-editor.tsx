"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MIN_QR_SIZE,
  REFERENCE_ID,
  TEXT_ALIGNMENTS,
  clampQr,
  clampText,
  fontSizeFromScale,
  moveQr,
  moveText,
  resizeQrFromCorner,
  resizeTextFromCorner,
  rotateText,
  textBoxFor,
  textCentre,
  type Corner,
  type ImageBox,
  type Point,
  type TemplateOverlay,
  type TextAlignment,
  type QrIcon,
} from "@/qr/overlay";
import { inputClass, labelClass } from "@/components/ui";

export type EditorImage = { url: string; width: number; height: number };

export type LayerId = "qr" | "text";

type DragMode =
  | { kind: "move"; layer: LayerId }
  | { kind: "resize-qr"; corner: Corner }
  | { kind: "resize-text"; corner: Corner }
  | { kind: "rotate-text" };

type Props = {
  image: EditorImage;
  value: TemplateOverlay;
  onChange: (next: TemplateOverlay) => void;
  /** ID drawn in the preview so the admin sees real proportions. */
  sampleId?: string;
};

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

/**
 * Two-layer design editor: a QR code and a printed ID, placed independently.
 *
 * The preview may be any size on screen, so every pointer position is converted
 * back to ORIGINAL IMAGE PIXELS before it touches the overlay, and the boxes
 * themselves are positioned in percentages. What gets saved is therefore never
 * browser geometry.
 */
export function OverlayEditor({ image, value, onChange, sampleId = REFERENCE_ID }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: DragMode; pointer: Point; origin: TemplateOverlay } | null>(null);

  const [selected, setSelected] = useState<LayerId>("qr");
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const box: ImageBox = useMemo(() => ({ width: image.width, height: image.height }), [image.width, image.height]);
  const textBox = useMemo(() => textBoxFor(value.text, sampleId), [sampleId, value.text]);

  // On-screen scale, used to draw the preview text at the size it will print.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const measure = () => setStage({ width: element.clientWidth, height: element.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [image.url]);

  /** Screen point -> original image pixels. */
  const toImagePoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return null;

      return {
        x: (clientX - rect.left) * (image.width / rect.width),
        y: (clientY - rect.top) * (image.height / rect.height),
      };
    },
    [image.height, image.width],
  );

  const commit = useCallback(
    (next: TemplateOverlay) => {
      onChange(next);
    },
    [onChange],
  );

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    const handle = target.dataset.handle;
    const layer = target.closest<HTMLElement>("[data-layer]")?.dataset.layer as LayerId | undefined;
    if (!handle && !layer) return;

    const point = toImagePoint(event.clientX, event.clientY);
    if (!point) return;

    const mode: DragMode = !handle
      ? { kind: "move", layer: layer! }
      : handle === "rotate"
        ? { kind: "rotate-text" }
        : handle.startsWith("text:")
          ? { kind: "resize-text", corner: handle.slice(5) as Corner }
          : { kind: "resize-qr", corner: handle.slice(3) as Corner };

    setSelected(mode.kind === "move" ? mode.layer : mode.kind === "resize-qr" ? "qr" : "text");
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, pointer: point, origin: value };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const point = toImagePoint(event.clientX, event.clientY);
    if (!drag || !point) return;

    const { origin } = drag;

    if (drag.mode.kind === "move" && drag.mode.layer === "qr") {
      commit({ ...origin, qr: moveQr(origin.qr, box, point.x - drag.pointer.x, point.y - drag.pointer.y) });
      return;
    }

    if (drag.mode.kind === "move") {
      commit({ ...origin, text: moveText(origin.text, box, sampleId, point.x - drag.pointer.x, point.y - drag.pointer.y) });
      return;
    }

    if (drag.mode.kind === "resize-qr") {
      commit({ ...origin, qr: resizeQrFromCorner(origin.qr, box, drag.mode.corner, point) });
      return;
    }

    if (drag.mode.kind === "resize-text") {
      commit({ ...origin, text: resizeTextFromCorner(origin.text, box, sampleId, drag.mode.corner, point) });
      return;
    }

    // Rotation handle: the angle from the box centre, clockwise, matching CSS
    // and the SVG the renderer produces.
    const centre = textCentre(origin.text, sampleId);
    let degrees = (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;
    if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;

    commit({ ...origin, text: rotateText(origin.text, box, sampleId, degrees, centre) });
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 1;
    const layer = selected;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      commit(
        layer === "qr"
          ? { ...value, qr: moveQr(value.qr, box, dx, dy) }
          : { ...value, text: moveText(value.text, box, sampleId, dx, dy) },
      );
    } else if (event.key === "+" || event.key === "=") {
      commit(scaleSelected(value, box, sampleId, layer, step));
    } else if (event.key === "-" || event.key === "_") {
      commit(scaleSelected(value, box, sampleId, layer, -step));
    } else if (layer === "text" && (event.key === "[" || event.key === "]")) {
      const turn = (event.key === "]" ? 1 : -1) * (event.shiftKey ? 15 : 5);
      commit({ ...value, text: rotateText(value.text, box, sampleId, value.text.rotation + turn) });
    } else {
      return;
    }

    event.preventDefault();
  }

  const percent = (amount: number, total: number) => `${(amount / total) * 100}%`;
  const scale = stage.height ? stage.height / image.height : 0;
  const handleSize = 16;

  return (
    <div className="space-y-4">
      <LayerPicker selected={selected} onSelect={setSelected} />

      <div className="mx-auto w-full" style={{ maxWidth: `calc(70vh * ${image.width} / ${image.height})` }}>
        <div
          ref={stageRef}
          onPointerDown={startDrag}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          role="application"
          aria-label="Template overlay editor"
          tabIndex={0}
          className="relative w-full touch-none select-none overflow-hidden rounded-md border border-line bg-canvas shadow-inner"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          <img src={image.url} alt="Template artwork" draggable={false} className="pointer-events-none block h-full w-full" />

          {/* Layer 1: the QR code. Square, and the box is the QR area itself. */}
          <div
            data-layer="qr"
            data-selected={selected === "qr"}
            className={`absolute border-2 border-dashed border-blue-600/80 bg-blue-500/10 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{
              left: percent(value.qr.x, image.width),
              top: percent(value.qr.y, image.height),
              width: percent(value.qr.size, image.width),
              height: percent(value.qr.size, image.height),
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <SampleQr className="h-full w-full text-black" round={value.qr.dotStyle === "round"} icon={value.qr.icon} />
            </div>

            {selected === "qr"
              ? CORNERS.map((corner) => (
                  <Handle
                    key={corner}
                    handle={`qr:${corner}`}
                    title={`Resize from the ${corner} corner`}
                    left={corner.includes("w") ? "0%" : "100%"}
                    top={corner.startsWith("n") ? "0%" : "100%"}
                    cursor={corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize"}
                    size={handleSize}
                  />
                ))
              : null}
          </div>

          {/* Layer 2: the printed QR ID, anywhere on the artwork. */}
          <div
            className="absolute"
            style={{
              left: percent(value.text.x, image.width),
              top: percent(value.text.y, image.height),
              width: percent(textBox.width, image.width),
              height: percent(textBox.height, image.height),
            }}
          >
            <div
              data-layer="text"
              data-selected={selected === "text"}
              className={`absolute inset-0 flex items-center ${dragging ? "cursor-grabbing" : "cursor-grab"} ${
                value.text.alignment === "center" ? "justify-center" : value.text.alignment === "right" ? "justify-end" : "justify-start"
              }`}
              style={{ transform: `rotate(${value.text.rotation}deg)` }}
            >
              <span
                className="whitespace-nowrap font-bold text-black"
                style={{
                  fontFamily: "Helvetica, Arial, 'Liberation Sans', sans-serif",
                  fontSize: scale ? Math.max(4, value.text.fontSize * scale) : 11,
                  lineHeight: 1.2,
                }}
              >
                {sampleId}
              </span>
            </div>

            {selected === "text" ? (
              <>
                <span
                  data-selected-outline
                  className="pointer-events-none absolute -inset-px border-2 border-dashed border-emerald-600/80"
                  style={{ transform: `rotate(${value.text.rotation}deg)` }}
                />
                {CORNERS.map((corner) => (
                  <Handle
                    key={corner}
                    handle={`text:${corner}`}
                    title={`Resize the text from the ${corner} corner`}
                    left={corner.includes("w") ? "0%" : "100%"}
                    top={corner.startsWith("n") ? "0%" : "100%"}
                    cursor={corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize"}
                    size={handleSize}
                  />
                ))}
                <Handle
                  handle="rotate"
                  title="Drag to rotate the text"
                  left="50%"
                  top="0%"
                  cursor="grab"
                  size={handleSize}
                  offsetY={-22}
                  label="↻"
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {selected === "qr" ? (
        <QrFields image={image} qr={value.qr} onCommit={(qr) => commit({ ...value, qr })} />
      ) : (
        <TextFields
          image={image}
          text={value.text}
          sampleId={sampleId}
          onCommit={(text) => commit({ ...value, text })}
        />
      )}

      <p className="text-xs text-muted">
        {selected === "qr"
          ? `QR code: ${value.qr.size} × ${value.qr.size} px at ${value.qr.x}, ${value.qr.y}. Drag to move, drag a corner to resize.`
          : `QR ID text: ${value.text.fontSize} px at ${value.text.x}, ${value.text.y}, rotated ${value.text.rotation}°. Drag to move, a corner to resize, the round handle to rotate.`}{" "}
        Coordinates are stored in the original {image.width} × {image.height} px artwork.
      </p>
    </div>
  );
}

function scaleSelected(overlay: TemplateOverlay, box: ImageBox, sampleId: string, layer: LayerId, delta: number): TemplateOverlay {
  if (layer === "qr") {
    // Grow and shrink around the centre, and stay within the limits the editor allows everywhere else.
    const centre = { x: overlay.qr.x + overlay.qr.size / 2, y: overlay.qr.y + overlay.qr.size / 2 };
    const size = Math.round(overlay.qr.size + delta);

    return { ...overlay, qr: clampQr({ x: centre.x - size / 2, y: centre.y - size / 2, size }, box) };
  }

  const fontSize = fontSizeFromScale(overlay.text, box, sampleId, 1 + delta / overlay.text.fontSize);

  return { ...overlay, text: clampText({ ...overlay.text, fontSize }, box, sampleId) };
}

/** Only one layer can be selected, and only that layer shows editing controls. */
function LayerPicker({ selected, onSelect }: { selected: LayerId; onSelect: (layer: LayerId) => void }) {
  const options: { id: LayerId; label: string }[] = [
    { id: "qr", label: "QR code" },
    { id: "text", label: "QR ID text" },
  ];

  return (
    <div role="radiogroup" aria-label="Overlay layer" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={selected === option.id}
          data-layer-select={option.id}
          onClick={() => onSelect(option.id)}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
            selected === option.id ? "border-gray-900 bg-gray-900 text-white" : "border-line bg-surface text-ink hover:bg-canvas"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Handle({
  handle,
  title,
  left,
  top,
  cursor,
  size,
  offsetY = 0,
  label,
}: {
  handle: string;
  title: string;
  left: string;
  top: string;
  cursor: string;
  size: number;
  /** Extra offset in px, e.g. to float the rotation handle above the box. */
  offsetY?: number;
  label?: string;
}) {
  return (
    <span
      data-handle={handle}
      title={title}
      aria-label={title}
      className="absolute z-10 flex items-center justify-center rounded-full border-2 border-blue-700 bg-white text-[10px] leading-none font-bold text-blue-800 shadow-sm"
      style={{ left, top, width: size, height: size, cursor, transform: `translate(-50%, calc(-50% + ${offsetY}px))` }}
    >
      {label}
    </span>
  );
}

function QrFields({
  image,
  qr,
  onCommit,
}: {
  image: EditorImage;
  qr: TemplateOverlay["qr"];
  onCommit: (qr: TemplateOverlay["qr"]) => void;
}) {
  async function chooseIcon(file: File | undefined) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    onCommit({ ...qr, icon: { type: "custom", dataUrl } });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <NumberField id="qr-x" label="X" value={qr.x} min={0} max={Math.max(0, image.width - qr.size)} onCommit={(x) => onCommit({ ...qr, x })} />
        <NumberField id="qr-y" label="Y" value={qr.y} min={0} max={Math.max(0, image.height - qr.size)} onCommit={(y) => onCommit({ ...qr, y })} />
        <NumberField id="qr-size" label="Size" value={qr.size} min={Math.min(MIN_QR_SIZE, image.width, image.height)} max={Math.min(image.width, image.height)} onCommit={(size) => onCommit({ ...qr, size })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="qr-dot-style" className={labelClass}>Dot style</label>
          <select id="qr-dot-style" value={qr.dotStyle ?? "square"} onChange={(event) => onCommit({ ...qr, dotStyle: event.target.value as "square" | "round" })} className={inputClass}>
            <option value="square">Square</option>
            <option value="round">Rounded dots</option>
          </select>
        </div>
        <div>
          <label htmlFor="qr-icon" className={labelClass}>Center icon</label>
          <select id="qr-icon" value={typeof qr.icon === "string" ? qr.icon : qr.icon?.type === "custom" ? "custom" : "none"} onChange={(event) => onCommit({ ...qr, icon: event.target.value as QrIcon })} className={inputClass}>
            <option value="none">No icon</option>
            <option value="instagram">Instagram</option>
            <option value="google">Google</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="link">Link</option>
            <option value="custom">Custom image…</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="qr-custom-icon" className={labelClass}>Custom center image</label>
        <input id="qr-custom-icon" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseIcon(event.target.files?.[0])} className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink" />
        <p className="mt-1 text-xs text-muted">A white badge protects the code. Keep the icon simple for reliable scanning.</p>
      </div>
    </div>
  );
}

function TextFields({
  image,
  text,
  sampleId,
  onCommit,
}: {
  image: EditorImage;
  text: TemplateOverlay["text"];
  sampleId: string;
  onCommit: (text: TemplateOverlay["text"]) => void;
}) {
  const measured = textBoxFor(text, sampleId);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <NumberField id="text-x" label="X" value={text.x} min={0} max={Math.max(0, image.width)} onCommit={(x) => onCommit({ ...text, x })} />
      <NumberField id="text-y" label="Y" value={text.y} min={0} max={Math.max(0, image.height)} onCommit={(y) => onCommit({ ...text, y })} />
      <NumberField
        id="text-font-size"
        label="Font size"
        value={text.fontSize}
        min={1}
        max={Math.round(measured.height || text.fontSize) * 10}
        onCommit={(fontSize) => onCommit({ ...text, fontSize })}
      />
      <NumberField id="text-rotation" label="Rotation" value={text.rotation} min={-180} max={180} onCommit={(rotation) => onCommit({ ...text, rotation })} />

      <div>
        <label htmlFor="text-alignment" className={labelClass}>
          Alignment
        </label>
        <select
          id="text-alignment"
          value={text.alignment}
          onChange={(event) => onCommit({ ...text, alignment: event.target.value as TextAlignment })}
          className={inputClass}
        >
          {TEXT_ALIGNMENTS.map((option) => (
            <option key={option} value={option}>
              {option[0]!.toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Numeric field that updates the artwork immediately, on every keystroke. */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value));

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={shown}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(parsed)) onCommit(parsed);
        }}
        onBlur={() => setDraft(null)}
        className={inputClass}
      />
    </div>
  );
}

/** Deterministic QR-looking placeholder. Preview only: the real code is added later. */
function SampleQr({ className, round, icon }: { className?: string; round?: boolean; icon?: QrIcon }) {
  const modules = useMemo(() => buildSampleModules(25), []);
  const grid = modules.map((row, y) =>
    row.some(Boolean)
      ? row.map((on, x) => {
          const rounded = Boolean(round && x > 7 && y > 7);
          return on ? <rect key={x} x={x + (rounded ? 0.08 : 0)} y={y + (rounded ? 0.08 : 0)} width={rounded ? 0.84 : 1} height={rounded ? 0.84 : 1} rx={rounded ? 0.42 : 0} fill="currentColor" /> : null;
        })
      : null,
  );

  return (
    <svg viewBox="-1 -1 27 27" className={className} aria-hidden="true" shapeRendering="crispEdges">
      {grid}
      {icon && icon !== "none" ? <rect x="9.8" y="9.8" width="5.4" height="5.4" rx="0.9" fill="white" /> : null}
      {typeof icon === "object" && icon.type === "custom" ? <image href={icon.dataUrl} x="10.8" y="10.8" width="3.4" height="3.4" preserveAspectRatio="xMidYMid meet" /> : icon && icon !== "none" ? <text x="12.5" y="13.6" textAnchor="middle" fontSize="3.2" fontWeight="700" fill="currentColor">{icon === "instagram" ? "◎" : icon === "google" ? "G" : icon === "whatsapp" ? "◔" : "↗"}</text> : null}
    </svg>
  );
}

function buildSampleModules(size: number): boolean[][] {
  const inFinder = (x: number, y: number) => {
    const ox = x < 7 ? 0 : size - 7;
    const oy = y < 7 ? 0 : size - 7;
    if (x < ox + 7 && x >= ox && y < oy + 7 && y >= oy) {
      const dx = x - ox;
      const dy = y - oy;
      const border = dx === 0 || dy === 0 || dx === 6 || dy === 6;
      const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      return border || core;
    }
    return false;
  };

  // Fixed seed keeps server and client markup identical.
  let seed = 20261003;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => inFinder(x, y) || (x > 7 && y > 7 && random() > 0.52)),
  );
}

export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      URL.revokeObjectURL(url);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    probe.src = url;
  });
}

/** Object URL lifecycle for an image picked in the browser. */
export function useLocalImage() {
  const [image, setImage] = useState<EditorImage | null>(null);
  const previousUrl = useRef<string | null>(null);

  const load = useCallback(async (file: File) => {
    const size = await readImageSize(file);
    if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);

    const url = URL.createObjectURL(file);
    previousUrl.current = url;
    setImage({ url, ...size });
    return size;
  }, []);

  useEffect(() => () => void (previousUrl.current && URL.revokeObjectURL(previousUrl.current)), []);

  return { image, load };
}

export type { TemplateOverlay };
