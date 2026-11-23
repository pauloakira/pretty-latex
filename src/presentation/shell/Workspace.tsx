import type { ReactNode } from "react";
import { FolderIcon, OutlineIcon, SearchIcon } from "./icons";

type Props = {
  treeOpen: boolean;
  pdfOpen: boolean;
  onHidePdf: () => void;
  /** What fills the open file tree panel. */
  tree: ReactNode;
  /** What fills the middle column (the editor). */
  source: ReactNode;
};

/**
 * The three columns under the title bar (designs B1–B3): file tree (a rail when
 * collapsed), source, and PDF. The PDF is a placeholder until the preview card.
 */
export function Workspace({ treeOpen, pdfOpen, onHidePdf, tree, source }: Props) {
  return (
    <div className="workspace">
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
        <section className="pdf-pane" aria-label="PDF preview">
          <div className="pdf-bar">
            <span>pdf</span>
            <button type="button" className="pill-button" onClick={onHidePdf}>
              hide <kbd>⌘\</kbd>
            </button>
          </div>
          <div className="pdf-empty">
            <p className="pane-empty">The PDF appears here after the first build.</p>
          </div>
        </section>
      )}
    </div>
  );
}
