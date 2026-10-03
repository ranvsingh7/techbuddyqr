// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { OverlayEditor } from "@/components/overlay-editor";
import { MIN_QR_SIZE, MIN_TEXT_SIZE, REFERENCE_ID, textBoxFor, type TemplateOverlay } from "@/qr/overlay";

/** Original artwork is 1200 x 1800 but only shown at 400 x 600 in the browser. */
const IMAGE = { url: "/artwork.png", width: 1200, height: 1800 };
const DISPLAY = { width: 400, height: 600 };

const LOADED: TemplateOverlay = {
  qr: { x: 40, y: 60, size: 90 },
  text: { x: 40, y: 200, fontSize: 14, rotation: 12, alignment: "left" },
};

const START: TemplateOverlay = {
  qr: { x: 400, y: 700, size: 500 },
  text: { x: 420, y: 1240, fontSize: 30, rotation: 0, alignment: "center" },
};

afterEach(cleanup);

/** Mirrors how the real forms own the value: the editor is fully controlled. */
function Harness({ initial = START }: { initial?: TemplateOverlay }) {
  const [value, setValue] = useState<TemplateOverlay>(initial);
  return (
    <>
      <OverlayEditor image={IMAGE} value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function setup(initial: TemplateOverlay = START) {
  cleanup();
  const view = render(<Harness initial={initial} />);
  const stage = view.getByRole("application");
  const qrLayer = stage.querySelector<HTMLElement>('[data-layer="qr"]')!;
  const textLayer = stage.querySelector<HTMLElement>('[data-layer="text"]')!;

  // A browser reports the drawn size; happy-dom has no layout engine.
  stage.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: DISPLAY.width, bottom: DISPLAY.height, width: DISPLAY.width, height: DISPLAY.height, toJSON: () => ({}) }) as DOMRect;

  const read = () => JSON.parse(view.getByTestId("value").textContent ?? "{}") as TemplateOverlay;
  return { ...view, stage, qrLayer, textLayer, read };
}

function pointer(target: Element, type: string, x: number, y: number, shiftKey = false) {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, "clientX", { value: x });
    Object.defineProperty(event, "clientY", { value: y });
    Object.defineProperty(event, "pointerId", { value: 1 });
    Object.defineProperty(event, "shiftKey", { value: shiftKey });
    target.dispatchEvent(event);
  });
}

/** Original image pixels -> on-screen pixels. */
function toScreen(imageX: number, imageY: number) {
  return { x: (imageX / IMAGE.width) * DISPLAY.width, y: (imageY / IMAGE.height) * DISPLAY.height };
}

/** A drag expressed in original image pixels, so expectations stay readable. */
function drag(view: ReturnType<typeof setup>, target: Element, fromImage: { x: number; y: number }, toImage: { x: number; y: number }, shiftKey = false) {
  const from = toScreen(fromImage.x, fromImage.y);
  const to = toScreen(toImage.x, toImage.y);

  pointer(target, "pointerdown", from.x, from.y, shiftKey);
  pointer(view.stage, "pointermove", to.x, to.y, shiftKey);
  pointer(view.stage, "pointerup", to.x, to.y, shiftKey);
}

function field(view: ReturnType<typeof setup>, id: string) {
  const input = view.container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`#${id} not found`);
  return input;
}

function type(view: ReturnType<typeof setup>, id: string, value: number | string) {
  fireEvent.change(field(view, id), { target: { value: String(value) } });
}

const qrCorners = (qr: TemplateOverlay["qr"]) => ({
  nw: { x: qr.x, y: qr.y },
  ne: { x: qr.x + qr.size, y: qr.y },
  sw: { x: qr.x, y: qr.y + qr.size },
  se: { x: qr.x + qr.size, y: qr.y + qr.size },
});

const textCorners = (overlay: TemplateOverlay) => {
  const box = textBoxFor(overlay.text, REFERENCE_ID);
  return {
    nw: { x: overlay.text.x, y: overlay.text.y },
    ne: { x: overlay.text.x + box.width, y: overlay.text.y },
    sw: { x: overlay.text.x, y: overlay.text.y + box.height },
    se: { x: overlay.text.x + box.width, y: overlay.text.y + box.height },
  };
};

const handle = (view: ReturnType<typeof setup>, name: string) => {
  const element = view.stage.querySelector<HTMLElement>(`[data-handle="${name}"]`);
  if (!element) throw new Error(`handle ${name} not found`);
  return element;
};

describe("overlay editor", () => {
  it("draws both layers as percentages of the artwork", () => {
    const { stage, qrLayer, textLayer } = setup();
    const box = textBoxFor(START.text, REFERENCE_ID);

    expect(stage.querySelector("img")!.getAttribute("src")).toBe("/artwork.png");
    expect(qrLayer.style.left).toBe(`${(START.qr.x / IMAGE.width) * 100}%`);
    expect(qrLayer.style.top).toBe(`${(START.qr.y / IMAGE.height) * 100}%`);
    expect(qrLayer.style.width).toBe(`${(START.qr.size / IMAGE.width) * 100}%`);
    expect(qrLayer.style.height).toBe(`${(START.qr.size / IMAGE.height) * 100}%`);
    // The two percentages differ because the axes do: the drawn box is still square.
    const onScreen = {
      width: (parseFloat(qrLayer.style.width) / 100) * IMAGE.width,
      height: (parseFloat(qrLayer.style.height) / 100) * IMAGE.height,
    };
    expect(onScreen.width).toBeCloseTo(START.qr.size, 6);
    expect(onScreen.height).toBeCloseTo(START.qr.size, 6);

    const textWrap = textLayer.parentElement!;
    expect(textWrap.style.left).toBe(`${(START.text.x / IMAGE.width) * 100}%`);
    expect(textWrap.style.top).toBe(`${(START.text.y / IMAGE.height) * 100}%`);
    expect(textWrap.style.width).toBe(`${(box.width / IMAGE.width) * 100}%`);
  });

  it("moves the QR without taking the text with it", () => {
    const view = setup();

    drag(view, view.qrLayer, { x: 650, y: 950 }, { x: 700, y: 1000 });

    const next = view.read();
    expect(next.qr).toEqual({ x: 450, y: 750, size: 500 });
    expect(next.text).toEqual(START.text);
  });

  it("moves the text without taking the QR with it", () => {
    const view = setup();
    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));

    drag(view, view.textLayer, { x: 500, y: 1300 }, { x: 380, y: 1180 });

    const next = view.read();
    expect(next.text).toEqual({ ...START.text, x: 300, y: 1120 });
    expect(next.qr).toEqual(START.qr);
  });

  it("resizes the QR from every corner and keeps it square", () => {
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const view = setup();
      drag(view, handle(view, `qr:${corner}`), qrCorners(START.qr)[corner], { x: 300, y: 500 });

      const { qr } = view.read();
      // A square has one number: the model's `size` is enough on its own.
      expect(Object.keys(qr).sort()).toEqual(["size", "x", "y"]);
      expect(qr.size).toBeGreaterThan(0);
      expect(qr.x).toBeGreaterThanOrEqual(0);
      expect(qr.y).toBeGreaterThanOrEqual(0);
      expect(qr.x + qr.size).toBeLessThanOrEqual(IMAGE.width);
      expect(qr.y + qr.size).toBeLessThanOrEqual(IMAGE.height);
    }
  });

  it("resizes the QR from one handle to a predictable whole number", () => {
    const view = setup();

    // Drag the south-east corner 200 image px right and down: still one size.
    drag(view, handle(view, "qr:se"), qrCorners(START.qr).se, { x: 1100, y: 1400 });

    expect(view.read().qr).toEqual({ x: 400, y: 700, size: 700 });
  });

  it("keeps the opposite corner still when resizing", () => {
    const view = setup();

    // The south-east corner is pinned at 900, 1200 the whole way through.
    drag(view, handle(view, "qr:nw"), qrCorners(START.qr).nw, { x: 600, y: 1000 });
    expect(view.read().qr).toEqual({ x: 600, y: 900, size: 300 });

    const other = setup();
    drag(other, handle(other, "qr:se"), qrCorners(START.qr).se, { x: 700, y: 1100 });
    expect(other.read().qr).toEqual({ x: 400, y: 700, size: 400 });

    // The pin holds even when the drag is not diagonal.
    const lopsided = setup();
    drag(lopsided, handle(lopsided, "qr:nw"), qrCorners(START.qr).nw, { x: 500, y: 1050 });
    const resized = lopsided.read().qr;
    expect(resized.x + resized.size).toBe(900);
    expect(resized.y + resized.size).toBe(1200);
  });

  it("drives the QR size from whichever axis moved furthest", () => {
    const view = setup();

    // North-west corner to (700, 900): 200 across, 300 down, so 300 wins and the
    // block grows from the pinned south-east corner at (900, 1200).
    drag(view, handle(view, "qr:nw"), qrCorners(START.qr).nw, { x: 700, y: 900 });

    expect(view.read().qr).toEqual({ x: 600, y: 900, size: 300 });
  });

  it("never lets the QR leave the artwork", () => {
    const inside = setup();
    drag(inside, handle(inside, "qr:se"), qrCorners(START.qr).se, { x: 1400, y: 1000 });

    // The block is 1000 across, which no longer fits from x 400: it slides left.
    const pushed = inside.read().qr;
    expect(pushed.size).toBe(1000);
    expect(pushed.x).toBe(200);
    expect(pushed.x + pushed.size).toBe(IMAGE.width);

    // Even a drag that ends outside the canvas stays on the artwork.
    const outside = setup();
    drag(outside, handle(outside, "qr:se"), qrCorners(START.qr).se, { x: 5000, y: 5000 });

    const flung = outside.read().qr;
    expect(flung.x).toBeGreaterThanOrEqual(0);
    expect(flung.y).toBeGreaterThanOrEqual(0);
    expect(flung.x + flung.size).toBeLessThanOrEqual(IMAGE.width);
    expect(flung.y + flung.size).toBeLessThanOrEqual(IMAGE.height);
    expect(flung.size).toBeLessThanOrEqual(Math.min(IMAGE.width, IMAGE.height));
  });

  it("resizes the text from a corner handle, scaling the font", () => {
    const view = setup();
    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));
    const box = textBoxFor(START.text, REFERENCE_ID);
    const before = view.read().text.fontSize;

    // Grow from the north-west corner: the font gets bigger, the anchor stays put.
    drag(view, handle(view, "text:nw"), textCorners(START).nw, { x: START.text.x - 100, y: START.text.y - 40 });

    const next = view.read().text;
    expect(next.fontSize).toBeGreaterThan(before);
    expect(next.x).toBeLessThan(START.text.x);
    expect(next.rotation).toBe(START.text.rotation);
    expect(next.alignment).toBe(START.text.alignment);
    expect(textBoxFor(next, REFERENCE_ID).width).toBeGreaterThan(box.width);
  });

  it("rotates the text from the rotation handle", () => {
    const view = setup();
    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));

    const box = textBoxFor(START.text, REFERENCE_ID);
    const centre = { x: START.text.x + box.width / 2, y: START.text.y + box.height / 2 };

    // Drag the handle straight up from the centre: a quarter turn anticlockwise.
    drag(view, handle(view, "rotate"), centre, { x: centre.x, y: centre.y - 200 });

    const next = view.read().text;
    expect(Math.round(next.rotation)).toBe(-90);
    // Rotation happens around the centre, so the box origin moves but the centre holds.
    expect(next.x + textBoxFor(next, REFERENCE_ID).width / 2).toBeCloseTo(centre.x, 0);
    expect(next.y + textBoxFor(next, REFERENCE_ID).height / 2).toBeCloseTo(centre.y, 0);
  });

  it("snaps the rotation to 15 degrees while shift is held", () => {
    const view = setup();
    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));

    const box = textBoxFor(START.text, REFERENCE_ID);
    const centre = { x: START.text.x + box.width / 2, y: START.text.y + box.height / 2 };

    drag(view, handle(view, "rotate"), centre, { x: centre.x + 200, y: centre.y - 40 }, true);

    expect(Math.abs(view.read().text.rotation % 15)).toBe(0);
  });

  it("keeps rotated text inside the artwork", () => {
    const view = setup();
    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));

    drag(view, view.textLayer, { x: START.text.x + 60, y: START.text.y + 10 }, { x: 3000, y: 3000 });

    const next = view.read().text;
    const box = textBoxFor(next, REFERENCE_ID);
    const radians = (next.rotation * Math.PI) / 180;
    const extent = {
      width: Math.abs(box.width * Math.cos(radians)) + Math.abs(box.height * Math.sin(radians)),
      height: Math.abs(box.width * Math.sin(radians)) + Math.abs(box.height * Math.cos(radians)),
    };
    const centre = { x: next.x + box.width / 2, y: next.y + box.height / 2 };

    expect(centre.x - extent.width / 2).toBeGreaterThanOrEqual(-1);
    expect(centre.y - extent.height / 2).toBeGreaterThanOrEqual(-1);
    expect(centre.x + extent.width / 2).toBeLessThanOrEqual(IMAGE.width + 1);
    expect(centre.y + extent.height / 2).toBeLessThanOrEqual(IMAGE.height + 1);
  });

  it("shows controls for the selected layer only", () => {
    const view = setup();
    const shown = (id: string) => view.container.querySelector(`#${id}`);

    // QR selected by default.
    expect(shown("qr-size")).toBeTruthy();
    expect(shown("text-font-size")).toBeNull();

    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));
    expect(shown("qr-size")).toBeNull();
    expect(shown("text-font-size")).toBeTruthy();
    expect(shown("text-rotation")).toBeTruthy();
    expect(shown("text-alignment")).toBeTruthy();

    // Selecting by clicking the artwork works too, and only one layer is ever active.
    fireEvent.pointerDown(view.qrLayer, { button: 0 });
    expect(view.qrLayer.dataset.selected).toBe("true");
    expect(view.textLayer.dataset.selected).toBe("false");
  });

  it("shows handles for the selected layer only", () => {
    const view = setup();

    expect(view.stage.querySelectorAll('[data-handle^="qr:"]')).toHaveLength(4);
    expect(view.stage.querySelectorAll('[data-handle^="text:"]')).toHaveLength(0);
    expect(view.stage.querySelector('[data-handle="rotate"]')).toBeNull();

    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));
    expect(view.stage.querySelectorAll('[data-handle^="qr:"]')).toHaveLength(0);
    expect(view.stage.querySelectorAll('[data-handle^="text:"]')).toHaveLength(4);
    expect(view.stage.querySelector('[data-handle="rotate"]')).toBeTruthy();
  });

  it("edits the selected layer through the numeric fields", () => {
    const view = setup();

    type(view, "qr-x", 250);
    type(view, "qr-size", 320);
    expect(view.read().qr).toEqual({ x: 250, y: 700, size: 320 });

    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));
    type(view, "text-x", 90);
    type(view, "text-font-size", 44);
    type(view, "text-rotation", -30);
    expect(view.read().text).toEqual({ x: 90, y: 1240, fontSize: 44, rotation: -30, alignment: "center" });

    fireEvent.change(view.container.querySelector<HTMLSelectElement>("#text-alignment")!, { target: { value: "right" } });
    expect(view.read().text.alignment).toBe("right");
  });

  it("nudges and scales the selected layer from the keyboard", () => {
    const view = setup();

    fireEvent.keyDown(view.stage, { key: "ArrowRight" });
    expect(view.read().qr.x).toBe(401);

    fireEvent.keyDown(view.stage, { key: "ArrowDown", shiftKey: true });
    expect(view.read().qr.y).toBe(710);

    fireEvent.keyDown(view.stage, { key: "+" });
    expect(view.read().qr.size).toBe(501);

    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));
    fireEvent.keyDown(view.stage, { key: "ArrowLeft" });
    expect(view.read().text.x).toBe(419);

    fireEvent.keyDown(view.stage, { key: "]" });
    expect(view.read().text.rotation).toBe(5);
  });

  it("stops the keyboard from scaling a layer past what the artwork allows", () => {
    const view = setup();

    for (let i = 0; i < 100; i += 1) fireEvent.keyDown(view.stage, { key: "+", shiftKey: true });
    expect(view.read().qr.size).toBe(1200);
    expect(view.read().qr.x + view.read().qr.size).toBeLessThanOrEqual(IMAGE.width);
    expect(view.read().qr.y + view.read().qr.size).toBeLessThanOrEqual(IMAGE.height);

    for (let i = 0; i < 200; i += 1) fireEvent.keyDown(view.stage, { key: "-", shiftKey: true });
    expect(view.read().qr.size).toBe(MIN_QR_SIZE);

    fireEvent.click(view.getByRole("radio", { name: "QR ID text" }));
    for (let i = 0; i < 200; i += 1) fireEvent.keyDown(view.stage, { key: "+", shiftKey: true });
    expect(view.read().text.fontSize).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);

    for (let i = 0; i < 400; i += 1) fireEvent.keyDown(view.stage, { key: "-", shiftKey: true });
    expect(view.read().text.fontSize).toBe(MIN_TEXT_SIZE);
    // Collapsing the ID never lets it leave the artwork.
    expect(view.read().text.x).toBeGreaterThanOrEqual(0);
    expect(view.read().text.y).toBeGreaterThanOrEqual(0);
  });

  it("keeps dragging on the stage while the pointer is captured", () => {
    const view = setup();
    let released = 0;
    view.stage.setPointerCapture = () => {};
    view.stage.releasePointerCapture = () => {
      released++;
    };
    view.stage.hasPointerCapture = () => true;

    drag(view, view.qrLayer, { x: 650, y: 950 }, { x: 660, y: 960 });

    expect(view.read().qr).toEqual({ x: 410, y: 710, size: 500 });
    expect(released).toBe(1);
  });

  it("ignores drags that start outside a layer", () => {
    const view = setup();

    pointer(view.stage, "pointerdown", 10, 10);
    pointer(view.stage, "pointermove", 200, 200);

    expect(view.read()).toEqual(START);
  });

  it("renders whatever overlay it is given", () => {
    function Loader() {
      const [value, setValue] = useState<TemplateOverlay | null>(null);
      return (
        <>
          <button data-testid="load" onClick={() => setValue(LOADED)}>
            load
          </button>
          {value ? <OverlayEditor image={IMAGE} value={value} onChange={setValue} /> : null}
        </>
      );
    }

    const view = render(<Loader />);
    expect(view.queryByRole("application")).toBeNull();

    fireEvent.click(view.getByTestId("load"));

    const qr = view.getByRole("application").querySelector<HTMLElement>('[data-layer="qr"]')!;
    expect(qr.style.width).toBe(`${(LOADED.qr.size / IMAGE.width) * 100}%`);
    expect(qr.dataset.selected).toBe("true");
  });
});
