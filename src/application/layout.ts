/**
 * Which panes are visible. Default matches canvas design B1: file tree collapsed to a
 * rail, PDF shown. Pure: no React, so it's tested directly.
 */
export type Layout = {
  treeOpen: boolean;
  pdfOpen: boolean;
  /** The PDF fills the window, the tree and editor set aside (⇧⌘\, Esc leaves). */
  pdfExpanded: boolean;
};

export const initialLayout: Layout = { treeOpen: false, pdfOpen: true, pdfExpanded: false };

export type LayoutAction =
  | { type: "toggleTree" }
  | { type: "showTree" }
  | { type: "togglePdf" }
  | { type: "toggleExpandPdf" }
  | { type: "leaveExpandedPdf" };

export function layoutReducer(layout: Layout, action: LayoutAction): Layout {
  switch (action.type) {
    case "toggleTree":
      return { ...layout, treeOpen: !layout.treeOpen };
    case "showTree":
      return layout.treeOpen ? layout : { ...layout, treeOpen: true };
    case "togglePdf":
      // Hiding the PDF also leaves the expanded view, so the editor comes back.
      return { ...layout, pdfOpen: !layout.pdfOpen, pdfExpanded: false };
    case "toggleExpandPdf":
      return layout.pdfExpanded ? { ...layout, pdfExpanded: false } : { ...layout, pdfOpen: true, pdfExpanded: true };
    case "leaveExpandedPdf":
      return layout.pdfExpanded ? { ...layout, pdfExpanded: false } : layout;
  }
}

/** The parts of a KeyboardEvent the shortcuts look at. */
export type KeyPress = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * ⌘B toggles the file tree, ⌘\ the PDF, ⇧⌘\ the expanded PDF. Anything else (or extra
 * modifiers) is ignored. Esc, which leaves the expanded PDF, is handled where it's known.
 */
export function shortcutToLayoutAction(press: KeyPress): LayoutAction | null {
  if (!press.metaKey || press.ctrlKey || press.altKey) return null;
  // Shift turns \ into | on most layouts.
  if (press.shiftKey) return press.key === "\\" || press.key === "|" ? { type: "toggleExpandPdf" } : null;
  switch (press.key.toLowerCase()) {
    case "b":
      return { type: "toggleTree" };
    case "\\":
      return { type: "togglePdf" };
    default:
      return null;
  }
}
