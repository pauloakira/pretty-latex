//! File commands: read and write source files, list a project folder for the file tree,
//! (Sessions, one per window, live in `windows`.)

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Extensions the file tree shows: the files you edit in a LaTeX project. Build output
/// (.aux, .log, .pdf, …) and images stay hidden.
const SOURCE_EXTENSIONS: &[&str] = &[
    "tex", "ltx", "bib", "sty", "cls", "bst", "bbx", "cbx", "dtx", "ins", "txt", "md",
];

/// Folders never worth listing, on top of hidden ones.
const SKIPPED_DIRS: &[&str] = &["node_modules", "target"];

/// Stop listing past this depth or entry count, so opening a huge folder by mistake
/// (say, the home folder) stays quick.
const MAX_DEPTH: usize = 12;
const MAX_ENTRIES: usize = 10_000;

/// One file or folder in the project tree.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<Entry>,
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Couldn't read {path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Couldn't save {path}: {e}"))
}

/// A file's raw bytes (the built PDF). A raw IPC response reaches the frontend as an
/// `ArrayBuffer`, not a JSON array of numbers, so a large PDF crosses the bridge cheaply.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("Couldn't read {path}: {e}"))
}

/// The source files under `root`, folders first, then alphabetical. Folders with no
/// source files in them are left out.
#[tauri::command]
pub fn list_project(root: String) -> Result<Vec<Entry>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("{root} is not a folder"));
    }
    let mut budget = MAX_ENTRIES;
    Ok(list_dir(root_path, 0, &mut budget))
}

fn list_dir(dir: &Path, depth: usize, budget: &mut usize) -> Vec<Entry> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for item in read.flatten() {
        if *budget == 0 {
            break;
        }
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        // symlink_metadata: don't follow links, so a link loop can't recurse forever.
        let Ok(meta) = item.path().symlink_metadata() else {
            continue;
        };
        let path = item.path();
        if meta.is_dir() {
            if depth + 1 >= MAX_DEPTH || SKIPPED_DIRS.contains(&name.as_str()) {
                continue;
            }
            let children = list_dir(&path, depth + 1, budget);
            if !children.is_empty() {
                *budget = budget.saturating_sub(1);
                dirs.push(entry(name, path, true, children));
            }
        } else if is_source(&path) {
            *budget -= 1;
            files.push(entry(name, path, false, Vec::new()));
        }
    }
    let by_name = |a: &Entry, b: &Entry| a.name.to_lowercase().cmp(&b.name.to_lowercase());
    dirs.sort_by(by_name);
    files.sort_by(by_name);
    dirs.extend(files);
    dirs
}

fn entry(name: String, path: PathBuf, is_dir: bool, children: Vec<Entry>) -> Entry {
    Entry {
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir,
        children,
    }
}

fn is_source(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| SOURCE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn names(entries: &[Entry]) -> Vec<&str> {
        entries.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn lists_source_files_folders_first_and_hides_the_rest() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        fs::write(r.join("main.tex"), "").unwrap();
        fs::write(r.join("Refs.bib"), "").unwrap();
        fs::write(r.join("main.aux"), "").unwrap();
        fs::write(r.join("main.pdf"), "").unwrap();
        fs::write(r.join(".latexmkrc"), "").unwrap();
        fs::create_dir(r.join("chapters")).unwrap();
        fs::write(r.join("chapters/intro.tex"), "").unwrap();
        fs::create_dir(r.join("figures")).unwrap();
        fs::write(r.join("figures/plot.png"), "").unwrap();
        fs::create_dir(r.join(".git")).unwrap();
        fs::write(r.join(".git/notes.txt"), "").unwrap();

        let tree = list_project(r.to_string_lossy().into_owned()).unwrap();

        assert_eq!(names(&tree), ["chapters", "main.tex", "Refs.bib"]);
        assert!(tree[0].is_dir);
        assert_eq!(names(&tree[0].children), ["intro.tex"]);
        assert!(tree[0].children[0].path.ends_with("chapters/intro.tex"));
    }

    #[test]
    fn rejects_a_path_that_is_not_a_folder() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("main.tex");
        fs::write(&file, "").unwrap();
        assert!(list_project(file.to_string_lossy().into_owned()).is_err());
    }

    #[test]
    fn reads_back_what_it_writes() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("a.tex").to_string_lossy().into_owned();
        write_text_file(path.clone(), "\\section{A}\n".into()).unwrap();
        assert_eq!(read_text_file(path).unwrap(), "\\section{A}\n");
    }

    #[test]
    fn says_which_file_it_could_not_read() {
        let error = read_text_file("/nonexistent/x.tex".into()).unwrap_err();
        assert!(error.contains("/nonexistent/x.tex"));
    }
}
