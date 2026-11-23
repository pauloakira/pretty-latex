import { basename } from "../domain/project";

/**
 * The open documents behind the title-bar tabs. Pure: the async parts (reading, writing,
 * dialogs) live in useWorkspace and dispatch these actions when they finish.
 */
export type Doc = {
  /** Unique per opening, so a file closed and reopened gets a fresh editor state. */
  key: string;
  /** Null until an untitled document is first saved. */
  path: string | null;
  title: string;
  text: string;
  /** The text as last read from or written to disk. */
  savedText: string;
};

export type Documents = {
  docs: Doc[];
  activeKey: string | null;
  nextId: number;
};

export const noDocuments: Documents = { docs: [], activeKey: null, nextId: 1 };

export type DocumentsAction =
  | { type: "open"; path: string; text: string }
  | { type: "new"; text?: string }
  | { type: "edit"; key: string; text: string }
  | { type: "saved"; key: string; path: string; text: string }
  | { type: "close"; key: string }
  | { type: "activate"; key: string }
  | { type: "activatePath"; path: string }
  | { type: "cycle"; delta: 1 | -1 };

export const isDirty = (doc: Doc): boolean => doc.text !== doc.savedText;

export function activeDoc(state: Documents): Doc | null {
  return state.docs.find((doc) => doc.key === state.activeKey) ?? null;
}

export function documentsReducer(state: Documents, action: DocumentsAction): Documents {
  switch (action.type) {
    case "open": {
      const existing = state.docs.find((doc) => doc.path === action.path);
      if (existing) return { ...state, activeKey: existing.key };
      const doc: Doc = {
        key: `doc-${state.nextId}`,
        path: action.path,
        title: basename(action.path),
        text: action.text,
        savedText: action.text,
      };
      return { docs: [...state.docs, doc], activeKey: doc.key, nextId: state.nextId + 1 };
    }
    case "new": {
      const text = action.text ?? "";
      const doc: Doc = {
        key: `doc-${state.nextId}`,
        path: null,
        title: untitledName(state.docs),
        text,
        // A new document starts clean: closing an untouched one shouldn't ask.
        savedText: text,
      };
      return { docs: [...state.docs, doc], activeKey: doc.key, nextId: state.nextId + 1 };
    }
    case "edit":
      return update(state, action.key, (doc) => ({ ...doc, text: action.text }));
    case "saved":
      return update(state, action.key, (doc) => ({
        ...doc,
        path: action.path,
        title: basename(action.path),
        // Typing may have continued while the write was in flight: only what was written
        // counts as saved.
        savedText: action.text,
      }));
    case "close": {
      const index = state.docs.findIndex((doc) => doc.key === action.key);
      if (index < 0) return state;
      const docs = state.docs.filter((doc) => doc.key !== action.key);
      if (state.activeKey !== action.key) return { ...state, docs };
      // Like a browser: the tab to the right takes over, else the one to the left.
      const next = docs[index] ?? docs[index - 1] ?? null;
      return { ...state, docs, activeKey: next?.key ?? null };
    }
    case "activate":
      return state.docs.some((doc) => doc.key === action.key) ? { ...state, activeKey: action.key } : state;
    case "activatePath": {
      const doc = state.docs.find((d) => d.path === action.path);
      return doc ? { ...state, activeKey: doc.key } : state;
    }
    case "cycle": {
      if (state.docs.length === 0) return state;
      const index = state.docs.findIndex((doc) => doc.key === state.activeKey);
      const next = (index + action.delta + state.docs.length) % state.docs.length;
      return { ...state, activeKey: state.docs[next].key };
    }
  }
}

function update(state: Documents, key: string, change: (doc: Doc) => Doc): Documents {
  return { ...state, docs: state.docs.map((doc) => (doc.key === key ? change(doc) : doc)) };
}

/** untitled.tex, then untitled-2.tex, untitled-3.tex, … skipping names in use. */
function untitledName(docs: Doc[]): string {
  const taken = new Set(docs.filter((doc) => doc.path === null).map((doc) => doc.title));
  if (!taken.has("untitled.tex")) return "untitled.tex";
  let n = 2;
  while (taken.has(`untitled-${n}.tex`)) n++;
  return `untitled-${n}.tex`;
}
