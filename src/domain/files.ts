import type { ProjectEntry, Session } from "./project";

/** The answer to "these files have unsaved changes": save them, throw them away, or stop. */
export type UnsavedAnswer = "save" | "discard" | "cancel";

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

  /** Opens another window, empty or on `folder`. */
  openWindow(folder: string | null): Promise<void>;
  /** Tells the app this window's open folder (its title, where Finder opens go). */
  setWindowProject(root: string | null): Promise<void>;
  /** Brings forward another window that has `root` open; false when none does. */
  focusProjectWindow(root: string): Promise<boolean>;
  /** Save / Don't Save / Cancel for the unsaved files `titles`, before closing or quitting. */
  askUnsaved(titles: string[], quitting: boolean): Promise<UnsavedAnswer>;
  /** Asks this window to close; the close-requested handler runs first. */
  closeWindow(): Promise<void>;
  /**
   * Runs `handler` whenever this window is about to close (red button, ⇧⌘W, Window menu).
   * It resolves true to let it close. Resolves to an unsubscribe function.
   */
  onCloseRequested(handler: () => Promise<boolean>): Promise<() => void>;
  /** The app is quitting (⌘Q) and wants this window to deal with its unsaved files. */
  onQuitRequested(handler: () => void): Promise<() => void>;
  /** This window is ready for the quit: the app asks the next window, or quits. */
  continueQuit(): Promise<void>;
  /** How many files in this window have unsaved changes, so ⌘Q knows whom to ask. */
  setUnsavedCount(count: number): Promise<void>;
}
