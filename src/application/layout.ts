/**
 * Which panes are visible. Default matches canvas design B1: file tree collapsed to a
 * rail, PDF shown. Pure: no React, so it's tested directly.
 */
export type Layout = {
  treeOpen: boolean;
  pdfOpen: boolean;
};

export const initialLayout: Layout = { treeOpen: false, pdfOpen: true };

export type LayoutAction = { type: "toggleTree" } | { type: "showTree" } | { type: "togglePdf" };

export function layoutReducer(layout: Layout, action: LayoutAction): Layout {
  switch (action.type) {
    case "toggleTree":
      return { ...layout, treeOpen: !layout.treeOpen };
    case "showTree":
      return layout.treeOpen ? layout : { ...layout, treeOpen: true };
    case "togglePdf":
      return { ...layout, pdfOpen: !layout.pdfOpen };
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

/** ⌘B toggles the file tree, ⌘\ the PDF. Anything else (or extra modifiers) is ignored. */
export function shortcutToLayoutAction(press: KeyPress): LayoutAction | null {
  if (!press.metaKey || press.ctrlKey || press.shiftKey || press.altKey) return null;
  switch (press.key.toLowerCase()) {
    case "b":
      return { type: "toggleTree" };
    case "\\":
      return { type: "togglePdf" };
    default:
      return null;
  }
}
