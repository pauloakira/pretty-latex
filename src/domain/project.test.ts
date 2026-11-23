import { describe, expect, it } from "vitest";
import { basename, parseSession, relativeTo } from "./project";

describe("paths", () => {
  it("takes the last part of a path", () => {
    expect(basename("/a/b/main.tex")).toBe("main.tex");
    expect(basename("/a/thesis/")).toBe("thesis");
  });

  it("shows a path relative to the open folder only when it's inside it", () => {
    expect(relativeTo("/p", "/p/ch/intro.tex")).toBe("ch/intro.tex");
    expect(relativeTo("/p", "/pq/x.tex")).toBe("/pq/x.tex");
    expect(relativeTo(null, "/p/x.tex")).toBe("/p/x.tex");
  });
});

describe("parseSession", () => {
  it("reads a saved session and drops bad tab entries", () => {
    expect(parseSession({ version: 1, project: "/p", tabs: ["/p/a.tex", 3], active: "/p/a.tex" })).toEqual({
      version: 1,
      project: "/p",
      tabs: ["/p/a.tex"],
      active: "/p/a.tex",
    });
  });

  it("rejects anything else", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession({ version: 2, tabs: [] })).toBeNull();
    expect(parseSession({ version: 1 })).toBeNull();
  });
});
