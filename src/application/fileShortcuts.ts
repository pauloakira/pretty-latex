import type { KeyPress } from "./layout";

export type FileCommand =
  | "newFile"
  | "openFile"
  | "openFolder"
  | "save"
  | "saveAs"
  | "closeTab"
  | "nextTab"
  | "previousTab";

/**
 * ⌘N new, ⌘O open file, ⇧⌘O open folder, ⌘S save, ⇧⌘S save as, ⌘W close tab,
 * ⇧⌘] / ⇧⌘[ next and previous tab. Control or Option held means it's not ours.
 */
export function shortcutToFileCommand(press: KeyPress): FileCommand | null {
  if (!press.metaKey || press.ctrlKey || press.altKey) return null;
  const key = press.key.toLowerCase();
  if (press.shiftKey) {
    if (key === "o") return "openFolder";
    if (key === "s") return "saveAs";
    // With Shift held, the bracket keys report braces.
    if (key === "]" || key === "}") return "nextTab";
    if (key === "[" || key === "{") return "previousTab";
    return null;
  }
  if (key === "n") return "newFile";
  if (key === "o") return "openFile";
  if (key === "s") return "save";
  if (key === "w") return "closeTab";
  return null;
}
