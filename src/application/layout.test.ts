import { describe, expect, it } from "vitest";
import { initialLayout, layoutReducer, shortcutToLayoutAction, type KeyPress } from "./layout";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("layout", () => {
  it("starts with the tree collapsed and the PDF shown", () => {
    expect(initialLayout).toEqual({ treeOpen: false, pdfOpen: true, pdfExpanded: false });
  });

  it("toggles each pane independently", () => {
    const treeOpen = layoutReducer(initialLayout, { type: "toggleTree" });
    expect(treeOpen).toEqual({ treeOpen: true, pdfOpen: true, pdfExpanded: false });
    const pdfHidden = layoutReducer(treeOpen, { type: "togglePdf" });
    expect(pdfHidden).toEqual({ treeOpen: true, pdfOpen: false, pdfExpanded: false });
  });

  it("expands the PDF (showing it if hidden), and leaves on Esc or when hiding it", () => {
    const hidden = { ...initialLayout, pdfOpen: false };
    const expanded = layoutReducer(hidden, { type: "toggleExpandPdf" });
    expect(expanded).toEqual({ treeOpen: false, pdfOpen: true, pdfExpanded: true });
    expect(layoutReducer(expanded, { type: "leaveExpandedPdf" }).pdfExpanded).toBe(false);
    expect(layoutReducer(expanded, { type: "toggleExpandPdf" }).pdfExpanded).toBe(false);
    expect(layoutReducer(expanded, { type: "togglePdf" })).toEqual({ treeOpen: false, pdfOpen: false, pdfExpanded: false });
  });
});

describe("shortcutToLayoutAction", () => {
  it("maps ⌘B to the tree and ⌘\\ to the PDF", () => {
    expect(shortcutToLayoutAction(press("b"))).toEqual({ type: "toggleTree" });
    expect(shortcutToLayoutAction(press("B"))).toEqual({ type: "toggleTree" });
    expect(shortcutToLayoutAction(press("\\"))).toEqual({ type: "togglePdf" });
  });

  it("maps ⇧⌘\\ to the expanded PDF, whichever character shift makes", () => {
    expect(shortcutToLayoutAction(press("|", { shiftKey: true }))).toEqual({ type: "toggleExpandPdf" });
    expect(shortcutToLayoutAction(press("\\", { shiftKey: true }))).toEqual({ type: "toggleExpandPdf" });
  });

  it("ignores other keys and extra modifiers", () => {
    expect(shortcutToLayoutAction(press("k"))).toBeNull();
    expect(shortcutToLayoutAction(press("b", { metaKey: false }))).toBeNull();
    expect(shortcutToLayoutAction(press("b", { shiftKey: true }))).toBeNull();
    expect(shortcutToLayoutAction(press("\\", { altKey: true }))).toBeNull();
  });
});
