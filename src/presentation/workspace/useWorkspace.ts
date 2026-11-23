import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { activeDoc, documentsReducer, isDirty, noDocuments, type Documents } from "../../application/documents";
import { SAMPLE_DOCUMENT } from "../../application/sampleDocument";
import type { Files } from "../../domain/files";
import type { Project, Session } from "../../domain/project";

export type Notice = { text: string; tone: "info" | "error" };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Open documents, the open folder and the session, plus the file commands behind the
 * shortcuts. Restores the last project and tabs on mount, and saves the session whenever
 * the open files change. `onSaved` runs after every successful write (it starts a build).
 */
export function useWorkspace(files: Files, onSaved?: (path: string, text: string) => void) {
  const [documents, dispatch] = useReducer(documentsReducer, noDocuments);
  const [project, setProject] = useState<Project | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [restored, setRestored] = useState(false);

  // Async commands read the latest state through refs, not stale closures.
  const docsRef = useRef<Documents>(documents);
  docsRef.current = documents;
  const projectRef = useRef<Project | null>(project);
  projectRef.current = project;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // "saved …" is a passing note; errors stay until the next success.
  useEffect(() => {
    if (notice?.tone !== "info") return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const fail = useCallback((error: unknown) => setNotice({ text: message(error), tone: "error" }), []);

  const openPath = useCallback(
    async (path: string) => {
      try {
        dispatch({ type: "open", path, text: await files.readText(path) });
        setNotice(null);
      } catch (error) {
        fail(error);
      }
    },
    [files, fail],
  );

  const loadProject = useCallback(
    async (root: string) => {
      const entries = await files.listProject(root);
      setProject({ root, entries });
    },
    [files],
  );

  const refreshTree = useCallback(async () => {
    const current = projectRef.current;
    if (!current) return;
    try {
      await loadProject(current.root);
    } catch {
      // The folder went away; keep the last listing rather than an error.
    }
  }, [loadProject]);

  // Restore the last session, then pick up files the OS asked us to open.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      let session: Session | null = null;
      try {
        session = await files.loadSession();
      } catch {
        // An unreadable session is the same as none.
      }
      if (cancelled) return;
      if (session) {
        if (session.project) await loadProject(session.project).catch(() => undefined);
        for (const path of session.tabs) {
          try {
            const text = await files.readText(path);
            if (cancelled) return;
            dispatch({ type: "open", path, text });
          } catch {
            // Moved or deleted since last time: just don't reopen it.
          }
        }
        if (session.active) dispatch({ type: "activatePath", path: session.active });
      } else {
        // First launch: something to look at instead of an empty window.
        dispatch({ type: "new", text: SAMPLE_DOCUMENT });
      }
      const pending = await files.takePendingFiles().catch(() => []);
      for (const path of pending) await openPath(path);
      if (cancelled) return;
      setRestored(true);
      const stop = await files.onOpenRequest((paths) => paths.forEach((path) => void openPath(path)));
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [files, loadProject, openPath]);

  // Save the session when the open folder, the saved tabs or the active one change.
  const tabPaths = documents.docs.flatMap((doc) => (doc.path ? [doc.path] : []));
  const activePath = activeDoc(documents)?.path ?? null;
  const sessionKey = JSON.stringify([project?.root ?? null, tabPaths, activePath]);
  useEffect(() => {
    if (!restored) return;
    const [root, tabs, active] = JSON.parse(sessionKey) as [string | null, string[], string | null];
    files.saveSession({ version: 1, project: root, tabs, active }).catch(() => undefined);
  }, [files, restored, sessionKey]);

  const openFile = useCallback(async () => {
    const path = await files.pickFile(projectRef.current?.root).catch(fail);
    if (path) await openPath(path);
  }, [files, fail, openPath]);

  /** Resolves true when a folder was opened. */
  const openFolder = useCallback(async () => {
    const root = await files.pickFolder().catch(fail);
    if (!root) return false;
    try {
      await loadProject(root);
      setNotice(null);
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }, [files, fail, loadProject]);

  const write = useCallback(
    async (key: string, path: string) => {
      const doc = docsRef.current.docs.find((d) => d.key === key);
      if (!doc) return;
      const text = doc.text;
      try {
        await files.writeText(path, text);
        dispatch({ type: "saved", key, path, text });
        onSavedRef.current?.(path, text);
        setNotice({ text: `saved ${doc.path === path ? doc.title : path}`, tone: "info" });
        const root = projectRef.current?.root;
        if (root && path.startsWith(`${root}/`) && doc.path !== path) await refreshTree();
      } catch (error) {
        fail(error);
      }
    },
    [files, fail, refreshTree],
  );

  const saveAs = useCallback(async () => {
    const doc = activeDoc(docsRef.current);
    if (!doc) return;
    const dir = doc.path ? doc.path.slice(0, doc.path.lastIndexOf("/")) : projectRef.current?.root;
    const path = await files.pickSavePath(dir ? `${dir}/${doc.title}` : doc.title).catch(fail);
    if (path) await write(doc.key, path);
  }, [files, fail, write]);

  const save = useCallback(async () => {
    const doc = activeDoc(docsRef.current);
    if (!doc) return;
    if (doc.path) await write(doc.key, doc.path);
    else await saveAs();
  }, [saveAs, write]);

  const close = useCallback(
    async (key: string) => {
      const doc = docsRef.current.docs.find((d) => d.key === key);
      if (!doc) return;
      if (isDirty(doc) && !(await files.confirmDiscard(doc.title).catch(() => false))) return;
      dispatch({ type: "close", key });
    },
    [files],
  );

  const dirtyPaths = useMemo(
    () => new Set(documents.docs.flatMap((doc) => (doc.path && isDirty(doc) ? [doc.path] : []))),
    [documents.docs],
  );

  return {
    documents,
    active: activeDoc(documents),
    project,
    notice,
    /** True once the last session is back (and on first launch, right away). */
    restored,
    dirtyPaths,
    dispatch,
    openPath,
    openFile,
    openFolder,
    save,
    saveAs,
    close,
  };
}
