import { describe, expect, it } from "vitest";
import { activeDoc, documentsReducer, isDirty, noDocuments, type Documents, type DocumentsAction } from "./documents";

const run = (...actions: DocumentsAction[]): Documents => actions.reduce(documentsReducer, noDocuments);

describe("documentsReducer", () => {
  it("opens a file as a clean, active tab named after it", () => {
    const state = run({ type: "open", path: "/p/main.tex", text: "x" });
    const doc = activeDoc(state);
    expect(doc?.title).toBe("main.tex");
    expect(doc && isDirty(doc)).toBe(false);
  });

  it("focuses a file that's already open instead of opening it twice", () => {
    const state = run(
      { type: "open", path: "/p/a.tex", text: "a" },
      { type: "open", path: "/p/b.tex", text: "b" },
      { type: "open", path: "/p/a.tex", text: "a" },
    );
    expect(state.docs).toHaveLength(2);
    expect(activeDoc(state)?.path).toBe("/p/a.tex");
  });

  it("is dirty after an edit and clean again once the text is back", () => {
    let state = run({ type: "open", path: "/p/a.tex", text: "a" });
    const key = state.activeKey as string;
    state = documentsReducer(state, { type: "edit", key, text: "ab" });
    expect(isDirty(state.docs[0])).toBe(true);
    state = documentsReducer(state, { type: "edit", key, text: "a" });
    expect(isDirty(state.docs[0])).toBe(false);
  });

  it("names new files untitled.tex, untitled-2.tex, …", () => {
    const state = run({ type: "new" }, { type: "new" }, { type: "new" });
    expect(state.docs.map((doc) => doc.title)).toEqual(["untitled.tex", "untitled-2.tex", "untitled-3.tex"]);
  });

  it("takes the saved path and title, and counts only the written text as saved", () => {
    let state = run({ type: "new" });
    const key = state.activeKey as string;
    state = documentsReducer(state, { type: "edit", key, text: "written" });
    state = documentsReducer(state, { type: "edit", key, text: "written, then more" });
    state = documentsReducer(state, { type: "saved", key, path: "/p/paper.tex", text: "written" });
    expect(state.docs[0]).toMatchObject({ path: "/p/paper.tex", title: "paper.tex" });
    expect(isDirty(state.docs[0])).toBe(true);
  });

  it("hands focus to the right neighbour on close, else the left", () => {
    let state = run(
      { type: "open", path: "/a.tex", text: "" },
      { type: "open", path: "/b.tex", text: "" },
      { type: "open", path: "/c.tex", text: "" },
      { type: "activatePath", path: "/b.tex" },
    );
    state = documentsReducer(state, { type: "close", key: state.activeKey as string });
    expect(activeDoc(state)?.path).toBe("/c.tex");
    state = documentsReducer(state, { type: "close", key: state.activeKey as string });
    expect(activeDoc(state)?.path).toBe("/a.tex");
    state = documentsReducer(state, { type: "close", key: state.activeKey as string });
    expect(state.activeKey).toBeNull();
  });

  it("gives a reopened file a new key, so it gets a fresh editor state", () => {
    let state = run({ type: "open", path: "/a.tex", text: "" });
    const first = state.activeKey;
    state = documentsReducer(state, { type: "close", key: first as string });
    state = documentsReducer(state, { type: "open", path: "/a.tex", text: "" });
    expect(state.activeKey).not.toBe(first);
  });

  it("cycles through tabs both ways, wrapping around", () => {
    let state = run({ type: "open", path: "/a.tex", text: "" }, { type: "open", path: "/b.tex", text: "" });
    state = documentsReducer(state, { type: "cycle", delta: 1 });
    expect(activeDoc(state)?.path).toBe("/a.tex");
    state = documentsReducer(state, { type: "cycle", delta: -1 });
    expect(activeDoc(state)?.path).toBe("/b.tex");
  });
});
