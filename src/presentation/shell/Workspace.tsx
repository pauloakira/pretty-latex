import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { FolderIcon, OutlineIcon, SearchIcon } from "./icons";

type Props = {
  treeOpen: boolean;
  pdfOpen: boolean;
  /** The PDF fills the workspace; the tree and editor stay mounted (undo history) but hidden. */
  pdfExpanded?: boolean;
  /** What fills the open file tree panel. */
  tree: ReactNode;
  /** What fills the middle column (the editor). */
  source: ReactNode;
  /** The PDF column, shown when pdfOpen. */
  pdf: ReactNode;
};

export const PDF_WIDTH = { initial: 540, min: 280, minSource: 360 };
const WIDTH_KEY = "pretty-latex.pdfWidth";

function savedWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved >= PDF_WIDTH.min ? saved : PDF_WIDTH.initial;
  } catch {
    return PDF_WIDTH.initial;
  }
}

/**
 * The three columns under the title bar (designs B1–B3): file tree (a rail when
 * collapsed), source, and PDF. The PDF column's left edge can be dragged; its width is
 * remembered.
 */
export function Workspace({ treeOpen, pdfOpen, pdfExpanded = false, tree, source, pdf }: Props) {
  const [pdfWidth, setPdfWidth] = useState(savedWidth);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const workspace = handle.parentElement;
    if (!workspace) return;
    handle.setPointerCapture(event.pointerId);
    const right = workspace.getBoundingClientRect().right;
    const max = Math.max(PDF_WIDTH.min, workspace.clientWidth - PDF_WIDTH.minSource);
    let width = pdfWidth;
    const move = (e: PointerEvent) => {
      width = Math.round(Math.min(max, Math.max(PDF_WIDTH.min, right - e.clientX)));
      setPdfWidth(width);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      try {
        localStorage.setItem(WIDTH_KEY, String(width));
      } catch {
        // Not remembered; fine.
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div className={pdfExpanded ? "workspace workspace-pdf-expanded" : "workspace"} style={{ "--pdf-width": `${pdfWidth}px` } as CSSProperties}>
      {treeOpen ? (
        <aside className="tree-panel" aria-label="File tree">
          {tree}
        </aside>
      ) : (
        <aside className="tree-rail" aria-label="File tree (collapsed)">
          <span className="rail-icon rail-icon-active" title="Files">
            <FolderIcon />
          </span>
          <span className="rail-icon" title="Outline">
            <OutlineIcon />
          </span>
          <span className="rail-icon" title="Search">
            <SearchIcon />
          </span>
        </aside>
      )}

      <main className="source-pane">{source}</main>

      {pdfOpen && (
        <>
          <div
            className="pdf-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize PDF"
            aria-valuenow={pdfWidth}
            onPointerDown={startResize}
          />
          {pdf}
        </>
      )}
    </div>
  );
}
