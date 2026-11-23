import { vi } from "vitest";
import type { Git, GitStatus } from "../domain/git";

/** A scripted git: `state.status` is what status returns; commit and push record calls. */
export function fakeGit(status: GitStatus | null = null) {
  const state = {
    status,
    commitError: null as Error | null,
    pushError: null as Error | null,
    commits: [] as { message: string; paths: string[] }[],
    pushes: 0,
  };
  const git = {
    status: vi.fn(async (_path: string) => state.status),
    commit: vi.fn(async (_root: string, message: string, paths: string[]) => {
      if (state.commitError) throw state.commitError;
      state.commits.push({ message, paths });
      if (state.status) {
        state.status = {
          ...state.status,
          ahead: state.status.ahead + 1,
          files: state.status.files.filter((f) => !paths.includes(f.path)),
        };
      }
      return "abc1234";
    }),
    push: vi.fn(async (_root: string) => {
      if (state.pushError) throw state.pushError;
      state.pushes++;
      if (state.status) state.status = { ...state.status, ahead: 0, upstream: state.status.upstream ?? "origin/main" };
      return "origin/main";
    }),
  } satisfies Git;
  return { git, state };
}

export function repoStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    root: "/p",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    hasRemote: true,
    files: [],
    ...overrides,
  };
}
