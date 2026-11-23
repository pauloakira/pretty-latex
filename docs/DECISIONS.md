# Decision log

Short records of choices that shape the codebase. Newest last. Each entry says what we
chose, what else we weighed, and why.

## D1 — App stack: Tauri 2 + React + TypeScript (2026-11-22)

**Chosen:** Tauri 2 (Rust core) with a React + TypeScript frontend built by Vite. The
editor will be CodeMirror 6 and the PDF preview pdf.js. Builds run through `latexmk` from
the user's TeX install.

**Weighed against:** a native SwiftUI/AppKit app.

| Need | Tauri 2 + web UI | SwiftUI / AppKit |
|------|------------------|------------------|
| Glass window (real blur behind a tint) | `windowEffects` gives native `NSVisualEffectView` vibrancy; the UI on top is CSS | Native, best-in-class |
| Code editor with LaTeX highlighting, autocomplete | CodeMirror 6: mature, fast, extensible | `NSTextView` + a hand-built highlighter and completion |
| PDF preview with zoom and SyncTeX highlights | pdf.js, already proven in pretty-markdown | PDFKit, very good |
| Reuse from pretty-markdown | Same stack: CodeMirror setup, pdf.js viewer, CI, conventions | Nothing carries over |
| Running `latexmk`, watching files | Rust commands (`std::process`, `notify`) | `Process`, `FSEvents` |
| iPad later | Tauri iOS target, as pretty-markdown does | SwiftUI multiplatform |

**Why:** the hard parts of this app are the editor and the PDF pane, and both are already
solved in pretty-markdown with this exact stack. Native would give slightly nicer glass
but means building the editor from scratch. Tauri's vibrancy is the same
`NSVisualEffectView` underneath, so the canvas design (B · Split Glass) is reachable.

**Glass, revised after the first run:** `windowEffects` (`NSVisualEffectView`) turned out
too opaque: the wallpaper disappears. Instead the window is fully transparent, a private
CoreGraphics call sets a small background blur radius (what Terminal does), and a CSS tint
sits on top. Radius and tint are each one value.

**Costs we accept:** the window needs `macOSPrivateApi` for transparency, which rules out
the Mac App Store. Distribution is a signed, notarized `.dmg`, like pretty-markdown.

## D2 — Files: our own Rust commands, one EditorState per tab (2026-11-22)

- **Reading, writing and listing** go through small Rust commands (`src-tauri/src/files.rs`)
  instead of Tauri's fs plugin: no path-scope configuration, and the folder listing (source
  files only, hidden and build output left out, empty folders pruned, capped at 10k
  entries) is one call. Dialogs use the dialog plugin.
- **The file tree shows** `.tex .ltx .bib .sty .cls .bst .bbx .cbx .dtx .ins .txt .md`.
  Build output and images stay hidden until there's a reason to show them.
- **Tabs share one CodeMirror view**; each tab keeps its own `EditorState`, so switching
  keeps text, selection and undo history. A file reopened after closing gets a new key and
  a fresh state.
- **The session** (`session.json` in the app's config folder) stores the open folder, the
  saved tabs and the active one. Unsaved new files aren't restored.

## D3 — Builds: latexmk on save, output in build/ (2026-11-22)

- **⌘S builds.** Every successful save starts a build 250 ms later; saves closer together
  make one build. Starting a build stops the running one (SIGTERM to latexmk's process
  group, so pdflatex and biber stop too), and its result is dropped.
- **Which file builds:** a `% !TEX root = …` line wins; else a file with `\documentclass`
  builds itself; else (a chapter, a `.bib`) the project's `main.tex`; else a lone `.tex`
  builds itself.
- **Engine:** `latexmk -pdf` by default; `% !TEX program = xelatex|lualatex` switches it.
  Runs with `-interaction=nonstopmode -halt-on-error -file-line-error -synctex=1
  -outdir=build`, and `max_print_line=10000` so log lines don't wrap.
- **Finding TeX:** apps started from Finder don't get the shell's PATH, so we look on the
  PATH and then in `/Library/TeX/texbin` (MacTeX), Homebrew, `/usr/local/bin` and TinyTeX.
  Without latexmk the badge says "no TeX" and the status line says what to install.
- **Diagnostics:** errors come from `file:line:` log lines; LaTeX/package warnings from
  "on input line N", put on the main file since the log doesn't say which file. Shown as
  gutter dots and wavy underlines (CodeMirror lint), the count in the badge and the first
  error in the status line.

## D4 — PDF preview: pdf.js in layers, wheel glide (2026-11-22)

- **pdf.js 6.4, legacy build**, loaded lazily (its own chunk), like pretty-markdown. Its
  data files (cmaps, fonts, wasm, ICC) ship with the app via a Vite plugin.
- **No-flash reload:** each build's PDF opens in a new layer under the shown one, hidden
  but laid out; once the page in view has drawn, it swaps in at the same page and offset.
- **Draws 4 pages ahead** of the scroll direction (1 behind) and frees pages further away,
  the numbers pretty-markdown measured. Paused while a wheel glide runs.
- **Wheel glide:** WKWebView applies each wheel delta as one jump, and a fast mouse wheel
  with macOS acceleration sends ~375 px per event, 0–2 per frame, which read as choppy.
  Wheel input on the PDF moves a target instead, and each frame closes a share of the gap
  (70 ms ease, at most 20 ms counted per frame so a slow frame doesn't lurch). Measured in
  the app: 11 scroll steps per burst before, one per frame after. Pinch and sideways
  scrolling stay with the webview.
- **Fit** is pdf.js's "auto": the pane width, at most 125%, so the expanded full-window
  view (⇧⌘\, Esc leaves) shows a readable page.

## D5 — Git: the git command line, commit only what's ticked (2026-11-23)

- **Runs `git`** (PATH, then Homebrew, then `/usr/bin`) rather than a git library: the
  user's config, ignore rules, hooks, SSH keys and keychain credentials apply as in the
  terminal. `GIT_TERMINAL_PROMPT=0` makes a push that needs a password fail with git's
  message instead of waiting on a prompt nobody can see.
- **The repository** is the one containing the open folder (or the active file);
  `git rev-parse --show-toplevel` finds it from any subfolder. Not a repository: no
  git icon.
- **Commit** stages and commits exactly the ticked files (`git add -A -- paths` then
  `git commit -- paths`), so anything else already staged stays out. New files are
  listed one by one (`--untracked-files=all`). Files are what's on disk: unsaved editor
  changes aren't included, and the panel says so.
- **Push** pushes the current branch; its first push sets the upstream on `origin` (or the
  only remote). A failed push after a good commit keeps the commit and says so.
