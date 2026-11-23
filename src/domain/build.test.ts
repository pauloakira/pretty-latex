import { describe as group, expect, it } from "vitest";
import { buildLabel, describe, mainFileFor, statusAfter } from "./build";
import type { Project } from "./project";

const project: Project = {
  root: "/p",
  entries: [
    { name: "chapters", path: "/p/chapters", isDir: true, children: [] },
    { name: "main.tex", path: "/p/main.tex", isDir: false, children: [] },
  ],
};

group("mainFileFor", () => {
  it("follows a TeX root comment", () => {
    expect(mainFileFor("/p/chapters/intro.tex", "% !TEX root = ../main.tex\n\\section{A}", null)).toBe("/p/main.tex");
  });

  it("builds a file with a documentclass itself", () => {
    expect(mainFileFor("/p/notes.tex", "\\documentclass{article}", project)).toBe("/p/notes.tex");
  });

  it("builds the project's main.tex after saving a chapter or the bibliography", () => {
    expect(mainFileFor("/p/chapters/intro.tex", "\\section{A}", project)).toBe("/p/main.tex");
    expect(mainFileFor("/p/refs.bib", "@book{x}", project)).toBe("/p/main.tex");
  });

  it("builds a lone .tex file, and nothing for other files outside a project", () => {
    expect(mainFileFor("/a/x.tex", "hello", null)).toBe("/a/x.tex");
    expect(mainFileFor("/a/notes.md", "# hi", null)).toBeNull();
  });
});

group("build status", () => {
  it("counts errors, or calls a failure without parsed errors one error", () => {
    const error = { file: "/p/main.tex", line: 3, severity: "error" as const, message: "Boom." };
    expect(statusAfter({ kind: "done", ok: false, seconds: 1, pdf: null, diagnostics: [error, error] })).toEqual({
      kind: "failed",
      errors: 2,
    });
    expect(statusAfter({ kind: "done", ok: false, seconds: 1, pdf: null, diagnostics: [] })).toEqual({
      kind: "failed",
      errors: 1,
    });
  });

  it("labels a missing TeX install", () => {
    expect(buildLabel({ kind: "unavailable", message: "TeX not found" })).toEqual({ text: "no TeX", tone: "error" });
  });

  it("describes a diagnostic relative to the project", () => {
    expect(describe({ file: "/p/chapters/intro.tex", line: 7, severity: "error", message: "Undefined control sequence." }, "/p")).toBe(
      "chapters/intro.tex:7 Undefined control sequence.",
    );
  });
});
