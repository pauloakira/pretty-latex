/** A region on a PDF page, in PDF points from the page's top-left corner. */
export type PdfSpot = { page: number; x: number; y: number; width: number; height: number };

/** A place in a source file (line is 1-based). */
export type SourceSpot = { file: string; line: number };

/** Port: SyncTeX lookups against a built PDF. Null when SyncTeX has nothing there. */
export interface SyncTex {
  /** Where `line` of `file` ended up in `pdf` (⌘↵). */
  forward(pdf: string, file: string, line: number): Promise<PdfSpot | null>;
  /** The source line behind a point on a page (⌘-click). */
  inverse(pdf: string, page: number, x: number, y: number): Promise<SourceSpot | null>;
}
