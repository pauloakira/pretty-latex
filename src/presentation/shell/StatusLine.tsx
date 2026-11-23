type Props = {
  pdfOpen: boolean;
  /** The active file, relative to the open folder when it's inside it. */
  location: string | null;
  notice: { text: string; tone: "info" | "error" } | null;
  /** The cursor's line, when a document is open. */
  line?: number | null;
  /** Whether ⌘↵ can jump to the PDF (a PDF has been built). */
  canSync?: boolean;
};

/**
 * Bottom status line (design B1): the active file (or the last save / error) on the left;
 * on the right, how to jump to the PDF, how to bring a hidden PDF back, and the line.
 */
export function StatusLine({ pdfOpen, location, notice, line = null, canSync = false }: Props) {
  return (
    <footer className="statusline">
      {notice ? (
        <span className={notice.tone === "error" ? "statusline-error" : undefined} role="status">
          {notice.text}
        </span>
      ) : (
        <span>{location ?? "ready"}</span>
      )}
      <span className="statusline-right">
        {canSync && <span className="statusline-dim">⌘↵ jump to pdf</span>}
        {!pdfOpen && <span className="statusline-dim">⌘\ show pdf</span>}
        {line !== null && <span aria-label="Line">Ln {line}</span>}
      </span>
    </footer>
  );
}
