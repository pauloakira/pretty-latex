import { useEffect, useMemo, useReducer, useRef } from "react";
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
};

/** The glass window (design B): title bar with tabs, file tree, editor, PDF, status line. */
export default function App({ files = tauriFiles, builder = tauriBuilder }: Props) {
  const [layout, dispatchLayout] = useReducer(layoutReducer, initialLayout);
  const build = useBuild(builder);
  // Read at save time, so the latest open folder decides the main file.
  const projectRef = useRef<Workspace["project"]>(null);
  const workspace = useWorkspace(files, (path, text) => {
    const main = mainFileFor(path, text, projectRef.current);
    if (main) build.request(main);
  });
  const { documents, active, project, dispatch } = workspace;
  projectRef.current = project;

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
    }
  };
  // The listener is added once; it calls whatever `run` is current.
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
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
        onHidePdf={() => dispatchLayout({ type: "togglePdf" })}
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
        notice={noticeFor(workspace.notice, buildNotice)}
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
    </div>
  );
}
