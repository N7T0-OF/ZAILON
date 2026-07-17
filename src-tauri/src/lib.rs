use serde::Serialize;
use std::{
    fs,
    io::{copy, Cursor},
    path::{Path, PathBuf},
    process::Command,
};
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMod {
    id: String,
    name: String,
    path: String,
    enabled: bool,
    mod_type: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedGame {
    name: String,
    exec_path: String,
    mods_path: String,
    platform: String,
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn mod_type(path: &Path) -> String {
    if path.is_dir() {
        return "Folder".into();
    }

    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pak" => "UE5".into(),
        "asi" => "ASI".into(),
        "dll" => "DLL".into(),
        "zip" | "7z" | "rar" => "Archive".into(),
        _ => "Manual".into(),
    }
}

fn entry_size(path: &Path) -> u64 {
    if path.is_file() {
        return fs::metadata(path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
    }

    WalkDir::new(path)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| entry.metadata().ok().map(|metadata| metadata.len()))
        .sum()
}

fn normalized_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .trim_start_matches("DISABLED_")
        .to_string()
}

fn steam_common_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let home = dirs::home_dir();

    #[cfg(target_os = "windows")]
    {
        roots.push(PathBuf::from(
            r"C:\Program Files (x86)\Steam\steamapps\common",
        ));
        roots.push(PathBuf::from(r"C:\Program Files\Steam\steamapps\common"));
    }

    #[cfg(target_os = "linux")]
    if let Some(home) = &home {
        roots.push(home.join(".steam/steam/steamapps/common"));
        roots.push(home.join(".local/share/Steam/steamapps/common"));
    }

    #[cfg(target_os = "macos")]
    if let Some(home) = &home {
        roots.push(home.join("Library/Application Support/Steam/steamapps/common"));
    }

    let libraries: Vec<PathBuf> = roots
        .iter()
        .filter_map(|root| root.parent().map(Path::to_path_buf))
        .collect();

    for library in libraries {
        let vdf = library.join("libraryfolders.vdf");
        let Ok(contents) = fs::read_to_string(vdf) else {
            continue;
        };
        for line in contents.lines().filter(|line| line.contains("\"path\"")) {
            let values: Vec<_> = line
                .split('"')
                .filter(|value| !value.trim().is_empty())
                .collect();
            if values.len() >= 2 && values[0].trim() == "path" {
                roots.push(PathBuf::from(values[1].replace("\\\\", "\\")).join("steamapps/common"));
            }
        }
    }

    roots.sort();
    roots.dedup();
    roots
}

fn first_executable(directory: &Path) -> Option<PathBuf> {
    WalkDir::new(directory)
        .max_depth(4)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .find(|path| {
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if file_name.contains("unins") || file_name.contains("crashreport") {
                return false;
            }
            #[cfg(target_os = "windows")]
            {
                return path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
            }
            #[cfg(not(target_os = "windows"))]
            {
                return true;
            }
        })
}

#[tauri::command]
fn scan_mods(mods_path: String) -> Result<Vec<NativeMod>, String> {
    let folder = PathBuf::from(mods_path);
    if !folder.exists() {
        return Ok(Vec::new());
    }

    Ok(fs::read_dir(&folder)
        .map_err(to_error)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let file_name = path.file_name()?.to_str()?.to_string();
            if file_name.starts_with('.') {
                return None;
            }
            let enabled = !file_name.starts_with("DISABLED_");
            Some(NativeMod {
                id: path.to_string_lossy().to_string(),
                name: normalized_name(&path),
                path: path.to_string_lossy().to_string(),
                enabled,
                mod_type: mod_type(&path),
                size_bytes: entry_size(&path),
            })
        })
        .collect::<Vec<_>>())
}

#[tauri::command]
fn toggle_mod(mod_path: String, enable: bool) -> Result<String, String> {
    let source = PathBuf::from(mod_path);
    let parent = source
        .parent()
        .ok_or_else(|| "Invalid mod path".to_string())?;
    let current_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid mod name".to_string())?;
    let target_name = if enable {
        current_name
            .strip_prefix("DISABLED_")
            .unwrap_or(current_name)
            .to_string()
    } else if current_name.starts_with("DISABLED_") {
        current_name.to_string()
    } else {
        format!("DISABLED_{current_name}")
    };
    let target = parent.join(target_name);

    if target != source {
        fs::rename(&source, &target).map_err(to_error)?;
    }
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_mod(mod_path: String) -> Result<(), String> {
    let path = PathBuf::from(mod_path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(to_error)
    } else {
        fs::remove_file(path).map_err(to_error)
    }
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(path).map_err(to_error)
}

#[tauri::command]
fn launch_game(exec_path: String) -> Result<(), String> {
    let executable = PathBuf::from(exec_path);
    if !executable.is_file() {
        return Err("The game executable was not found.".into());
    }
    Command::new(&executable)
        .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
        .spawn()
        .map_err(to_error)?;
    Ok(())
}

#[tauri::command]
fn guess_mods_path(exec_path: String) -> String {
    let executable = PathBuf::from(exec_path);
    let base = executable.parent().unwrap_or_else(|| Path::new("."));
    let mut candidates = vec![base.join("mods"), base.join("Mods"), base.join("~mods")];
    for ancestor in base.ancestors().take(5) {
        candidates.push(ancestor.join("Content/Paks/~mods"));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .unwrap_or_else(|| base.join("mods"))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn detect_games() -> Vec<DetectedGame> {
    steam_common_roots()
        .into_iter()
        .filter(|root| root.is_dir())
        .flat_map(|root| {
            fs::read_dir(root)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
        })
        .filter_map(|entry| {
            let directory = entry.path();
            let executable = first_executable(&directory)?;
            let name = directory.file_name()?.to_string_lossy().to_string();
            let mods_path = guess_mods_path(executable.to_string_lossy().to_string());
            Some(DetectedGame {
                name,
                exec_path: executable.to_string_lossy().to_string(),
                mods_path,
                platform: "steam".into(),
            })
        })
        .collect()
}

#[tauri::command]
async fn install_mod(url: String, file_name: String, mods_path: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("Only HTTPS mod downloads are allowed.".into());
    }
    let destination = PathBuf::from(mods_path);
    fs::create_dir_all(&destination).map_err(to_error)?;

    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid mod file name".to_string())?
        .to_string();
    let bytes = reqwest::get(url)
        .await
        .map_err(to_error)?
        .error_for_status()
        .map_err(to_error)?
        .bytes()
        .await
        .map_err(to_error)?;

    if safe_name.to_ascii_lowercase().ends_with(".zip") {
        let archive_path = destination.join(&safe_name);
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(to_error)?;
        let extract_root = destination.join(Path::new(&safe_name).file_stem().unwrap_or_default());
        fs::create_dir_all(&extract_root).map_err(to_error)?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(to_error)?;
            let Some(relative_path) = entry.enclosed_name().map(Path::to_path_buf) else {
                continue;
            };
            let output = extract_root.join(relative_path);
            if entry.is_dir() {
                fs::create_dir_all(&output).map_err(to_error)?;
            } else {
                if let Some(parent) = output.parent() {
                    fs::create_dir_all(parent).map_err(to_error)?;
                }
                let mut file = fs::File::create(&output).map_err(to_error)?;
                copy(&mut entry, &mut file).map_err(to_error)?;
            }
        }
        let _ = archive_path;
        Ok(extract_root.to_string_lossy().to_string())
    } else {
        let output = destination.join(safe_name);
        fs::write(&output, bytes).map_err(to_error)?;
        Ok(output.to_string_lossy().to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_mods,
            toggle_mod,
            delete_mod,
            ensure_dir,
            launch_game,
            guess_mods_path,
            detect_games,
            install_mod
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZAILON");
}
