import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { aheadBehind, statusWords, type GitStatus } from "../../domain/git";
import type { GitResult } from "../workspace/useGit";

type Props = {
  status: GitStatus;
  /** Repository-relative paths of open files with unsaved changes. */
  unsaved: string[];
  busy: "commit" | "push" | null;
  result: GitResult | null;
  /** Resolves true when the commit landed (the message is then cleared). */
  onCommit: (message: string, paths: string[], andPush: boolean) => Promise<boolean>;
  onPush: () => void;
  onRefresh: () => void;
};

/**
 * Commit and push from the side panel: the branch and how it stands against its remote,
 * the changed files (all ticked; untick to leave one out), a message, and Commit or
 * Commit & Push. ⌘↵ commits and pushes (commits only, without a remote).
 */
export function GitPanel({ status, unsaved, busy, result, onCommit, onPush, onRefresh }: Props) {
  const [message, setMessage] = useState("");
  // Unticked paths; new changes start ticked.
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());

  // Forget unticks for files no longer changed.
  const paths = useMemo(() => status.files.map((f) => f.path), [status.files]);
  useEffect(() => {
    setLeft((current) => new Set([...current].filter((p) => paths.includes(p))));
  }, [paths]);

  const chosen = paths.filter((p) => !left.has(p));
  const canCommit = !busy && chosen.length > 0 && message.trim().length > 0;
  const sync = aheadBehind(status);

  const toggle = (path: string) =>
    setLeft((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  const toggleAll = () => setLeft(chosen.length === paths.length ? new Set(paths) : new Set());

  const commit = async (andPush: boolean) => {
    if (!canCommit) return;
    if (await onCommit(message.trim(), chosen, andPush)) setMessage("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault();
      void commit(status.hasRemote);
    }
  };

  return (
    <div className="git-panel">
      <div className="git-head">
        <span className="git-branch" title={status.upstream ? `tracks ${status.upstream}` : "not pushed yet"}>
          ⎇ {status.branch ?? "detached HEAD"}
        </span>
        {sync && (
          <span className="git-sync" aria-label="Ahead and behind">
            {sync}
          </span>
        )}
        <button type="button" className="icon-button git-refresh" aria-label="Refresh git status" onClick={onRefresh}>
          ↻
        </button>
      </div>

      {paths.length === 0 ? (
        <p className="pane-empty">Nothing to commit.</p>
      ) : (
        <>
          <label className="git-all">
            <input
              type="checkbox"
              checked={chosen.length === paths.length}
              ref={(el) => {
                if (el) el.indeterminate = chosen.length > 0 && chosen.length < paths.length;
              }}
              onChange={toggleAll}
            />
            <span>
              {chosen.length} of {paths.length} changed {paths.length === 1 ? "file" : "files"}
            </span>
          </label>
          <ul className="git-files" aria-label="Changed files">
            {status.files.map((file) => {
              const slash = file.path.lastIndexOf("/");
              return (
                <li key={file.path}>
                  <label className="git-file" title={`${file.path} (${statusWords[file.status]})`}>
                    <input type="checkbox" checked={!left.has(file.path)} onChange={() => toggle(file.path)} />
                    <span className="git-file-name">
                      {file.path.slice(slash + 1)}
                      {slash > 0 && <span className="git-file-dir"> {file.path.slice(0, slash)}</span>}
                    </span>
                    <span className={`git-letter git-letter-${statusWords[file.status]}`} aria-label={statusWords[file.status]}>
                      {file.status === "?" ? "N" : file.status}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {unsaved.length > 0 && (
        <p className="git-warning">
          {unsaved.length === 1 ? `${unsaved[0]} has` : `${unsaved.length} files have`} unsaved changes, which won't be in
          the commit. <kbd>⌘S</kbd> first.
        </p>
      )}

      {paths.length > 0 && (
        <>
          <textarea
            className="git-message"
            aria-label="Commit message"
            placeholder="Commit message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="git-actions">
            <button type="button" className="git-button" disabled={!canCommit} onClick={() => void commit(false)}>
              {busy === "commit" && !status.hasRemote ? "Committing…" : "Commit"}
            </button>
            {status.hasRemote && (
              <button
                type="button"
                className="git-button git-button-primary"
                disabled={!canCommit}
                onClick={() => void commit(true)}
                title="⌘↵"
              >
                {busy === "push" ? "Pushing…" : busy === "commit" ? "Committing…" : "Commit & Push"}
              </button>
            )}
          </div>
        </>
      )}

      {paths.length === 0 && status.hasRemote && status.branch && (status.ahead > 0 || !status.upstream) && (
        <div className="git-actions">
          <button type="button" className="git-button git-button-primary" disabled={!!busy} onClick={onPush}>
            {busy === "push" ? "Pushing…" : status.upstream ? `Push ↑${status.ahead}` : "Push branch"}
          </button>
        </div>
      )}

      {!status.hasRemote && <p className="git-hint">No remote yet: commits stay on this Mac.</p>}

      {result && (
        <p className={result.tone === "error" ? "git-result statusline-error" : "git-result"} role="status">
          {result.text}
        </p>
      )}
    </div>
  );
}
