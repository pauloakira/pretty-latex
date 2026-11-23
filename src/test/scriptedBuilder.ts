import { vi } from "vitest";
import type { Builder, BuildOutcome } from "../domain/build";

/** A `Builder` for tests: answers every build with `next` (or throws `error`). */
export function scriptedBuilder() {
  const state = {
    next: { kind: "done", ok: true, seconds: 1.2, pdf: null, diagnostics: [] } as BuildOutcome,
    error: null as Error | null,
  };
  const builder = {
    build: vi.fn(async (_main: string) => {
      if (state.error) throw state.error;
      return state.next;
    }),
  } satisfies Builder;
  return { builder, state };
}
