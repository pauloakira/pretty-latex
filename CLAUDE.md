# CLAUDE.md — pretty-latex

## Project context

`pretty-latex` is a **minimal LaTeX editor for macOS** that feels like writing in a
terminal: a translucent glass window, a monospace editor, and a live PDF beside it that can
be hidden. It deliberately does far less than VS Code.

**Stack:** Tauri 2 (Rust core) · React + TypeScript · Vite. Planned: CodeMirror 6 (editor),
pdf.js (preview), `latexmk` from the user's TeX install (build). Why this stack:
[docs/DECISIONS.md](docs/DECISIONS.md) D1. It mirrors the sibling project
`pretty-markdown`; reuse its patterns (CodeMirror setup, pdf.js viewer, CI) where they fit.

**Design:** the "Pretty-Latex" document on the local Design Canvas (`http://localhost:4410`).
The chosen direction is **B · Split Glass**: B1 default (file tree collapsed to a rail, PDF
on), B2 file tree open (⌘B), B3 PDF hidden (⌘\\).

## Commands

```bash
npm run tauri dev        # run the app
npm run typecheck && npm test && npm run build
```

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI (`.github/workflows/ci.yml`) runs the same checks on every PR and on pushes to `main`.

## Working conventions

- TypeScript `strict`; no `any`.
- Conventional Commits. Commit at logical checkpoints.
- One branch per card (`feat/…`, `fix/…`, `chore/…`, `docs/…`), PR into `main`.
- Record structural choices in [docs/DECISIONS.md](docs/DECISIONS.md).

## Task board

Work is tracked on the shared Notion kanban
[Claude Code — Kanban](https://app.notion.com/p/420668ddf3228055b93cf712c23db858). This
repo's cards have **Project = `pretty-latex`** (use the "pretty-latex" board view). Follow
the rules at the top of that page: claim a card only if **Claimed by** is empty, set
**In progress** and your session name, add the branch and PR as you go, and move the card to
**Done** after merge.
