# pretty-latex

A minimal LaTeX editor for macOS that feels like writing in a terminal: a translucent glass
window, a monospace editor, and a live PDF beside it that you can hide.

It deliberately does far less than VS Code or Overleaf. You open a folder, write, press ⌘S,
and read the PDF.

## Install

### Ask your AI coding agent (easiest)

Paste this into **Claude Code**, **Codex**, **Cursor**, or any coding agent that can run
commands on your Mac:

```text
Install the pretty-latex macOS app from https://github.com/pauloakira/pretty-latex by following its INSTALL.md.
```

The agent checks what's missing (Xcode tools, Node.js, Rust, a TeX distribution) and asks
before installing anything. Then it builds and installs the app. Chat assistants without
terminal access, such as ChatGPT or Claude on the web, can't install it for you. Give them
the same prompt and they'll walk you through the steps.

### One command

```bash
git clone https://github.com/pauloakira/pretty-latex.git ~/.pretty-latex && ~/.pretty-latex/scripts/install.sh
```

This needs the Xcode Command Line Tools, Node.js 20.19+ and Rust. The script checks for them
and tells you what's missing. To build documents you also need MacTeX or TinyTeX, which
provide `latexmk`. The app lands in `/Applications` and opens `.tex` files. Run
`~/.pretty-latex/scripts/install.sh` again to update.

Prerequisites, uninstalling and troubleshooting are in **[INSTALL.md](INSTALL.md)**.

## Features

- **Glass window.** The window is fully transparent, with a light background blur and a
  tint, like Terminal. The wallpaper shows through.
- **Monospace editor.** CodeMirror 6 with LaTeX highlighting, find and replace (⌘F) and
  tabs. Each tab keeps its own undo history.
- **Builds on save.** ⌘S runs `latexmk` from your own TeX install. Output goes to `build/`.
  `% !TEX root = …` and `% !TEX program = xelatex|lualatex` are honoured. Without them,
  chapter files build the project's `main.tex`.
- **Errors where they happened.** Build errors and warnings show as gutter dots and wavy
  underlines, with the count in the badge and the first error in the status line.
- **Live PDF.** pdf.js renders the PDF beside the editor. It reloads without a flash and
  keeps your page. Hide the PDF (⌘\\), or expand it to the whole window (⇧⌘\\).
- **SyncTeX.** ⌘↵ in the editor jumps to that spot in the PDF. ⌘-click in the PDF jumps to
  the source line.
- **File tree.** Open a folder (⇧⌘O) to see its source files. The tree folds to a thin rail
  (⌘B).
- **Git.** Tick files, commit and push from a small panel (⇧⌘G). It uses your own `git`,
  config and keys.
- **Several windows.** Each window holds one project (⇧⌘N). All of them come back on the
  next launch.
- **Never loses work by accident.** Closing a window or quitting with unsaved files asks
  Save / Don't Save / Cancel.
- **Native.** Double-click a `.tex` in Finder to open it. No account and no network access.

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| New file / open file / open folder | ⌘N / ⌘O / ⇧⌘O |
| Save (and build) / save as | ⌘S / ⇧⌘S |
| Close tab / next tab / previous tab | ⌘W / ⇧⌘] / ⇧⌘[ |
| New window / close window | ⇧⌘N / ⇧⌘W |
| Toggle file tree | ⌘B |
| Toggle PDF / expand PDF (Esc leaves) | ⌘\\ / ⇧⌘\\ |
| Source → PDF / PDF → source | ⌘↵ / ⌘-click |
| Git panel / commit from it | ⇧⌘G / ⌘↵ |
| Find and replace | ⌘F |
| Quit (asks about unsaved files) | ⌘Q |

## Develop

```bash
npm install
```

```bash
npm run tauri dev
```

Checks, the same ones CI runs:

```bash
npm run typecheck && npm test && npm run build
```

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

The stack is Tauri 2 (Rust), React and TypeScript with Vite, CodeMirror 6 and pdf.js.
[docs/DECISIONS.md](docs/DECISIONS.md) explains each structural choice. Conventions for
contributors (and coding agents) are in [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE) © 2026 Paulo Akira.
