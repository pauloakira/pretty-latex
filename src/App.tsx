import { useEffect, useMemo, useReducer, useRef } from "react";
import { shortcutToFileCommand, type FileCommand } from "./application/fileShortcuts";
import { initialLayout, layoutReducer, shortcutToLayoutAction } from "./application/layout";
import { isDirty } from "./application/documents";
import type { BuildStatus } from "./domain/build";
import type { Files } from "./domain/files";
import { relativeTo } from "./domain/project";
import type { Tab } from "./domain/tabs";
import { tauriFiles } from "./infrastructure/files/tauriFiles";
import { Editor } from "./presentation/editor/Editor";
import { FileTree } from "./presentation/shell/FileTree";
import { StatusLine } from "./presentation/shell/StatusLine";
import { TitleBar } from "./presentation/shell/TitleBar";
import { Workspace } from "./presentation/shell/Workspace";
import { useWorkspace } from "./presentation/workspace/useWorkspace";

// Nothing builds yet; this becomes real state with the latexmk card.
const IDLE: BuildStatus = { kind: "idle" };

type Props = {
  /** The file system and dialogs; tests pass an in-memory one. */
  files?: Files;
};

/** The glass window (design B): title bar with tabs, file tree, editor, PDF, status line. */
export default function App({ files = tauriFiles }: Props) {
  const [layout, dispatchLayout] = useReducer(layoutReducer, initialLayout);
  const workspace = useWorkspace(files);
  const { documents, active, project, dispatch } = workspace;

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
        build={IDLE}
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
        notice={workspace.notice}
      />
    </div>
  );
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
