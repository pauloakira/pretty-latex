//! SyncTeX: from a source line to its spot in the PDF (forward search, ⌘↵) and from a
//! point in the PDF back to its source line (inverse search, ⌘-click). Runs the `synctex`
//! tool that comes with TeX, against the `.synctex.gz` latexmk writes next to the PDF.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

/// A region on a PDF page, in PDF points from the page's top-left corner.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfSpot {
    /// 1-based.
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A place in a source file.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpot {
    pub file: String,
    /// 1-based.
    pub line: u32,
}

fn synctex(args: &[&str], cwd: &Path) -> Result<String, String> {
    let tex_dir = crate::latex::find_tex_dir(std::env::var_os("PATH").as_deref())
        .ok_or("TeX not found: install MacTeX or TinyTeX")?;
    let output = Command::new(tex_dir.join("synctex"))
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Couldn't run synctex: {e}"))?;
    // synctex exits non-zero when nothing matches; that's "no result", not an error.
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn dir_of(pdf: &str) -> PathBuf {
    Path::new(pdf)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
}

/// Where `line` of `file` ended up in `pdf`; None when SyncTeX has nothing for it (say,
/// a preamble line, or a build without SyncTeX data).
#[tauri::command]
pub async fn synctex_forward(
    pdf: String,
    file: String,
    line: u32,
) -> Result<Option<PdfSpot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input = format!("{line}:0:{file}");
        let out = synctex(&["view", "-i", &input, "-o", &pdf], &dir_of(&pdf))?;
        Ok(parse_view(&out))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The source line behind the point (`x`, `y`, PDF points from the top-left) on `page`.
#[tauri::command]
pub async fn synctex_inverse(
    pdf: String,
    page: u32,
    x: f64,
    y: f64,
) -> Result<Option<SourceSpot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = format!("{page}:{x:.2}:{y:.2}:{pdf}");
        let out = synctex(&["edit", "-o", &output], &dir_of(&pdf))?;
        Ok(parse_edit(&out))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `synctex view` lists one record per box the line produced; their union on the first
/// page is the spot (h: left, v: baseline, W/H: width and height).
fn parse_view(out: &str) -> Option<PdfSpot> {
    let mut records: Vec<[f64; 5]> = Vec::new();
    let mut current = [0.0f64; 5];
    let mut seen = 0u8;
    for line in out.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let slot = match key {
            "Page" => 0,
            "h" => 1,
            "v" => 2,
            "W" => 3,
            "H" => 4,
            _ => continue,
        };
        let Ok(number) = value.trim().parse::<f64>() else {
            continue;
        };
        if slot == 0 {
            if seen == 0b11111 {
                records.push(current);
            }
            current = [0.0; 5];
            seen = 0;
        }
        current[slot] = number;
        seen |= 1 << slot;
    }
    if seen == 0b11111 {
        records.push(current);
    }
    let page = records.first()?[0];
    let on_page: Vec<&[f64; 5]> = records.iter().filter(|r| r[0] == page).collect();
    let left = on_page.iter().map(|r| r[1]).fold(f64::INFINITY, f64::min);
    let right = on_page
        .iter()
        .map(|r| r[1] + r[3])
        .fold(f64::NEG_INFINITY, f64::max);
    let top = on_page
        .iter()
        .map(|r| r[2] - r[4])
        .fold(f64::INFINITY, f64::min);
    let bottom = on_page
        .iter()
        .map(|r| r[2])
        .fold(f64::NEG_INFINITY, f64::max);
    Some(PdfSpot {
        page: page as u32,
        x: left,
        y: top,
        width: (right - left).max(1.0),
        height: (bottom - top).max(1.0),
    })
}

fn parse_edit(out: &str) -> Option<SourceSpot> {
    let mut file = None;
    let mut line = None;
    for row in out.lines() {
        if let Some(input) = row.strip_prefix("Input:") {
            file = Some(clean(Path::new(input.trim())));
        } else if let Some(n) = row.strip_prefix("Line:") {
            line = n.trim().parse::<u32>().ok();
        }
        if file.is_some() && line.is_some() {
            break;
        }
    }
    Some(SourceSpot {
        file: file?,
        line: line?.max(1),
    })
}

/// `/p/./chapters/x.tex` → `/p/chapters/x.tex` (and `a/../b` → `b`), so it matches the
/// paths the editor has open.
fn clean(path: &Path) -> String {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unites_the_boxes_of_a_line_on_its_first_page() {
        let out = "This is SyncTeX\nSyncTeX result begin\nOutput:/p/build/x.pdf\nPage:32\nx:102.1\ny:261.0\nh:85.0\nv:263.5\nW:426.5\nH:9.9\nbefore:\nOutput:/p/build/x.pdf\nPage:32\nx:114.9\ny:277.3\nh:85.0\nv:278.5\nW:200.0\nH:10.0\nOutput:/p/build/x.pdf\nPage:33\nh:85.0\nv:100.0\nW:426.5\nH:9.9\nSyncTeX result end\n";
        let spot = parse_view(out).unwrap();
        assert_eq!(spot.page, 32);
        assert!((spot.x - 85.0).abs() < 1e-6);
        assert!((spot.y - 253.6).abs() < 1e-6);
        assert!((spot.width - 426.5).abs() < 1e-6);
        assert!((spot.height - (278.5 - 253.6)).abs() < 1e-6);
    }

    #[test]
    fn reads_the_source_line_and_cleans_its_path() {
        let out = "SyncTeX result begin\nOutput:/p/build/x.pdf\nInput:/p/./chapters/one.tex\nLine:272\nColumn:-1\nSyncTeX result end\n";
        assert_eq!(
            parse_edit(out),
            Some(SourceSpot {
                file: "/p/chapters/one.tex".into(),
                line: 272
            })
        );
    }

    #[test]
    fn has_no_spot_when_synctex_finds_nothing() {
        assert_eq!(
            parse_view("SyncTeX result begin\nSyncTeX result end\n"),
            None
        );
        assert_eq!(parse_edit("SyncTeX ERROR: nothing\n"), None);
    }

    #[test]
    fn round_trips_through_a_real_build() {
        // Needs a TeX install; skipped on machines (and CI) without one.
        let Some(tex) = crate::latex::find_tex_dir(std::env::var_os("PATH").as_deref()) else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        std::fs::create_dir(d.join("chapters")).unwrap();
        std::fs::write(
            d.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\nFirst page text.\n\\input{chapters/one}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(
            d.join("chapters/one.tex"),
            "\\newpage\nA line in the chapter.\n",
        )
        .unwrap();
        let status = Command::new(tex.join("latexmk"))
            .args([
                "-pdf",
                "-interaction=nonstopmode",
                "-synctex=1",
                "-outdir=build",
                "main.tex",
            ])
            .current_dir(d)
            .env(
                "PATH",
                format!(
                    "{}:{}",
                    tex.display(),
                    std::env::var("PATH").unwrap_or_default()
                ),
            )
            .output()
            .unwrap();
        assert!(status.status.success());
        let pdf = d.join("build/main.pdf").to_string_lossy().into_owned();
        let chapter = d.join("chapters/one.tex").to_string_lossy().into_owned();

        let spot = tauri::async_runtime::block_on(synctex_forward(pdf.clone(), chapter.clone(), 2))
            .unwrap()
            .unwrap();
        assert_eq!(spot.page, 2);

        let back = tauri::async_runtime::block_on(synctex_inverse(
            pdf,
            spot.page,
            spot.x + 5.0,
            spot.y + spot.height / 2.0,
        ))
        .unwrap()
        .unwrap();
        // macOS temp folders sit behind a /private symlink; compare the ends.
        assert!(back.file.ends_with("/chapters/one.tex"), "{}", back.file);
        assert_eq!(back.line, 2);
    }
}
