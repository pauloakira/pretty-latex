import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
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
  onChange?: (docKey: string, text: string) => void;
};

/**
 * The LaTeX source editor (CodeMirror 6): highlighting, line numbers, active line, undo
 * (⌘Z / ⇧⌘Z), find and replace (⌘F), soft wrap, Tab to indent. One view is reused for
 * every tab; switching swaps in that tab's saved EditorState.
 */
export function Editor({ docKey, text, openKeys, cursorStyle = "block", onChange }: Props) {
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

  useEffect(() => {
    if (!openKeys) return;
    for (const key of states.current.keys()) if (!openKeys.includes(key)) states.current.delete(key);
  }, [openKeys]);

  return <div className="editor" ref={host} />;
}
