import { invoke } from "@tauri-apps/api/core";
import type { Builder, BuildOutcome } from "../../domain/build";

/** The builder over the `build_latex` command in src-tauri/src/latex.rs. */
export const tauriBuilder: Builder = {
  async build(main) {
    try {
      return await invoke<BuildOutcome>("build_latex", { main });
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  },
};
