import { describe, expect, it } from "vitest";
import { percent, stepZoom } from "./pdf";

describe("PDF zoom", () => {
  it("steps up and down from any scale, stopping at the ends", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    // From fit width (say 0.83) to the neighbouring steps.
    expect(stepZoom(0.83, 1)).toBe(0.9);
    expect(stepZoom(0.83, -1)).toBe(0.75);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it("shows a scale as a percentage", () => {
    expect(percent(0.834)).toBe("83%");
  });
});
