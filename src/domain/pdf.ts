/** How big the PDF pages are drawn: a scale (1 = 100%), or as wide as the pane. */
export type PdfZoom = number | "page-width";

/** Where the reader is: page n of total, at what scale (resolved, also for fit width). */
export type PdfView = { page: number; pages: number; scale: number };

/** Zoom steps, like Preview's: −/+ move to the next one. */
const STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

/** The next step above (+1) or below (−1) the scale shown now. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  if (direction > 0) return STEPS.find((s) => s > scale + 0.001) ?? STEPS[STEPS.length - 1];
  return [...STEPS].reverse().find((s) => s < scale - 0.001) ?? STEPS[0];
}

export const percent = (scale: number) => `${Math.round(scale * 100)}%`;
