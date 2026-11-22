import type { BuildStatus } from "../../domain/build";
import { buildLabel } from "../../domain/build";
import type { Tab } from "../../domain/tabs";
import { SidebarIcon, SplitIcon } from "./icons";

type Props = {
  tabs: Tab[];
  activeTabId: string | null;
  build: BuildStatus;
  treeOpen: boolean;
  pdfOpen: boolean;
  onToggleTree: () => void;
  onTogglePdf: () => void;
};

/**
 * Title bar from design B1. The bar and its empty spaces drag the window; buttons and
 * tabs don't carry the drag attribute, so clicks on them stay clicks. macOS draws the
 * traffic lights over the left padding.
 */
export function TitleBar({ tabs, activeTabId, build, treeOpen, pdfOpen, onToggleTree, onTogglePdf }: Props) {
  const badge = buildLabel(build);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <button
        type="button"
        className="icon-button"
        aria-label={treeOpen ? "Hide file tree" : "Show file tree"}
        aria-pressed={treeOpen}
        title="File tree (⌘B)"
        onClick={onToggleTree}
      >
        <SidebarIcon />
      </button>

      <nav className="tabs" aria-label="Open files" data-tauri-drag-region>
        {tabs.map((tab) => (
          <span
            key={tab.id}
            className={tab.id === activeTabId ? "tab tab-active" : "tab"}
            aria-current={tab.id === activeTabId ? "page" : undefined}
          >
            {tab.title}
            {tab.dirty && <span className="tab-dirty" aria-label="unsaved" />}
          </span>
        ))}
      </nav>

      <span className={`build-badge build-${badge.tone}`} role="status" aria-label="Build status">
        ● {badge.text}
      </span>

      <button
        type="button"
        className="icon-button"
        aria-label={pdfOpen ? "Hide PDF" : "Show PDF"}
        aria-pressed={pdfOpen}
        title="PDF (⌘\)"
        onClick={onTogglePdf}
      >
        <SplitIcon />
      </button>
    </header>
  );
}
