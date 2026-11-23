import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import type { Session } from "./domain/project";
import { memoryFiles } from "./test/memoryFiles";

// Tell React this is a test environment so act() works without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const q = (selector: string) => container.querySelector(selector);
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const tabTitles = () => [...container.querySelectorAll(".tab-title")].map((el) => el.textContent);
const activeTab = () => q('.tab-title[aria-current="page"]')?.textContent;
const editorText = () => EditorView.findFromDOM(q(".cm-editor") as HTMLElement)?.state.doc.toString();
const type = (text: string) =>
  act(() => {
    const view = EditorView.findFromDOM(q(".cm-editor") as HTMLElement);
    view?.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  });

/** Let pending promises (file reads, dialogs) settle and React re-render. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

const press = async (key: string, mods: { shiftKey?: boolean } = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true, ...mods }));
  });
  await settle();
};

async function mount(disk: Record<string, string> = {}, session: Session | null = null) {
  const fake = memoryFiles(disk, session);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<App files={fake.files} />));
  await settle();
  return fake;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("App shell", () => {
  it("makes the title bar a drag region but not its buttons", async () => {
    await mount();
    expect(q(".titlebar")?.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(button("Show file tree")?.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(button("Hide PDF")?.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  it("opens with the tree collapsed to a rail and the PDF shown (design B1)", async () => {
    await mount();
    expect(q('[aria-label="File tree (collapsed)"]')).not.toBeNull();
    expect(q('[aria-label="File tree"]')).toBeNull();
    expect(q('[aria-label="PDF preview"]')).not.toBeNull();
    expect(q('[aria-label="Build status"]')?.textContent).toContain("auto-build");
  });

  it("toggles the file tree with the button and with ⌘B", async () => {
    await mount();
    act(() => button("Show file tree")?.click());
    expect(q('[aria-label="File tree"]')).not.toBeNull();
    expect(button("Hide file tree")?.getAttribute("aria-pressed")).toBe("true");
    await press("b");
    expect(q('[aria-label="File tree"]')).toBeNull();
  });

  it("hides the PDF three ways and says how to bring it back", async () => {
    await mount();
    act(() => button("Hide PDF")?.click());
    expect(q('[aria-label="PDF preview"]')).toBeNull();
    expect(q(".statusline")?.textContent).toContain("⌘\\ show pdf");
    await press("\\");
    expect(q('[aria-label="PDF preview"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>(".pill-button")?.click());
    expect(q('[aria-label="PDF preview"]')).toBeNull();
  });
});

describe("files and tabs", () => {
  it("shows the sample document as an untitled tab on first launch", async () => {
    await mount();
    expect(tabTitles()).toEqual(["untitled.tex"]);
    expect(editorText()).toContain("\\section{Introduction}");
  });

  it("opens a file with ⌘O and saves edits back with ⌘S", async () => {
    const { disk, state } = await mount({ "/p/main.tex": "\\section{A}" });
    state.nextFile = "/p/main.tex";
    await press("o");
    expect(activeTab()).toBe("main.tex");
    expect(editorText()).toBe("\\section{A}");

    type(" more");
    expect(q(".tab-dirty")).not.toBeNull();
    await press("s");
    expect(disk.get("/p/main.tex")).toBe("\\section{A} more");
    expect(q(".tab-dirty")).toBeNull();
    expect(q(".statusline")?.textContent).toContain("saved main.tex");
  });

  it("asks where to save a new file, then names the tab after it", async () => {
    const { disk, state, files } = await mount({});
    await press("n");
    expect(activeTab()).toBe("untitled-2.tex");
    type("hello");
    state.nextSavePath = "/p/notes.tex";
    await press("s");
    expect(files.pickSavePath).toHaveBeenCalledWith("untitled-2.tex");
    expect(disk.get("/p/notes.tex")).toBe("hello");
    expect(activeTab()).toBe("notes.tex");
  });

  it("opens a folder with ⇧⌘O into the tree, and opens files from it", async () => {
    const { state } = await mount({ "/thesis/main.tex": "main", "/thesis/ch/intro.tex": "intro" });
    state.nextFolder = "/thesis";
    await press("O", { shiftKey: true });

    expect(q('[aria-label="File tree"]')).not.toBeNull();
    expect(q(".tree-panel .pane-caption")?.textContent).toBe("THESIS");
    const rows = [...container.querySelectorAll<HTMLButtonElement>(".tree-row")];
    expect(rows.map((row) => row.textContent)).toEqual(["▾ch", "intro.tex", "main.tex"]);

    act(() => rows[1].click());
    await settle();
    expect(activeTab()).toBe("intro.tex");
    expect(q(".statusline")?.textContent).toContain("ch/intro.tex");

    type("!");
    expect(q(".tree-row-active .tab-dirty")).not.toBeNull();
  });

  it("closes a clean tab with ⌘W, and asks first when it has unsaved changes", async () => {
    const { state, files } = await mount({ "/a.tex": "a", "/b.tex": "b" });
    state.nextFile = "/a.tex";
    await press("o");
    state.nextFile = "/b.tex";
    await press("o");
    expect(tabTitles()).toEqual(["untitled.tex", "a.tex", "b.tex"]);

    type("!");
    state.discard = false;
    await press("w");
    expect(files.confirmDiscard).toHaveBeenCalledWith("b.tex");
    expect(tabTitles()).toContain("b.tex");

    state.discard = true;
    await press("w");
    expect(tabTitles()).toEqual(["untitled.tex", "a.tex"]);
    expect(activeTab()).toBe("a.tex");

    act(() => button("Close a.tex")?.click());
    await settle();
    expect(tabTitles()).toEqual(["untitled.tex"]);
  });

  it("switches tabs by clicking and with ⇧⌘[ / ⇧⌘], keeping each file's text", async () => {
    const { state } = await mount({ "/a.tex": "aaa" });
    state.nextFile = "/a.tex";
    await press("o");
    act(() => container.querySelectorAll<HTMLButtonElement>(".tab-title")[0].click());
    expect(editorText()).toContain("\\section{Introduction}");
    await press("}", { shiftKey: true });
    expect(editorText()).toBe("aaa");
    await press("{", { shiftKey: true });
    expect(activeTab()).toBe("untitled.tex");
  });

  it("shows hints when every tab is closed", async () => {
    await mount();
    await press("w");
    expect(tabTitles()).toEqual([]);
    expect(q(".source-empty")?.textContent).toContain("open a folder");
  });

  it("reopens the last folder and its saved tabs, skipping files that are gone", async () => {
    const session: Session = {
      version: 1,
      project: "/p",
      tabs: ["/p/a.tex", "/p/gone.tex", "/p/b.tex"],
      active: "/p/a.tex",
    };
    await mount({ "/p/a.tex": "a", "/p/b.tex": "b" }, session);
    expect(tabTitles()).toEqual(["a.tex", "b.tex"]);
    expect(activeTab()).toBe("a.tex");
    act(() => button("Show file tree")?.click());
    expect(q(".tree-panel .pane-caption")?.textContent).toBe("P");
  });

  it("remembers the open folder and saved tabs, but not unsaved new files", async () => {
    const { state } = await mount({ "/p/a.tex": "a" });
    state.nextFolder = "/p";
    await press("O", { shiftKey: true });
    state.nextFile = "/p/a.tex";
    await press("o");
    expect(state.session).toEqual({ version: 1, project: "/p", tabs: ["/p/a.tex"], active: "/p/a.tex" });
  });

  it("opens files the OS hands over (a double-clicked .tex)", async () => {
    const { state } = await mount({ "/x.tex": "x" });
    act(() => state.openRequest?.(["/x.tex"]));
    await settle();
    expect(activeTab()).toBe("x.tex");
  });

  it("shows an error in the status line when a file can't be read", async () => {
    const { state } = await mount();
    state.nextFile = "/missing.tex";
    await press("o");
    expect(q(".statusline-error")?.textContent).toContain("/missing.tex");
  });
});
