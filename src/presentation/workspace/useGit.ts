import { useCallback, useEffect, useRef, useState } from "react";
import type { Git, GitStatus } from "../../domain/git";

export type GitResult = { text: string; tone: "info" | "error" };

/**
 * The open folder's repository: its status, refreshed when the folder changes, when the
 * window comes back into focus, and after saves, commits and pushes, plus commit and push.
 */
export function useGit(git: Git, folder: string | null) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState<"commit" | "push" | null>(null);
  const [result, setResult] = useState<GitResult | null>(null);
  const folderRef = useRef(folder);
  folderRef.current = folder;

  const refresh = useCallback(async () => {
    const asked = folderRef.current;
    if (!asked) {
      setStatus(null);
      return;
    }
    try {
      const next = await git.status(asked);
      if (folderRef.current === asked) setStatus(next);
    } catch {
      // git missing or broken: no panel rather than an error on every refresh.
      if (folderRef.current === asked) setStatus(null);
    }
  }, [git]);

  useEffect(() => {
    setResult(null);
    void refresh();
  }, [folder, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  /** Commits `paths` and, when `andPush`, pushes. Resolves true when the commit landed. */
  const commit = useCallback(
    async (message: string, paths: string[], andPush: boolean) => {
      const root = status?.root;
      if (!root) return false;
      setBusy("commit");
      setResult(null);
      try {
        const hash = await git.commit(root, message, paths);
        const files = `${paths.length} ${paths.length === 1 ? "file" : "files"}`;
        if (!andPush) {
          setResult({ text: `committed ${files} · ${hash}`, tone: "info" });
          return true;
        }
        setBusy("push");
        try {
          const where = await git.push(root);
          setResult({ text: `committed ${files} · ${hash} · pushed to ${where}`, tone: "info" });
        } catch (error) {
          setResult({ text: `committed ${hash}, but push failed: ${messageOf(error)}`, tone: "error" });
        }
        return true;
      } catch (error) {
        setResult({ text: messageOf(error), tone: "error" });
        return false;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [git, status?.root, refresh],
  );

  const push = useCallback(async () => {
    const root = status?.root;
    if (!root) return;
    setBusy("push");
    setResult(null);
    try {
      setResult({ text: `pushed to ${await git.push(root)}`, tone: "info" });
    } catch (error) {
      setResult({ text: messageOf(error), tone: "error" });
    } finally {
      setBusy(null);
      await refresh();
    }
  }, [git, status?.root, refresh]);

  return { status, busy, result, refresh, commit, push };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
