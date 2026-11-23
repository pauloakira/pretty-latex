import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { lazyPdfJs } from "./infrastructure/pdf/lazyPdfJs";
import { tauriGit } from "./infrastructure/git/tauriGit";
import { tauriSyncTex } from "./infrastructure/synctex/tauriSyncTex";
import type { PdfSpot, SyncTex } from "./domain/synctex";
import { unsavedInRepo, type Git } from "./domain/git";
import { GitPanel } from "./presentation/shell/GitPanel";
import { useGit } from "./presentation/workspace/useGit";
import type { PdfDisplayFactory } from "./presentation/pdf/PdfDisplay";
import { PdfPane } from "./presentation/pdf/PdfPane";
import { shortcutToFileCommand, type FileCommand } from "./application/fileShortcuts";
import { initialLayout, layoutReducer, shortcutToLayoutAction } from "./application/layout";
import { isDirty } from "./application/documents";
import { describe, mainFileFor, type Builder } from "./domain/build";
import type { Files } from "./domain/files";
import { relativeTo } from "./domain/project";
import type { Tab } from "./domain/tabs";
import { tauriBuilder } from "./infrastructure/build/tauriBuilder";
import { tauriFiles } from "./infrastructure/files/tauriFiles";
import { Editor } from "./presentation/editor/Editor";
import { FileTree } from "./presentation/shell/FileTree";
import { StatusLine } from "./presentation/shell/StatusLine";
import { TitleBar } from "./presentation/shell/TitleBar";
import { Workspace } from "./presentation/shell/Workspace";
import { useBuild } from "./presentation/workspace/useBuild";
import { useWorkspace } from "./presentation/workspace/useWorkspace";

type Props = {
  /** The file system and dialogs; tests pass an in-memory one. */
  files?: Files;
  /** Runs latexmk; tests pass a scripted one. */
  builder?: Builder;
  /** Draws the PDF; tests pass a fake (jsdom can't run pdf.js). */
  createPdfDisplay?: PdfDisplayFactory;
  /** Commit and push; tests pass a scripted one. */
  git?: Git;
  /** Jumps between source and PDF; tests pass a scripted one. */
  syncTex?: SyncTex;
};

/** The glass window (design B): title bar with tabs, file tree, editor, PDF, status line. */
export default function App({
  files = tauriFiles,
  builder = tauriBuilder,
  createPdfDisplay = lazyPdfJs,
  git = tauriGit,
  syncTex = tauriSyncTex,
}: Props) {
  const [layout, dispatchLayout] = useReducer(layoutReducer, initialLayout);
  const build = useBuild(builder);
  // Read at save time, so the latest open folder decides the main file.
  const projectRef = useRef<Workspace["project"]>(null);
  const gitRefresh = useRef<() => Promise<void>>(async () => undefined);
  const workspace = useWorkspace(files, (path, text) => {
    const main = mainFileFor(path, text, projectRef.current);
    if (main) build.request(main);
    void gitRefresh.current();
  });
  const { documents, active, project, dispatch } = workspace;
  projectRef.current = project;

  // The repository is the open folder's, or with no folder open, the active file's.
  const gitFolder = project?.root ?? (active?.path ? active.path.slice(0, active.path.lastIndexOf("/")) : null);
  const repo = useGit(git, gitFolder);
  gitRefresh.current = repo.refresh;
  const showingGit = layout.treeOpen && layout.sidePanel === "git";
  // ── SyncTeX ────────────────────────────────────────────────────────────────────
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const [pdfReveal, setPdfReveal] = useState<{ spot: PdfSpot; nonce: number } | null>(null);
  const [sourceReveal, setSourceReveal] = useState<{ path: string; line: number; nonce: number } | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const nonce = useRef(0);
  useEffect(() => {
    if (!syncNote) return;
    const timer = setTimeout(() => setSyncNote(null), 2500);
    return () => clearTimeout(timer);
  }, [syncNote]);

  /** ⌘↵ in the editor: show where this line is in the PDF. */
  const syncToPdf = async (line: number) => {
    const path = active?.path;
    if (!build.pdf || !path) {
      setSyncNote(path ? "build first (⌘S) to jump to the PDF" : "save the file first to jump to the PDF");
      return;
    }
    try {
      const spot = await syncTex.forward(build.pdf, path, line);
      if (!spot) {
        setSyncNote(`line ${line} isn't in the PDF`);
        return;
      }
      if (!layout.pdfOpen) dispatchLayout({ type: "togglePdf" });
      setPdfReveal({ spot, nonce: ++nonce.current });
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : String(error));
    }
  };

  /** ⌘-click in the PDF: open the source line behind it. */
  const syncToSource = async (page: number, x: number, y: number) => {
    if (!build.pdf) return;
    try {
      const spot = await syncTex.inverse(build.pdf, page, x, y);
      if (!spot) {
        setSyncNote("no source line there");
        return;
      }
      dispatchLayout({ type: "leaveExpandedPdf" });
      await workspace.openPath(spot.file);
      setSourceReveal({ path: spot.file, line: spot.line, nonce: ++nonce.current });
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : String(error));
    }
  };
  // Only once the jumped-to file is the active tab, so the line lands in the right document.
  const editorReveal = sourceReveal && active?.path === sourceReveal.path ? sourceReveal : null;

  const { refresh: refreshGit } = repo;
  useEffect(() => {
    if (showingGit) void refreshGit();
  }, [showingGit, refreshGit]);

  // Build once the last session is back, so its PDF shows without a save first.
  const builtOnLaunch = useRef(false);
  useEffect(() => {
    if (!workspace.restored || builtOnLaunch.current) return;
    builtOnLaunch.current = true;
    if (!active?.path) return;
    const main = mainFileFor(active.path, active.text, project);
    if (main) build.request(main);
  }, [workspace.restored, active, project, build]);

  const activeDiagnostics = useMemo(
    () => (active?.path ? build.diagnostics.filter((d) => d.file === active.path) : []),
    [active?.path, build.diagnostics],
  );
  const firstError = build.diagnostics.find((d) => d.severity === "error");
  const buildNotice =
    build.status.kind === "unavailable"
      ? { text: build.status.message, tone: "error" as const }
      : build.status.kind === "failed" && firstError
        ? { text: describe(firstError, project?.root ?? null), tone: "error" as const }
        : null;

  const tabs: Tab[] = documents.docs.map((doc) => ({
    id: doc.key,
    title: doc.title,
    dirty: isDirty(doc),
    path: doc.path,
  }));
  const openKeys = useMemo(() => documents.docs.map((doc) => doc.key), [documents.docs]);

  const run = async (command: FileCommand) => {
    switch (command) {
      case "newFile":
        return dispatch({ type: "new" });
      case "openFile":
        return workspace.openFile();
      case "openFolder":
        if (await workspace.openFolder()) dispatchLayout({ type: "showTree" });
        return;
      case "save":
        return workspace.save();
      case "saveAs":
        return workspace.saveAs();
      case "closeTab":
        return active ? workspace.close(active.key) : undefined;
      case "nextTab":
        return dispatch({ type: "cycle", delta: 1 });
      case "previousTab":
        return dispatch({ type: "cycle", delta: -1 });
      case "newWindow":
        return files.openWindow(null).catch(() => undefined);
      case "closeWindow":
        return workspace.closeWindow();
    }
  };
  // The listener is added once; it calls whatever `run` is current.
  const runRef = useRef(run);
  runRef.current = run;

  // Expanded, the hidden editor mustn't keep the keyboard: the PDF takes it (arrows and
  // space scroll), and the editor gets it back on the way out.
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (layout.pdfExpanded === wasExpanded.current) return;
    wasExpanded.current = layout.pdfExpanded;
    const target = layout.pdfExpanded
      ? document.querySelector<HTMLElement>(".pdf-layer:not(.pdf-layer-loading)")
      : document.querySelector<HTMLElement>(".cm-content");
    if (target) target.focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [layout.pdfExpanded]);

  // Esc leaves the expanded PDF; the listener reads the layout through a ref.
  const expandedRef = useRef(layout.pdfExpanded);
  expandedRef.current = layout.pdfExpanded;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && expandedRef.current) {
        event.preventDefault();
        dispatchLayout({ type: "leaveExpandedPdf" });
        return;
      }
      const layoutAction = shortcutToLayoutAction(event);
      if (layoutAction) {
        event.preventDefault();
        dispatchLayout(layoutAction);
        return;
      }
      const command = shortcutToFileCommand(event);
      if (command) {
        // Also stops the webview's own ⌘W (close window) and ⌘N.
        event.preventDefault();
        void runRef.current(command);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="window">
      <TitleBar
        tabs={tabs}
        activeTabId={documents.activeKey}
        build={build.status}
        treeOpen={layout.treeOpen}
        pdfOpen={layout.pdfOpen}
        onToggleTree={() => dispatchLayout({ type: "toggleTree" })}
        onTogglePdf={() => dispatchLayout({ type: "togglePdf" })}
        onSelectTab={(key) => dispatch({ type: "activate", key })}
        onCloseTab={(key) => void workspace.close(key)}
      />
      <Workspace
        treeOpen={layout.treeOpen}
        pdfOpen={layout.pdfOpen}
        pdfExpanded={layout.pdfExpanded}
        sidePanel={layout.sidePanel}
        onShowPanel={(panel, toggle) => dispatchLayout({ type: "showPanel", panel, toggle })}
        gitChanges={repo.status?.files.length ?? 0}
        git={
          repo.status && (
            <GitPanel
              status={repo.status}
              unsaved={unsavedInRepo(repo.status.root, workspace.dirtyPaths)}
              busy={repo.busy}
              result={repo.result}
              onCommit={repo.commit}
              onPush={() => void repo.push()}
              onRefresh={() => void repo.refresh()}
            />
          )
        }
        pdf={
          <PdfPane
            path={build.pdf}
            version={build.pdfVersion}
            readBytes={files.readBytes}
            createDisplay={createPdfDisplay}
            onHide={() => dispatchLayout({ type: "togglePdf" })}
            expanded={layout.pdfExpanded}
            onToggleExpanded={() => dispatchLayout({ type: "toggleExpandPdf" })}
            onSyncClick={(page, x, y) => void syncToSource(page, x, y)}
            reveal={pdfReveal}
          />
        }
        tree={
          <FileTree
            project={project}
            activePath={active?.path ?? null}
            dirtyPaths={workspace.dirtyPaths}
            onOpen={(path) => void workspace.openPath(path)}
          />
        }
        source={
          active ? (
            <Editor
              docKey={active.key}
              text={active.text}
              openKeys={openKeys}
              diagnostics={activeDiagnostics}
              reveal={editorReveal}
              onSyncToPdf={(line) => void syncToPdf(line)}
              onCursorLine={setCursorLine}
              onChange={(key, text) => dispatch({ type: "edit", key, text })}
            />
          ) : (
            <EmptySource />
          )
        }
      />
      <StatusLine
        pdfOpen={layout.pdfOpen}
        location={active ? (active.path ? relativeTo(project?.root ?? null, active.path) : active.title) : null}
        notice={noticeFor(workspace.notice, syncNote ? { text: syncNote, tone: "info" } : buildNotice)}
        line={active ? cursorLine : null}
        canSync={!!build.pdf && !!active?.path}
      />
    </div>
  );
}

type Workspace = ReturnType<typeof useWorkspace>;
type Notice = Workspace["notice"];

/** A file error first, then a build problem, then a passing note like "saved main.tex". */
function noticeFor(file: Notice, build: Notice): Notice {
  if (file?.tone === "error") return file;
  return build ?? file;
}

/** What the middle column shows with no tabs open. */
function EmptySource() {
  return (
    <div className="source-empty">
      <p>
        <kbd>⌘O</kbd> open a file
      </p>
      <p>
        <kbd>⇧⌘O</kbd> open a folder
      </p>
      <p>
        <kbd>⌘N</kbd> new file
      </p>
      <p>
        <kbd>⇧⌘N</kbd> new window
      </p>
    </div>
  );
}
