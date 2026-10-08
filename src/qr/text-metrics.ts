/**
 * Text metrics shared by the browser editor and the server-side renderer.
 *
 * The printed QR ID is drawn with a plain sans-serif face, and both the editor
 * box and the SVG text have to agree on how wide that text is. Measuring with the
 * DOM in the browser and with a font engine on the server would drift apart, so
 * both sides use these tables instead: the standard Helvetica/Arial advance
 * widths, which Arial, Helvetica and the metric-compatible Liberation Sans all
 * share.
 *
 * No font files, no font management: one family, one weight, plain numbers.
 */

/** Advance widths in 1/1000 em, standard Helvetica metrics. */
const REGULAR: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333,
  "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556,
  M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667,
  Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

/** Advance widths in 1/1000 em, standard Helvetica-Bold metrics. */
const BOLD: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333,
  "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611,
  M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667,
  Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278,
  m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556,
  y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584,
};

const FALLBACK = 556;

/** Generic family keeps Sharp/librsvg rendering portable across production images. */
export const ID_FONT_FAMILY = "sans-serif";
/** Bold, so the ID stays legible on a printed card. Matched by the tables above. */
export const ID_FONT_WEIGHT = 700;
/** Line box height as a multiple of the font size. */
export const TEXT_LINE_HEIGHT = 1.2;
function advance(character: string, bold: boolean): number {
  return (bold ? BOLD : REGULAR)[character] ?? FALLBACK;
}

/** Width of `text` in pixels at `fontSize`, rounded to whole pixels. */
export function measureTextWidth(text: string, fontSize: number, bold = true): number {
  let total = 0;
  for (const character of text) total += advance(character, bold);
  return Math.round((total / 1000) * fontSize);
}

/** Height of the line box in pixels. */
export function textBoxHeight(fontSize: number): number {
  return Math.round(fontSize * TEXT_LINE_HEIGHT);
}

