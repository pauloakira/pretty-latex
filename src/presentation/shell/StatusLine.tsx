type Props = {
  pdfOpen: boolean;
};

/**
 * Bottom status line. Breadcrumb, cursor position and build time arrive with the editor
 * and build cards; for now it only says how to bring a hidden PDF back.
 */
export function StatusLine({ pdfOpen }: Props) {
  return (
    <footer className="statusline">
      <span>ready</span>
      {!pdfOpen && <span className="statusline-dim">⌘\ show pdf</span>}
    </footer>
  );
}
