#!/usr/bin/env bash
#
# Build pretty-latex from source and install it (macOS).
#
#   ./scripts/install.sh [--dir <path>] [--dest <path>] [--no-open]
#
# Run it from a checkout of the repo, or from anywhere: it then clones the repo into
# --dir (default ~/.pretty-latex) and updates that clone on later runs.
#
# Installs pretty-latex.app into --dest (default /Applications, falling back to
# ~/Applications if that isn't writable), registers it for .tex files, and opens it.
#
# It doesn't install toolchains; it checks for them and says what's missing.
# See INSTALL.md for prerequisites and troubleshooting.

set -euo pipefail

REPO_URL="${PRETTY_LATEX_REPO:-https://github.com/pauloakira/pretty-latex.git}"
BRANCH="main"
APP_NAME="pretty-latex"
CLONE_DIR="$HOME/.pretty-latex"
DEST=""
OPEN_AFTER=1
DIR_GIVEN=0

usage() {
  sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) CLONE_DIR="$2"; DIR_GIVEN=1; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --no-open) OPEN_AFTER=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || fail "pretty-latex is a macOS app; this script runs on macOS only."

# ---- Prerequisites -------------------------------------------------------------
step "Checking prerequisites"
missing=()

have() { command -v "$1" >/dev/null 2>&1; }

# Is version $1 >= $2? (dotted numbers)
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$2" ]
}

xcode-select -p >/dev/null 2>&1 || missing+=("Xcode Command Line Tools — run: xcode-select --install")
have git || missing+=("git")

if have node; then
  node_version="$(node -v | sed 's/^v//')"
  # Vite 7 needs Node ^20.19 or >=22.12.
  if ! { version_ge "$node_version" "22.12.0" || { [ "${node_version%%.*}" = "20" ] && version_ge "$node_version" "20.19.0"; }; }; then
    missing+=("Node.js 20.19+ or 22.12+ (found $node_version)")
  fi
else
  missing+=("Node.js 20.19+ or 22.12+")
fi
have npm || missing+=("npm")
{ have cargo && have rustc; } || missing+=("Rust toolchain (cargo, rustc) — https://rustup.rs")

if [ ${#missing[@]} -gt 0 ]; then
  printf 'Missing:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  fail "Install the items above, then run this script again (details in INSTALL.md)."
fi
echo "git, Node $(node -v), npm $(npm -v), $(rustc --version | cut -d' ' -f1-2) — OK"

# TeX is needed to build documents, not to build the app: warn, don't stop.
tex_found=""
for dir in "" /Library/TeX/texbin /opt/homebrew/bin /usr/local/bin "$HOME/Library/TinyTeX/bin/universal-darwin"; do
  if [ -z "$dir" ]; then have latexmk && tex_found="$(command -v latexmk)"; else [ -x "$dir/latexmk" ] && tex_found="$dir/latexmk"; fi
  [ -n "$tex_found" ] && break
done
if [ -n "$tex_found" ]; then
  echo "latexmk: $tex_found — OK"
else
  echo "Note: no latexmk found. The app installs, but documents won't build until you install"
  echo "      a TeX distribution (MacTeX: brew install --cask mactex-no-gui). See INSTALL.md."
fi

# ---- Source --------------------------------------------------------------------
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
checkout="$(cd "$script_dir/.." && pwd)"

if [ "$DIR_GIVEN" = 0 ] && [ -f "$checkout/package.json" ] && grep -q '"name": "pretty-latex"' "$checkout/package.json"; then
  SRC="$checkout"
  step "Using this checkout: $SRC"
elif [ -d "$CLONE_DIR/.git" ]; then
  SRC="$CLONE_DIR"
  step "Updating $SRC"
  git -C "$SRC" checkout -q "$BRANCH"
  git -C "$SRC" pull --ff-only origin "$BRANCH"
else
  SRC="$CLONE_DIR"
  step "Cloning $REPO_URL into $SRC"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$SRC"
fi
cd "$SRC"

# ---- Build ---------------------------------------------------------------------
step "Installing JavaScript dependencies"
npm ci --no-audit --no-fund

step "Building the app (the first build compiles Rust crates and takes a few minutes)"
npx --no-install tauri build --bundles app

built="$SRC/src-tauri/target/release/bundle/macos/$APP_NAME.app"
[ -d "$built" ] || fail "Build finished but $built is missing."

# ---- Install -------------------------------------------------------------------
if [ -z "$DEST" ]; then
  DEST="/Applications"
  [ -w "$DEST" ] || DEST="$HOME/Applications"
fi
mkdir -p "$DEST"
target="$DEST/$APP_NAME.app"

if pgrep -xq "$APP_NAME"; then
  echo "Note: $APP_NAME is running — quit and reopen it to use the new version."
fi

step "Installing to $target"
rm -rf "$target"
ditto "$built" "$target"
# An ad-hoc signature keeps macOS from treating the copied bundle as damaged.
codesign --force --deep -s - "$target" >/dev/null 2>&1 || true

# Register with Launch Services so Finder offers it for .tex files ("Open With").
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
[ -x "$lsregister" ] && "$lsregister" -f "$target" || true

step "Done — $APP_NAME is installed at $target"
echo "Tip: right-click a .tex file → Get Info → Open with: $APP_NAME → Change All… to make it the default."

if [ "$OPEN_AFTER" = 1 ]; then
  open "$target"
fi
