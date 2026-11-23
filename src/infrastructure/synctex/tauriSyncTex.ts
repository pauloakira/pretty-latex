import { invoke } from "@tauri-apps/api/core";
import type { PdfSpot, SourceSpot, SyncTex } from "../../domain/synctex";

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** SyncTeX over the commands in src-tauri/src/synctex.rs. */
export const tauriSyncTex: SyncTex = {
  forward: (pdf, file, line) => call<PdfSpot | null>("synctex_forward", { pdf, file, line }),
  inverse: (pdf, page, x, y) => call<SourceSpot | null>("synctex_inverse", { pdf, page, x, y }),
};
