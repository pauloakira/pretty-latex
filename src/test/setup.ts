// jsdom has no layout, so Range lacks the geometry CodeMirror reads when it measures
// (e.g. scrolling the cursor into view on a timer). Empty rects are enough for tests.
const emptyRect = (): DOMRect => new DOMRect(0, 0, 0, 0);
const emptyList = (): DOMRectList => {
  const list: DOMRect[] = [];
  return Object.assign(list, { item: (i: number) => list[i] ?? null }) as unknown as DOMRectList;
};

if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyList;
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
