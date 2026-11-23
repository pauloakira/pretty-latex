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
    expect(initialLayout).toEqual({ treeOpen: false, sidePanel: "files", pdfOpen: true, pdfExpanded: false });
  });

  it("toggles each pane independently", () => {
    const treeOpen = layoutReducer(initialLayout, { type: "toggleTree" });
    expect(treeOpen).toEqual({ treeOpen: true, sidePanel: "files", pdfOpen: true, pdfExpanded: false });
    const pdfHidden = layoutReducer(treeOpen, { type: "togglePdf" });
    expect(pdfHidden).toEqual({ treeOpen: true, sidePanel: "files", pdfOpen: false, pdfExpanded: false });
  });

  it("expands the PDF (showing it if hidden), and leaves on Esc or when hiding it", () => {
    const hidden = { ...initialLayout, pdfOpen: false };
    const expanded = layoutReducer(hidden, { type: "toggleExpandPdf" });
    expect(expanded).toEqual({ treeOpen: false, sidePanel: "files", pdfOpen: true, pdfExpanded: true });
    expect(layoutReducer(expanded, { type: "leaveExpandedPdf" }).pdfExpanded).toBe(false);
    expect(layoutReducer(expanded, { type: "toggleExpandPdf" }).pdfExpanded).toBe(false);
    expect(layoutReducer(expanded, { type: "togglePdf" })).toEqual({ treeOpen: false, sidePanel: "files", pdfOpen: false, pdfExpanded: false });
  });
});

describe("side panel", () => {
  it("opens on the view a rail icon picks, and folds when that icon is clicked again", () => {
    const git = layoutReducer(initialLayout, { type: "showPanel", panel: "git", toggle: true });
    expect(git).toMatchObject({ treeOpen: true, sidePanel: "git" });
    const files = layoutReducer(git, { type: "showPanel", panel: "files", toggle: true });
    expect(files).toMatchObject({ treeOpen: true, sidePanel: "files" });
    expect(layoutReducer(files, { type: "showPanel", panel: "files", toggle: true }).treeOpen).toBe(false);
    // ⇧⌘G (no toggle) only ever opens.
    expect(layoutReducer(git, { type: "showPanel", panel: "git" }).treeOpen).toBe(true);
  });

  it("leaves the expanded PDF to show the panel", () => {
    const expanded = { ...initialLayout, pdfExpanded: true };
    expect(layoutReducer(expanded, { type: "showPanel", panel: "git" }).pdfExpanded).toBe(false);
  });
});

describe("shortcutToLayoutAction", () => {
  it("maps ⌘B to the tree and ⌘\\ to the PDF", () => {
    expect(shortcutToLayoutAction(press("b"))).toEqual({ type: "toggleTree" });
    expect(shortcutToLayoutAction(press("B"))).toEqual({ type: "toggleTree" });
    expect(shortcutToLayoutAction(press("\\"))).toEqual({ type: "togglePdf" });
  });

  it("maps ⇧⌘G to git", () => {
    expect(shortcutToLayoutAction(press("G", { shiftKey: true }))).toEqual({ type: "showPanel", panel: "git" });
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
