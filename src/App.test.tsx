import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import type { Session } from "./domain/project";
import { memoryFiles } from "./test/memoryFiles";
import { scriptedBuilder } from "./test/scriptedBuilder";
import { fakePdfDisplay } from "./test/fakePdfDisplay";
import { fakeGit, repoStatus } from "./test/fakeGit";
import type { GitStatus } from "./domain/git";
import { BUILD_DEBOUNCE_MS } from "./presentation/workspace/useBuild";

// Tell React this is a test environment so act() works without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const q = <E extends Element = Element>(selector: string) => container.querySelector<E>(selector);
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

/** Wait out the build debounce, then let the build settle. */
const afterBuild = async () => {
  await act(() => new Promise((resolve) => setTimeout(resolve, BUILD_DEBOUNCE_MS + 20)));
  await settle();
};

let builds = scriptedBuilder();
let pdfs = fakePdfDisplay();
let repo = fakeGit();

async function mount(disk: Record<string, string> = {}, session: Session | null = null, gitStatus: GitStatus | null = null) {
  const fake = memoryFiles(disk, session);
  repo = fakeGit(gitStatus);
  builds = scriptedBuilder();
  pdfs = fakePdfDisplay();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<App files={fake.files} builder={builds.builder} createPdfDisplay={pdfs.create} git={repo.git} />));
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

describe("building", () => {
  const badge = () => q('[aria-label="Build status"]')?.textContent;
  const status = () => q(".statusline")?.textContent;
  const openMain = async (text = "\\documentclass{article}\n") => {
    const fake = await mount({ "/p/main.tex": text });
    fake.state.nextFile = "/p/main.tex";
    await press("o");
    return fake;
  };

  it("builds the file with ⌘S and shows how long it took", async () => {
    await openMain();
    await press("s");
    expect(badge()).toContain("building");
    await afterBuild();
    expect(builds.builder.build).toHaveBeenCalledWith("/p/main.tex");
    expect(badge()).toContain("built 1.2s");
  });

  it("makes one build of saves close together", async () => {
    await openMain();
    await press("s");
    await press("s");
    await afterBuild();
    expect(builds.builder.build).toHaveBeenCalledTimes(1);
  });

  it("shows errors in the badge, the status line and the gutter", async () => {
    await openMain("\\documentclass{article}\n\\begin{document}\n\\oops\n");
    builds.state.next = {
      kind: "done",
      ok: false,
      seconds: 0.4,
      pdf: null,
      diagnostics: [
        { file: "/p/main.tex", line: 3, severity: "error", message: "Undefined control sequence." },
        { file: "/p/other.tex", line: 1, severity: "warning", message: "Elsewhere" },
      ],
    };
    await press("s");
    await afterBuild();
    expect(badge()).toContain("1 error");
    expect(status()).toContain("main.tex:3 Undefined control sequence.");
    expect(container.querySelectorAll(".cm-lint-marker-error")).toHaveLength(1);
    expect(container.querySelectorAll(".cm-lint-marker-warning")).toHaveLength(0);
  });

  it("says so when TeX isn't installed", async () => {
    await openMain();
    builds.state.error = new Error("TeX not found: install MacTeX");
    await press("s");
    await afterBuild();
    expect(badge()).toContain("no TeX");
    expect(status()).toContain("TeX not found: install MacTeX");
  });

  it("builds the project's main.tex after saving a chapter", async () => {
    const fake = await mount({ "/p/main.tex": "\\documentclass{book}", "/p/ch1.tex": "\\chapter{One}" });
    fake.state.nextFolder = "/p";
    await press("o", { shiftKey: true });
    fake.state.nextFile = "/p/ch1.tex";
    await press("o");
    await press("s");
    await afterBuild();
    expect(builds.builder.build).toHaveBeenCalledWith("/p/main.tex");
  });
});

describe("PDF preview", () => {
  const pdfBar = () => q(".pdf-bar")?.textContent;
  const built = (pdf: string) => {
    builds.state.next = { kind: "done", ok: true, seconds: 0.9, pdf, diagnostics: [] };
  };

  it("shows the built PDF with its page count, and reloads it after the next build", async () => {
    const fake = await mount({ "/p/main.tex": "\\documentclass{article}", "/p/build/main.pdf": "%PDF-one" });
    fake.state.nextFile = "/p/main.tex";
    await press("o");
    expect(q(".pdf-pane")?.textContent).toContain("appears here after the first build");
    built("/p/build/main.pdf");
    await press("s");
    await afterBuild();
    await settle();
    expect(pdfs.state.shown).toEqual(["%PDF-one"]);
    expect(pdfBar()).toContain("main.pdf");
    expect(pdfBar()).toContain("p. 1 / 3");
    expect(pdfBar()).toContain("80%");

    fake.disk.set("/p/build/main.pdf", "%PDF-two");
    await press("s");
    await afterBuild();
    await settle();
    expect(pdfs.state.shown).toEqual(["%PDF-one", "%PDF-two"]);
  });

  it("zooms in and out in steps, and back to fit width", async () => {
    const fake = await mount({ "/p/main.tex": "\\documentclass{article}", "/p/build/main.pdf": "%PDF" });
    fake.state.nextFile = "/p/main.tex";
    await press("o");
    built("/p/build/main.pdf");
    await press("s");
    await afterBuild();
    await settle();
    act(() => button("Zoom in")?.click());
    await settle();
    expect(pdfBar()).toContain("90%");
    act(() => button("Zoom out")?.click());
    await settle();
    act(() => button("Fit width")?.click());
    await settle();
    expect(pdfs.state.zooms).toEqual([0.9, 0.75, "page-width"]);
    expect(button("Fit width")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("builds on launch when tabs come back, so the PDF shows without saving", async () => {
    await mount(
      { "/p/main.tex": "\\documentclass{article}" },
      { version: 1, project: null, tabs: ["/p/main.tex"], active: "/p/main.tex" },
    );
    await afterBuild();
    expect(builds.builder.build).toHaveBeenCalledWith("/p/main.tex");
  });

  it("has a draggable left edge", async () => {
    await mount();
    expect(q('[role="separator"][aria-label="Resize PDF"]')).not.toBeNull();
  });
});

describe("expanded PDF", () => {
  const expanded = () => q(".workspace")?.classList.contains("workspace-pdf-expanded");

  it("fills the window from the expand button or ⇧⌘\\, and Esc brings the editor back", async () => {
    await mount();
    act(() => button("Expand PDF")?.click());
    expect(expanded()).toBe(true);
    expect(q(".pdf-pane")?.textContent).toContain("Exit full screen");
    // The editor stays mounted (its undo history survives) and lets go of the keyboard.
    expect(q(".cm-editor")).not.toBeNull();
    expect(document.activeElement?.closest(".cm-editor")).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(expanded()).toBe(false);
    expect(document.activeElement?.closest(".cm-editor")).not.toBeNull();

    await press("|", { shiftKey: true });
    expect(expanded()).toBe(true);
    await press("|", { shiftKey: true });
    expect(expanded()).toBe(false);
  });

  it("leaves the expanded view when the PDF is hidden", async () => {
    await mount();
    act(() => button("Expand PDF")?.click());
    await press("\\");
    expect(expanded()).toBe(false);
    expect(q('[aria-label="PDF preview"]')).toBeNull();
  });
});

describe("git panel", () => {
  const changed = repoStatus({
    files: [
      { path: "main.tex", status: "M" },
      { path: "chapters/one.tex", status: "?" },
    ],
  });
  const openRepo = async (status: GitStatus | null = changed) => {
    const fake = await mount({ "/p/main.tex": "\\documentclass{article}" }, null, status);
    fake.state.nextFolder = "/p";
    await press("o", { shiftKey: true });
    return fake;
  };
  const message = () => q<HTMLTextAreaElement>('textarea[aria-label="Commit message"]');
  const typeMessage = (text: string) =>
    act(() => {
      const el = message()!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const buttonText = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);
  const result = () => q(".git-result")?.textContent;

  it("shows a git icon with the change count only for a repository", async () => {
    await openRepo(null);
    act(() => button("Hide file tree")?.click());
    expect(button("Git")).toBeNull();
    expect(q('[aria-label^="Git"]')).toBeNull();

    await openRepo();
    act(() => button("Hide file tree")?.click());
    expect(q('button[aria-label="Git, 2 changed"]')?.textContent).toContain("2");
  });

  it("opens from the rail or ⇧⌘G with the branch and changed files", async () => {
    await openRepo();
    act(() => button("Hide file tree")?.click());
    act(() => q<HTMLButtonElement>('button[aria-label="Git, 2 changed"]')?.click());
    await settle();
    expect(q('[aria-label="Git"]')).not.toBeNull();
    expect(q(".git-branch")?.textContent).toContain("main");
    const files = [...container.querySelectorAll(".git-file")].map((el) => el.textContent);
    expect(files).toEqual(["main.texM", "one.tex chaptersN"]);

    act(() => (container.querySelector('[role="tab"]') as HTMLButtonElement).click());
    expect(q('[aria-label="File tree"]')).not.toBeNull();
    await press("G", { shiftKey: true });
    expect(q('[aria-label="Git"]')).not.toBeNull();
  });

  it("commits the ticked files with the message, and pushes", async () => {
    await openRepo();
    await press("G", { shiftKey: true });
    expect(buttonText("Commit & Push")?.disabled).toBe(true);
    typeMessage("Draft chapter one");
    // Leave main.tex out.
    act(() => (container.querySelectorAll(".git-file input")[0] as HTMLInputElement).click());
    expect(q(".git-all")?.textContent).toContain("1 of 2");
    act(() => buttonText("Commit & Push")?.click());
    await settle();
    expect(repo.state.commits).toEqual([{ message: "Draft chapter one", paths: ["chapters/one.tex"] }]);
    expect(repo.state.pushes).toBe(1);
    expect(result()).toContain("committed 1 file · abc1234 · pushed to origin/main");
    expect(message()?.value).toBe("");
    expect([...container.querySelectorAll(".git-file")].map((el) => el.textContent)).toEqual(["main.texM"]);
  });

  it("says what went wrong, and keeps the message when the commit fails", async () => {
    await openRepo();
    await press("G", { shiftKey: true });
    repo.state.commitError = new Error("Please tell me who you are");
    typeMessage("Draft");
    act(() => buttonText("Commit")?.click());
    await settle();
    expect(q(".git-result.statusline-error")?.textContent).toContain("Please tell me who you are");
    expect(message()?.value).toBe("Draft");
  });

  it("keeps the commit when only the push fails", async () => {
    await openRepo();
    await press("G", { shiftKey: true });
    repo.state.pushError = new Error("Permission denied (publickey)");
    typeMessage("Draft");
    act(() => buttonText("Commit & Push")?.click());
    await settle();
    expect(repo.state.commits).toHaveLength(1);
    expect(result()).toContain("committed abc1234, but push failed: Permission denied (publickey)");
  });

  it("offers a push when commits are waiting, and only Commit without a remote", async () => {
    await openRepo(repoStatus({ ahead: 2 }));
    await press("G", { shiftKey: true });
    expect(q(".git-sync")?.textContent).toBe("↑2");
    act(() => buttonText("Push ↑2")?.click());
    await settle();
    expect(repo.state.pushes).toBe(1);

    await openRepo(repoStatus({ hasRemote: false, upstream: null, files: [{ path: "a.tex", status: "M" }] }));
    await press("G", { shiftKey: true });
    expect(buttonText("Commit & Push")).toBeUndefined();
    expect(q(".git-hint")?.textContent).toContain("No remote");
  });

  it("warns that unsaved changes won't be committed", async () => {
    const fake = await openRepo();
    fake.state.nextFile = "/p/main.tex";
    await press("o");
    await type("x");
    await press("G", { shiftKey: true });
    expect(q(".git-warning")?.textContent).toContain("main.tex has unsaved changes");
  });
});

describe("windows", () => {
  it("opens a new window with ⇧⌘N", async () => {
    const fake = await mount();
    await press("N", { shiftKey: true });
    expect(fake.files.openWindow).toHaveBeenCalledWith(null);
  });

  it("tells the app this window's folder, for its title and Finder opens", async () => {
    const fake = await mount({ "/p/main.tex": "x" });
    expect(fake.files.setWindowProject).toHaveBeenLastCalledWith(null);
    fake.state.nextFolder = "/p";
    await press("o", { shiftKey: true });
    expect(fake.files.setWindowProject).toHaveBeenLastCalledWith("/p");
  });

  it("goes to the window that already has a folder open instead of opening it twice", async () => {
    const fake = await mount({ "/p/main.tex": "x" });
    fake.state.otherWindowRoot = "/p";
    fake.state.nextFolder = "/p";
    await press("o", { shiftKey: true });
    expect(fake.files.focusProjectWindow).toHaveBeenCalledWith("/p");
    expect(fake.files.listProject).not.toHaveBeenCalled();
    expect(q('[aria-label="File tree"]')).toBeNull();
  });

  it("closes the window with ⇧⌘W, asking first when something is unsaved", async () => {
    const fake = await mount({ "/p/main.tex": "x" });
    await press("W", { shiftKey: true });
    // The first-launch sample is clean: no question.
    expect(fake.files.confirmCloseWindow).not.toHaveBeenCalled();
    expect(fake.files.closeWindow).toHaveBeenCalledTimes(1);

    await type("edit");
    fake.state.closeWindowAnswer = false;
    await press("W", { shiftKey: true });
    expect(fake.files.confirmCloseWindow).toHaveBeenCalledWith(1);
    expect(fake.files.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("starts a new window empty, without the first-launch sample", async () => {
    await mount({}, { version: 1, project: null, tabs: [], active: null });
    expect(tabTitles()).toEqual([]);
    expect(q(".source-empty")?.textContent).toContain("new window");
  });
});
