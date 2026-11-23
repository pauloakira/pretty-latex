/**
 * Even scrolling for wheel input in a scroller. The webview applies each wheel delta as
 * one jump, and a fast mouse wheel with macOS acceleration sends ~375 px per event,
 * irregularly (0, 1 or 2 events per frame), so the page lurches. Here each delta moves a
 * target, and every frame the scroller closes a fixed share of the gap to it (an
 * exponential ease), so the same distance is covered in even steps.
 *
 * Pinch (ctrl+wheel) and sideways scrolling are left to the webview.
 */

/** Time constant of the ease: about 63% of the gap is closed in this long. */
export const GLIDE_MS = 70;

/**
 * Longest frame the ease accounts for. When pdf.js holds a frame up (drawing a page that
 * scrolls into view), catching up on all the lost time at once is the visible lurch;
 * capped, the motion just slows for that frame.
 */
const MAX_STEP_MS = 20;
const LINE_PX = 40;

export type Scroller = {
  get(): number;
  set(top: number): void;
  max(): number;
  /** Viewport height, for page-mode deltas. */
  page(): number;
};

type Frames = {
  request(callback: (now: number) => void): number;
  cancel(id: number): void;
  now(): number;
};

const browserFrames: Frames = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
};

export type Glide = {
  /** Feed a wheel event; returns true when it was taken (the caller prevents default). */
  wheel(event: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey">): boolean;
  /** True while a glide is moving the scroller. */
  active(): boolean;
  stop(): void;
};

export function createGlide(scroller: Scroller, frames: Frames = browserFrames): Glide {
  let target = 0;
  let lastSet = 0;
  let lastTime = 0;
  let frame = 0;

  const stop = () => {
    if (frame) frames.cancel(frame);
    frame = 0;
  };

  const step = (now: number) => {
    frame = 0;
    // Something else moved it (scrollbar drag, keys, go-to-page): let that win.
    if (Math.abs(scroller.get() - lastSet) > 2) return;
    const dt = Math.min(MAX_STEP_MS, Math.max(1, now - lastTime));
    lastTime = now;
    const current = scroller.get();
    const gap = target - current;
    if (Math.abs(gap) < 0.5) {
      scroller.set(target);
      lastSet = scroller.get();
      return;
    }
    const share = 1 - Math.exp(-dt / GLIDE_MS);
    let next = current + gap * share;
    // Scrollers keep whole (or half) pixels: always move at least one, and land exactly.
    if (Math.abs(next - current) < 1) next = current + Math.sign(gap) * Math.min(1, Math.abs(gap));
    if (Math.abs(target - next) < 1) next = target;
    scroller.set(next);
    lastSet = scroller.get();
    // Pinned at an end (the document is shorter than the target): stop.
    if (lastSet === current) return;
    frame = frames.request(step);
  };

  return {
    wheel(event) {
      if (event.ctrlKey || event.metaKey) return false;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return false;
      const px =
        event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaMode === 2 ? event.deltaY * scroller.page() : event.deltaY;
      if (!frame) {
        target = scroller.get();
        lastSet = target;
        lastTime = frames.now();
      }
      target = Math.min(scroller.max(), Math.max(0, target + px));
      if (!frame) frame = frames.request(step);
      return true;
    },
    active: () => frame !== 0,
    stop,
  };
}
