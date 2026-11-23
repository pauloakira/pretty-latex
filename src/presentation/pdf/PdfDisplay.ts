import type { PdfView, PdfZoom } from "../../domain/pdf";
import type { PdfSpot } from "../../domain/synctex";

/** Draws PDF pages into a container. pdf.js in the app; a fake in tests (jsdom can't). */
export interface PdfDisplay {
  /** Shows these bytes, replacing what's shown while keeping the page and scroll offset. */
  show(bytes: Uint8Array): Promise<void>;
  setZoom(zoom: PdfZoom): void;
  /** Scrolls `spot` into view and flashes a highlight on it (forward search). */
  reveal(spot: PdfSpot): void;
  destroy(): void;
}

export type PdfDisplayFactory = (
  container: HTMLDivElement,
  options: {
    zoom: PdfZoom;
    onView: (view: PdfView) => void;
    /** ⌘-click on a page: the point, in PDF points from the page's top-left (inverse search). */
    onSyncClick?: (page: number, x: number, y: number) => void;
  },
) => Promise<PdfDisplay>;
