/** The open folder's git repository, as the side panel shows it. */
export type GitStatus = {
  root: string;
  /** Null on a detached HEAD. */
  branch: string | null;
  /** e.g. "origin/main"; null until the branch is first pushed. */
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  files: GitFile[];
};

/** M modified, A added, D deleted, R renamed, U conflict, ? new (untracked). */
export type GitFileStatus = "M" | "A" | "D" | "R" | "U" | "?";

export type GitFile = {
  /** Relative to the repository root. */
  path: string;
  status: GitFileStatus;
};

/** Port: git for the open folder. Failures reject with git's own message. */
export interface Git {
  /** The repository containing `path`, or null when it isn't in one. */
  status(path: string): Promise<GitStatus | null>;
  /** Commits exactly `paths`; resolves to the short hash. */
  commit(root: string, message: string, paths: string[]): Promise<string>;
  /** Pushes the current branch (setting its upstream the first time); resolves to e.g. "origin/main". */
  push(root: string): Promise<string>;
}

/** Words for a file's status letter, for tooltips and screen readers. */
export const statusWords: Record<GitFileStatus, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  U: "conflict",
  "?": "new",
};

/** Repository-relative paths of the open files with unsaved changes. */
export function unsavedInRepo(root: string, dirtyPaths: Iterable<string>): string[] {
  const prefix = `${root}/`;
  return [...dirtyPaths].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
}

/** "↑2 ↓1" (only the parts that aren't zero), or "" when in sync. */
export function aheadBehind(status: Pick<GitStatus, "ahead" | "behind">): string {
  return [status.ahead ? `↑${status.ahead}` : "", status.behind ? `↓${status.behind}` : ""].filter(Boolean).join(" ");
}
