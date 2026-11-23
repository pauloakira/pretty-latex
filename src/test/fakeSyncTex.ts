import { vi } from "vitest";
import type { PdfSpot, SourceSpot, SyncTex } from "../domain/synctex";

/** Scripted SyncTeX: answers forward with `state.spot` and inverse with `state.source`. */
export function fakeSyncTex() {
  const state = {
    spot: { page: 2, x: 72, y: 100, width: 300, height: 12 } as PdfSpot | null,
    source: null as SourceSpot | null,
  };
  const syncTex = {
    forward: vi.fn(async (_pdf: string, _file: string, _line: number) => state.spot),
    inverse: vi.fn(async (_pdf: string, _page: number, _x: number, _y: number) => state.source),
  } satisfies SyncTex;
  return { syncTex, state };
}
