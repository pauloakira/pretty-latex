import { vi } from "vitest";
import type { PdfView, PdfZoom } from "../domain/pdf";
import type { PdfDisplayFactory } from "../presentation/pdf/PdfDisplay";

/** A PdfDisplay that records what it was asked to show, and reports page 1 of 3. */
export function fakePdfDisplay() {
  const state = {
    shown: [] as string[],
    zooms: [] as PdfZoom[],
    onView: null as ((view: PdfView) => void) | null,
  };
  const create: PdfDisplayFactory = vi.fn(async (_container, options) => {
    state.onView = options.onView;
    return {
      show: vi.fn(async (bytes: Uint8Array) => {
        state.shown.push(new TextDecoder().decode(bytes));
        options.onView({ page: 1, pages: 3, scale: 0.8 });
      }),
      setZoom: vi.fn((zoom: PdfZoom) => {
        state.zooms.push(zoom);
        if (typeof zoom === "number") options.onView({ page: 1, pages: 3, scale: zoom });
      }),
      destroy: vi.fn(),
    };
  });
  return { create, state };
}
