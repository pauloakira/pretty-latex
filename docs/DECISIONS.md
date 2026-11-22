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
