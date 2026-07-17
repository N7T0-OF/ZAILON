use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{copy, Cursor, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use steamlocate::{Library, SteamDir};
#[cfg(desktop)]
use tauri::{ipc::Channel, State};
#[cfg(desktop)]
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMod {
    id: String,
    name: String,
    path: String,
    enabled: bool,
    mod_type: String,
    size_bytes: u64,
    files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedGame {
    name: String,
    exec_path: String,
    mods_path: String,
    platform: String,
    provider: String,
    provider_game_id: Option<String>,
    install_directory: String,
    steam_library: Option<String>,
    executable_candidates: Vec<DetectedExecutable>,
    size_bytes: Option<u64>,
    last_updated: Option<u64>,
    build_id: Option<String>,
    needs_executable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedExecutable {
    path: String,
    name: String,
    size_bytes: u64,
}

#[cfg(desktop)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SteamScanDiagnostics {
    steam_path: String,
    libraries: Vec<String>,
    manifests_found: usize,
    manifest_errors: usize,
    skipped_non_games: usize,
}

#[cfg(desktop)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SteamScan {
    games: Vec<DetectedGame>,
    diagnostics: SteamScanDiagnostics,
}

#[cfg(desktop)]
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
enum SteamScanEvent {
    #[serde(rename_all = "camelCase")]
    Stage { stage: String, detail: String },
    #[serde(rename_all = "camelCase")]
    Progress { current: usize, total: usize },
}

#[cfg(desktop)]
struct PendingUpdate(Mutex<Option<Update>>);

#[cfg(desktop)]
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    prerelease: bool,
    draft: bool,
    assets: Vec<GitHubReleaseAsset>,
}

#[cfg(desktop)]
#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[cfg(desktop)]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMetadata {
    version: String,
    current_version: String,
    date: Option<String>,
    notes: Option<String>,
}

#[cfg(desktop)]
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
enum UpdateDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn update_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_local_data_dir().map_err(to_error)?;
    fs::create_dir_all(&root).map_err(to_error)?;
    Ok(root)
}

fn safe_game_id(game_id: &str) -> Result<&str, String> {
    if game_id.is_empty()
        || game_id.len() > 128
        || !game_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("Invalid game identifier.".into());
    }
    Ok(game_id)
}

fn game_resource_directory(app: &tauri::AppHandle, game_id: &str) -> Result<PathBuf, String> {
    let game_id = safe_game_id(game_id)?;
    let directory = update_data_root(app)?
        .join("games")
        .join(game_id)
        .join("resources");
    fs::create_dir_all(&directory).map_err(to_error)?;
    Ok(directory)
}

fn allowed_resource_extension(kind: &str, extension: &str) -> bool {
    let extension = extension.to_ascii_lowercase();
    match kind {
        "cover" | "logo" | "icon" | "background" | "banner" => {
            matches!(
                extension.as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "avif" | "gif"
            )
        }
        "video" => matches!(extension.as_str(), "mp4" | "webm"),
        _ => false,
    }
}

#[tauri::command]
fn store_game_resource(
    app: AppHandle,
    game_id: String,
    kind: String,
    source_path: String,
) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    let metadata = fs::metadata(&source).map_err(to_error)?;
    if !metadata.is_file() {
        return Err("The selected resource must be a file.".into());
    }
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .ok_or_else(|| "The resource has no supported file extension.".to_string())?;
    if !allowed_resource_extension(&kind, extension) {
        return Err("Unsupported resource type for this slot.".into());
    }
    let byte_limit = if kind == "video" {
        350 * 1024 * 1024
    } else {
        50 * 1024 * 1024
    };
    if metadata.len() > byte_limit {
        return Err("The selected resource exceeds the allowed local size limit.".into());
    }
    let directory = game_resource_directory(&app, &game_id)?;
    let mut destination = directory.join(format!(
        "{kind}-{}.{}",
        unix_timestamp(),
        extension.to_ascii_lowercase()
    ));
    let mut suffix = 1;
    while destination.exists() {
        destination = directory.join(format!(
            "{kind}-{}-{suffix}.{}",
            unix_timestamp(),
            extension.to_ascii_lowercase()
        ));
        suffix += 1;
    }
    fs::copy(source, &destination).map_err(to_error)?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn remove_game_resource(
    app: AppHandle,
    game_id: String,
    resource_path: String,
) -> Result<(), String> {
    let root = game_resource_directory(&app, &game_id)?
        .canonicalize()
        .map_err(to_error)?;
    let resource = PathBuf::from(resource_path)
        .canonicalize()
        .map_err(to_error)?;
    if !resource.starts_with(&root) || !resource.is_file() {
        return Err("Resource path is outside of this game's local resource directory.".into());
    }
    fs::remove_file(resource).map_err(to_error)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("The requested path does not exist.".into());
    }
    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(to_error)?;
    #[cfg(target_os = "macos")]
    Command::new("open").arg(path).spawn().map_err(to_error)?;
    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(to_error)?;
    Ok(())
}

fn append_update_log(root: &Path, entry: serde_json::Value) -> Result<(), String> {
    let log_path = root.join("update-log.jsonl");
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(to_error)?;
    writeln!(log, "{}", serde_json::to_string(&entry).map_err(to_error)?).map_err(to_error)
}

fn prune_update_backups(backups_path: &Path) -> Result<(), String> {
    let mut backups = fs::read_dir(backups_path)
        .map_err(to_error)?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| {
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(UNIX_EPOCH);
            (modified, entry.path())
        })
        .collect::<Vec<_>>();
    backups.sort_by(|left, right| right.0.cmp(&left.0));
    for (_, path) in backups.into_iter().skip(3) {
        fs::remove_dir_all(path).map_err(to_error)?;
    }
    Ok(())
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

fn mod_files(path: &Path) -> Vec<String> {
    if path.is_file() {
        return path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| vec![name.to_string()])
            .unwrap_or_default();
    }
    WalkDir::new(path)
        .min_depth(1)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            entry
                .path()
                .strip_prefix(path)
                .ok()
                .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        })
        .collect()
}

fn normalized_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .trim_start_matches("DISABLED_")
        .to_string()
}

#[cfg(desktop)]
fn steam_installation(input: Option<String>) -> Result<SteamDir, String> {
    match input.filter(|path| !path.trim().is_empty()) {
        Some(path) => {
            let selected = PathBuf::from(path);
            let root = if selected
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("steamapps"))
            {
                selected.parent().map(Path::to_path_buf).unwrap_or(selected)
            } else {
                selected
            };
            SteamDir::from_dir(&root).map_err(to_error)
        }
        None => SteamDir::locate().map_err(to_error),
    }
}

#[cfg(desktop)]
fn is_steam_runtime_or_tool(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    [
        "steam linux runtime",
        "steamworks common redistributables",
        "proton",
        "steamvr",
        "directx",
        "visual c++",
        "dedicated server",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

#[cfg(desktop)]
fn executable_score(path: &Path, install_directory: &Path, game_name: &str) -> i32 {
    let relative_depth = path
        .strip_prefix(install_directory)
        .ok()
        .map(|relative| relative.components().count())
        .unwrap_or(9) as i32;
    let file_name = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let compact_game_name: String = game_name
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    let compact_file_name: String = file_name
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect();
    let mut score = 100 - relative_depth * 12;
    if relative_depth == 1 {
        score += 45;
    }
    if compact_game_name.len() > 3
        && (compact_file_name.contains(&compact_game_name)
            || compact_game_name.contains(&compact_file_name))
    {
        score += 80;
    }
    if path
        .to_string_lossy()
        .to_ascii_lowercase()
        .contains("binaries\\win64")
    {
        score += 20;
    }
    score
}

#[cfg(desktop)]
fn is_launchable_candidate(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if [
        "unins",
        "uninstall",
        "crashreport",
        "crashpad",
        "eac_launcher",
        "easyanticheat",
    ]
    .iter()
    .any(|needle| file_name.contains(needle))
    {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        path.is_file()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    }
    #[cfg(target_os = "macos")]
    {
        path.is_dir()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        path.is_file()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| {
                    matches!(
                        extension.to_ascii_lowercase().as_str(),
                        "x86" | "x86_64" | "sh"
                    )
                })
                .unwrap_or(true)
    }
}

#[cfg(desktop)]
fn executable_candidates(install_directory: &Path, game_name: &str) -> Vec<DetectedExecutable> {
    let mut seen = HashSet::new();
    let mut entries = WalkDir::new(install_directory)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .map(|entry| entry.into_path())
        .filter(|path| is_launchable_candidate(path))
        .filter(|path| seen.insert(path.to_string_lossy().to_ascii_lowercase()))
        .map(|path| {
            let size_bytes = fs::metadata(&path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            let score = executable_score(&path, install_directory, game_name);
            (
                score,
                DetectedExecutable {
                    name: path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("Executable")
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    size_bytes,
                },
            )
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.path.cmp(&right.1.path))
    });
    entries
        .into_iter()
        .map(|(_, executable)| executable)
        .collect()
}

#[cfg(desktop)]
fn report_steam_stage(channel: Option<&Channel<SteamScanEvent>>, stage: &str, detail: String) {
    if let Some(channel) = channel {
        let _ = channel.send(SteamScanEvent::Stage {
            stage: stage.into(),
            detail,
        });
    }
}

#[cfg(desktop)]
fn scan_steam_games_impl(
    steam_path: Option<String>,
    channel: Option<&Channel<SteamScanEvent>>,
) -> Result<SteamScan, String> {
    report_steam_stage(
        channel,
        "locating-steam",
        "Locating the Steam installation".into(),
    );
    let steam = steam_installation(steam_path)?;
    let mut library_paths = vec![steam.path().to_path_buf()];
    match steam.library_paths() {
        Ok(paths) => library_paths.extend(paths),
        Err(error) => report_steam_stage(
            channel,
            "library-warning",
            format!("Could not parse libraryfolders.vdf: {error}"),
        ),
    }
    library_paths.sort();
    library_paths.dedup();

    report_steam_stage(
        channel,
        "reading-libraries",
        format!("{} Steam library location(s) found", library_paths.len()),
    );
    let mut diagnostics = SteamScanDiagnostics {
        steam_path: steam.path().to_string_lossy().to_string(),
        libraries: library_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        manifests_found: 0,
        manifest_errors: 0,
        skipped_non_games: 0,
    };
    let mut games = Vec::new();
    let mut seen_apps = HashSet::new();
    let library_total = library_paths.len();

    for (library_index, library_path) in library_paths.iter().enumerate() {
        if let Some(channel) = channel {
            let _ = channel.send(SteamScanEvent::Progress {
                current: library_index,
                total: library_total,
            });
        }
        let library = match Library::from_dir(library_path) {
            Ok(library) => library,
            Err(error) => {
                diagnostics.manifest_errors += 1;
                report_steam_stage(
                    channel,
                    "library-warning",
                    format!("Skipped {}: {error}", library_path.display()),
                );
                continue;
            }
        };
        let app_total = library.app_ids().len();
        report_steam_stage(
            channel,
            "reading-manifests",
            format!("{} manifest(s) in {}", app_total, library_path.display()),
        );

        for app in library.apps() {
            diagnostics.manifests_found += 1;
            let app = match app {
                Ok(app) => app,
                Err(_) => {
                    diagnostics.manifest_errors += 1;
                    continue;
                }
            };
            if !seen_apps.insert(app.app_id) {
                continue;
            }
            let install_directory = library.resolve_app_dir(&app);
            if !install_directory.is_dir() {
                continue;
            }
            let name = app.name.clone().unwrap_or_else(|| app.install_dir.clone());
            if name.trim().is_empty() || is_steam_runtime_or_tool(&name) {
                diagnostics.skipped_non_games += 1;
                continue;
            }
            let candidates = executable_candidates(&install_directory, &name);
            let needs_executable = candidates.is_empty();
            let exec_path = candidates
                .first()
                .map(|candidate| candidate.path.clone())
                .unwrap_or_default();
            let mods_path = if exec_path.is_empty() {
                install_directory.join("Mods").to_string_lossy().to_string()
            } else {
                guess_mods_path(exec_path.clone())
            };
            games.push(DetectedGame {
                name,
                exec_path,
                mods_path,
                platform: "steam".into(),
                provider: "Steam".into(),
                provider_game_id: Some(app.app_id.to_string()),
                install_directory: install_directory.to_string_lossy().to_string(),
                steam_library: Some(library.path().to_string_lossy().to_string()),
                executable_candidates: candidates,
                size_bytes: app.size_on_disk,
                last_updated: app.last_updated.and_then(|time| {
                    time.duration_since(UNIX_EPOCH)
                        .ok()
                        .map(|duration| duration.as_secs())
                }),
                build_id: app.build_id.map(|value| value.to_string()),
                needs_executable,
            });
        }
    }
    games.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    if let Some(channel) = channel {
        let _ = channel.send(SteamScanEvent::Progress {
            current: library_total,
            total: library_total,
        });
    }
    report_steam_stage(
        channel,
        "finished",
        format!("{} installed Steam game(s) ready to review", games.len()),
    );
    Ok(SteamScan { games, diagnostics })
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
                files: mod_files(&path),
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

#[cfg(desktop)]
#[tauri::command]
fn scan_steam_games(
    steam_path: Option<String>,
    on_event: Channel<SteamScanEvent>,
) -> Result<SteamScan, String> {
    scan_steam_games_impl(steam_path, Some(&on_event))
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
            let Some(relative_path) = entry.enclosed_name() else {
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

#[tauri::command]
fn prepare_update_backup(
    app: AppHandle,
    snapshot: String,
    current_version: String,
    target_version: String,
) -> Result<String, String> {
    const MAX_SNAPSHOT_BYTES: usize = 25 * 1024 * 1024;
    if snapshot.len() > MAX_SNAPSHOT_BYTES {
        return Err(
            "The local launcher backup is unexpectedly large. Update was not started.".into(),
        );
    }

    let root = update_data_root(&app)?;
    let backups = root.join("update-backups");
    fs::create_dir_all(&backups).map_err(to_error)?;
    let timestamp = unix_timestamp();
    let backup = backups.join(format!("{timestamp}-{target_version}"));
    fs::create_dir_all(&backup).map_err(to_error)?;
    fs::write(backup.join("zailon-store.json"), snapshot).map_err(to_error)?;
    fs::write(
        backup.join("metadata.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "createdAt": timestamp,
            "currentVersion": current_version,
            "targetVersion": target_version,
            "system": std::env::consts::OS,
            "architecture": std::env::consts::ARCH,
            "purpose": "pre-update launcher configuration backup"
        }))
        .map_err(to_error)?,
    )
    .map_err(to_error)?;
    prune_update_backups(&backups)?;
    append_update_log(
        &root,
        serde_json::json!({
            "at": timestamp,
            "event": "backup-created",
            "currentVersion": current_version,
            "targetVersion": target_version,
            "system": std::env::consts::OS,
            "architecture": std::env::consts::ARCH,
            "result": "ok"
        }),
    )?;

    Ok(backup.to_string_lossy().to_string())
}

#[tauri::command]
fn record_update_event(
    app: AppHandle,
    event: String,
    version: String,
    message: Option<String>,
) -> Result<(), String> {
    let root = update_data_root(&app)?;
    append_update_log(
        &root,
        serde_json::json!({
            "at": unix_timestamp(),
            "event": event,
            "version": version,
            "system": std::env::consts::OS,
            "architecture": std::env::consts::ARCH,
            "message": message
        }),
    )
}

#[tauri::command]
fn open_update_log(app: AppHandle) -> Result<(), String> {
    let root = update_data_root(&app)?;
    let log_path = root.join("update-log.jsonl");
    if !log_path.exists() {
        fs::write(&log_path, "").map_err(to_error)?;
    }

    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg(&log_path)
        .spawn()
        .map_err(to_error)?;
    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&log_path)
        .spawn()
        .map_err(to_error)?;
    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(&log_path)
        .spawn()
        .map_err(to_error)?;

    Ok(())
}

#[cfg(desktop)]
async fn updater_endpoint(channel: &str) -> Result<url::Url, String> {
    const STABLE_ENDPOINT: &str =
        "https://github.com/N7T0-OF/ZAILON/releases/latest/download/latest.json";
    if channel == "stable" {
        return url::Url::parse(STABLE_ENDPOINT).map_err(to_error);
    }
    if channel != "beta" {
        return Err("Unknown update channel.".into());
    }

    let releases = reqwest::Client::new()
        .get("https://api.github.com/repos/N7T0-OF/ZAILON/releases")
        .header(reqwest::header::USER_AGENT, "ZAILON-Updater")
        .send()
        .await
        .map_err(to_error)?
        .error_for_status()
        .map_err(to_error)?
        .json::<Vec<GitHubRelease>>()
        .await
        .map_err(to_error)?;
    let release = releases
        .into_iter()
        .find(|release| release.prerelease && !release.draft)
        .ok_or_else(|| "No published beta update is available.".to_string())?;
    let latest_json = release
        .assets
        .into_iter()
        .find(|asset| asset.name == "latest.json")
        .ok_or_else(|| "The latest beta release has no signed updater metadata.".to_string())?;
    url::Url::parse(&latest_json.browser_download_url).map_err(to_error)
}

#[cfg(desktop)]
#[tauri::command]
async fn check_for_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
    channel: String,
) -> Result<Option<UpdateMetadata>, String> {
    let endpoint = updater_endpoint(&channel).await?;
    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(to_error)?
        .build()
        .map_err(to_error)?
        .check()
        .await
        .map_err(to_error)?;
    let metadata = update.as_ref().map(|update| UpdateMetadata {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        date: update.date.as_ref().map(ToString::to_string),
        notes: update.body.clone(),
    });
    *pending_update.0.lock().map_err(to_error)? = update;
    Ok(metadata)
}

#[cfg(desktop)]
#[tauri::command]
async fn install_update(
    pending_update: State<'_, PendingUpdate>,
    on_event: Channel<UpdateDownloadEvent>,
) -> Result<(), String> {
    let update = pending_update
        .0
        .lock()
        .map_err(to_error)?
        .take()
        .ok_or_else(|| "No update is ready to install. Check again first.".to_string())?;
    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(UpdateDownloadEvent::Started { content_length });
                    started = true;
                }
                let _ = on_event.send(UpdateDownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(UpdateDownloadEvent::Finished);
            },
        )
        .await
        .map_err(to_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_safe_game_identifiers() {
        assert!(safe_game_id("4b2d66ca-5c39-4d35_a").is_ok());
        assert!(safe_game_id("../outside").is_err());
        assert!(safe_game_id("").is_err());
    }

    #[test]
    fn limits_resource_extensions_by_slot() {
        assert!(allowed_resource_extension("cover", "webp"));
        assert!(allowed_resource_extension("video", "MP4"));
        assert!(!allowed_resource_extension("cover", "exe"));
        assert!(!allowed_resource_extension("video", "gif"));
    }

    #[cfg(desktop)]
    #[test]
    fn excludes_known_steam_tools_from_game_results() {
        assert!(is_steam_runtime_or_tool("Steam Linux Runtime 3.0"));
        assert!(is_steam_runtime_or_tool("Proton Experimental"));
        assert!(!is_steam_runtime_or_tool("Baldur's Gate 3"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.manage(PendingUpdate(Mutex::new(None)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_mods,
            toggle_mod,
            delete_mod,
            ensure_dir,
            launch_game,
            guess_mods_path,
            install_mod,
            store_game_resource,
            remove_game_resource,
            open_path,
            prepare_update_backup,
            record_update_event,
            open_update_log,
            #[cfg(desktop)]
            scan_steam_games,
            #[cfg(desktop)]
            check_for_update,
            #[cfg(desktop)]
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZAILON");
}
