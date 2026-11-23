import { vi } from "vitest";
import type { Files } from "../domain/files";
import type { ProjectEntry, Session } from "../domain/project";

/**
 * An in-memory `Files` for tests: a map of path → text, scripted dialog answers, and a
 * session slot. Every method is a vi.fn so tests can assert on calls.
 */
export function memoryFiles(initial: Record<string, string> = {}, session: Session | null = null) {
  const disk = new Map(Object.entries(initial));
  const state = {
    session,
    /** What the next dialogs answer. */
    nextFile: null as string | null,
    nextFolder: null as string | null,
    nextSavePath: null as string | null,
    discard: true,
    pending: [] as string[],
    openRequest: null as ((paths: string[]) => void) | null,
  };

  const listProject = (root: string): ProjectEntry[] => {
    const build = (dir: string): ProjectEntry[] => {
      const prefix = `${dir}/`;
      const names = new Set<string>();
      for (const path of disk.keys()) if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split("/")[0]);
      return [...names].sort().map((name) => {
        const path = prefix + name;
        const isDir = !disk.has(path);
        return { name, path, isDir, children: isDir ? build(path) : [] };
      });
    };
    return build(root);
  };

  const files = {
    pickFile: vi.fn(async () => state.nextFile),
    pickFolder: vi.fn(async () => state.nextFolder),
    pickSavePath: vi.fn(async (_defaultPath: string) => state.nextSavePath),
    confirmDiscard: vi.fn(async (_title: string) => state.discard),
    readText: vi.fn(async (path: string) => {
      const text = disk.get(path);
      if (text === undefined) throw new Error(`Couldn't read ${path}`);
      return text;
    }),
    readBytes: vi.fn(async (path: string) => {
      const text = disk.get(path);
      if (text === undefined) throw new Error(`Couldn't read ${path}`);
      return new TextEncoder().encode(text);
    }),
    writeText: vi.fn(async (path: string, text: string) => {
      disk.set(path, text);
    }),
    listProject: vi.fn(async (root: string) => listProject(root)),
    loadSession: vi.fn(async () => state.session),
    saveSession: vi.fn(async (next: Session) => {
      state.session = next;
    }),
    takePendingFiles: vi.fn(async () => state.pending.splice(0)),
    onOpenRequest: vi.fn(async (handler: (paths: string[]) => void) => {
      state.openRequest = handler;
      return () => {
        state.openRequest = null;
      };
    }),
  } satisfies Files;

  return { files, disk, state };
}
