import { FolderIcon, OutlineIcon, SearchIcon } from "./icons";

type Props = {
  treeOpen: boolean;
  pdfOpen: boolean;
  onHidePdf: () => void;
};

/**
 * The three columns under the title bar (designs B1–B3): file tree (a rail when
 * collapsed), source, and PDF. Each pane is an empty placeholder until its own card
 * fills it in (file tree, editor, PDF preview).
 */
export function Workspace({ treeOpen, pdfOpen, onHidePdf }: Props) {
  return (
    <div className="workspace">
      {treeOpen ? (
        <aside className="tree-panel" aria-label="File tree">
          <p className="pane-caption">FILES</p>
          <p className="pane-empty">No folder open</p>
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

      <main className="source-pane">
        <p className="empty-title">No project open</p>
        <p className="pane-empty">
          Open a folder with your <code>.tex</code> files to start.
        </p>
      </main>

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
