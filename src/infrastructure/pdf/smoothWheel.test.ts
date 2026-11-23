import { describe, expect, it } from "vitest";
import { createGlide, type Scroller } from "./smoothWheel";

function setup(max = 10_000) {
  let top = 0;
  const scroller: Scroller = {
    get: () => top,
    set: (v) => {
      top = Math.round(Math.min(max, Math.max(0, v)) * 2) / 2; // like a real scroller, half-pixel steps
    },
    max: () => max,
    page: () => 800,
  };
  let now = 0;
  let pending: ((t: number) => void) | null = null;
  const frames = {
    request: (cb: (t: number) => void) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
    now: () => now,
  };
  const glide = createGlide(scroller, frames);
  /** Run frames of `ms` each; returns the scroll positions. */
  const run = (count: number, ms = 13) => {
    const tops: number[] = [];
    for (let i = 0; i < count && pending; i++) {
      now += ms;
      const cb = pending;
      pending = null;
      cb(now);
      tops.push(top);
    }
    return tops;
  };
  const wheel = (deltaY: number, mods: Partial<WheelEvent> = {}) =>
    glide.wheel({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false, metaKey: false, ...mods });
  return { glide, run, wheel, top: () => top, setTop: (v: number) => (top = v) };
}

describe("wheel glide", () => {
  it("covers a wheel jump in even, shrinking steps instead of at once", () => {
    const t = setup();
    expect(t.wheel(375)).toBe(true);
    const tops = t.run(40);
    expect(tops[0]).toBeGreaterThan(50);
    expect(tops[0]).toBeLessThan(375);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1]);
    expect(t.top()).toBe(375);
    expect(t.glide.active()).toBe(false);
  });

  it("adds wheel events that arrive mid-glide to the same target", () => {
    const t = setup();
    t.wheel(375);
    t.run(2);
    t.wheel(375);
    t.wheel(375);
    t.run(60);
    expect(t.top()).toBe(1125);
  });

  it("stops at the ends", () => {
    const t = setup(500);
    t.wheel(2000);
    t.run(80);
    expect(t.top()).toBe(500);
    expect(t.glide.active()).toBe(false);
  });

  it("leaves pinch zoom and sideways scrolling to the webview", () => {
    const t = setup();
    expect(t.wheel(10, { ctrlKey: true })).toBe(false);
    expect(t.glide.wheel({ deltaX: 50, deltaY: 5, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe(false);
  });

  it("gives way when something else moves the scroller", () => {
    const t = setup();
    t.wheel(1000);
    t.run(1);
    t.setTop(5000); // say, a scrollbar drag
    t.run(1);
    expect(t.glide.active()).toBe(false);
    expect(t.top()).toBe(5000);
  });

  it("doesn't lurch to catch up after a slow frame", () => {
    const normal = setup();
    normal.wheel(1000);
    const [afterNormal] = normal.run(1, 20);
    const slow = setup();
    slow.wheel(1000);
    const [afterSlow] = slow.run(1, 60); // a page drawing held this frame up
    expect(afterSlow).toBe(afterNormal);
  });

  it("turns line and page deltas into pixels", () => {
    const t = setup();
    t.wheel(3, { deltaMode: 1 });
    t.run(80);
    expect(t.top()).toBe(120);
  });
});
