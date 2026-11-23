/** One file or folder in the project tree, as the Rust `list_project` command returns it. */
export type ProjectEntry = {
  name: string;
  path: string;
  isDir: boolean;
  children: ProjectEntry[];
};

/** An open folder and the source files in it. */
export type Project = {
  root: string;
  entries: ProjectEntry[];
};

/** The last part of a path: `/a/b/main.tex` → `main.tex`. */
export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

/** `path` relative to `root` when it's inside it, else the path unchanged. */
export function relativeTo(root: string | null, path: string): string {
  if (!root) return path;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** What's restored on launch: the open folder and the saved files that were open. */
export type Session = {
  version: 1;
  project: string | null;
  tabs: string[];
  active: string | null;
};

/** Read a session from untrusted JSON (a file on disk); null when it isn't one. */
export function parseSession(raw: unknown): Session | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.tabs)) return null;
  return {
    version: 1,
    project: typeof obj.project === "string" ? obj.project : null,
    tabs: obj.tabs.filter((tab): tab is string => typeof tab === "string"),
    active: typeof obj.active === "string" ? obj.active : null,
  };
}
