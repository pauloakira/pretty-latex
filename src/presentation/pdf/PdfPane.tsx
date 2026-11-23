import { useEffect, useRef, useState } from "react";
import { basename } from "../../domain/project";
import { percent, stepZoom, type PdfView, type PdfZoom } from "../../domain/pdf";
import type { PdfSpot } from "../../domain/synctex";
import { CollapseIcon, ExpandIcon } from "../shell/icons";
import type { PdfDisplay, PdfDisplayFactory } from "./PdfDisplay";

type Props = {
  /** The built PDF, or null before the first build. */
  path: string | null;
  /** Bumps after each build, so the same path reloads. */
  version: number;
  readBytes: (path: string) => Promise<Uint8Array>;
  createDisplay: PdfDisplayFactory;
  onHide: () => void;
  /** The PDF fills the window. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** ⌘-click on a page (inverse search): the point, in PDF points from the top-left. */
  onSyncClick?: (page: number, x: number, y: number) => void;
  /** A spot to scroll to and highlight (forward search); the nonce repeats a jump. */
  reveal?: { spot: PdfSpot; nonce: number } | null;
};

/**
 * The PDF column (design B1): the built PDF on a darker backdrop, with the page count,
 * zoom −/+ and fit width in the bar. Reloads after every build in place.
 */
export function PdfPane({
  path,
  version,
  readBytes,
  createDisplay,
  onHide,
  expanded,
  onToggleExpanded,
  onSyncClick,
  reveal,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const display = useRef<Promise<PdfDisplay> | null>(null);
  const [zoom, setZoom] = useState<PdfZoom>("page-width");
  const [view, setView] = useState<PdfView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onSyncClickRef = useRef(onSyncClick);
  onSyncClickRef.current = onSyncClick;

  // One display for the pane's lifetime.
  useEffect(() => {
    if (!host.current) return;
    const created = createDisplay(host.current, {
      zoom: zoomRef.current,
      onView: setView,
      onSyncClick: (page, x, y) => onSyncClickRef.current?.(page, x, y),
    });
    display.current = created;
    return () => {
      display.current = null;
      void created.then((d) => d.destroy());
    };
  }, [createDisplay]);

  useEffect(() => {
    if (!path || !display.current) return;
    let cancelled = false;
    const pending = display.current;
    (async () => {
      try {
        const bytes = await readBytes(path);
        if (cancelled) return;
        await (await pending).show(bytes);
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, version, readBytes]);

  useEffect(() => {
    if (!reveal) return;
    void display.current?.then((d) => d.reveal(reveal.spot));
    // The nonce makes the same spot jump again.
  }, [reveal?.nonce]);

  const changeZoom = (next: PdfZoom) => {
    setZoom(next);
    void display.current?.then((d) => d.setZoom(next));
  };
  const scale = view?.scale ?? 1;

  return (
    <section className={expanded ? "pdf-pane pdf-pane-expanded" : "pdf-pane"} aria-label="PDF preview">
      <div className="pdf-bar">
        <span className="pdf-name">{path ? basename(path) : "pdf"}</span>
        {view && (
          <span className="pdf-controls">
            <span aria-label="Page">
              p. {view.page} / {view.pages}
            </span>
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom(stepZoom(scale, -1))}>
              −
            </button>
            <button
              type="button"
              aria-label="Fit width"
              aria-pressed={zoom === "page-width"}
              title="Fit width"
              onClick={() => changeZoom("page-width")}
            >
              {percent(scale)}
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => changeZoom(stepZoom(scale, 1))}>
              +
            </button>
          </span>
        )}
        <span className="pdf-actions">
          {expanded ? (
            <button type="button" className="pill-button" onClick={onToggleExpanded} title="⇧⌘\ or Esc">
              <CollapseIcon /> Exit full screen
            </button>
          ) : (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Expand PDF"
                title="Expand PDF (⇧⌘\)"
                onClick={onToggleExpanded}
              >
                <ExpandIcon />
              </button>
              <button type="button" className="pill-button" onClick={onHide}>
                hide <kbd>⌘\</kbd>
              </button>
            </>
          )}
        </span>
      </div>
      <div className="pdf-stage">
        <div className="pdf-host" ref={host} />
        {!path && <p className="pane-empty pdf-overlay">The PDF appears here after the first build (⌘S).</p>}
        {error && <p className="pane-empty pdf-overlay statusline-error">{error}</p>}
      </div>
    </section>
  );
}
