import type { PdfView, PdfZoom } from "../../domain/pdf";

/** Draws PDF pages into a container. pdf.js in the app; a fake in tests (jsdom can't). */
export interface PdfDisplay {
  /** Shows these bytes, replacing what's shown while keeping the page and scroll offset. */
  show(bytes: Uint8Array): Promise<void>;
  setZoom(zoom: PdfZoom): void;
  destroy(): void;
}

export type PdfDisplayFactory = (
  container: HTMLDivElement,
  options: { zoom: PdfZoom; onView: (view: PdfView) => void },
) => Promise<PdfDisplay>;
