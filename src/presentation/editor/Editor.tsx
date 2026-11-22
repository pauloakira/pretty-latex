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
import { useEffect, useRef } from "react";
import { editorTheme } from "../../infrastructure/editor/editorTheme";
import { latexLanguage } from "../../infrastructure/editor/latexLanguage";

export type CursorStyle = "bar" | "block";

type Props = {
  /** Text the editor starts with. Later changes to this prop are ignored (it's uncontrolled). */
  initialDoc: string;
  cursorStyle?: CursorStyle;
  onChange?: (doc: string) => void;
};

/**
 * The LaTeX source editor (CodeMirror 6): highlighting, line numbers, active line, undo
 * (⌘Z / ⇧⌘Z), find and replace (⌘F), soft wrap, Tab to indent.
 */
export function Editor({ initialDoc, cursorStyle = "block", onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Keep the latest callback without rebuilding the editor on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
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
          EditorView.editorAttributes.of({
            class: cursorStyle === "block" ? "cm-block-cursor" : "",
          }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
    // initialDoc and cursorStyle are read once, when the editor is created.
  }, []);

  return <div className="editor" ref={host} />;
}
