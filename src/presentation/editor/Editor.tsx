import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
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
  /** A line to move to and flash (inverse search from the PDF); the nonce repeats it. */
  reveal?: { line: number; nonce: number } | null;
  /** ⌘↵: jump from this line to the PDF (forward search). */
  onSyncToPdf?: (line: number) => void;
  /** The cursor's line, for the status line. */
  onCursorLine?: (line: number) => void;
  onChange?: (docKey: string, text: string) => void;
};

/**
 * The LaTeX source editor (CodeMirror 6): highlighting, line numbers, active line, undo
 * (⌘Z / ⇧⌘Z), find and replace (⌘F), soft wrap, Tab to indent. One view is reused for
 * every tab; switching swaps in that tab's saved EditorState.
 */
export function Editor({
  docKey,
  text,
  openKeys,
  cursorStyle = "block",
  diagnostics = NONE,
  reveal,
  onSyncToPdf,
  onCursorLine,
  onChange,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const shownKey = useRef(docKey);
  const states = useRef(new Map<string, EditorState>());
  // Keep the latest callback without rebuilding the editor on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSyncRef = useRef(onSyncToPdf);
  onSyncRef.current = onSyncToPdf;
  const onCursorRef = useRef(onCursorLine);
  onCursorRef.current = onCursorLine;
  const reportCursor = (state: EditorState) =>
    onCursorRef.current?.(state.doc.lineAt(state.selection.main.head).number);

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
      // Ahead of the default keymap, where ⌘↵ inserts a blank line.
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: (view) => {
              if (!onSyncRef.current) return false;
              onSyncRef.current(view.state.doc.lineAt(view.state.selection.main.head).number);
              return true;
            },
          },
        ]),
      ),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      syncedLine,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current?.(shownKey.current, update.state.doc.toString());
        if (update.selectionSet || update.docChanged) reportCursor(update.state);
      }),
    ],
    // cursorStyle is read once, when the editor is created.
    [],
  );

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions }) });
    view.current = created;
    reportCursor(created.state);
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
    reportCursor(next);
    current.dispatch({ effects: EditorView.scrollIntoView(next.selection.main.head, { y: "center" }) });
    current.focus();
    // text only matters for a key seen for the first time, read right here.
  }, [docKey, extensions]);

  // A line from the PDF (⌘-click): cursor to its start, centred, and a passing highlight.
  // After the docKey effect, so it lands in the document just switched to.
  const revealed = useRef(0);
  useEffect(() => {
    const current = view.current;
    // Each jump once: coming back to this tab later mustn't replay it.
    if (!current || !reveal || reveal.nonce === revealed.current) return;
    revealed.current = reveal.nonce;
    const line = current.state.doc.line(Math.min(Math.max(reveal.line, 1), current.state.doc.lines));
    current.dispatch({
      selection: { anchor: line.from },
      effects: [EditorView.scrollIntoView(line.from, { y: "center" }), flashLine.of(line.from)],
    });
    current.focus();
    const timer = setTimeout(() => current.dispatch({ effects: flashLine.of(null) }), FLASH_MS);
    return () => clearTimeout(timer);
    // The nonce makes the same line jump again.
  }, [reveal?.nonce, docKey]);

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

/** How long the line a ⌘-click jumped to stays highlighted. */
const FLASH_MS = 1800;

/** Sets (a line's start) or clears (null) the synced-line highlight. */
const flashLine = StateEffect.define<number | null>();
const syncedMark = Decoration.line({ class: "cm-synced-line" });

const syncedLine = StateField.define({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(flashLine)) next = effect.value === null ? Decoration.none : Decoration.set([syncedMark.range(effect.value)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Build diagnostics as CodeMirror ones: the whole line, or line 1 when the log gave none. */
function toLint(doc: EditorState["doc"], diagnostics: readonly Diagnostic[]): LintDiagnostic[] {
  return diagnostics.map((d) => {
    const line = doc.line(Math.min(Math.max(d.line, 1), doc.lines));
    return { from: line.from, to: line.to, severity: d.severity, message: d.message, source: "latexmk" };
  });
}
