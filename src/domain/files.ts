import type { ProjectEntry, Session } from "./project";

/**
 * Port: everything the app needs from the file system and native dialogs. The Tauri
 * adapter lives in infrastructure/files; tests use an in-memory one. Failures reject with
 * an Error whose message is fit to show the user.
 */
export interface Files {
  /** Native open dialog for a source file; null when cancelled. */
  pickFile(defaultDir?: string): Promise<string | null>;
  /** Native open dialog for a folder; null when cancelled. */
  pickFolder(): Promise<string | null>;
  /** Native save dialog, starting at `defaultPath`; null when cancelled. */
  pickSavePath(defaultPath: string): Promise<string | null>;
  /** Ask before throwing away unsaved changes to `title`. True means discard. */
  confirmDiscard(title: string): Promise<boolean>;

  readText(path: string): Promise<string>;
  /** Raw bytes, for the built PDF. */
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, text: string): Promise<void>;
  listProject(root: string): Promise<ProjectEntry[]>;

  loadSession(): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;

  /** Files the OS asked to open (double-clicked `.tex`) before the app was listening. */
  takePendingFiles(): Promise<string[]>;
  /** Subscribe to later open requests from the OS. Resolves to an unsubscribe function. */
  onOpenRequest(handler: (paths: string[]) => void): Promise<() => void>;
}
