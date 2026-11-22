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
    expect(initialLayout).toEqual({ treeOpen: false, pdfOpen: true });
  });

  it("toggles each pane independently", () => {
    const treeOpen = layoutReducer(initialLayout, { type: "toggleTree" });
    expect(treeOpen).toEqual({ treeOpen: true, pdfOpen: true });
    const pdfHidden = layoutReducer(treeOpen, { type: "togglePdf" });
    expect(pdfHidden).toEqual({ treeOpen: true, pdfOpen: false });
  });
});

describe("shortcutToLayoutAction", () => {
  it("maps ⌘B to the tree and ⌘\\ to the PDF", () => {
    expect(shortcutToLayoutAction(press("b"))).toEqual({ type: "toggleTree" });
    expect(shortcutToLayoutAction(press("B"))).toEqual({ type: "toggleTree" });
    expect(shortcutToLayoutAction(press("\\"))).toEqual({ type: "togglePdf" });
  });

  it("ignores other keys and extra modifiers", () => {
    expect(shortcutToLayoutAction(press("k"))).toBeNull();
    expect(shortcutToLayoutAction(press("b", { metaKey: false }))).toBeNull();
    expect(shortcutToLayoutAction(press("b", { shiftKey: true }))).toBeNull();
    expect(shortcutToLayoutAction(press("\\", { altKey: true }))).toBeNull();
  });
});
