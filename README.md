# pretty-latex

A minimal LaTeX editor for macOS with a glass, terminal-like feel: a translucent window, a
monospace editor and a live PDF you can hide.

> Early scaffold. Today the app opens an empty glass window; the editor, build and PDF
> preview are on the way.

## Run it

Needs Node 22+, Rust (stable) and Xcode command-line tools. For building documents later,
a TeX install with `latexmk` (MacTeX or TinyTeX).

```bash
npm install
```

```bash
npm run tauri dev
```

## Docs

- [docs/DECISIONS.md](docs/DECISIONS.md) — why Tauri + React + TypeScript
- [CLAUDE.md](CLAUDE.md) — conventions, checks and the task board
