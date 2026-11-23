import { describe, expect, it } from "vitest";
import { shortcutToFileCommand } from "./fileShortcuts";
import type { KeyPress } from "./layout";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("shortcutToFileCommand", () => {
  it("maps the file shortcuts", () => {
    expect(shortcutToFileCommand(press("n"))).toBe("newFile");
    expect(shortcutToFileCommand(press("o"))).toBe("openFile");
    expect(shortcutToFileCommand(press("O", { shiftKey: true }))).toBe("openFolder");
    expect(shortcutToFileCommand(press("s"))).toBe("save");
    expect(shortcutToFileCommand(press("S", { shiftKey: true }))).toBe("saveAs");
    expect(shortcutToFileCommand(press("w"))).toBe("closeTab");
    expect(shortcutToFileCommand(press("}", { shiftKey: true }))).toBe("nextTab");
    expect(shortcutToFileCommand(press("{", { shiftKey: true }))).toBe("previousTab");
    expect(shortcutToFileCommand(press("N", { shiftKey: true }))).toBe("newWindow");
    expect(shortcutToFileCommand(press("W", { shiftKey: true }))).toBe("closeWindow");
  });

  it("ignores keys without ⌘ or with Control or Option", () => {
    expect(shortcutToFileCommand(press("s", { metaKey: false }))).toBeNull();
    expect(shortcutToFileCommand(press("s", { ctrlKey: true }))).toBeNull();
    expect(shortcutToFileCommand(press("s", { altKey: true }))).toBeNull();
    expect(shortcutToFileCommand(press("x", { shiftKey: true }))).toBeNull();
    expect(shortcutToFileCommand(press("z"))).toBeNull();
  });
});
