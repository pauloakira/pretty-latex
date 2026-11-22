import { StringStream } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { startState, tokenize, type LatexState, type LatexToken } from "./latexLanguage";

type Piece = [text: string, token: LatexToken | null];

/** Runs the tokenizer over lines, like CodeMirror does, merging same-token neighbours. */
function tokenizeLines(lines: string[], state: LatexState = startState()): Piece[][] {
  return lines.map((line) => {
    const pieces: Piece[] = [];
    const stream = new StringStream(line, 4, 2);
    while (!stream.eol()) {
      const token = tokenize(stream, state);
      const text = stream.current();
      if (text.length === 0) throw new Error(`tokenizer did not advance on ${JSON.stringify(line)}`);
      const last = pieces[pieces.length - 1];
      if (last && last[1] === token) last[0] += text;
      else pieces.push([text, token]);
      stream.start = stream.pos;
    }
    return pieces;
  });
}

const one = (line: string) => tokenizeLines([line])[0];

describe("LaTeX tokenizer", () => {
  it("colors a command and its arguments", () => {
    expect(one("\\section{Introduction}")).toEqual([
      ["\\section", "command"],
      ["{Introduction}", "argument"],
    ]);
  });

  it("treats [..] right after a command as an argument", () => {
    expect(one("\\documentclass[11pt]{article}")).toEqual([
      ["\\documentclass", "command"],
      ["[11pt]{article}", "argument"],
    ]);
  });

  it("leaves brackets in running text alone", () => {
    expect(one("see [1] here")).toEqual([["see [1] here", null]]);
  });

  it("colors environment names after \\begin and \\end", () => {
    expect(one("\\begin{itemize}")).toEqual([
      ["\\begin", "command"],
      ["{itemize}", "environment"],
    ]);
    expect(one("\\end {itemize}")).toEqual([
      ["\\end", "command"],
      [" ", null],
      ["{itemize}", "environment"],
    ]);
  });

  it("colors inline math, including commands inside it", () => {
    expect(one("where $A \\in \\mathbb{R}^{n}$ is sparse")).toEqual([
      ["where ", null],
      ["$A \\in \\mathbb{R}^{n}$", "math"],
      [" is sparse", null],
    ]);
  });

  it("handles $$…$$, \\(…\\) and \\[…\\]", () => {
    expect(one("$$x$$ and \\(y\\) and \\[z\\]")).toEqual([
      ["$$x$$", "math"],
      [" and ", null],
      ["\\(y\\)", "math"],
      [" and ", null],
      ["\\[z\\]", "math"],
    ]);
  });

  it("keeps an escaped dollar out of math", () => {
    expect(one("costs \\$5 total")).toEqual([
      ["costs ", null],
      ["\\$", "command"],
      ["5 total", null],
    ]);
  });

  it("colors the body of equation environments as math, across lines", () => {
    expect(tokenizeLines(["\\begin{equation}", "  \\|x_k\\|_A \\le 2", "\\end{equation}", "after"])).toEqual([
      [
        ["\\begin", "command"],
        ["{equation}", "environment"],
      ],
      [["  \\|x_k\\|_A \\le 2", "math"]],
      [
        ["\\end", "command"],
        ["{equation}", "environment"],
      ],
      [["after", null]],
    ]);
  });

  it("also treats starred math environments as math", () => {
    expect(tokenizeLines(["\\begin{align*}", "a &= b"])[1]).toEqual([["a &= b", "math"]]);
  });

  it("does not treat other environments as math", () => {
    expect(tokenizeLines(["\\begin{itemize}", "  plain"])[1]).toEqual([["  plain", null]]);
  });

  it("colors comments to the end of the line, but not an escaped percent", () => {
    expect(one("50\\% done % TODO: tighten")).toEqual([
      ["50", null],
      ["\\%", "command"],
      [" done ", null],
      ["% TODO: tighten", "comment"],
    ]);
  });

  it("carries an open argument group across lines", () => {
    expect(tokenizeLines(["\\caption{A long", "caption} text"])).toEqual([
      [
        ["\\caption", "command"],
        ["{A long", "argument"],
      ],
      [
        ["caption}", "argument"],
        [" text", null],
      ],
    ]);
  });

  it("keeps commands inside arguments blue", () => {
    expect(one("\\item Bounds for \\emph{any} ordering")).toEqual([
      ["\\item", "command"],
      [" Bounds for ", null],
      ["\\emph", "command"],
      ["{any}", "argument"],
      [" ordering", null],
    ]);
  });

  it("tokenizes a 5,000-line document quickly", () => {
    const block = [
      "\\section{Results}",
      "We study $Ax = b$ where $A \\in \\mathbb{R}^{n \\times n}$ is sparse. % note",
      "\\begin{equation}",
      "  \\|x_k - x^*\\|_A \\le 2\\left(\\frac{\\sqrt{\\kappa}-1}{\\sqrt{\\kappa}+1}\\right)^k",
      "\\end{equation}",
    ];
    const lines = Array.from({ length: 1000 }, () => block).flat();
    const started = performance.now();
    tokenizeLines(lines);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
