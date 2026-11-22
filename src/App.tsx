import { useEffect, useReducer, useState } from "react";
import { initialLayout, layoutReducer, shortcutToLayoutAction } from "./application/layout";
import { SAMPLE_DOCUMENT } from "./application/sampleDocument";
import type { BuildStatus } from "./domain/build";
import type { Tab } from "./domain/tabs";
import { Editor } from "./presentation/editor/Editor";
import { StatusLine } from "./presentation/shell/StatusLine";
import { TitleBar } from "./presentation/shell/TitleBar";
import { Workspace } from "./presentation/shell/Workspace";

// Nothing builds yet; this becomes real state with the latexmk card.
const IDLE: BuildStatus = { kind: "idle" };
// Until files can be opened, the editor holds one unsaved scratch buffer.
const SCRATCH_ID = "scratch";

/** The glass window shell (design B1): title bar, panes, status line. */
export default function App() {
  const [layout, dispatch] = useReducer(layoutReducer, initialLayout);
  const [scratchDirty, setScratchDirty] = useState(false);
  const tabs: Tab[] = [{ id: SCRATCH_ID, title: "scratch.tex", dirty: scratchDirty }];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = shortcutToLayoutAction(event);
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="window">
      <TitleBar
        tabs={tabs}
        activeTabId={SCRATCH_ID}
        build={IDLE}
        treeOpen={layout.treeOpen}
        pdfOpen={layout.pdfOpen}
        onToggleTree={() => dispatch({ type: "toggleTree" })}
        onTogglePdf={() => dispatch({ type: "togglePdf" })}
      />
      <Workspace
        treeOpen={layout.treeOpen}
        pdfOpen={layout.pdfOpen}
        onHidePdf={() => dispatch({ type: "togglePdf" })}
        source={<Editor initialDoc={SAMPLE_DOCUMENT} onChange={() => setScratchDirty(true)} />}
      />
      <StatusLine pdfOpen={layout.pdfOpen} />
    </div>
  );
}
