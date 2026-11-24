# Installing pretty-latex

pretty-latex is built from source. There are no prebuilt downloads yet. These steps work
for a person or an AI coding agent. It is a **macOS-only** app.

> **For AI agents:** do the steps in order and run each command yourself. Ask the user
> before you install a missing toolchain or TeX distribution, since that changes their
> system. Ask again before any step that needs `sudo` or an admin password. Don't skip the
> checks in step 1. When you're done, tell the user what you installed and where.

## 1. Check prerequisites

To build the app you need:

| Tool | Version | Check | Install (if missing) |
|------|---------|-------|----------------------|
| Xcode Command Line Tools | — | `xcode-select -p` | `xcode-select --install` (opens a system dialog) |
| git | any | `git --version` | Comes with the Xcode Command Line Tools |
| Node.js | 20.19+ or 22.12+ | `node -v` | <https://nodejs.org> (LTS), or `brew install node` |
| Rust | stable | `cargo -V && rustc -V` | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`, then open a new shell |

To build documents you also need a TeX distribution that includes `latexmk`. The app
installs and opens without one, but it can't compile `.tex` files until you add one.

| Option | Size | Install |
|--------|------|---------|
| MacTeX, no GUI apps (recommended) | ~5 GB | `brew install --cask mactex-no-gui`, or the installer at <https://tug.org/mactex/> |
| TinyTeX (small; add packages as needed) | ~250 MB | See <https://yihui.org/tinytex/> |

Check for TeX with `ls /Library/TeX/texbin/latexmk` (MacTeX) or `command -v latexmk`. The
app looks on the `PATH`, in `/Library/TeX/texbin`, in Homebrew's folders, in `/usr/local/bin`
and in `~/Library/TinyTeX`. Installing MacTeX needs an admin password.

Git integration (the ⇧⌘G panel) uses your existing `git`. Nothing extra is needed for it.

## 2. Build and install

```bash
git clone https://github.com/pauloakira/pretty-latex.git ~/.pretty-latex
```

```bash
~/.pretty-latex/scripts/install.sh
```

The script checks the prerequisites again and warns if it can't find `latexmk`. Then it:

1. runs `npm ci`;
2. builds the app;
3. installs `pretty-latex.app` into `/Applications`, or into `~/Applications` if
   `/Applications` isn't writable;
4. registers the app for `.tex` files;
5. opens the app.

The first build compiles the Rust dependencies and takes a few minutes. Later builds are
much faster.

Options:

- `--dest <dir>` installs the app somewhere else.
- `--no-open` skips launching the app.
- `--dir <dir>` clones into a different folder when you run the script from outside a
  checkout.

If you're already in a clone of this repo, `./scripts/install.sh` builds that checkout
instead.

## 3. Verify

1. `ls /Applications/pretty-latex.app` (or `~/Applications/...`) shows the app.
2. The app opens as a translucent glass window.
3. In the app, create a file with ⌘N and paste in:

   ```latex
   \documentclass{article}
   \begin{document}
   Hello, $e^{i\pi} + 1 = 0$.
   \end{document}
   ```

4. Save it with ⌘S as `hello.tex`. The build starts on its own, and the PDF appears on the
   right.

If the badge says "no TeX", see step 1.

## Updating

Run the same command again. It pulls the latest `main` into `~/.pretty-latex`, rebuilds,
and replaces the installed app. Quit the app first, or restart it afterwards.

```bash
~/.pretty-latex/scripts/install.sh
```

## Make it the default for `.tex` files

In Finder, right-click any `.tex` file → **Get Info** → **Open with:** pretty-latex →
**Change All…**

## Uninstall

```bash
rm -rf /Applications/pretty-latex.app ~/Applications/pretty-latex.app
```

```bash
rm -rf ~/.pretty-latex
```

```bash
rm -rf ~/Library/Application\ Support/com.prettylatex.app
```

The first command removes the app, the second the source clone, and the third the saved
windows and tabs. Your `.tex` files and their `build/` folders are never touched.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `xcrun: error: invalid active developer path` | Install the Xcode Command Line Tools: `xcode-select --install` |
| `cargo: command not found` right after installing Rust | Open a new terminal, or run `source "$HOME/.cargo/env"` |
| Vite complains about the Node version | Upgrade Node to 20.19+ or 22.12+ |
| The badge says "no TeX" | Install MacTeX or TinyTeX (step 1), then restart the app |
| The build fails with a missing `.sty` (TinyTeX) | Install the package with `tlmgr install <name>`, then save again |
| macOS says the app "is damaged" or "can't be opened" | Run `codesign --force --deep -s - /Applications/pretty-latex.app`, or right-click the app → **Open** once |
| ⌘-click in the PDF or ⌘↵ in the editor does nothing | SyncTeX needs a successful build first; save the file and wait for the PDF |
