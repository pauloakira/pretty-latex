import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";
import type { Diagnostic } from "../../domain/build";
import { editorTheme } from "../../infrastructure/editor/editorTheme";
import { latexLanguage } from "../../infrastructure/editor/latexLanguage";

export type CursorStyle = "bar" | "block";

type Props = {
  /** Which document is shown. Each key keeps its own text, selection and undo history. */
  docKey: string;
  /** Text for a key the editor hasn't seen yet. Ignored afterwards (it's uncontrolled). */
  text: string;
  /** Keys still open; states for any others are dropped. */
  openKeys?: readonly string[];
  cursorStyle?: CursorStyle;
  /** Build errors and warnings for the shown document, marked in the gutter and text. */
  diagnostics?: readonly Diagnostic[];
  onChange?: (docKey: string, text: string) => void;
};

/**
 * The LaTeX source editor (CodeMirror 6): highlighting, line numbers, active line, undo
 * (⌘Z / ⇧⌘Z), find and replace (⌘F), soft wrap, Tab to indent. One view is reused for
 * every tab; switching swaps in that tab's saved EditorState.
 */
export function Editor({ docKey, text, openKeys, cursorStyle = "block", diagnostics = NONE, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const shownKey = useRef(docKey);
  const states = useRef(new Map<string, EditorState>());
  // Keep the latest callback without rebuilding the editor on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      lineNumbers(),
      lintGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      bracketMatching(),
      search({ top: true }),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      latexLanguage,
      editorTheme,
      EditorView.editorAttributes.of({ class: cursorStyle === "block" ? "cm-block-cursor" : "" }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current?.(shownKey.current, update.state.doc.toString());
      }),
    ],
    // cursorStyle is read once, when the editor is created.
    [],
  );

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions }) });
    view.current = created;
    created.focus();
    return () => {
      created.destroy();
      view.current = null;
    };
    // The first document is read once; later ones arrive through docKey.
  }, [extensions]);

  useEffect(() => {
    const current = view.current;
    if (!current || shownKey.current === docKey) return;
    states.current.set(shownKey.current, current.state);
    shownKey.current = docKey;
    const next = states.current.get(docKey) ?? EditorState.create({ doc: text, extensions });
    current.setState(next);
    current.dispatch({ effects: EditorView.scrollIntoView(next.selection.main.head, { y: "center" }) });
    current.focus();
    // text only matters for a key seen for the first time, read right here.
  }, [docKey, extensions]);

  // After the docKey effect, so a switched-in state gets the current marks.
  useEffect(() => {
    const current = view.current;
    if (!current) return;
    current.dispatch(setDiagnostics(current.state, toLint(current.state.doc, diagnostics)));
  }, [docKey, diagnostics]);

  useEffect(() => {
    if (!openKeys) return;
    for (const key of states.current.keys()) if (!openKeys.includes(key)) states.current.delete(key);
  }, [openKeys]);

  return <div className="editor" ref={host} />;
}

const NONE: readonly Diagnostic[] = [];

/** Build diagnostics as CodeMirror ones: the whole line, or line 1 when the log gave none. */
function toLint(doc: EditorState["doc"], diagnostics: readonly Diagnostic[]): LintDiagnostic[] {
  return diagnostics.map((d) => {
    const line = doc.line(Math.min(Math.max(d.line, 1), doc.lines));
    return { from: line.from, to: line.to, severity: d.severity, message: d.message, source: "latexmk" };
  });
}
