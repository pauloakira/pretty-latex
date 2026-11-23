type Props = {
  pdfOpen: boolean;
  /** The active file, relative to the open folder when it's inside it. */
  location: string | null;
  notice: { text: string; tone: "info" | "error" } | null;
};

/**
 * Bottom status line: the active file (or the last save / error), and how to bring a
 * hidden PDF back. Cursor position and build time arrive with later cards.
 */
export function StatusLine({ pdfOpen, location, notice }: Props) {
  return (
    <footer className="statusline">
      {notice ? (
        <span className={notice.tone === "error" ? "statusline-error" : undefined} role="status">
          {notice.text}
        </span>
      ) : (
        <span>{location ?? "ready"}</span>
      )}
      {!pdfOpen && <span className="statusline-dim">⌘\ show pdf</span>}
    </footer>
  );
}
