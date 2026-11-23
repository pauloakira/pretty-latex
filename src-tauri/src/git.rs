//! Git for the side panel: status of the open folder's repository, commit, push. Runs the
//! `git` command line, so the user's config, ignore rules, SSH keys and keychain
//! credentials apply as in the terminal.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

/// Where git lives on macOS. Apps started from Finder don't get the shell's PATH, so the
/// Homebrew one is never on it; `/usr/bin/git` is Apple's (needs the command line tools).
const GIT_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// The repository's top folder.
    pub root: String,
    /// None on a detached HEAD.
    pub branch: Option<String>,
    /// The branch it pushes to, e.g. `origin/main`; None until first pushed.
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// Whether a remote is configured at all (push needs one).
    pub has_remote: bool,
    pub files: Vec<GitFile>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    /// Relative to the repository root.
    pub path: String,
    /// One letter: M modified, A added, D deleted, R renamed, U conflict, ? untracked.
    pub status: String,
}

fn git_binary() -> PathBuf {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    dirs.extend(GIT_DIRS.iter().map(PathBuf::from));
    dirs.into_iter()
        .map(|dir| dir.join("git"))
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("git"))
}

fn git(dir: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new(git_binary())
        .arg("-C")
        .arg(dir)
        .args(args)
        // Never wait on a password prompt nobody can see: fail with git's message instead.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Couldn't run git: {e}"))
}

/// Stdout on success, else git's own message (its last meaningful lines).
fn run(dir: &Path, args: &[&str]) -> Result<String, String> {
    let output = git(dir, args)?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    Err(failure(&output))
}

fn failure(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let text = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("hint:"))
        .collect();
    let tail = &lines[lines.len().saturating_sub(2)..];
    let message = tail.join(" ");
    let message = message
        .trim_start_matches("fatal: ")
        .trim_start_matches("error: ");
    if message.is_empty() {
        "git failed".into()
    } else {
        message.to_string()
    }
}

/// The repository containing `path`, or None when it isn't in one.
#[tauri::command]
pub async fn git_status(path: String) -> Result<Option<GitStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || status(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

fn status(path: &Path) -> Result<Option<GitStatus>, String> {
    let Ok(top) = run(path, &["rev-parse", "--show-toplevel"]) else {
        return Ok(None);
    };
    let root = PathBuf::from(top.trim());
    let porcelain = run(
        &root,
        &[
            "status",
            "--porcelain=v1",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let remotes = run(&root, &["remote"]).unwrap_or_default();
    let mut parsed = parse_status(&porcelain);
    parsed.root = root.to_string_lossy().into_owned();
    parsed.has_remote = !remotes.trim().is_empty();
    Ok(Some(parsed))
}

/// Parses `git status --porcelain=v1 --branch -z`.
fn parse_status(text: &str) -> GitStatus {
    let mut status = GitStatus {
        root: String::new(),
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        has_remote: false,
        files: Vec::new(),
    };
    let mut entries = text.split('\0').filter(|e| !e.is_empty());
    while let Some(entry) = entries.next() {
        if let Some(head) = entry.strip_prefix("## ") {
            parse_branch(head, &mut status);
            continue;
        }
        if entry.len() < 4 {
            continue;
        }
        let (code, path) = entry.split_at(3);
        let mut chars = code.chars();
        let (x, y) = (chars.next().unwrap_or(' '), chars.next().unwrap_or(' '));
        // A rename's old path follows as its own entry.
        if x == 'R' || x == 'C' {
            entries.next();
        }
        let letter = match (x, y) {
            ('?', _) => '?',
            ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D') => 'U',
            ('R', _) | ('C', _) => 'R',
            ('A', _) => 'A',
            ('D', _) | (_, 'D') => 'D',
            _ => 'M',
        };
        status.files.push(GitFile {
            path: path.to_string(),
            status: letter.to_string(),
        });
    }
    status
}

fn parse_branch(head: &str, status: &mut GitStatus) {
    // "main", "main...origin/main [ahead 1, behind 2]", "No commits yet on main",
    // "HEAD (no branch)".
    if let Some(name) = head.strip_prefix("No commits yet on ") {
        status.branch = Some(name.to_string());
        return;
    }
    if head.starts_with("HEAD (no branch)") {
        return;
    }
    let (names, counts) = match head.split_once(" [") {
        Some((names, counts)) => (names, counts.trim_end_matches(']')),
        None => (head, ""),
    };
    match names.split_once("...") {
        Some((branch, upstream)) => {
            status.branch = Some(branch.to_string());
            status.upstream = Some(upstream.to_string());
        }
        None => status.branch = Some(names.to_string()),
    }
    for part in counts.split(", ") {
        if let Some(n) = part.strip_prefix("ahead ") {
            status.ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            status.behind = n.parse().unwrap_or(0);
        }
    }
}

/// Commits exactly `paths` (relative to `root`; new, changed or deleted) with `message`.
/// Anything else already staged stays staged and out of this commit. Returns the short
/// hash.
#[tauri::command]
pub async fn git_commit(
    root: String,
    message: String,
    paths: Vec<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || commit(Path::new(&root), &message, &paths))
        .await
        .map_err(|e| e.to_string())?
}

fn commit(root: &Path, message: &str, paths: &[String]) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Write a commit message first".into());
    }
    if paths.is_empty() {
        return Err("Nothing selected to commit".into());
    }
    let mut add = vec!["add", "-A", "--"];
    add.extend(paths.iter().map(String::as_str));
    run(root, &add)?;
    let mut commit = vec!["commit", "-m", message, "--"];
    commit.extend(paths.iter().map(String::as_str));
    run(root, &commit)?;
    Ok(run(root, &["rev-parse", "--short", "HEAD"])?
        .trim()
        .to_string())
}

/// Pushes the current branch. The first push of a branch sets its upstream on `origin`
/// (or the only remote). Returns where it pushed, e.g. `origin/main`.
#[tauri::command]
pub async fn git_push(root: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || push(Path::new(&root)))
        .await
        .map_err(|e| e.to_string())?
}

fn push(root: &Path) -> Result<String, String> {
    let current = status(root)?.ok_or("Not a git repository")?;
    let branch = current
        .branch
        .ok_or("Not on a branch (detached HEAD): check out a branch to push")?;
    if let Some(upstream) = current.upstream {
        run(root, &["push"])?;
        return Ok(upstream);
    }
    let remotes = run(root, &["remote"])?;
    let remotes: Vec<&str> = remotes
        .lines()
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .collect();
    let remote = if remotes.contains(&"origin") {
        "origin"
    } else if remotes.len() == 1 {
        remotes[0]
    } else if remotes.is_empty() {
        return Err("No remote to push to: add one with git remote add origin <url>".into());
    } else {
        return Err("Several remotes and none is origin: push once from the terminal".into());
    };
    run(root, &["push", "-u", remote, "HEAD"])?;
    Ok(format!("{remote}/{branch}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sh(dir: &Path, args: &[&str]) {
        let out = git(dir, args).unwrap();
        assert!(out.status.success(), "git {args:?}: {}", failure(&out));
    }

    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        sh(d, &["init", "-q", "-b", "main"]);
        sh(d, &["config", "user.email", "test@example.com"]);
        sh(d, &["config", "user.name", "Test"]);
        sh(d, &["config", "commit.gpgsign", "false"]);
        dir
    }

    #[test]
    fn parses_branch_lines() {
        let s = parse_status("## main...origin/main [ahead 2, behind 1]\0");
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert_eq!(s.upstream.as_deref(), Some("origin/main"));
        assert_eq!((s.ahead, s.behind), (2, 1));
        assert_eq!(
            parse_status("## No commits yet on main\0")
                .branch
                .as_deref(),
            Some("main")
        );
        assert_eq!(parse_status("## HEAD (no branch)\0").branch, None);
        let plain = parse_status("## draft\0");
        assert_eq!(
            (plain.branch.as_deref(), plain.upstream),
            (Some("draft"), None)
        );
    }

    #[test]
    fn parses_file_entries_including_renames() {
        let s = parse_status(" M a.tex\0?? new.tex\0R  b.tex\0old.tex\0 D gone.tex\0UU c.tex\0");
        let files: Vec<(&str, &str)> = s
            .files
            .iter()
            .map(|f| (f.path.as_str(), f.status.as_str()))
            .collect();
        assert_eq!(
            files,
            [
                ("a.tex", "M"),
                ("new.tex", "?"),
                ("b.tex", "R"),
                ("gone.tex", "D"),
                ("c.tex", "U")
            ]
        );
    }

    #[test]
    fn is_none_outside_a_repository() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(status(dir.path()).unwrap(), None);
    }

    #[test]
    fn commits_only_the_chosen_files_and_pushes_a_new_branch() {
        let repo = repo();
        let r = repo.path();
        fs::write(r.join("main.tex"), "a").unwrap();
        fs::write(r.join("notes.txt"), "b").unwrap();
        fs::create_dir(r.join("chapters")).unwrap();
        fs::write(r.join("chapters/one.tex"), "c").unwrap();

        // Found from a subfolder too.
        let s = status(&r.join("chapters")).unwrap().unwrap();
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert!(!s.has_remote);
        let mut paths: Vec<&str> = s.files.iter().map(|f| f.path.as_str()).collect();
        paths.sort();
        // New files are listed one by one, not folded into their folder.
        assert_eq!(paths, ["chapters/one.tex", "main.tex", "notes.txt"]);

        let hash = commit(
            r,
            "First draft",
            &["main.tex".into(), "chapters/one.tex".into()],
        )
        .unwrap();
        assert!(!hash.is_empty());
        let after = status(r).unwrap().unwrap();
        let left: Vec<&str> = after.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(left, ["notes.txt"]);

        assert!(push(r).unwrap_err().contains("No remote"));
        let remote = tempfile::tempdir().unwrap();
        sh(remote.path(), &["init", "-q", "--bare"]);
        sh(
            r,
            &["remote", "add", "origin", &remote.path().to_string_lossy()],
        );
        assert_eq!(push(r).unwrap(), "origin/main");
        let pushed = status(r).unwrap().unwrap();
        assert_eq!(pushed.upstream.as_deref(), Some("origin/main"));
        assert_eq!(pushed.ahead, 0);

        // A second commit is ahead by one, and a plain push sends it.
        fs::write(r.join("main.tex"), "a2").unwrap();
        commit(r, "Edit", &["main.tex".into()]).unwrap();
        assert_eq!(status(r).unwrap().unwrap().ahead, 1);
        assert_eq!(push(r).unwrap(), "origin/main");
        assert_eq!(status(r).unwrap().unwrap().ahead, 0);
    }

    #[test]
    fn refuses_an_empty_message_or_selection() {
        let repo = repo();
        assert!(commit(repo.path(), "  ", &["a".into()]).is_err());
        assert!(commit(repo.path(), "msg", &[]).is_err());
    }

    #[test]
    fn reports_git_errors_in_its_own_words() {
        let repo = repo();
        let error = commit(repo.path(), "msg", &["missing.tex".into()]).unwrap_err();
        assert!(error.contains("missing.tex"), "{error}");
    }
}
