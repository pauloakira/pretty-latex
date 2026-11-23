import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { latexTags } from "./latexLanguage";

/** Syntax colors from the canvas tokens (syn-command, syn-env, …), defined in styles.css. */
const latexHighlight = HighlightStyle.define([
  { tag: latexTags.command, color: "var(--syn-command)" },
  { tag: latexTags.environment, color: "var(--syn-env)" },
  { tag: latexTags.argument, color: "var(--syn-brace)" },
  { tag: latexTags.math, color: "var(--syn-math)" },
  { tag: latexTags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
]);

/** Transparent editor so the glass shows through; monospace, faint gutter, accent caret. */
const glassTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--text)",
      fontSize: "14px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--mono)",
      lineHeight: "24px",
    },
    ".cm-content": {
      padding: "18px 0",
      caretColor: "var(--accent)",
    },
    ".cm-line": { padding: "0 24px 0 20px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--text-faint)",
      paddingLeft: "12px",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px", textAlign: "right" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
    // The line a ⌘-click in the PDF jumped to (design: "L14 (synced)").
    ".cm-synced-line, .cm-synced-line.cm-activeLine": {
      backgroundColor: "rgba(126, 224, 195, 0.12)",
      boxShadow: "inset 2px 0 0 rgba(126, 224, 195, 0.7)",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
      { backgroundColor: "rgba(126, 224, 195, 0.18)" },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(126, 224, 195, 0.16)",
      outline: "1px solid rgba(126, 224, 195, 0.35)",
    },
    ".cm-searchMatch": { backgroundColor: "rgba(242, 200, 121, 0.25)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(242, 200, 121, 0.5)" },

    // Find/replace panel (⌘F): a glass strip at the top of the editor.
    ".cm-panels": {
      backgroundColor: "rgba(20, 26, 45, 0.92)",
      color: "var(--text)",
      backdropFilter: "blur(12px)",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--hairline)" },
    ".cm-search": { fontFamily: "var(--mono)", fontSize: "12px", padding: "8px 12px" },
    ".cm-search label": { color: "var(--text-dim)" },
    ".cm-textfield": {
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      border: "1px solid var(--hairline)",
      borderRadius: "5px",
      color: "var(--text)",
      fontFamily: "var(--mono)",
      padding: "3px 8px",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      border: "1px solid var(--hairline)",
      borderRadius: "5px",
      color: "var(--text-dim)",
      fontFamily: "var(--mono)",
    },
    ".cm-panel.cm-search [name=close]": { color: "var(--text-dim)" },

    // Build errors and warnings (latexmk): a dot in the gutter, a wavy line, a glass tooltip.
    ".cm-gutter-lint": { width: "12px" },
    ".cm-gutter-lint .cm-gutterElement": { padding: "0" },
    ".cm-lint-marker": { width: "8px", height: "8px", borderRadius: "50%", marginTop: "8px", backgroundImage: "none" },
    ".cm-lint-marker-error": { backgroundColor: "var(--error)" },
    ".cm-lint-marker-warning": { backgroundColor: "var(--warn)" },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      textDecoration: "underline wavy var(--error)",
      textUnderlineOffset: "4px",
    },
    ".cm-lintRange-warning": {
      backgroundImage: "none",
      textDecoration: "underline wavy var(--warn)",
      textUnderlineOffset: "4px",
    },
    ".cm-tooltip": {
      backgroundColor: "rgba(20, 26, 45, 0.95)",
      border: "1px solid var(--hairline)",
      borderRadius: "6px",
      color: "var(--text)",
      fontFamily: "var(--mono)",
      fontSize: "12px",
    },
    ".cm-diagnostic": { padding: "4px 10px", borderLeftWidth: "3px" },
    ".cm-diagnostic-error": { borderLeftColor: "var(--error)" },
    ".cm-diagnostic-warning": { borderLeftColor: "var(--warn)" },
    ".cm-diagnosticSource": { color: "var(--text-faint)" },
  },
  { dark: true },
);

/**
 * Terminal-style block cursor: the caret becomes a translucent block over the character.
 * Turned on with the `cm-block-cursor` class on the editor (see Editor's cursorStyle).
 */
const blockCursorTheme = EditorView.theme({
  "&.cm-block-cursor .cm-cursor": {
    borderLeftWidth: "0.6em",
    marginLeft: "0",
    opacity: "0.55",
  },
});

export const editorTheme = [glassTheme, blockCursorTheme, syntaxHighlighting(latexHighlight)];
