/*
 * pdf.js behind the PdfDisplay port. Uses the legacy build, like pretty-markdown: the
 * webview is the user's Safari version, which can lag behind the modern build.
 *
 * No-flash reloads: each build's PDF opens in a new layer stacked under the shown one,
 * hidden but laid out, so pdf.js draws its pages. Once the page in view has drawn (or a
 * short timeout passes), the new layer takes over and the old one is destroyed.
 */
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import type { PdfZoom } from "../../domain/pdf";
import type { PdfDisplay, PdfDisplayFactory } from "../../presentation/pdf/PdfDisplay";

GlobalWorkerOptions.workerSrc = workerUrl;

/** pdf.js data files, served by the pdfjs-assets plugin in vite.config.ts. */
const assetUrl = (dir: string) => new URL(`/pdfjs/${dir}/`, window.location.href).href;

/** Longest wait for the new layer's first page before swapping anyway. */
const SWAP_TIMEOUT_MS = 800;

type Layer = {
  element: HTMLDivElement;
  viewer: PDFViewer;
  eventBus: EventBus;
  pdf: PDFDocumentProxy;
};

/** Where the reader is: the page at the top, and how far down it (0–1). */
type Spot = { page: number; offset: number };

export const mountPdfJs: PdfDisplayFactory = async (container, options) => {
  let zoom: PdfZoom = options.zoom;
  let shown: Layer | null = null;
  let loading = 0;

  const report = (layer: Layer) => {
    options.onView({
      page: layer.viewer.currentPageNumber,
      pages: layer.viewer.pagesCount,
      scale: layer.viewer.currentScale,
    });
  };

  const applyZoom = (layer: Layer) => {
    layer.viewer.currentScaleValue = zoom === "page-width" ? "page-width" : String(zoom);
  };

  const pageBox = (layer: Layer, index: number) => {
    const div = layer.viewer.getPageView(index)?.div as HTMLElement | undefined;
    return div ? { top: div.offsetTop, height: div.offsetHeight } : null;
  };

  const spotOf = (layer: Layer): Spot => {
    const index = layer.viewer.currentPageNumber - 1;
    const box = pageBox(layer, index);
    const offset = box && box.height > 0 ? (layer.element.scrollTop - box.top) / box.height : 0;
    return { page: index + 1, offset };
  };

  const goTo = (layer: Layer, spot: Spot) => {
    const index = Math.min(spot.page, layer.viewer.pagesCount) - 1;
    const box = pageBox(layer, index);
    if (box) layer.element.scrollTop = box.top + spot.offset * box.height;
  };

  const destroyLayer = (layer: Layer) => {
    layer.viewer.setDocument(null as unknown as PDFDocumentProxy);
    void layer.pdf.loadingTask.destroy();
    layer.element.remove();
  };

  // Keep "fit width" fitted when the pane is resized (dragging its edge, the window).
  const resize = new ResizeObserver(() => {
    if (shown && zoom === "page-width") applyZoom(shown);
  });
  resize.observe(container);

  const display: PdfDisplay = {
    async show(bytes) {
      const id = ++loading;
      const pdf = await getDocument({
        data: bytes,
        cMapUrl: assetUrl("cmaps"),
        cMapPacked: true,
        standardFontDataUrl: assetUrl("standard_fonts"),
        wasmUrl: assetUrl("wasm"),
        iccUrl: assetUrl("iccs"),
        enableHWA: true,
      }).promise;
      if (id !== loading) {
        void pdf.loadingTask.destroy();
        return;
      }

      const element = document.createElement("div");
      element.className = "pdf-layer pdf-layer-loading";
      const viewerElement = document.createElement("div");
      viewerElement.className = "pdfViewer";
      element.appendChild(viewerElement);
      container.appendChild(element);

      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const viewer = new PDFViewer({ container: element, viewer: viewerElement, eventBus, linkService });
      linkService.setViewer(viewer);
      const layer: Layer = { element, viewer, eventBus, pdf };

      const spot = shown ? spotOf(shown) : { page: 1, offset: 0 };
      const ready = new Promise<void>((resolve) => {
        const done = () => resolve();
        eventBus.on("pagerendered", (event: { pageNumber: number }) => {
          if (event.pageNumber === Math.min(spot.page, pdf.numPages)) done();
        });
        setTimeout(done, SWAP_TIMEOUT_MS);
      });
      const pagesInit = new Promise<void>((resolve) => eventBus.on("pagesinit", () => resolve(), { once: true }));
      viewer.setDocument(pdf);
      linkService.setDocument(pdf, null);
      await pagesInit;
      applyZoom(layer);
      goTo(layer, spot);
      await ready;

      if (id !== loading) {
        destroyLayer(layer);
        return;
      }
      // Re-read the old spot: the reader may have scrolled while the new one drew.
      if (shown) {
        goTo(layer, spotOf(shown));
        destroyLayer(shown);
      }
      element.classList.remove("pdf-layer-loading");
      shown = layer;
      const onChange = () => report(layer);
      eventBus.on("pagechanging", onChange);
      eventBus.on("scalechanging", onChange);
      report(layer);
    },

    setZoom(next) {
      zoom = next;
      if (shown) applyZoom(shown);
    },

    destroy() {
      loading++;
      resize.disconnect();
      if (shown) destroyLayer(shown);
      shown = null;
    },
  };
  return display;
};
