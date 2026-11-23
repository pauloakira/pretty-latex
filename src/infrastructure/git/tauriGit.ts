import { invoke } from "@tauri-apps/api/core";
import type { Git, GitStatus } from "../../domain/git";

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** The git port over the commands in src-tauri/src/git.rs. */
export const tauriGit: Git = {
  status: (path) => call<GitStatus | null>("git_status", { path }),
  commit: (root, message, paths) => call<string>("git_commit", { root, message, paths }),
  push: (root) => call<string>("git_push", { root }),
};
