import { useEffect, useReducer } from "react";
import { initialLayout, layoutReducer, shortcutToLayoutAction } from "./application/layout";
import type { BuildStatus } from "./domain/build";
import type { Tab } from "./domain/tabs";
import { StatusLine } from "./presentation/shell/StatusLine";
import { TitleBar } from "./presentation/shell/TitleBar";
import { Workspace } from "./presentation/shell/Workspace";

// Nothing opens files or builds yet; these become real state in later cards.
const NO_TABS: Tab[] = [];
const IDLE: BuildStatus = { kind: "idle" };

/** The glass window shell (design B1): title bar, panes, status line. */
export default function App() {
  const [layout, dispatch] = useReducer(layoutReducer, initialLayout);

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
        tabs={NO_TABS}
        activeTabId={null}
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
      />
      <StatusLine pdfOpen={layout.pdfOpen} />
    </div>
  );
}
