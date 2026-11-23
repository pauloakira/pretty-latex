import { useCallback, useEffect, useRef, useState } from "react";
import { statusAfter, type Builder, type BuildStatus, type Diagnostic } from "../../domain/build";

/** Saves this close together make one build (save all, or ⌘S pressed twice). */
export const BUILD_DEBOUNCE_MS = 250;

/**
 * The latest build: its status, its errors and warnings, and the PDF it made. `request`
 * builds a main file shortly after a save; a newer request replaces an older one, and the
 * Rust side stops the older latexmk.
 */
export function useBuild(builder: Builder) {
  const [status, setStatus] = useState<BuildStatus>({ kind: "idle" });
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [pdf, setPdf] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Only the latest request may update state; earlier ones finish into the void.
  const latest = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    async (main: string, id: number) => {
      try {
        const outcome = await builder.build(main);
        if (id !== latest.current || outcome.kind === "cancelled") return;
        setStatus(statusAfter(outcome));
        setDiagnostics(outcome.diagnostics);
        if (outcome.pdf) setPdf(outcome.pdf);
      } catch (error) {
        if (id !== latest.current) return;
        setStatus({ kind: "unavailable", message: error instanceof Error ? error.message : String(error) });
        setDiagnostics([]);
      }
    },
    [builder],
  );

  const request = useCallback(
    (main: string) => {
      const id = ++latest.current;
      clearTimeout(timer.current);
      setStatus({ kind: "building" });
      timer.current = setTimeout(() => void run(main, id), BUILD_DEBOUNCE_MS);
    },
    [run],
  );

  return { status, diagnostics, pdf, request };
}
