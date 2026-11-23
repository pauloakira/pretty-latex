//! LaTeX builds: find the TeX install, run `latexmk` with output in `build/`, cancel a
//! build a newer one replaced, and turn the log into file + line diagnostics.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime};

/// Where TeX distributions put their binaries on macOS. Apps started from Finder don't get
/// the shell's PATH, so `/Library/TeX/texbin` (MacTeX) is never on it.
const TEX_DIRS: &[&str] = &[
    "/Library/TeX/texbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/texbin",
];

/// Build output folder, next to the main file.
const OUT_DIR: &str = "build";

/// The running builds, one per main file, so a newer build of the same document can stop
/// the old one while other documents (other windows) keep building.
#[derive(Default)]
pub struct Builds {
    next_id: AtomicU64,
    /// Main file → (latest build id, process group of its latexmk once started). latexmk
    /// starts pdflatex, biber, … as children, so the whole group is stopped.
    running: Mutex<HashMap<String, (u64, Option<u32>)>>,
}

impl Builds {
    /// Registers a new build of `main`, stopping the one it replaces. Returns its id.
    fn begin(&self, main: &str) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let replaced = self
            .running
            .lock()
            .unwrap()
            .insert(main.to_string(), (id, None));
        if let Some((_, Some(group))) = replaced {
            stop_group(group);
        }
        id
    }

    /// Records the started process; false when a newer build already replaced this one.
    fn started(&self, main: &str, id: u64, group: u32) -> bool {
        match self.running.lock().unwrap().get_mut(main) {
            Some(entry) if entry.0 == id => {
                entry.1 = Some(group);
                true
            }
            _ => false,
        }
    }

    /// Ends build `id` of `main`; false when a newer build replaced it.
    fn finish(&self, main: &str, id: u64) -> bool {
        let mut running = self.running.lock().unwrap();
        if running.get(main).is_some_and(|entry| entry.0 == id) {
            running.remove(main);
            true
        } else {
            false
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    /// Absolute path, or the main file when the log doesn't say.
    pub file: String,
    /// 1-based; 0 when the log gives no line.
    pub line: u32,
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Serialize, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BuildOutcome {
    /// latexmk finished; `ok` is false when it failed or the log has errors.
    Done {
        ok: bool,
        seconds: f64,
        pdf: Option<String>,
        diagnostics: Vec<Diagnostic>,
    },
    /// A newer build replaced this one.
    Cancelled,
}

/// Builds `main` (a .tex file) with latexmk. Starting a build stops the running build of
/// the same file; builds of other files carry on.
#[tauri::command]
pub async fn build_latex(
    state: tauri::State<'_, Builds>,
    main: String,
) -> Result<BuildOutcome, String> {
    build(&state, main).await
}

async fn build(state: &Builds, main: String) -> Result<BuildOutcome, String> {
    let main_path = PathBuf::from(&main);
    let dir = main_path
        .parent()
        .ok_or_else(|| format!("{main} has no folder"))?
        .to_path_buf();
    let file_name = main_path
        .file_name()
        .ok_or_else(|| format!("{main} is not a file"))?
        .to_string_lossy()
        .into_owned();
    let tex_dir = find_tex_dir(std::env::var_os("PATH").as_deref()).ok_or_else(|| {
        "TeX not found: install MacTeX (tug.org/mactex) or TinyTeX, which provide latexmk"
            .to_string()
    })?;
    let source = std::fs::read_to_string(&main_path).unwrap_or_default();

    let id = state.begin(&main);

    let mut command = Command::new(tex_dir.join("latexmk"));
    command
        .current_dir(&dir)
        .args([
            engine_flag(&source),
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            "-synctex=1",
            &format!("-outdir={OUT_DIR}"),
            &file_name,
        ])
        .env("PATH", path_with(&tex_dir))
        // Stop TeX wrapping log lines at 79 characters, which splits messages and paths.
        .env("max_print_line", "10000")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let started = Instant::now();
    let started_at = SystemTime::now();
    let child = command
        .spawn()
        .map_err(|e| format!("Couldn't start latexmk: {e}"))?;
    if !state.started(&main, id, child.id()) {
        // Replaced while starting: stop this one at once.
        stop_group(child.id());
    }
    let output = tauri::async_runtime::spawn_blocking(move || child.wait_with_output())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("latexmk failed: {e}"))?;

    if !state.finish(&main, id) {
        return Ok(BuildOutcome::Cancelled);
    }

    let stem = main_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let out = dir.join(OUT_DIR);
    // A latexmkrc can rename the output ($jobname), so take what this build wrote.
    let log = output_file(&out, &stem, "log", Some(started_at))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default();
    let mut diagnostics = parse_log(&log, &dir, &main);
    let has_errors = diagnostics.iter().any(|d| d.severity == Severity::Error);
    if !output.status.success() && !has_errors {
        // Failed before TeX wrote anything useful (bad option, missing engine, …).
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("latexmk failed")
            .trim()
            .to_string();
        diagnostics.insert(
            0,
            Diagnostic {
                file: main.clone(),
                line: 0,
                severity: Severity::Error,
                message,
            },
        );
    }
    // A failed build leaves the last good PDF, which is still worth showing.
    let pdf = output_file(&out, &stem, "pdf", Some(started_at))
        .or_else(|| output_file(&out, &stem, "pdf", None));
    Ok(BuildOutcome::Done {
        ok: output.status.success() && !has_errors,
        seconds: started.elapsed().as_secs_f64(),
        pdf: pdf.map(|p| p.to_string_lossy().into_owned()),
        diagnostics,
    })
}

/// The `.ext` file in `out` for this build: `<stem>.ext` when it's there, else the newest
/// one. With `since`, only files written after it count.
fn output_file(out: &Path, stem: &str, ext: &str, since: Option<SystemTime>) -> Option<PathBuf> {
    let fresh = |path: &Path| -> Option<SystemTime> {
        let modified = path.metadata().ok()?.modified().ok()?;
        since.is_none_or(|t| modified >= t).then_some(modified)
    };
    let named = out.join(format!("{stem}.{ext}"));
    if fresh(&named).is_some() {
        return Some(named);
    }
    std::fs::read_dir(out)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == ext))
        .filter_map(|path| fresh(&path).map(|modified| (modified, path)))
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

/// The first folder with `latexmk` in it: the PATH, then the usual install places.
pub(crate) fn find_tex_dir(path: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = path
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    dirs.extend(TEX_DIRS.iter().map(PathBuf::from));
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(Path::new(&home).join("Library/TinyTeX/bin/universal-darwin"));
    }
    dirs.into_iter().find(|dir| dir.join("latexmk").is_file())
}

/// PATH with the TeX folder first, so latexmk finds pdflatex, biber, … next to it.
fn path_with(tex_dir: &Path) -> std::ffi::OsString {
    let mut dirs = vec![tex_dir.to_path_buf()];
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

/// latexmk's engine switch, from a `% !TEX program = …` line at the top of the file.
fn engine_flag(source: &str) -> &'static str {
    for line in source.lines().take(20) {
        let lower = line.to_lowercase();
        let Some(rest) = lower.trim_start().strip_prefix('%') else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(rest) = rest.strip_prefix("!tex") else {
            continue;
        };
        let Some((key, value)) = rest.split_once('=') else {
            continue;
        };
        if matches!(key.trim(), "program" | "ts-program") {
            return match value.trim() {
                "xelatex" => "-xelatex",
                "lualatex" => "-lualatex",
                _ => "-pdf",
            };
        }
    }
    "-pdf"
}

#[cfg(unix)]
fn stop_group(group: u32) {
    if let Ok(group) = i32::try_from(group) {
        // SAFETY: plain signal to a process group we started; a stale id just fails.
        unsafe {
            libc::killpg(group, libc::SIGTERM);
        }
    }
}

#[cfg(not(unix))]
fn stop_group(_group: u32) {}

/// Errors (`./file.tex:12: message`, written thanks to -file-line-error) and LaTeX or
/// package warnings (`… on input line 12.`) from a TeX log. Warnings don't name their
/// file, so they're put on the main file.
pub fn parse_log(log: &str, dir: &Path, main: &str) -> Vec<Diagnostic> {
    let mut out: Vec<Diagnostic> = Vec::new();
    for line in log.lines() {
        if let Some(diagnostic) = parse_error(line, dir) {
            if !out.contains(&diagnostic) {
                out.push(diagnostic);
            }
        } else if let Some(diagnostic) = parse_warning(line, main) {
            if !out.contains(&diagnostic) {
                out.push(diagnostic);
            }
        }
    }
    out
}

fn parse_error(line: &str, dir: &Path) -> Option<Diagnostic> {
    // "./chapters/intro.tex:12: Undefined control sequence."
    let (file, rest) = line.split_once(".tex:")?;
    let (number, message) = rest.split_once(": ")?;
    let line_number: u32 = number.parse().ok()?;
    let file = format!("{file}.tex");
    let path = if Path::new(&file).is_absolute() {
        PathBuf::from(&file)
    } else {
        dir.join(file.trim_start_matches("./"))
    };
    Some(Diagnostic {
        file: path.to_string_lossy().into_owned(),
        line: line_number,
        severity: Severity::Error,
        message: message
            .trim()
            .trim_start_matches("LaTeX Error: ")
            .to_string(),
    })
}

fn parse_warning(line: &str, main: &str) -> Option<Diagnostic> {
    // "LaTeX Warning: Reference `x' on page 1 undefined on input line 12."
    // "Package hyperref Warning: Token not allowed … on input line 5."
    let start = line.find("Warning: ")?;
    let head = &line[..start];
    if !(head.starts_with("LaTeX ") || head.starts_with("Package ") || head.starts_with("Class ")) {
        return None;
    }
    let message = line[start + "Warning: ".len()..].trim();
    let (text, line_number) = match message.rsplit_once(" on input line ") {
        Some((text, n)) => (text, n.trim_end_matches('.').parse().unwrap_or(0)),
        None => (message.trim_end_matches('.'), 0),
    };
    Some(Diagnostic {
        file: main.to_string(),
        line: line_number,
        severity: Severity::Warning,
        message: text.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOG: &str = "\
This is pdfTeX, Version 3.141592653
(./main.tex
LaTeX2e <2024-11-01>
(./chapters/intro.tex
./chapters/intro.tex:7: Undefined control sequence.
l.7 \\badmacro
)
LaTeX Warning: Reference `fig:plot' on page 1 undefined on input line 12.
Package hyperref Warning: Token not allowed in a PDF string on input line 3.
./main.tex:20: LaTeX Error: File `missing.sty' not found.
LaTeX Warning: There were undefined references.
./chapters/intro.tex:7: Undefined control sequence.
";

    #[test]
    fn reads_errors_and_warnings_from_a_log() {
        let found = parse_log(LOG, Path::new("/p"), "/p/main.tex");
        let summary: Vec<(&str, u32, Severity, &str)> = found
            .iter()
            .map(|d| (d.file.as_str(), d.line, d.severity, d.message.as_str()))
            .collect();
        assert_eq!(
            summary,
            [
                (
                    "/p/chapters/intro.tex",
                    7,
                    Severity::Error,
                    "Undefined control sequence."
                ),
                (
                    "/p/main.tex",
                    12,
                    Severity::Warning,
                    "Reference `fig:plot' on page 1 undefined"
                ),
                (
                    "/p/main.tex",
                    3,
                    Severity::Warning,
                    "Token not allowed in a PDF string"
                ),
                (
                    "/p/main.tex",
                    20,
                    Severity::Error,
                    "File `missing.sty' not found."
                ),
                (
                    "/p/main.tex",
                    0,
                    Severity::Warning,
                    "There were undefined references"
                ),
            ]
        );
    }

    #[test]
    fn picks_the_engine_from_a_magic_comment() {
        assert_eq!(engine_flag("\\documentclass{article}"), "-pdf");
        assert_eq!(
            engine_flag("% !TEX program = xelatex\n\\documentclass{article}"),
            "-xelatex"
        );
        assert_eq!(engine_flag("%!TEX TS-program = LuaLaTeX\n"), "-lualatex");
    }

    #[test]
    fn finds_latexmk_on_the_path_first() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("latexmk"), "").unwrap();
        let found = find_tex_dir(Some(dir.path().as_os_str()));
        assert_eq!(found.as_deref(), Some(dir.path()));
    }

    #[test]
    fn builds_a_document_into_the_build_folder() {
        // Needs a TeX install; skipped on machines (and CI) without one.
        if find_tex_dir(std::env::var_os("PATH").as_deref()).is_none() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("doc.tex");
        std::fs::write(
            &main,
            "\\documentclass{article}\\begin{document}Hi \\undefinedthing\\end{document}\n",
        )
        .unwrap();
        let state = Builds::default();
        let outcome =
            tauri::async_runtime::block_on(build(&state, main.to_string_lossy().into_owned()))
                .unwrap();
        match outcome {
            BuildOutcome::Done {
                ok, diagnostics, ..
            } => {
                assert!(!ok);
                assert_eq!(diagnostics[0].line, 1);
                assert!(diagnostics[0]
                    .message
                    .contains("Undefined control sequence"));
            }
            BuildOutcome::Cancelled => panic!("not cancelled"),
        }
        assert!(dir.path().join("build/doc.log").is_file());
    }

    #[test]
    fn follows_a_jobname_set_in_latexmkrc() {
        if find_tex_dir(std::env::var_os("PATH").as_deref()).is_none() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".latexmkrc"), "$jobname = 'thesis';\n").unwrap();
        let main = dir.path().join("main.tex");
        std::fs::write(
            &main,
            "\\documentclass{article}\\begin{document}Hi\\end{document}\n",
        )
        .unwrap();
        let state = Builds::default();
        let outcome =
            tauri::async_runtime::block_on(build(&state, main.to_string_lossy().into_owned()))
                .unwrap();
        match outcome {
            BuildOutcome::Done { ok, pdf, .. } => {
                assert!(ok);
                assert!(pdf.unwrap().ends_with("build/thesis.pdf"));
            }
            BuildOutcome::Cancelled => panic!("not cancelled"),
        }
    }

    #[test]
    fn a_new_build_replaces_only_the_same_document() {
        let builds = Builds::default();
        let a1 = builds.begin("/a/main.tex");
        let b1 = builds.begin("/b/main.tex");
        let a2 = builds.begin("/a/main.tex");
        // The newer build of /a replaced the first; /b is untouched.
        assert!(!builds.started("/a/main.tex", a1, 0));
        assert!(!builds.finish("/a/main.tex", a1));
        assert!(builds.finish("/b/main.tex", b1));
        assert!(builds.finish("/a/main.tex", a2));
    }

    #[test]
    fn prefers_the_named_output_then_the_newest() {
        let out = tempfile::tempdir().unwrap();
        let o = out.path();
        assert_eq!(output_file(o, "main", "pdf", None), None);
        std::fs::write(o.join("thesis.pdf"), "").unwrap();
        assert_eq!(
            output_file(o, "main", "pdf", None),
            Some(o.join("thesis.pdf"))
        );
        std::fs::write(o.join("main.pdf"), "").unwrap();
        assert_eq!(
            output_file(o, "main", "pdf", None),
            Some(o.join("main.pdf"))
        );
        let later = SystemTime::now() + std::time::Duration::from_secs(60);
        assert_eq!(output_file(o, "main", "pdf", Some(later)), None);
    }
}
