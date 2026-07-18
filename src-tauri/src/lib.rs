use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    io::{copy, Cursor, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;

#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use steamlocate::{Library, SteamDir};
#[cfg(desktop)]
use tauri::{ipc::Channel, State};
#[cfg(desktop)]
use tauri_plugin_updater::{Update, UpdaterExt};

#[cfg(target_os = "windows")]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY},
    RegKey,
};

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
    fingerprint: String,
    framework: String,
    manifests: Vec<String>,
    source_url: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModImportCandidate {
    id: String,
    name: String,
    path: String,
    enabled: bool,
    mod_type: String,
    size_bytes: u64,
    files: Vec<String>,
    fingerprint: String,
    framework: String,
    manifests: Vec<String>,
    source_url: Option<String>,
    version: Option<String>,
    confidence: String,
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveSource {
    id: String,
    name: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileImportPreview {
    manifest: serde_json::Value,
    archive_path: String,
    embedded_files: usize,
    missing_mod_names: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NxmRequest {
    raw_url: String,
    game_domain: String,
    mod_id: u64,
    file_id: u64,
    key: Option<String>,
    expires: Option<u64>,
    user_id: Option<u64>,
}

#[cfg(desktop)]
struct PendingExternalInstalls(Mutex<Vec<NxmRequest>>);

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
    item_kind: String,
    confidence: String,
    version: Option<String>,
    publisher: Option<String>,
    detection_source: String,
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
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryProviderDiagnostic {
    provider: String,
    status: String,
    found: usize,
    detail: String,
}

#[cfg(desktop)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryScan {
    games: Vec<DetectedGame>,
    diagnostics: Vec<DiscoveryProviderDiagnostic>,
}

#[cfg(desktop)]
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
enum DiscoveryScanEvent {
    #[serde(rename_all = "camelCase")]
    Stage { provider: String, detail: String },
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
                "png" | "jpg" | "jpeg" | "webp" | "avif" | "gif" | "svg"
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

fn validate_external_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "The source URL is invalid.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only secure HTTPS source links can be opened.".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "The source URL has no host.".to_string())?
        .to_ascii_lowercase();
    let allowed_hosts = ["gamebanana.com", "nexusmods.com", "curseforge.com"];
    if !allowed_hosts
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
    {
        return Err("This source is not in ZAILON's trusted link list.".into());
    }

    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    validate_external_url(&url)?;

    #[cfg(target_os = "windows")]
    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .spawn()
        .map_err(to_error)?;
    #[cfg(target_os = "macos")]
    Command::new("open").arg(&url).spawn().map_err(to_error)?;
    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(&url)
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

fn fingerprint_path(path: &Path) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    normalized_name(path).to_ascii_lowercase().hash(&mut hasher);
    if path.is_file() {
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .hash(&mut hasher);
        fs::metadata(path)
            .map(|value| value.len())
            .unwrap_or(0)
            .hash(&mut hasher);
    } else {
        for entry in WalkDir::new(path)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
            .take(50_000)
        {
            if let Ok(relative) = entry.path().strip_prefix(path) {
                relative
                    .to_string_lossy()
                    .replace('\\', "/")
                    .to_ascii_lowercase()
                    .hash(&mut hasher);
            }
            entry
                .metadata()
                .map(|value| value.len())
                .unwrap_or(0)
                .hash(&mut hasher);
        }
    }
    format!("{:016x}", hasher.finish())
}

fn metadata_files(path: &Path) -> Vec<PathBuf> {
    let names = [
        "manifest.json",
        "mod.json",
        "info.json",
        "package.json",
        "meta.ini",
        "readme.md",
        "readme.txt",
        "fomod/info.xml",
        "nexusmods.txt",
    ];
    if !path.is_dir() {
        return Vec::new();
    }
    names
        .iter()
        .map(|name| path.join(name))
        .filter(|candidate| candidate.is_file())
        .collect()
}

fn trusted_source_url(text: &str) -> Option<String> {
    text.match_indices("https://").find_map(|(start, _)| {
        let rest = &text[start..];
        let end = rest
            .find(|character: char| {
                character.is_whitespace()
                    || matches!(character, '"' | '\'' | ')' | ']' | '>' | ',' | ';')
            })
            .unwrap_or(rest.len());
        let candidate = &rest[..end];
        let parsed = url::Url::parse(candidate).ok()?;
        if parsed.scheme() != "https" {
            return None;
        }
        let host = parsed.host_str()?.to_ascii_lowercase();
        let trusted = host == "nexusmods.com"
            || host.ends_with(".nexusmods.com")
            || host == "gamebanana.com"
            || host.ends_with(".gamebanana.com")
            || host == "curseforge.com"
            || host.ends_with(".curseforge.com");
        trusted.then(|| parsed.to_string())
    })
}

fn mod_metadata(path: &Path) -> (Vec<String>, Option<String>, Option<String>) {
    let files = metadata_files(path);
    let manifests = files
        .iter()
        .filter_map(|file| {
            file.strip_prefix(path)
                .ok()
                .map(|value| value.to_string_lossy().replace('\\', "/"))
        })
        .collect::<Vec<_>>();
    let mut source_url = None;
    let mut version = None;
    for file in files {
        let Ok(metadata) = fs::metadata(&file) else {
            continue;
        };
        if metadata.len() > 1024 * 1024 {
            continue;
        }
        let Ok(text) = fs::read_to_string(&file) else {
            continue;
        };
        source_url = source_url.or_else(|| trusted_source_url(&text));
        if file
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"))
        {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                version = version.or_else(|| {
                    ["version", "modVersion", "mod_version"]
                        .iter()
                        .find_map(|key| {
                            value
                                .get(key)
                                .and_then(|item| item.as_str())
                                .map(ToOwned::to_owned)
                        })
                });
            }
        }
    }
    (manifests, source_url, version)
}

fn detect_framework(path: &Path, files: &[String]) -> String {
    let joined = format!("{} {}", path.to_string_lossy(), files.join(" "))
        .replace('\\', "/")
        .to_ascii_lowercase();
    if joined.contains("archive/pc/mod")
        || joined.contains("r6/scripts")
        || joined.contains("red4ext/plugins")
        || joined.contains("bin/x64/plugins")
    {
        "Cyberpunk 2077".into()
    } else if files.iter().any(|file| {
        matches!(
            Path::new(file)
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                .as_deref(),
            Some("esp" | "esm" | "esl")
        )
    }) {
        "Bethesda Plugin".into()
    } else if joined.contains("~mods")
        || files
            .iter()
            .any(|file| file.to_ascii_lowercase().ends_with(".pak"))
    {
        "Unreal Pak".into()
    } else if joined.contains("d3dx.ini")
        || ["gimi", "zzmi", "srmi", "wwmi", "efmi"]
            .iter()
            .any(|name| joined.contains(name))
    {
        "XXMI".into()
    } else if joined.contains("bepinex") {
        "BepInEx".into()
    } else {
        "Generic".into()
    }
}

fn inspect_native_mod(path: &Path) -> NativeMod {
    let files = mod_files(path);
    let (manifests, source_url, version) = mod_metadata(path);
    let framework = detect_framework(path, &files);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    NativeMod {
        id: fingerprint_path(path),
        name: normalized_name(path),
        path: path.to_string_lossy().to_string(),
        enabled: !file_name.starts_with("DISABLED_"),
        mod_type: mod_type(path),
        size_bytes: entry_size(path),
        files,
        fingerprint: fingerprint_path(path),
        framework,
        manifests,
        source_url,
        version,
    }
}

fn is_probable_mod_root(path: &Path) -> bool {
    if path.is_file() {
        return matches!(
            path.extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                .as_deref(),
            Some("zip" | "7z" | "rar" | "pak" | "archive" | "esp" | "esm" | "esl" | "dll" | "asi")
        );
    }
    if !metadata_files(path).is_empty() {
        return true;
    }
    WalkDir::new(path)
        .max_depth(3)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .take(200)
        .any(|entry| {
            matches!(
                entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase())
                    .as_deref(),
                Some("pak" | "archive" | "esp" | "esm" | "esl" | "dll" | "asi" | "ini")
            )
        })
}

fn import_candidate_roots(path: &Path) -> Vec<PathBuf> {
    if path.is_file() {
        return vec![path.to_path_buf()];
    }
    let cyberpunk_locations = [
        "archive/pc/mod",
        "r6/scripts",
        "red4ext/plugins",
        "bin/x64/plugins",
        "mods",
    ];
    let mut specialized = Vec::new();
    for location in cyberpunk_locations {
        let directory = path.join(location);
        if let Ok(entries) = fs::read_dir(directory) {
            specialized.extend(
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .filter(|entry| is_probable_mod_root(entry)),
            );
        }
    }
    if !specialized.is_empty() {
        return specialized;
    }
    let direct = fs::read_dir(path)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| is_probable_mod_root(entry))
        .collect::<Vec<_>>();
    if direct.len() > 1 && !is_probable_mod_root(path) {
        direct
    } else {
        vec![path.to_path_buf()]
    }
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
                item_kind: "game".into(),
                confidence: if needs_executable { "medium" } else { "high" }.into(),
                version: None,
                publisher: None,
                detection_source: "Steam appmanifest".into(),
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

#[cfg(desktop)]
fn report_discovery_stage(channel: &Channel<DiscoveryScanEvent>, provider: &str, detail: String) {
    let _ = channel.send(DiscoveryScanEvent::Stage {
        provider: provider.into(),
        detail,
    });
}

#[cfg(desktop)]
fn epic_manifest_root() -> Result<PathBuf, String> {
    let program_data = std::env::var_os("PROGRAMDATA")
        .ok_or_else(|| "PROGRAMDATA is unavailable on this platform.".to_string())?;
    let root = PathBuf::from(program_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    if !root.is_dir() {
        return Err("Epic Games manifest directory was not found.".into());
    }
    Ok(root)
}

#[cfg(desktop)]
fn scan_epic_games(full: bool) -> Result<Vec<DetectedGame>, String> {
    let root = epic_manifest_root()?;
    let mut games = Vec::new();
    for entry in fs::read_dir(&root)
        .map_err(to_error)?
        .filter_map(Result::ok)
    {
        let manifest_path = entry.path();
        if !manifest_path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("item"))
        {
            continue;
        }
        let bytes = match fs::read(&manifest_path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let manifest: serde_json::Value = match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let text = |key: &str| {
            manifest
                .get(key)
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        let Some(name) = text("DisplayName") else {
            continue;
        };
        let Some(install_location) = text("InstallLocation") else {
            continue;
        };
        let install_directory = PathBuf::from(&install_location);
        if !install_directory.is_dir() {
            continue;
        }
        let launch_executable = text("LaunchExecutable")
            .map(|relative| install_directory.join(relative.replace('/', "\\")))
            .filter(|path| path.is_file());
        let mut candidates = launch_executable
            .as_ref()
            .map(|path| {
                vec![DetectedExecutable {
                    name: path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("Executable")
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    size_bytes: fs::metadata(path)
                        .map(|metadata| metadata.len())
                        .unwrap_or(0),
                }]
            })
            .unwrap_or_default();
        if full && candidates.is_empty() {
            candidates = executable_candidates(&install_directory, &name)
                .into_iter()
                .take(20)
                .collect();
        }
        let exec_path = candidates
            .first()
            .map(|candidate| candidate.path.clone())
            .unwrap_or_default();
        let needs_executable = exec_path.is_empty();
        let mods_path = if needs_executable {
            install_directory.join("Mods").to_string_lossy().to_string()
        } else {
            guess_mods_path(exec_path.clone())
        };
        games.push(DetectedGame {
            name,
            exec_path,
            mods_path,
            platform: "epic".into(),
            provider: "Epic Games".into(),
            provider_game_id: text("CatalogItemId").or_else(|| text("AppName")),
            install_directory: install_location,
            steam_library: None,
            executable_candidates: candidates,
            size_bytes: None,
            last_updated: fs::metadata(&manifest_path)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs()),
            build_id: None,
            needs_executable,
            item_kind: "game".into(),
            confidence: if needs_executable { "medium" } else { "high" }.into(),
            version: text("AppVersionString"),
            publisher: None,
            detection_source: "Epic .item manifest".into(),
        });
    }
    games.sort_by_key(|game| game.name.to_ascii_lowercase());
    Ok(games)
}

#[cfg(target_os = "windows")]
fn expand_windows_path(value: &str) -> String {
    let mut expanded = value.trim().trim_matches('"').to_string();
    for (name, replacement) in std::env::vars() {
        expanded = expanded.replace(&format!("%{name}%"), &replacement);
    }
    expanded
}

#[cfg(target_os = "windows")]
fn display_icon_path(value: &str) -> Option<PathBuf> {
    let value = value.trim();
    let raw = if let Some(remainder) = value.strip_prefix('"') {
        remainder.split('"').next().unwrap_or_default()
    } else {
        value.split(',').next().unwrap_or_default()
    };
    let path = PathBuf::from(expand_windows_path(raw));
    path.is_file().then_some(path)
}

#[cfg(target_os = "windows")]
fn is_technical_program(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    [
        "security update",
        "update for ",
        "hotfix",
        "language pack",
        "redistributable",
        "webview2 runtime",
        "windows software development kit",
        "windows driver kit",
        "debugging tools for windows",
    ]
    .iter()
    .any(|needle| name.contains(needle))
}

#[cfg(target_os = "windows")]
fn windows_provider(name: &str, publisher: &str, location: &str) -> String {
    let fingerprint = format!("{name} {publisher} {location}").to_ascii_lowercase();
    if fingerprint.contains("ubisoft") {
        "Ubisoft Connect"
    } else if fingerprint.contains("electronic arts") || fingerprint.contains("ea games") {
        "EA app"
    } else if fingerprint.contains("battle.net") || fingerprint.contains("blizzard") {
        "Battle.net"
    } else if fingerprint.contains("riot games") {
        "Riot Games"
    } else if fingerprint.contains("rockstar games") {
        "Rockstar Games"
    } else if fingerprint.contains("gog.com") || fingerprint.contains("gog galaxy") {
        "GOG Galaxy"
    } else if fingerprint.contains("itch.io") {
        "itch.io"
    } else if fingerprint.contains("epic games") {
        "Epic Games"
    } else {
        "Applications Windows"
    }
    .into()
}

#[cfg(target_os = "windows")]
fn registry_estimated_size_bytes(entry: &RegKey) -> Option<u64> {
    entry
        .get_value::<u64, _>("EstimatedSize")
        .ok()
        .or_else(|| {
            entry
                .get_value::<u32, _>("EstimatedSize")
                .ok()
                .map(u64::from)
        })
        .map(|kilobytes| kilobytes.saturating_mul(1024))
}

#[cfg(target_os = "windows")]
fn scan_windows_installed_apps(full: bool) -> Result<Vec<DetectedGame>, String> {
    let uninstall_path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
    let mut games = Vec::new();
    let mut seen = HashSet::new();
    let hives = [(HKEY_LOCAL_MACHINE, "HKLM"), (HKEY_CURRENT_USER, "HKCU")];
    let views = [
        (KEY_READ | KEY_WOW64_64KEY, "64-bit"),
        (KEY_READ | KEY_WOW64_32KEY, "32-bit"),
    ];

    for (hive, hive_name) in hives {
        for (flags, view_name) in views {
            let root = RegKey::predef(hive);
            let Ok(uninstall) = root.open_subkey_with_flags(uninstall_path, flags) else {
                continue;
            };
            for key_name in uninstall.enum_keys().filter_map(Result::ok) {
                let Ok(entry) = uninstall.open_subkey_with_flags(&key_name, flags) else {
                    continue;
                };
                if entry.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1 {
                    continue;
                }
                let name = entry
                    .get_value::<String, _>("DisplayName")
                    .unwrap_or_default();
                let name = name.trim().to_string();
                if name.is_empty() || is_technical_program(&name) {
                    continue;
                }
                let version = entry
                    .get_value::<String, _>("DisplayVersion")
                    .ok()
                    .filter(|value| !value.trim().is_empty());
                let publisher = entry
                    .get_value::<String, _>("Publisher")
                    .unwrap_or_default();
                let location = entry
                    .get_value::<String, _>("InstallLocation")
                    .ok()
                    .map(|value| expand_windows_path(&value))
                    .filter(|value| Path::new(value).is_dir())
                    .unwrap_or_default();
                let icon = entry
                    .get_value::<String, _>("DisplayIcon")
                    .ok()
                    .and_then(|value| display_icon_path(&value));
                let identity = format!(
                    "{}|{}|{}",
                    name.to_ascii_lowercase(),
                    publisher.to_ascii_lowercase(),
                    location.to_ascii_lowercase()
                );
                if !seen.insert(identity) {
                    continue;
                }
                let install_directory = if !location.is_empty() {
                    PathBuf::from(&location)
                } else {
                    icon.as_ref()
                        .and_then(|path| path.parent().map(Path::to_path_buf))
                        .unwrap_or_default()
                };
                let mut candidates = icon
                    .filter(|path| is_launchable_candidate(path))
                    .map(|path| {
                        vec![DetectedExecutable {
                            name: path
                                .file_name()
                                .and_then(|value| value.to_str())
                                .unwrap_or("Executable")
                                .to_string(),
                            size_bytes: fs::metadata(&path)
                                .map(|metadata| metadata.len())
                                .unwrap_or(0),
                            path: path.to_string_lossy().to_string(),
                        }]
                    })
                    .unwrap_or_default();
                if full && candidates.is_empty() && install_directory.is_dir() {
                    candidates = executable_candidates(&install_directory, &name)
                        .into_iter()
                        .take(12)
                        .collect();
                }
                let exec_path = candidates
                    .first()
                    .map(|candidate| candidate.path.clone())
                    .unwrap_or_default();
                let needs_executable = exec_path.is_empty();
                let provider = windows_provider(&name, &publisher, &location);
                let normalized_name = name.to_ascii_lowercase();
                let item_kind = if provider != "Applications Windows"
                    && ![
                        "launcher",
                        "connect",
                        "galaxy",
                        "battle.net",
                        "riot client",
                        "ea app",
                    ]
                    .iter()
                    .any(|needle| normalized_name.contains(needle))
                {
                    "game"
                } else {
                    "software"
                };
                let platform = match provider.as_str() {
                    "Epic Games" => "epic",
                    "GOG Galaxy" => "gog",
                    _ => "standalone",
                };
                let mods_path = if exec_path.is_empty() {
                    install_directory.join("Mods").to_string_lossy().to_string()
                } else {
                    guess_mods_path(exec_path.clone())
                };
                games.push(DetectedGame {
                    name,
                    exec_path,
                    mods_path,
                    platform: platform.into(),
                    provider,
                    provider_game_id: Some(format!("{hive_name}:{key_name}")),
                    install_directory: install_directory.to_string_lossy().to_string(),
                    steam_library: None,
                    executable_candidates: candidates,
                    size_bytes: registry_estimated_size_bytes(&entry),
                    last_updated: None,
                    build_id: None,
                    needs_executable,
                    item_kind: item_kind.into(),
                    confidence: if needs_executable { "medium" } else { "high" }.into(),
                    version,
                    publisher: (!publisher.trim().is_empty()).then_some(publisher),
                    detection_source: format!("Registre Windows {hive_name} {view_name}"),
                });
            }
        }
    }
    Ok(games)
}

#[cfg(all(desktop, not(target_os = "windows")))]
fn scan_windows_installed_apps(_full: bool) -> Result<Vec<DetectedGame>, String> {
    Err("Windows Registry is unavailable on this platform.".into())
}

#[cfg(desktop)]
fn deduplicate_discovery(items: Vec<DetectedGame>) -> Vec<DetectedGame> {
    let mut unique = HashMap::<String, DetectedGame>::new();
    for item in items {
        let key = if !item.exec_path.is_empty() {
            format!(
                "exec:{}",
                item.exec_path.replace('/', "\\").to_ascii_lowercase()
            )
        } else if let Some(provider_id) = &item.provider_game_id {
            format!(
                "provider:{}:{provider_id}",
                item.provider.to_ascii_lowercase()
            )
        } else {
            format!(
                "name:{}:{}",
                item.name.to_ascii_lowercase(),
                item.install_directory.to_ascii_lowercase()
            )
        };
        match unique.get(&key) {
            Some(existing) if existing.item_kind == "game" && item.item_kind != "game" => continue,
            _ => {
                unique.insert(key, item);
            }
        }
    }
    let mut values = unique.into_values().collect::<Vec<_>>();
    values.sort_by(|left, right| {
        left.item_kind.cmp(&right.item_kind).then_with(|| {
            left.name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase())
        })
    });
    values
}

#[cfg(desktop)]
#[tauri::command]
fn scan_library(
    mode: String,
    on_event: Channel<DiscoveryScanEvent>,
) -> Result<DiscoveryScan, String> {
    let full = match mode.as_str() {
        "quick" => false,
        "full" => true,
        _ => return Err("Unknown detection mode.".into()),
    };
    let mut diagnostics = Vec::new();
    let mut discovered = Vec::new();
    let providers = 3;

    report_discovery_stage(
        &on_event,
        "Steam",
        "Lecture des bibliothèques et manifestes Steam".into(),
    );
    match scan_steam_games_impl(None, None) {
        Ok(scan) => {
            let found = scan.games.len();
            discovered.extend(scan.games);
            diagnostics.push(DiscoveryProviderDiagnostic {
                provider: "Steam".into(),
                status: "ok".into(),
                found,
                detail: format!(
                    "{} bibliothèque(s), {} manifeste(s) lu(s)",
                    scan.diagnostics.libraries.len(),
                    scan.diagnostics.manifests_found
                ),
            });
        }
        Err(error) => diagnostics.push(DiscoveryProviderDiagnostic {
            provider: "Steam".into(),
            status: "unavailable".into(),
            found: 0,
            detail: error,
        }),
    }
    let _ = on_event.send(DiscoveryScanEvent::Progress {
        current: 1,
        total: providers,
    });

    report_discovery_stage(
        &on_event,
        "Epic Games",
        "Lecture des manifestes Epic Games".into(),
    );
    match scan_epic_games(full) {
        Ok(games) => {
            let found = games.len();
            discovered.extend(games);
            diagnostics.push(DiscoveryProviderDiagnostic {
                provider: "Epic Games".into(),
                status: "ok".into(),
                found,
                detail: "Manifestes .item locaux analysés".into(),
            });
        }
        Err(error) => diagnostics.push(DiscoveryProviderDiagnostic {
            provider: "Epic Games".into(),
            status: "unavailable".into(),
            found: 0,
            detail: error,
        }),
    }
    let _ = on_event.send(DiscoveryScanEvent::Progress {
        current: 2,
        total: providers,
    });

    report_discovery_stage(
        &on_event,
        "Applications Windows",
        if full {
            "Lecture du Registre et vérification ciblée des dossiers connus"
        } else {
            "Lecture rapide des applications déclarées dans le Registre"
        }
        .into(),
    );
    match scan_windows_installed_apps(full) {
        Ok(games) => {
            let found = games.len();
            discovered.extend(games);
            diagnostics.push(DiscoveryProviderDiagnostic {
                provider: "Applications Windows".into(),
                status: "ok".into(),
                found,
                detail: if full {
                    "Registre et dossiers d’installation déclarés analysés"
                } else {
                    "Registre Windows analysé sans parcours de disque"
                }
                .into(),
            });
        }
        Err(error) => diagnostics.push(DiscoveryProviderDiagnostic {
            provider: "Applications Windows".into(),
            status: "unavailable".into(),
            found: 0,
            detail: error,
        }),
    }
    let _ = on_event.send(DiscoveryScanEvent::Progress {
        current: providers,
        total: providers,
    });
    let games = deduplicate_discovery(discovered);
    report_discovery_stage(
        &on_event,
        "Terminé",
        format!("{} élément(s) local(aux) prêt(s) à vérifier", games.len()),
    );
    Ok(DiscoveryScan { games, diagnostics })
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
            Some(inspect_native_mod(&path))
        })
        .collect::<Vec<_>>())
}

#[tauri::command]
fn scan_mod_import(
    paths: Vec<String>,
    game_name: String,
) -> Result<Vec<ModImportCandidate>, String> {
    if paths.is_empty() || paths.len() > 100 {
        return Err("Select between 1 and 100 import folders.".into());
    }
    let mut unique = HashSet::new();
    let mut candidates = Vec::new();
    for selected in paths {
        let path = PathBuf::from(selected);
        if !path.exists() {
            continue;
        }
        for root in import_candidate_roots(&path) {
            let canonical = fs::canonicalize(&root).map_err(to_error)?;
            if !unique.insert(canonical.clone()) {
                continue;
            }
            let inspected = inspect_native_mod(&canonical);
            let strong = inspected.framework != "Generic" || !inspected.manifests.is_empty();
            let mut warnings = Vec::new();
            if inspected.source_url.is_none() {
                warnings.push("Aucune source exacte détectée : aucune mise à jour automatique ne sera autorisée.".into());
            }
            if inspected.framework == "Generic" {
                warnings.push(format!(
                    "Structure générique pour {game_name} : vérifiez la destination avant import."
                ));
            }
            candidates.push(ModImportCandidate {
                id: inspected.id.clone(),
                name: inspected.name,
                path: inspected.path,
                enabled: inspected.enabled,
                mod_type: inspected.mod_type,
                size_bytes: inspected.size_bytes,
                files: inspected.files,
                fingerprint: inspected.fingerprint,
                framework: inspected.framework,
                manifests: inspected.manifests,
                source_url: inspected.source_url,
                version: inspected.version,
                confidence: if strong { "high" } else { "low" }.into(),
                warnings,
            });
        }
    }
    candidates.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    Ok(candidates)
}

fn validated_mod_entry(mods_root: &str, mod_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(mods_root).map_err(to_error)?;
    let path = fs::canonicalize(mod_path).map_err(to_error)?;
    if path == root || !path.starts_with(&root) || path.parent() != Some(root.as_path()) {
        return Err("The mod entry is outside the configured Mods folder.".into());
    }
    Ok(path)
}

#[tauri::command]
fn toggle_mod(mod_path: String, mods_root: String, enable: bool) -> Result<String, String> {
    let source = validated_mod_entry(&mods_root, &mod_path)?;
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
fn delete_mod(mod_path: String, mods_root: String) -> Result<(), String> {
    let path = validated_mod_entry(&mods_root, &mod_path)?;
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

fn safe_archive_component(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ' ' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches([' ', '.'])
        .to_string();
    if cleaned.is_empty() {
        "mod".into()
    } else {
        cleaned.chars().take(100).collect()
    }
}

fn windows_reserved_name(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem[3..]
                .parse::<u8>()
                .is_ok_and(|number| (1..=9).contains(&number)))
}

fn forbidden_archive_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .is_some_and(|value| {
            matches!(
                value.as_str(),
                "exe" | "com" | "bat" | "cmd" | "ps1" | "msi" | "scr"
            )
        })
}

fn validate_archive_relative(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("Archive contains an absolute or empty path.".into());
    }
    for component in path.components() {
        let std::path::Component::Normal(value) = component else {
            return Err("Archive contains an unsafe traversal path.".into());
        };
        let text = value.to_string_lossy();
        if text.ends_with(' ')
            || text.ends_with('.')
            || text.contains(':')
            || windows_reserved_name(&text)
        {
            return Err(format!(
                "Archive contains an unsafe Windows path component: {text}"
            ));
        }
    }
    if forbidden_archive_file(path) {
        return Err(format!(
            "Archive contains an unexpected executable file: {}",
            path.display()
        ));
    }
    Ok(())
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    if source.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        fs::copy(source, destination).map_err(to_error)?;
        return Ok(());
    }
    for entry in WalkDir::new(source)
        .follow_links(false)
        .into_iter()
        .map(|entry| entry.map_err(to_error))
    {
        let entry = entry?;
        if entry.file_type().is_symlink() {
            return Err("Symbolic links are not allowed during mod import.".into());
        }
        let relative = entry.path().strip_prefix(source).map_err(to_error)?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        validate_archive_relative(relative)?;
        let output = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&output).map_err(to_error)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            fs::copy(entry.path(), output).map_err(to_error)?;
        }
    }
    Ok(())
}

fn unique_destination(directory: &Path, name: &str) -> PathBuf {
    let safe = safe_archive_component(name);
    let initial = directory.join(&safe);
    if !initial.exists() {
        return initial;
    }
    (2..10_000)
        .map(|index| directory.join(format!("{safe}-{index}")))
        .find(|candidate| !candidate.exists())
        .unwrap_or_else(|| directory.join(format!("{safe}-{}", unix_timestamp())))
}

#[tauri::command]
fn import_mod_candidates(paths: Vec<String>, destination: String) -> Result<Vec<String>, String> {
    if paths.is_empty() || paths.len() > 100 {
        return Err("Select between 1 and 100 mods.".into());
    }
    let destination = PathBuf::from(destination);
    fs::create_dir_all(&destination).map_err(to_error)?;
    let stage = destination.join(format!(".zailon-import-{}", unix_timestamp()));
    if stage.exists() {
        return Err("An import staging directory already exists.".into());
    }
    fs::create_dir_all(&stage).map_err(to_error)?;
    let result = (|| {
        let mut staged = Vec::new();
        for source in paths {
            let source = fs::canonicalize(source).map_err(to_error)?;
            if !source.exists() {
                return Err(format!(
                    "Import source does not exist: {}",
                    source.display()
                ));
            }
            let name = source
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "Invalid import source name.".to_string())?;
            let target = unique_destination(&stage, name);
            copy_tree(&source, &target)?;
            staged.push(target);
        }
        let mut installed = Vec::new();
        for source in staged {
            let name = source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("mod");
            let final_path = unique_destination(&destination, name);
            fs::rename(&source, &final_path).map_err(to_error)?;
            installed.push(final_path.to_string_lossy().to_string());
        }
        Ok(installed)
    })();
    let _ = fs::remove_dir_all(&stage);
    result
}

fn zip_options() -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644)
}

fn add_source_to_zip<W: Write + std::io::Seek>(
    writer: &mut zip::ZipWriter<W>,
    source: &Path,
    archive_root: &str,
) -> Result<usize, String> {
    let mut written = 0usize;
    if source.is_file() {
        let file_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Invalid mod file name.".to_string())?;
        let relative = Path::new(file_name);
        validate_archive_relative(relative)?;
        writer
            .start_file(format!("{archive_root}/{file_name}"), zip_options())
            .map_err(to_error)?;
        let mut file = fs::File::open(source).map_err(to_error)?;
        copy(&mut file, writer).map_err(to_error)?;
        return Ok(1);
    }
    for entry in WalkDir::new(source)
        .follow_links(false)
        .into_iter()
        .map(|entry| entry.map_err(to_error))
    {
        let entry = entry?;
        if entry.file_type().is_symlink() {
            return Err("Symbolic links cannot be exported in a profile.".into());
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(source).map_err(to_error)?;
        validate_archive_relative(relative)?;
        let zip_name = format!(
            "{archive_root}/{}",
            relative.to_string_lossy().replace('\\', "/")
        );
        writer
            .start_file(zip_name, zip_options())
            .map_err(to_error)?;
        let mut file = fs::File::open(entry.path()).map_err(to_error)?;
        copy(&mut file, writer).map_err(to_error)?;
        written += 1;
        if written > 100_000 {
            return Err("Profile export exceeds the 100,000 file safety limit.".into());
        }
    }
    Ok(written)
}

#[tauri::command]
fn export_profile(
    destination: String,
    manifest: serde_json::Value,
    complete: bool,
    sources: Vec<ArchiveSource>,
) -> Result<String, String> {
    if manifest
        .get("schemaVersion")
        .and_then(|value| value.as_u64())
        != Some(1)
        || manifest.get("app").and_then(|value| value.as_str()) != Some("ZAILON")
    {
        return Err("Invalid ZAILON profile manifest.".into());
    }
    let destination = PathBuf::from(destination);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    let temporary = destination.with_extension("zailon-profile.tmp");
    let file = fs::File::create(&temporary).map_err(to_error)?;
    let mut writer = zip::ZipWriter::new(file);
    writer
        .start_file("manifest.json", zip_options())
        .map_err(to_error)?;
    writer
        .write_all(&serde_json::to_vec_pretty(&manifest).map_err(to_error)?)
        .map_err(to_error)?;
    for (name, value) in [
        ("mods.json", manifest.get("mods")),
        ("load-order.json", manifest.pointer("/profile/modStates")),
        ("rules.json", manifest.pointer("/profile/conflictRules")),
        ("settings.json", manifest.pointer("/profile/installOptions")),
    ] {
        writer.start_file(name, zip_options()).map_err(to_error)?;
        writer
            .write_all(
                &serde_json::to_vec_pretty(value.unwrap_or(&serde_json::Value::Null))
                    .map_err(to_error)?,
            )
            .map_err(to_error)?;
    }
    writer
        .start_file("notes.txt", zip_options())
        .map_err(to_error)?;
    writer
        .write_all(
            manifest
                .pointer("/profile/description")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .as_bytes(),
        )
        .map_err(to_error)?;
    if complete {
        for source in sources {
            let path = PathBuf::from(&source.path);
            if !path.exists() {
                continue;
            }
            let root = format!(
                "files/{}--{}",
                safe_archive_component(&source.name),
                safe_archive_component(&source.id)
            );
            add_source_to_zip(&mut writer, &path, &root)?;
        }
    }
    writer.finish().map_err(to_error)?;
    if destination.exists() {
        fs::remove_file(&destination).map_err(to_error)?;
    }
    fs::rename(&temporary, &destination).map_err(to_error)?;
    Ok(destination.to_string_lossy().to_string())
}

fn archive_is_symlink(mode: Option<u32>) -> bool {
    mode.is_some_and(|value| value & 0o170000 == 0o120000)
}

#[tauri::command]
fn preview_profile_import(archive_path: String) -> Result<ProfileImportPreview, String> {
    let file = fs::File::open(&archive_path).map_err(to_error)?;
    let mut archive = zip::ZipArchive::new(file).map_err(to_error)?;
    if archive.len() > 100_000 {
        return Err("Profile archive contains too many entries.".into());
    }
    let mut embedded_files = 0usize;
    let mut manifest_bytes = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(to_error)?;
        if archive_is_symlink(entry.unix_mode()) {
            return Err("Profile archive contains a symbolic link.".into());
        }
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| "Profile archive contains an unsafe path.".to_string())?;
        validate_archive_relative(&relative)?;
        if entry.name() == "manifest.json" {
            if entry.size() > 5 * 1024 * 1024 {
                return Err("Profile manifest is unexpectedly large.".into());
            }
            entry.read_to_end(&mut manifest_bytes).map_err(to_error)?;
        }
        if entry.name().starts_with("files/") && !entry.is_dir() {
            embedded_files += 1;
        }
    }
    let manifest: serde_json::Value = serde_json::from_slice(&manifest_bytes).map_err(to_error)?;
    if manifest
        .get("schemaVersion")
        .and_then(|value| value.as_u64())
        != Some(1)
        || manifest.get("app").and_then(|value| value.as_str()) != Some("ZAILON")
    {
        return Err("Unsupported or invalid ZAILON profile archive.".into());
    }
    let warnings = if embedded_files == 0 {
        vec![
            "Archive légère : les mods absents devront être téléchargés ou importés séparément."
                .into(),
        ]
    } else {
        Vec::new()
    };
    Ok(ProfileImportPreview {
        manifest,
        archive_path,
        embedded_files,
        missing_mod_names: Vec::new(),
        warnings,
    })
}

#[tauri::command]
fn extract_profile_archive(
    archive_path: String,
    destination: String,
) -> Result<Vec<String>, String> {
    let file = fs::File::open(archive_path).map_err(to_error)?;
    let mut archive = zip::ZipArchive::new(file).map_err(to_error)?;
    if archive.len() > 100_000 {
        return Err("Profile archive contains too many entries.".into());
    }
    let destination = PathBuf::from(destination);
    fs::create_dir_all(&destination).map_err(to_error)?;
    let stage = destination.join(format!(".zailon-profile-import-{}", unix_timestamp()));
    fs::create_dir_all(&stage).map_err(to_error)?;
    let result = (|| {
        let mut total = 0u64;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(to_error)?;
            if !entry.name().starts_with("files/") {
                continue;
            }
            if archive_is_symlink(entry.unix_mode()) {
                return Err("Profile archive contains a symbolic link.".into());
            }
            total = total.saturating_add(entry.size());
            if total > 4 * 1024 * 1024 * 1024 {
                return Err("Profile archive exceeds the 4 GB extraction limit.".into());
            }
            let enclosed = entry
                .enclosed_name()
                .ok_or_else(|| "Profile archive contains an unsafe path.".to_string())?;
            let relative = enclosed.strip_prefix("files").map_err(to_error)?;
            if relative.as_os_str().is_empty() {
                continue;
            }
            validate_archive_relative(relative)?;
            let output = stage.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&output).map_err(to_error)?;
            } else {
                if let Some(parent) = output.parent() {
                    fs::create_dir_all(parent).map_err(to_error)?;
                }
                let mut output_file = fs::File::create(&output).map_err(to_error)?;
                copy(&mut entry, &mut output_file).map_err(to_error)?;
            }
        }
        let mut installed = Vec::new();
        for entry in fs::read_dir(&stage)
            .map_err(to_error)?
            .filter_map(Result::ok)
        {
            let name = entry.file_name().to_string_lossy().to_string();
            let target = unique_destination(&destination, &name);
            fs::rename(entry.path(), &target).map_err(to_error)?;
            installed.push(target.to_string_lossy().to_string());
        }
        Ok(installed)
    })();
    let _ = fs::remove_dir_all(&stage);
    result
}

fn provider_credential(provider: &str) -> Result<keyring::Entry, String> {
    if !matches!(provider, "nexus" | "curseforge") {
        return Err("Unknown provider.".into());
    }
    keyring::Entry::new("io.github.n7t0of.zailon", &format!("{provider}-api-key")).map_err(to_error)
}

#[tauri::command]
fn set_provider_secret(provider: String, secret: String) -> Result<(), String> {
    let secret = secret.trim();
    if secret.len() < 8 || secret.len() > 4096 {
        return Err("Provider credential has an invalid length.".into());
    }
    provider_credential(&provider)?
        .set_password(secret)
        .map_err(to_error)
}

#[tauri::command]
fn delete_provider_secret(provider: String) -> Result<(), String> {
    let entry = provider_credential(&provider)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(to_error(error)),
    }
}

#[tauri::command]
fn provider_secret_status() -> HashMap<String, bool> {
    ["nexus", "curseforge"]
        .into_iter()
        .map(|provider| {
            let present = provider_credential(provider)
                .and_then(|entry| entry.get_password().map_err(to_error))
                .is_ok();
            (provider.to_string(), present)
        })
        .collect()
}

fn parse_nxm_url(raw: &str) -> Result<NxmRequest, String> {
    if raw.len() > 4096 {
        return Err("NXM URL is too long.".into());
    }
    let parsed = url::Url::parse(raw).map_err(|_| "Invalid NXM URL.".to_string())?;
    if parsed.scheme() != "nxm"
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Invalid NXM URL structure.".into());
    }
    let game_domain = parsed
        .host_str()
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 128
                && value.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                })
        })
        .ok_or_else(|| "NXM URL has an invalid game domain.".to_string())?
        .to_string();
    let segments = parsed
        .path_segments()
        .map(|items| items.collect::<Vec<_>>())
        .unwrap_or_default();
    if segments.len() != 4 || segments[0] != "mods" || segments[2] != "files" {
        return Err("NXM URL path must match /mods/{modId}/files/{fileId}.".into());
    }
    let mod_id = segments[1]
        .parse::<u64>()
        .map_err(|_| "NXM mod identifier is invalid.".to_string())?;
    let file_id = segments[3]
        .parse::<u64>()
        .map_err(|_| "NXM file identifier is invalid.".to_string())?;
    if mod_id == 0 || file_id == 0 {
        return Err("NXM identifiers must be positive.".into());
    }
    let query = parsed.query_pairs().collect::<HashMap<_, _>>();
    let key = query
        .get("key")
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty() && value.len() <= 512);
    let expires = query
        .get("expires")
        .and_then(|value| value.parse::<u64>().ok());
    let user_id = query
        .get("user_id")
        .and_then(|value| value.parse::<u64>().ok());
    Ok(NxmRequest {
        raw_url: raw.into(),
        game_domain,
        mod_id,
        file_id,
        key,
        expires,
        user_id,
    })
}

#[cfg(desktop)]
fn enqueue_nxm(app: &AppHandle, raw: &str) {
    if let Ok(request) = parse_nxm_url(raw) {
        if let Ok(mut pending) = app.state::<PendingExternalInstalls>().0.lock() {
            if !pending.iter().any(|item| item.raw_url == request.raw_url) {
                pending.push(request.clone());
            }
        }
        let _ = app.emit("nxm-opened", request);
    }
}

#[cfg(desktop)]
#[tauri::command]
fn pending_external_installs(state: State<'_, PendingExternalInstalls>) -> Vec<NxmRequest> {
    state
        .0
        .lock()
        .map(|items| items.clone())
        .unwrap_or_default()
}

#[cfg(desktop)]
#[tauri::command]
fn consume_external_install(
    state: State<'_, PendingExternalInstalls>,
    raw_url: String,
) -> Result<(), String> {
    let mut pending = state.0.lock().map_err(to_error)?;
    pending.retain(|item| item.raw_url != raw_url);
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn set_nxm_association(enabled: bool) -> Result<bool, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let classes = root
        .open_subkey_with_flags(
            "Software\\Classes",
            winreg::enums::KEY_READ | winreg::enums::KEY_WRITE,
        )
        .or_else(|_| root.create_subkey("Software\\Classes").map(|item| item.0))
        .map_err(to_error)?;
    if enabled {
        let executable = std::env::current_exe().map_err(to_error)?;
        let (scheme, _) = classes.create_subkey("nxm").map_err(to_error)?;
        scheme
            .set_value("", &"URL:Nexus Mods Protocol")
            .map_err(to_error)?;
        scheme.set_value("URL Protocol", &"").map_err(to_error)?;
        let (icon, _) = scheme.create_subkey("DefaultIcon").map_err(to_error)?;
        icon.set_value("", &format!("\"{}\",0", executable.display()))
            .map_err(to_error)?;
        let (command, _) = scheme
            .create_subkey("shell\\open\\command")
            .map_err(to_error)?;
        command
            .set_value("", &format!("\"{}\" \"%1\"", executable.display()))
            .map_err(to_error)?;
    } else if let Ok(command) = classes.open_subkey("nxm\\shell\\open\\command") {
        let value: String = command.get_value("").unwrap_or_default();
        let executable = std::env::current_exe()
            .map_err(to_error)?
            .to_string_lossy()
            .to_string();
        if value
            .to_ascii_lowercase()
            .contains(&executable.to_ascii_lowercase())
        {
            classes.delete_subkey_all("nxm").map_err(to_error)?;
        } else {
            return Err(
                "The nxm:// association belongs to another application and was not modified."
                    .into(),
            );
        }
    }
    nxm_association_status()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_nxm_association(_enabled: bool) -> Result<bool, String> {
    Err("Runtime nxm:// association is currently available on Windows only.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn nxm_association_status() -> Result<bool, String> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let command = match root.open_subkey("Software\\Classes\\nxm\\shell\\open\\command") {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    let value: String = command.get_value("").unwrap_or_default();
    let executable = std::env::current_exe()
        .map_err(to_error)?
        .to_string_lossy()
        .to_string();
    Ok(value
        .to_ascii_lowercase()
        .contains(&executable.to_ascii_lowercase()))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn nxm_association_status() -> Result<bool, String> {
    Ok(false)
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
    let parsed = url::Url::parse(&url).map_err(to_error)?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return Err("Only valid HTTPS mod downloads are allowed.".into());
    }
    let destination = PathBuf::from(mods_path);
    fs::create_dir_all(&destination).map_err(to_error)?;

    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid mod file name".to_string())?
        .to_string();
    validate_archive_relative(Path::new(&safe_name))?;
    let response = reqwest::Client::new()
        .get(parsed)
        .send()
        .await
        .map_err(to_error)?
        .error_for_status()
        .map_err(to_error)?;
    if response
        .content_length()
        .is_some_and(|length| length > 2 * 1024 * 1024 * 1024)
    {
        return Err("Mod download exceeds the 2 GB safety limit.".into());
    }
    let bytes = response.bytes().await.map_err(to_error)?;
    if bytes.len() as u64 > 2 * 1024 * 1024 * 1024 {
        return Err("Mod download exceeds the 2 GB safety limit.".into());
    }

    if safe_name.to_ascii_lowercase().ends_with(".zip") {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(to_error)?;
        if archive.len() > 100_000 {
            return Err("Mod archive contains too many entries.".into());
        }
        let stage = destination.join(format!(".zailon-download-{}", unix_timestamp()));
        let extract_root = stage.join(safe_archive_component(
            Path::new(&safe_name)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("mod"),
        ));
        fs::create_dir_all(&extract_root).map_err(to_error)?;
        let extraction = (|| {
            let mut total = 0u64;
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).map_err(to_error)?;
                if archive_is_symlink(entry.unix_mode()) {
                    return Err("Mod archive contains a symbolic link.".into());
                }
                let relative_path = entry
                    .enclosed_name()
                    .ok_or_else(|| "Mod archive contains an unsafe traversal path.".to_string())?;
                validate_archive_relative(&relative_path)?;
                total = total.saturating_add(entry.size());
                if total > 4 * 1024 * 1024 * 1024 {
                    return Err("Mod archive exceeds the 4 GB extraction limit.".into());
                }
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
            Ok(())
        })();
        if let Err(error) = extraction {
            let _ = fs::remove_dir_all(&stage);
            return Err(error);
        }
        let final_path = unique_destination(
            &destination,
            extract_root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("mod"),
        );
        fs::rename(&extract_root, &final_path).map_err(to_error)?;
        let _ = fs::remove_dir_all(&stage);
        Ok(final_path.to_string_lossy().to_string())
    } else {
        if forbidden_archive_file(Path::new(&safe_name)) {
            return Err("Executable downloads are blocked. Open the provider page and review them manually.".into());
        }
        let output = destination.join(safe_name);
        if output.exists() {
            return Err("A mod archive with the same file name already exists.".into());
        }
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
        assert!(allowed_resource_extension("background", "svg"));
        assert!(allowed_resource_extension("video", "MP4"));
        assert!(!allowed_resource_extension("cover", "exe"));
        assert!(!allowed_resource_extension("video", "gif"));
    }

    #[test]
    fn accepts_only_secure_trusted_external_links() {
        assert!(validate_external_url("https://gamebanana.com/mods/123").is_ok());
        assert!(validate_external_url("https://api.gamebanana.com/Core/List/New").is_ok());
        assert!(validate_external_url("http://gamebanana.com/mods/123").is_err());
        assert!(validate_external_url("https://gamebanana.com.evil.example/mods/123").is_err());
        assert!(validate_external_url("file:///C:/Windows/System32/cmd.exe").is_err());
    }

    #[test]
    fn validates_nxm_urls_without_accepting_ambiguous_paths() {
        let parsed = parse_nxm_url(
            "nxm://cyberpunk2077/mods/42/files/99?key=temporary&expires=1999999999&user_id=7",
        )
        .expect("valid nxm URL");
        assert_eq!(parsed.game_domain, "cyberpunk2077");
        assert_eq!(parsed.mod_id, 42);
        assert_eq!(parsed.file_id, 99);
        assert!(parse_nxm_url("https://nexusmods.com/mods/42").is_err());
        assert!(parse_nxm_url("nxm://game/mods/0/files/2").is_err());
        assert!(parse_nxm_url("nxm://game/mods/1/files/2/extra").is_err());
        assert!(parse_nxm_url("nxm://game@evil/mods/1/files/2").is_err());
    }

    #[test]
    fn blocks_archive_traversal_reserved_names_and_executables() {
        assert!(validate_archive_relative(Path::new("safe/mod.archive")).is_ok());
        assert!(validate_archive_relative(Path::new("../outside.txt")).is_err());
        assert!(validate_archive_relative(Path::new("CON/readme.txt")).is_err());
        assert!(validate_archive_relative(Path::new("files/setup.exe")).is_err());
        assert!(validate_archive_relative(Path::new("folder/name.")).is_err());
    }

    #[test]
    fn scanner_detects_cyberpunk_metadata_and_stable_fingerprint() {
        let root = std::env::temp_dir().join(format!("zailon-scan-test-{}", unix_timestamp()));
        let mod_root = root.join("archive").join("pc").join("mod").join("example");
        fs::create_dir_all(&mod_root).expect("create test mod");
        fs::write(mod_root.join("example.archive"), b"test").expect("write archive");
        fs::write(
            mod_root.join("manifest.json"),
            br#"{"version":"1.2.3","source":"https://www.nexusmods.com/cyberpunk2077/mods/42"}"#,
        )
        .expect("write manifest");
        let first = inspect_native_mod(&mod_root);
        let second = inspect_native_mod(&mod_root);
        assert_eq!(first.framework, "Cyberpunk 2077");
        assert_eq!(first.version.as_deref(), Some("1.2.3"));
        assert_eq!(first.fingerprint, second.fingerprint);
        assert!(first
            .source_url
            .as_deref()
            .is_some_and(|url| url.contains("nexusmods.com")));
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn copy_import_never_overwrites_an_existing_destination() {
        let root = std::env::temp_dir().join(format!("zailon-copy-test-{}", unix_timestamp()));
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&destination).expect("destination");
        fs::write(source.join("mod.pak"), b"new").expect("source file");
        fs::write(destination.join("mod.pak"), b"existing").expect("existing file");
        let unique = unique_destination(&destination, "mod.pak");
        assert_ne!(unique, destination.join("mod.pak"));
        copy_tree(&source.join("mod.pak"), &unique).expect("copy");
        assert_eq!(
            fs::read(destination.join("mod.pak")).expect("read"),
            b"existing"
        );
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[cfg(desktop)]
    #[test]
    fn excludes_known_steam_tools_from_game_results() {
        assert!(is_steam_runtime_or_tool("Steam Linux Runtime 3.0"));
        assert!(is_steam_runtime_or_tool("Proton Experimental"));
        assert!(!is_steam_runtime_or_tool("Baldur's Gate 3"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn classifies_major_windows_game_providers() {
        assert_eq!(windows_provider("EA app", "Electronic Arts", ""), "EA app");
        assert_eq!(
            windows_provider("Ubisoft Connect", "Ubisoft", ""),
            "Ubisoft Connect"
        );
        assert_eq!(
            windows_provider("Battle.net", "Blizzard Entertainment", ""),
            "Battle.net"
        );
        assert_eq!(
            windows_provider("A local utility", "Independent", "C:\\Tools"),
            "Applications Windows"
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .manage(PendingExternalInstalls(Mutex::new(Vec::new())))
        .plugin(tauri_plugin_single_instance::init(
            |app, args, _working_directory| {
                for argument in args {
                    if argument.starts_with("nxm://") {
                        enqueue_nxm(app, &argument);
                    }
                }
            },
        ));
    builder
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
                for argument in std::env::args() {
                    if argument.starts_with("nxm://") {
                        enqueue_nxm(app.handle(), &argument);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_mods,
            scan_mod_import,
            toggle_mod,
            delete_mod,
            ensure_dir,
            launch_game,
            guess_mods_path,
            install_mod,
            import_mod_candidates,
            export_profile,
            preview_profile_import,
            extract_profile_archive,
            set_provider_secret,
            delete_provider_secret,
            provider_secret_status,
            set_nxm_association,
            nxm_association_status,
            store_game_resource,
            remove_game_resource,
            open_path,
            open_external_url,
            prepare_update_backup,
            record_update_event,
            open_update_log,
            #[cfg(desktop)]
            scan_steam_games,
            #[cfg(desktop)]
            scan_library,
            #[cfg(desktop)]
            pending_external_installs,
            #[cfg(desktop)]
            consume_external_install,
            #[cfg(desktop)]
            check_for_update,
            #[cfg(desktop)]
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZAILON");
}
