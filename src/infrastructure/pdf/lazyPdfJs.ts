import type { PdfDisplayFactory } from "../../presentation/pdf/PdfDisplay";

/** Loads pdf.js only when the PDF pane first mounts, so it stays out of the main bundle. */
export const lazyPdfJs: PdfDisplayFactory = async (container, options) => {
  const { mountPdfJs } = await import("./pdfJsDisplay");
  return mountPdfJs(container, options);
};
