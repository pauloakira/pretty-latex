import { describe, expect, it } from "vitest";
import { aheadBehind, unsavedInRepo } from "./git";

describe("git helpers", () => {
  it("lists unsaved files inside the repository, relative to it", () => {
    expect(unsavedInRepo("/p", ["/p/main.tex", "/p/ch/one.tex", "/elsewhere/x.tex", "/pp/y.tex"])).toEqual([
      "main.tex",
      "ch/one.tex",
    ]);
  });

  it("shows ahead and behind only when not zero", () => {
    expect(aheadBehind({ ahead: 2, behind: 1 })).toBe("↑2 ↓1");
    expect(aheadBehind({ ahead: 0, behind: 3 })).toBe("↓3");
    expect(aheadBehind({ ahead: 0, behind: 0 })).toBe("");
  });
});
