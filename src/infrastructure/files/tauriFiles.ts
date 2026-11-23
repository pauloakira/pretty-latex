import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import type { Files } from "../../domain/files";
import { parseSession, type ProjectEntry, type Session } from "../../domain/project";

const SOURCE_FILTERS = [
  { name: "LaTeX", extensions: ["tex", "ltx", "bib", "sty", "cls", "bst", "dtx", "ins"] },
  { name: "Text", extensions: ["txt", "md"] },
];

/** Tauri commands reject with a plain string; turn it into an Error. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** The file port over the Rust commands in src-tauri/src/files.rs and the dialog plugin. */
export const tauriFiles: Files = {
  async pickFile(defaultDir) {
    const picked = await open({ multiple: false, directory: false, defaultPath: defaultDir, filters: SOURCE_FILTERS });
    return typeof picked === "string" ? picked : null;
  },
  async pickFolder() {
    const picked = await open({ multiple: false, directory: true });
    return typeof picked === "string" ? picked : null;
  },
  async pickSavePath(defaultPath) {
    return (await save({ defaultPath, filters: SOURCE_FILTERS })) ?? null;
  },
  confirmDiscard(title) {
    return ask(`${title} has unsaved changes. Close it without saving?`, {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Don't Save",
      cancelLabel: "Cancel",
    });
  },

  readText: (path) => call<string>("read_text_file", { path }),
  // A raw IPC response: arrives as an ArrayBuffer, not JSON.
  readBytes: async (path) => new Uint8Array(await call<ArrayBuffer>("read_file_bytes", { path })),
  writeText: (path, text) => call<void>("write_text_file", { path, contents: text }),
  listProject: (root) => call<ProjectEntry[]>("list_project", { root }),

  async loadSession() {
    const raw = await call<string | null>("read_session");
    if (raw === null) return null;
    try {
      return parseSession(JSON.parse(raw));
    } catch {
      return null;
    }
  },
  saveSession: (session: Session) => call<void>("write_session", { contents: JSON.stringify(session) }),

  takePendingFiles: () => call<string[]>("take_pending_files"),
  onOpenRequest: (handler) => listen<string[]>("open-files", (event) => handler(event.payload)),
};
