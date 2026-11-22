/**
 * The empty glass window: title bar, an empty editor area and the status line.
 * Layout follows design "B1 · Split Glass" on the Pretty-Latex canvas; the editor, file
 * tree and PDF pane arrive in their own cards.
 */
export default function App() {
  return (
    <div className="window">
      {/* The whole bar drags the window; macOS draws the traffic lights over its left end. */}
      <header className="titlebar" data-tauri-drag-region>
        <span className="titlebar-title" data-tauri-drag-region>
          pretty-latex
        </span>
      </header>

      <main className="empty-state">
        <p className="empty-title">No project open</p>
        <p className="empty-hint">
          Open a folder with your <code>.tex</code> files to start.
        </p>
      </main>

      <footer className="statusline" role="status">
        <span>ready</span>
        <span className="statusline-dim">⌘O open folder</span>
      </footer>
    </div>
  );
}
