import { relativeTo, type Project, type ProjectEntry } from "./project";

/** One error or warning from a build log, on a file and a 1-based line (0: no line). */
export type Diagnostic = {
  file: string;
  line: number;
  severity: "error" | "warning";
  message: string;
};

/** What a build finished with. A build a newer one replaced comes back "cancelled". */
export type BuildOutcome =
  | { kind: "done"; ok: boolean; seconds: number; pdf: string | null; diagnostics: Diagnostic[] }
  | { kind: "cancelled" };

/** Runs latexmk on a main .tex file. Rejects when TeX is missing or can't start. */
export interface Builder {
  build(main: string): Promise<BuildOutcome>;
}

/**
 * State of the latest LaTeX build, shown in the title bar badge and status line.
 */
export type BuildStatus =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "ok"; seconds: number; warnings: number }
  | { kind: "failed"; errors: number }
  /** TeX isn't installed, or latexmk couldn't start. */
  | { kind: "unavailable"; message: string };

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
    case "unavailable":
      return { text: "no TeX", tone: "error" };
  }
}

/** The status a finished build leaves behind. */
export function statusAfter(outcome: Extract<BuildOutcome, { kind: "done" }>): BuildStatus {
  const errors = outcome.diagnostics.filter((d) => d.severity === "error").length;
  if (!outcome.ok) return { kind: "failed", errors: Math.max(errors, 1) };
  return { kind: "ok", seconds: outcome.seconds, warnings: outcome.diagnostics.length - errors };
}

/** "chapters/intro.tex:7 Undefined control sequence." for the status line. */
export function describe(diagnostic: Diagnostic, root: string | null): string {
  const where = relativeTo(root, diagnostic.file) + (diagnostic.line > 0 ? `:${diagnostic.line}` : "");
  return `${where} ${diagnostic.message}`;
}

const dirname = (path: string) => path.slice(0, path.lastIndexOf("/"));

/** Resolves `../main.tex` against a folder, collapsing `.` and `..`. */
function resolve(dir: string, relative: string): string {
  if (relative.startsWith("/")) return relative;
  const parts = dir.split("/");
  for (const part of relative.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

/**
 * Which file to build after saving `path`:
 * 1. a `% !TEX root = …` line at the top names it;
 * 2. a file with `\documentclass` builds itself;
 * 3. otherwise (a chapter, a .bib) the project's main.tex, if it has one;
 * 4. otherwise a .tex file builds itself, and anything else builds nothing.
 */
export function mainFileFor(path: string, text: string, project: Project | null): string | null {
  for (const line of text.split("\n").slice(0, 20)) {
    const match = /^\s*%\s*!TEX\s+root\s*=\s*(.+?)\s*$/i.exec(line);
    if (match) return resolve(dirname(path), match[1]);
  }
  const isTex = path.toLowerCase().endsWith(".tex");
  if (isTex && /\\documentclass\b/.test(text)) return path;
  const main = project ? project.entries.find((e: ProjectEntry) => !e.isDir && e.name === "main.tex") : undefined;
  if (main) return main.path;
  return isTex ? path : null;
}
