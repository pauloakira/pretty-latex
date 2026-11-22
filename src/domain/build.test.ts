import { describe, expect, it } from "vitest";
import { buildLabel } from "./build";

describe("buildLabel", () => {
  it("describes each build state", () => {
    expect(buildLabel({ kind: "idle" })).toEqual({ text: "auto-build", tone: "neutral" });
    expect(buildLabel({ kind: "building" })).toEqual({ text: "building…", tone: "busy" });
    expect(buildLabel({ kind: "ok", seconds: 0.84, warnings: 1 })).toEqual({
      text: "built 0.8s",
      tone: "ok",
    });
  });

  it("pluralises errors", () => {
    expect(buildLabel({ kind: "failed", errors: 1 }).text).toBe("1 error");
    expect(buildLabel({ kind: "failed", errors: 3 }).text).toBe("3 errors");
  });
});
