import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

// Tell React this is a test environment so act() works without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App shell", () => {
  let container: HTMLDivElement;
  let root: Root;

  const q = (selector: string) => container.querySelector(selector);
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const pressKey = (key: string) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true }));
    });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<App />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("makes the title bar a drag region but not its buttons", () => {
    expect(q(".titlebar")?.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(button("Show file tree")?.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(button("Hide PDF")?.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  it("opens with the tree collapsed to a rail and the PDF shown (design B1)", () => {
    expect(q('[aria-label="File tree (collapsed)"]')).not.toBeNull();
    expect(q('[aria-label="File tree"]')).toBeNull();
    expect(q('[aria-label="PDF preview"]')).not.toBeNull();
    expect(container.textContent).toContain("No project open");
  });

  it("shows the idle build badge", () => {
    expect(q('[aria-label="Build status"]')?.textContent).toContain("auto-build");
  });

  it("toggles the file tree with the button and with ⌘B", () => {
    act(() => button("Show file tree")?.click());
    expect(q('[aria-label="File tree"]')).not.toBeNull();
    expect(button("Hide file tree")?.getAttribute("aria-pressed")).toBe("true");

    pressKey("b");
    expect(q('[aria-label="File tree"]')).toBeNull();
    expect(q('[aria-label="File tree (collapsed)"]')).not.toBeNull();
  });

  it("hides the PDF three ways and says how to bring it back", () => {
    act(() => button("Hide PDF")?.click());
    expect(q('[aria-label="PDF preview"]')).toBeNull();
    expect(q(".statusline")?.textContent).toContain("⌘\\ show pdf");

    pressKey("\\");
    expect(q('[aria-label="PDF preview"]')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>(".pill-button")?.click());
    expect(q('[aria-label="PDF preview"]')).toBeNull();
  });
});
