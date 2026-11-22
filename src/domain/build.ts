/**
 * State of the latest LaTeX build, shown in the title bar badge and status line. The build
 * card (latexmk) produces these; until then the app stays "idle".
 */
export type BuildStatus =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "ok"; seconds: number; warnings: number }
  | { kind: "failed"; errors: number };

export type BuildTone = "neutral" | "busy" | "ok" | "error";

export function buildLabel(status: BuildStatus): { text: string; tone: BuildTone } {
  switch (status.kind) {
    case "idle":
      return { text: "auto-build", tone: "neutral" };
    case "building":
      return { text: "building…", tone: "busy" };
    case "ok":
      return { text: `built ${status.seconds.toFixed(1)}s`, tone: "ok" };
    case "failed":
      return {
        text: `${status.errors} ${status.errors === 1 ? "error" : "errors"}`,
        tone: "error",
      };
  }
}
