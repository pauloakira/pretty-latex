import { redo, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type CursorStyle } from "./Editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Editor", () => {
  let container: HTMLDivElement;
  let root: Root;

  function mount(doc: string, props: { cursorStyle?: CursorStyle; onChange?: (doc: string) => void } = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Editor initialDoc={doc} {...props} />));
    const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement);
    if (!view) throw new Error("editor did not mount");
    return view;
  }

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the document with line numbers", () => {
    mount("\\section{A}\ntext\n");
    expect(container.querySelector(".cm-content")?.textContent).toContain("\\section{A}");
    const numbers = [...container.querySelectorAll(".cm-lineNumbers .cm-gutterElement")].map((el) => el.textContent);
    expect(numbers).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });

  it("highlights commands and math with their own classes", () => {
    mount("\\section{A} $x$");
    const spanFor = (text: string) =>
      [...container.querySelectorAll(".cm-line span")].find((span) => span.textContent === text);
    const command = spanFor("\\section");
    const math = spanFor("$x$");
    expect(command?.className).toBeTruthy();
    expect(math?.className).toBeTruthy();
    expect(command?.className).not.toBe(math?.className);
  });

  it("uses the block cursor by default and a bar on request", () => {
    mount("x");
    expect(container.querySelector(".cm-editor")?.classList.contains("cm-block-cursor")).toBe(true);
    act(() => root.unmount());
    container.remove();
    mount("x", { cursorStyle: "bar" });
    expect(container.querySelector(".cm-editor")?.classList.contains("cm-block-cursor")).toBe(false);
  });

  it("reports edits and supports undo and redo", () => {
    const onChange = vi.fn();
    const view = mount("abc", { onChange });
    act(() => view.dispatch({ changes: { from: 3, insert: "d" }, userEvent: "input.type" }));
    expect(onChange).toHaveBeenLastCalledWith("abcd");

    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe("abc");
    act(() => {
      redo(view);
    });
    expect(view.state.doc.toString()).toBe("abcd");
  });

  it("highlights the active line", () => {
    mount("one\ntwo");
    expect(container.querySelector(".cm-activeLine")).not.toBeNull();
  });
});
