import { useState } from "react";
import { basename, type Project, type ProjectEntry } from "../../domain/project";

type Props = {
  project: Project | null;
  activePath: string | null;
  dirtyPaths: ReadonlySet<string>;
  onOpen: (path: string) => void;
};

/** The open folder's source files (design B2). Folders start expanded; click to fold. */
export function FileTree({ project, activePath, dirtyPaths, onOpen }: Props) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());

  if (!project) {
    return (
      <>
        <p className="pane-caption">FILES</p>
        <p className="pane-empty">
          No folder open. <code>⇧⌘O</code> opens one.
        </p>
      </>
    );
  }

  const toggle = (path: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const renderEntries = (entries: ProjectEntry[], depth: number) => (
    <ul className="tree-list" role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? "Files" : undefined}>
      {entries.map((entry) => {
        const open = entry.isDir && !folded.has(entry.path);
        const dirty = dirtyPaths.has(entry.path);
        return (
          <li key={entry.path} role="treeitem" aria-expanded={entry.isDir ? open : undefined}>
            <button
              type="button"
              className={entry.path === activePath ? "tree-row tree-row-active" : "tree-row"}
              style={{ paddingLeft: 6 + depth * 14 }}
              title={entry.path}
              onClick={() => (entry.isDir ? toggle(entry.path) : onOpen(entry.path))}
            >
              <span className="tree-glyph" aria-hidden>
                {entry.isDir ? (open ? "▾" : "▸") : ""}
              </span>
              <span className="tree-name">{entry.name}</span>
              {dirty && <span className="tab-dirty" aria-label="unsaved" />}
            </button>
            {open && renderEntries(entry.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <p className="pane-caption" title={project.root}>
        {basename(project.root).toUpperCase()}
      </p>
      {project.entries.length === 0 ? (
        <p className="pane-empty">No .tex files in this folder.</p>
      ) : (
        renderEntries(project.entries, 0)
      )}
    </>
  );
}
