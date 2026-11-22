import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";

// Tell React this is a test environment so act() works without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App shell", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("makes the title bar a window drag region", () => {
    const titlebar = container.querySelector(".titlebar");
    expect(titlebar?.hasAttribute("data-tauri-drag-region")).toBe(true);
  });

  it("shows the empty state when no project is open", () => {
    expect(container.textContent).toContain("No project open");
  });

  it("has a status line", () => {
    expect(container.querySelector('[role="status"]')?.textContent).toContain("ready");
  });
});
