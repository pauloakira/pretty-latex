import { vi } from "vitest";
import type { PdfView, PdfZoom } from "../domain/pdf";
import type { PdfSpot } from "../domain/synctex";
import type { PdfDisplayFactory } from "../presentation/pdf/PdfDisplay";

/** A PdfDisplay that records what it was asked to show, and reports page 1 of 3. */
export function fakePdfDisplay() {
  const state = {
    shown: [] as string[],
    zooms: [] as PdfZoom[],
    onView: null as ((view: PdfView) => void) | null,
    onSyncClick: null as ((page: number, x: number, y: number) => void) | null,
    revealed: [] as PdfSpot[],
  };
  const create: PdfDisplayFactory = vi.fn(async (_container, options) => {
    state.onView = options.onView;
    state.onSyncClick = options.onSyncClick ?? null;
    return {
      show: vi.fn(async (bytes: Uint8Array) => {
        state.shown.push(new TextDecoder().decode(bytes));
        options.onView({ page: 1, pages: 3, scale: 0.8 });
      }),
      setZoom: vi.fn((zoom: PdfZoom) => {
        state.zooms.push(zoom);
        if (typeof zoom === "number") options.onView({ page: 1, pages: 3, scale: zoom });
      }),
      reveal: vi.fn((spot: PdfSpot) => {
        state.revealed.push(spot);
      }),
      destroy: vi.fn(),
    };
  });
  return { create, state };
}
