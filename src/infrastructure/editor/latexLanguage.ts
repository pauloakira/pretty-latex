import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";
import { Tag, tags } from "@lezer/highlight";

/**
 * A small LaTeX tokenizer for CodeMirror. It only does what the editor colors need
 * (design B on the Pretty-Latex canvas):
 *
 * - `command`      \section, \begin, \\, \%          (blue)
 * - `environment`  the {name} after \begin / \end     (purple)
 * - `math`         $…$, $$…$$, \(…\), \[…\], and the body of equation-like environments (teal)
 * - `argument`     {…} groups and the [..] right after a command (yellow)
 * - `comment`      % to end of line                   (gray)
 *
 * Everything else is plain text. It works line by line, carrying open math and brace
 * depth across lines in its state, so long documents re-tokenize incrementally.
 */

export const latexTags = {
  command: Tag.define(),
  environment: Tag.define(),
  argument: Tag.define(),
  math: Tag.define(),
  comment: tags.comment,
};

export type LatexToken = keyof typeof latexTags;

/** Environments whose body is math, so it is colored like $…$. */
const MATH_ENVIRONMENTS = new Set(
  [
    "equation",
    "align",
    "gather",
    "multline",
    "eqnarray",
    "flalign",
    "alignat",
    "math",
    "displaymath",
  ].flatMap((name) => [name, `${name}*`]),
);

/** What closes the math we are in. */
type MathMode =
  | { close: "$" | "$$" | "\\)" | "\\]" }
  | { close: "end"; environment: string };

export type LatexState = {
  math: MathMode | null;
  /** Just saw \begin or \end: the next {…} is an environment name. */
  pendingEnvironment: "begin" | "end" | null;
  /** How many {…} argument groups we are inside. */
  braceDepth: number;
  /** The previous token was a command, so a following [..] is its optional argument. */
  afterCommand: boolean;
};

export function startState(): LatexState {
  return { math: null, pendingEnvironment: null, braceDepth: 0, afterCommand: false };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenInMath(stream: StringStream, state: LatexState, math: MathMode): LatexToken {
  if (math.close === "end") {
    const end = new RegExp(`^\\\\end(?=\\s*\\{${escapeRegExp(math.environment)}\\})`);
    if (stream.match(end)) {
      state.math = null;
      state.pendingEnvironment = "end";
      return "command";
    }
  } else if (stream.match(math.close)) {
    state.math = null;
    return "math";
  }
  if (stream.peek() === "%") {
    stream.skipToEnd();
    return "comment";
  }
  // A command or escape inside math (\frac, \$) stays math-colored.
  if (stream.match(/^\\(?:[a-zA-Z@]+|.)/)) return "math";
  if (!stream.match(/^[^\\$%]+/)) stream.next();
  return "math";
}

function tokenEnvironmentName(stream: StringStream, state: LatexState): LatexToken | null {
  const opened = state.pendingEnvironment;
  state.pendingEnvironment = null;
  const name = stream.match(/^\{([^}]*)\}/);
  if (!name || typeof name === "boolean") return null;
  if (opened === "begin" && MATH_ENVIRONMENTS.has(name[1].trim())) {
    state.math = { close: "end", environment: name[1].trim() };
  }
  return "environment";
}

function tokenInText(stream: StringStream, state: LatexState): LatexToken | null {
  const ch = stream.peek();

  if (ch === "%") {
    stream.skipToEnd();
    state.afterCommand = false;
    return "comment";
  }

  if (ch === "\\") {
    const environment = stream.match(/^\\(begin|end)(?![a-zA-Z@])/);
    if (environment && typeof environment !== "boolean") {
      state.pendingEnvironment = environment[1] as "begin" | "end";
      state.afterCommand = false;
      return "command";
    }
    if (stream.match("\\[")) {
      state.math = { close: "\\]" };
      return "math";
    }
    if (stream.match("\\(")) {
      state.math = { close: "\\)" };
      return "math";
    }
    stream.match(/^\\(?:[a-zA-Z@]+\*?|.)/);
    state.afterCommand = true;
    return "command";
  }

  if (ch === "$") {
    state.math = { close: stream.match("$$") ? "$$" : "$" };
    if (state.math.close === "$") stream.next();
    state.afterCommand = false;
    return "math";
  }

  if (ch === "{") {
    stream.next();
    state.braceDepth += 1;
    return "argument";
  }

  if (ch === "}") {
    stream.next();
    state.braceDepth = Math.max(0, state.braceDepth - 1);
    return "argument";
  }

  if (ch === "[" && state.afterCommand && stream.match(/^\[[^\]\n]*\]/)) {
    return "argument";
  }

  if (!stream.match(/^[^\\%${}[]+/)) stream.next();
  state.afterCommand = false;
  return state.braceDepth > 0 ? "argument" : null;
}

export function tokenize(stream: StringStream, state: LatexState): LatexToken | null {
  if (state.math) return tokenInMath(stream, state, state.math);
  if (state.pendingEnvironment) {
    if (stream.eatSpace()) return null;
    const environment = tokenEnvironmentName(stream, state);
    if (environment) return environment;
  }
  return tokenInText(stream, state);
}

const parser: StreamParser<LatexState> = {
  name: "latex",
  startState,
  copyState: (state) => ({ ...state }),
  token: tokenize,
  tokenTable: latexTags,
  languageData: { commentTokens: { line: "%" } },
};

export const latexLanguage = StreamLanguage.define(parser);
