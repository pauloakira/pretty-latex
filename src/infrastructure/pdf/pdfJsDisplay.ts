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
import { EventBus, PDFLinkService, PDFViewer, RenderingStates } from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import type { PdfZoom } from "../../domain/pdf";
import type { PdfDisplay, PdfDisplayFactory } from "../../presentation/pdf/PdfDisplay";
import { preRenderPages } from "./preRender";
import { createGlide, type Glide } from "./smoothWheel";

GlobalWorkerOptions.workerSrc = workerUrl;

/** pdf.js data files, served by the pdfjs-assets plugin in vite.config.ts. */
const assetUrl = (dir: string) => new URL(`/pdfjs/${dir}/`, window.location.href).href;

/** Longest wait for the new layer's first page before swapping anyway. */
const SWAP_TIMEOUT_MS = 800;

/**
 * Pages drawn ahead of the viewport in the scroll direction (and behind it). pdf.js on its
 * own draws the visible pages plus one, so a trackpad flick lands on blank pages that pop
 * in. (Same numbers as pretty-markdown, measured there.)
 */
const PRERENDER_AHEAD = 4;
const PRERENDER_BEHIND = 1;
const PRERENDER_DELAY_MS = 100;

/** The slice of PDFViewer's semi-internal API the pre-drawing uses; pdfjs-dist is pinned. */
interface VisiblePage {
  readonly id: number;
  readonly view: { readonly renderingState: number };
}
interface VisiblePages {
  readonly first: VisiblePage;
  readonly last: VisiblePage;
  readonly views: readonly VisiblePage[];
  readonly ids: Set<number>;
}
interface ViewerInternals {
  _getVisiblePages(): VisiblePages;
  readonly renderingQueue: { renderHighestPriority(pages?: VisiblePages): void };
  getPageView(index: number): { readonly renderingState: number } | undefined;
  readonly pagesCount: number;
  readonly _pages: readonly {
    readonly id: number;
    readonly renderingState: number;
    readonly canvas?: HTMLCanvasElement | null;
    reset(): void;
  }[];
}

/**
 * Draws pages ahead of the scroll whenever pdf.js has nothing more urgent, through its own
 * rendering queue, and frees pages far from the view so memory stays bounded.
 */
function keepPagesAhead(
  element: HTMLDivElement,
  viewer: PDFViewer,
  eventBus: EventBus,
  gliding: () => boolean,
): () => void {
  const internals = viewer as unknown as ViewerInternals;
  let lastTop = element.scrollTop;
  let down = true;
  let timer = 0;

  const preRender = () => {
    timer = 0;
    // Mid-glide the main thread moves the page every frame: keep it free, draw after.
    if (gliding()) {
      schedule();
      return;
    }
    const top = element.scrollTop;
    if (top !== lastTop) down = top > lastTop;
    lastTop = top;
    const visible = internals._getVisiblePages();
    if (visible.views.length === 0) return;
    if (visible.views.some((v) => v.view.renderingState !== RenderingStates.FINISHED)) return;
    const count = internals.pagesCount;
    const pages: VisiblePage[] = [];
    for (const id of preRenderPages(visible.first.id, visible.last.id, count, down, PRERENDER_AHEAD, PRERENDER_BEHIND)) {
      const view = internals.getPageView(id - 1);
      if (view?.renderingState === RenderingStates.RUNNING) return; // one at a time
      if (view && (view.renderingState === RenderingStates.INITIAL || view.renderingState === RenderingStates.PAUSED)) {
        pages.push({ id, view });
      }
    }
    if (pages.length === 0) return;
    internals.renderingQueue.renderHighestPriority({
      first: pages[0],
      last: pages[0],
      views: pages,
      ids: new Set(pages.map((p) => p.id)),
    });
  };
  const schedule = () => {
    if (!timer) timer = window.setTimeout(preRender, PRERENDER_DELAY_MS);
  };

  // Keep drawn pages to the view plus the drawing-ahead window (only the view right after
  // a zoom, when pdf.js would keep every old canvas stretched until redrawn).
  const trim = (viewOnly: boolean) => {
    const visible = internals._getVisiblePages();
    if (visible.views.length === 0) return;
    const ahead = viewOnly ? 0 : PRERENDER_AHEAD;
    const behind = viewOnly ? 0 : PRERENDER_BEHIND;
    const from = visible.first.id - (down ? behind : ahead);
    const to = visible.last.id + (down ? ahead : behind);
    for (const page of internals._pages) {
      const drawn = page.renderingState !== RenderingStates.INITIAL || page.canvas;
      if (drawn && (page.id < from || page.id > to)) page.reset();
    }
  };
  const onRendered = () => {
    trim(false);
    schedule();
  };
  const onScale = () => trim(true);

  eventBus.on("pagerendered", onRendered);
  eventBus.on("scalechanging", onScale);
  element.addEventListener("scroll", schedule, { passive: true });
  return () => {
    clearTimeout(timer);
    eventBus.off("pagerendered", onRendered);
    eventBus.off("scalechanging", onScale);
    element.removeEventListener("scroll", schedule);
  };
}

type Layer = {
  element: HTMLDivElement;
  viewer: PDFViewer;
  eventBus: EventBus;
  pdf: PDFDocumentProxy;
  stopPreRender: () => void;
  glide: Glide;
  stopGlide: () => void;
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

  // "Fit" is pdf.js's "auto": the pane's width, but at most 125%, so the expanded
  // full-window view shows a readable page rather than a giant one.
  const applyZoom = (layer: Layer) => {
    layer.viewer.currentScaleValue = zoom === "page-width" ? "auto" : String(zoom);
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
    layer.stopPreRender();
    layer.stopGlide();
    layer.viewer.setDocument(null as unknown as PDFDocumentProxy);
    void layer.pdf.loadingTask.destroy();
    layer.element.remove();
  };

  // Keep "fit" fitted when the pane is resized (its edge, the window, expanding).
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
      // Focusable, so arrow keys and space scroll it (the expanded view focuses it).
      element.tabIndex = -1;
      const viewerElement = document.createElement("div");
      viewerElement.className = "pdfViewer";
      element.appendChild(viewerElement);
      container.appendChild(element);

      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const viewer = new PDFViewer({ container: element, viewer: viewerElement, eventBus, linkService });
      linkService.setViewer(viewer);
      const glide = createGlide({
        get: () => element.scrollTop,
        set: (top) => {
          element.scrollTop = top;
        },
        max: () => element.scrollHeight - element.clientHeight,
        page: () => element.clientHeight,
      });
      const onWheel = (event: WheelEvent) => {
        if (glide.wheel(event)) event.preventDefault();
      };
      element.addEventListener("wheel", onWheel, { passive: false });
      const layer: Layer = {
        element,
        viewer,
        eventBus,
        pdf,
        glide,
        stopGlide: () => {
          glide.stop();
          element.removeEventListener("wheel", onWheel);
        },
        stopPreRender: keepPagesAhead(element, viewer, eventBus, glide.active),
      };

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
