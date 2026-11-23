import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { SidePanel } from "../../application/layout";
import { FolderIcon, GitIcon, OutlineIcon, SearchIcon } from "./icons";

type Props = {
  treeOpen: boolean;
  pdfOpen: boolean;
  /** The PDF fills the workspace; the tree and editor stay mounted (undo history) but hidden. */
  pdfExpanded?: boolean;
  /** Which view the open side panel shows. */
  sidePanel?: SidePanel;
  /** Open the side panel on a view (a rail icon, or the panel's own tabs). */
  onShowPanel?: (panel: SidePanel, toggle: boolean) => void;
  /** What fills the open file tree panel. */
  tree: ReactNode;
  /** The git view; null when the open folder isn't a git repository. */
  git?: ReactNode;
  /** Changed files, shown as a count on the rail's git icon. */
  gitChanges?: number;
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
export function Workspace({
  treeOpen,
  pdfOpen,
  pdfExpanded = false,
  sidePanel = "files",
  onShowPanel,
  tree,
  git = null,
  gitChanges = 0,
  source,
  pdf,
}: Props) {
  const view = git ? sidePanel : "files";
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
        <aside className="tree-panel" aria-label={view === "git" ? "Git" : "File tree"}>
          {git && (
            <div className="panel-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "files"}
                className="panel-tab"
                onClick={() => onShowPanel?.("files", false)}
              >
                Files
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "git"}
                className="panel-tab"
                onClick={() => onShowPanel?.("git", false)}
              >
                Git{gitChanges > 0 && <span className="panel-tab-count">{gitChanges}</span>}
              </button>
            </div>
          )}
          {view === "git" ? git : tree}
        </aside>
      ) : (
        <aside className="tree-rail" aria-label="File tree (collapsed)">
          <button
            type="button"
            className="rail-icon rail-icon-active"
            title="Files (⌘B)"
            aria-label="Files"
            onClick={() => onShowPanel?.("files", true)}
          >
            <FolderIcon />
          </button>
          {git && (
            <button
              type="button"
              className="rail-icon"
              title="Commit and push (⇧⌘G)"
              aria-label={gitChanges > 0 ? `Git, ${gitChanges} changed` : "Git"}
              onClick={() => onShowPanel?.("git", true)}
            >
              <GitIcon />
              {gitChanges > 0 && <span className="rail-badge">{gitChanges > 99 ? "99+" : gitChanges}</span>}
            </button>
          )}
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
