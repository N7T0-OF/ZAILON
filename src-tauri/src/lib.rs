use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    io::{copy, Cursor, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};
use walkdir::WalkDir;

#[cfg(desktop)]
use steamlocate::{Library, SteamDir};
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
    storage: String,
    stage_id: Option<String>,
    profile_ids: Vec<String>,
    deployment_status: String,
    diagnostics: Vec<String>,
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
    #[serde(skip_serializing)]
    raw_url: String,
    request_id: String,
    game_domain: String,
    mod_id: u64,
    file_id: u64,
    #[serde(skip_serializing)]
    key: Option<String>,
    expires: Option<u64>,
    user_id: Option<u64>,
}

#[cfg(desktop)]
struct PendingExternalInstalls(Mutex<Vec<NxmRequest>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutLaunchRequest {
    raw_url: String,
    game_id: String,
    profile_id: String,
}

#[cfg(desktop)]
struct PendingShortcutLaunches(Mutex<Vec<ShortcutLaunchRequest>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderConnectionStatus {
    provider: String,
    configured: bool,
    connected: bool,
    masked_secret: Option<String>,
    account_name: Option<String>,
    last_checked_at: Option<u64>,
    hourly_remaining: Option<u64>,
    hourly_limit: Option<u64>,
    daily_remaining: Option<u64>,
    daily_limit: Option<u64>,
    message: String,
}

struct ProviderConnectionCache(Mutex<HashMap<String, ProviderConnectionStatus>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundTaskSnapshot {
    id: String,
    kind: String,
    title: String,
    status: String,
    processed: u64,
    total: u64,
    message: String,
    started_at: u64,
    updated_at: u64,
    error: Option<String>,
}

#[derive(Clone)]
struct BackgroundTaskEntry {
    snapshot: BackgroundTaskSnapshot,
    cancel: Arc<AtomicBool>,
}

#[derive(Clone)]
struct BackgroundTaskRegistry(Arc<Mutex<HashMap<String, BackgroundTaskEntry>>>);

trait DiscordStream: Read + Write + Send {}
impl<T: Read + Write + Send> DiscordStream for T {}

#[derive(Clone)]
struct DiscordRuntime(Arc<Mutex<Option<Box<dyn DiscordStream>>>>);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresenceConfig {
    enabled: bool,
    client_id: String,
    large_image_key: Option<String>,
    show_profile: bool,
    show_mod_count: bool,
    show_elapsed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscordConnectionStatus {
    connected: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchGameResult {
    pid: u32,
    discord_connected: bool,
    discord_message: String,
    deployment_backend: String,
    deployed_files: usize,
    conflicts_resolved: usize,
    deployment_status: String,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchConflictRule {
    path: String,
    winner_mod_id: String,
}

#[derive(Debug, Clone)]
struct DeploymentEntry {
    relative: PathBuf,
    had_original: bool,
    deployed_signature: u64,
}

#[derive(Debug, Clone)]
struct DeploymentSession {
    game_root: PathBuf,
    session_root: PathBuf,
    overwrite_root: PathBuf,
    entries: Vec<DeploymentEntry>,
}

struct PreparedDeployment {
    session: Option<DeploymentSession>,
    deployed_files: usize,
    conflicts_resolved: usize,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameProcessEvent {
    pid: u32,
    game_id: String,
    game_name: String,
    profile_id: String,
    exit_code: Option<i32>,
    cleanup_error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
enum BackgroundTaskEvent {
    #[serde(rename_all = "camelCase")]
    Progress { task: BackgroundTaskSnapshot },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NexusCatalogGame {
    name: String,
    domain: String,
    mod_count: u64,
    download_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NexusCatalogMod {
    id: String,
    mod_id: u64,
    name: String,
    author: String,
    game: String,
    game_domain: String,
    thumbnail: String,
    downloads: u64,
    endorsements: u64,
    description: String,
    version: Option<String>,
    updated_at: Option<u64>,
    nsfw: bool,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtworkCandidate {
    id: String,
    provider: String,
    source_label: String,
    game_name: String,
    kind: String,
    url: String,
    width: Option<u64>,
    height: Option<u64>,
    attribution: String,
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

fn background_tasks_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(update_data_root(app)?.join("background-tasks.json"))
}

fn persist_background_tasks(app: &AppHandle, registry: &BackgroundTaskRegistry) {
    let snapshots = registry
        .0
        .lock()
        .map(|tasks| {
            tasks
                .values()
                .map(|entry| entry.snapshot.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if let (Ok(path), Ok(payload)) = (
        background_tasks_path(app),
        serde_json::to_vec_pretty(&snapshots),
    ) {
        let _ = fs::write(path, payload);
    }
}

fn restore_background_tasks(app: &AppHandle, registry: &BackgroundTaskRegistry) {
    let Ok(path) = background_tasks_path(app) else {
        return;
    };
    let Ok(payload) = fs::read(path) else { return };
    let Ok(mut snapshots) = serde_json::from_slice::<Vec<BackgroundTaskSnapshot>>(&payload) else {
        return;
    };
    snapshots.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    snapshots.truncate(100);
    if let Ok(mut tasks) = registry.0.lock() {
        for mut snapshot in snapshots {
            if snapshot.status == "running" {
                snapshot.status = "interrupted".into();
                snapshot.message = "Interrompu par la fermeture précédente de ZAILON.".into();
                snapshot.updated_at = unix_timestamp();
            }
            tasks.insert(
                snapshot.id.clone(),
                BackgroundTaskEntry {
                    snapshot,
                    cancel: Arc::new(AtomicBool::new(false)),
                },
            );
        }
    }
}

fn register_background_task(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    id: String,
    kind: &str,
    title: &str,
    total: u64,
) -> Result<Arc<AtomicBool>, String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Invalid background task identifier.".into());
    }
    let now = unix_timestamp();
    let cancel = Arc::new(AtomicBool::new(false));
    let snapshot = BackgroundTaskSnapshot {
        id: id.clone(),
        kind: kind.into(),
        title: title.into(),
        status: "running".into(),
        processed: 0,
        total,
        message: "Démarrage…".into(),
        started_at: now,
        updated_at: now,
        error: None,
    };
    let mut tasks = registry
        .0
        .lock()
        .map_err(|_| "Background task registry is unavailable.".to_string())?;
    if tasks
        .get(&id)
        .is_some_and(|entry| entry.snapshot.status == "running")
    {
        return Err("A background task with this identifier is already running.".into());
    }
    tasks.insert(
        id,
        BackgroundTaskEntry {
            snapshot: snapshot.clone(),
            cancel: cancel.clone(),
        },
    );
    drop(tasks);
    let _ = app.emit("background-task-changed", snapshot);
    persist_background_tasks(app, registry);
    Ok(cancel)
}

fn report_background_task(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    channel: Option<&Channel<BackgroundTaskEvent>>,
    id: &str,
    processed: u64,
    total: u64,
    message: String,
) {
    let snapshot = registry.0.lock().ok().and_then(|mut tasks| {
        let entry = tasks.get_mut(id)?;
        entry.snapshot.processed = processed;
        entry.snapshot.total = total;
        entry.snapshot.message = message;
        entry.snapshot.updated_at = unix_timestamp();
        Some(entry.snapshot.clone())
    });
    if let Some(snapshot) = snapshot {
        if let Some(channel) = channel {
            let _ = channel.send(BackgroundTaskEvent::Progress {
                task: snapshot.clone(),
            });
        }
        let _ = app.emit("background-task-changed", snapshot);
        persist_background_tasks(app, registry);
    }
}

fn finish_background_task(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    channel: Option<&Channel<BackgroundTaskEvent>>,
    id: &str,
    status: &str,
    message: String,
    error: Option<String>,
) {
    let snapshot = registry.0.lock().ok().and_then(|mut tasks| {
        let entry = tasks.get_mut(id)?;
        entry.snapshot.status = status.into();
        entry.snapshot.processed = if status == "completed" {
            entry.snapshot.total
        } else {
            entry.snapshot.processed
        };
        entry.snapshot.message = message;
        entry.snapshot.error = error;
        entry.snapshot.updated_at = unix_timestamp();
        Some(entry.snapshot.clone())
    });
    if let Some(snapshot) = snapshot {
        if let Some(channel) = channel {
            let _ = channel.send(BackgroundTaskEvent::Progress {
                task: snapshot.clone(),
            });
        }
        let _ = app.emit("background-task-changed", snapshot);
        persist_background_tasks(app, registry);
    }
}

#[tauri::command]
fn background_tasks(state: State<'_, BackgroundTaskRegistry>) -> Vec<BackgroundTaskSnapshot> {
    let mut snapshots = state
        .0
        .lock()
        .map(|tasks| {
            tasks
                .values()
                .map(|entry| entry.snapshot.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    snapshots.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    snapshots
}

#[tauri::command]
fn cancel_background_task(
    state: State<'_, BackgroundTaskRegistry>,
    task_id: String,
) -> Result<(), String> {
    let tasks = state
        .0
        .lock()
        .map_err(|_| "Background task registry is unavailable.".to_string())?;
    let task = tasks
        .get(&task_id)
        .ok_or_else(|| "Background task not found.".to_string())?;
    if task.snapshot.status == "running" {
        task.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
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

fn allowed_artwork_host(host: &str) -> bool {
    [
        "steamstatic.com",
        "steamusercontent.com",
        "nexusmods.com",
        "nexus-cdn.com",
    ]
    .iter()
    .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

fn image_extension(content_type: Option<&str>, url: &url::Url) -> Option<&'static str> {
    match content_type
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
    {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/avif" => Some("avif"),
        _ => match url
            .path_segments()
            .and_then(|segments| segments.last())
            .and_then(|name| name.rsplit('.').next())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "png" => Some("png"),
            "jpg" | "jpeg" => Some("jpg"),
            "webp" => Some("webp"),
            "gif" => Some("gif"),
            "avif" => Some("avif"),
            _ => None,
        },
    }
}

fn valid_image_bytes(bytes: &[u8], extension: &str) -> bool {
    match extension {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        "avif" => {
            bytes.len() >= 12
                && &bytes[4..8] == b"ftyp"
                && (&bytes[8..12] == b"avif" || &bytes[8..12] == b"avis")
        }
        _ => false,
    }
}

#[tauri::command]
async fn cache_remote_game_resource(
    app: AppHandle,
    game_id: String,
    kind: String,
    source_url: String,
) -> Result<String, String> {
    if !matches!(
        kind.as_str(),
        "cover" | "logo" | "icon" | "background" | "banner"
    ) {
        return Err("Remote artwork is not supported for this resource slot.".into());
    }
    let parsed =
        url::Url::parse(&source_url).map_err(|_| "The artwork URL is invalid.".to_string())?;
    let host = parsed
        .host_str()
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "The artwork URL has no host.".to_string())?;
    if parsed.scheme() != "https" || !allowed_artwork_host(&host) {
        return Err("This artwork provider is not in ZAILON's trusted source list.".into());
    }
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Unable to initialize the artwork download.".to_string())?
        .get(parsed.clone())
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The artwork download timed out.".to_string()
            } else {
                "The artwork provider is unavailable.".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "The artwork provider returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    const MAX_IMAGE_SIZE: u64 = 50 * 1024 * 1024;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_IMAGE_SIZE)
    {
        return Err("The remote artwork exceeds the 50 MB safety limit.".into());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let extension = image_extension(content_type.as_deref(), &parsed)
        .ok_or_else(|| "The remote resource is not a supported image.".to_string())?;
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Unable to read the remote artwork.".to_string())?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE || !valid_image_bytes(&bytes, extension) {
        return Err("The remote resource failed image validation.".into());
    }
    let directory = game_resource_directory(&app, &game_id)?;
    let mut destination =
        directory.join(format!("{kind}-remote-{}.{}", unix_timestamp(), extension));
    let mut suffix = 1;
    while destination.exists() {
        destination = directory.join(format!(
            "{kind}-remote-{}-{suffix}.{}",
            unix_timestamp(),
            extension
        ));
        suffix += 1;
    }
    fs::write(&destination, &bytes).map_err(to_error)?;
    Ok(destination.to_string_lossy().to_string())
}

fn push_artwork_candidate(
    candidates: &mut Vec<ArtworkCandidate>,
    seen: &mut HashSet<String>,
    game_name: &str,
    kind: &str,
    url: String,
    width: Option<u64>,
    height: Option<u64>,
) {
    let url = safe_remote_image(url);
    if url.is_empty() || !seen.insert(url.clone()) {
        return;
    }
    candidates.push(ArtworkCandidate {
        id: format!("steam-{}", candidates.len() + 1),
        provider: "steam".into(),
        source_label: "Steam officiel".into(),
        game_name: game_name.into(),
        kind: kind.into(),
        url,
        width,
        height,
        attribution:
            "Image fournie par le catalogue officiel Steam. Vérifiez l'aperçu avant utilisation."
                .into(),
    });
}

#[tauri::command]
async fn search_game_artwork(
    game_name: String,
    provider: Option<String>,
    provider_game_id: Option<String>,
    kind: String,
) -> Result<Vec<ArtworkCandidate>, String> {
    if !matches!(
        kind.as_str(),
        "cover" | "logo" | "icon" | "background" | "banner"
    ) {
        return Err("Automatic search is only available for image slots.".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Unable to initialize the Steam artwork search.".to_string())?;
    let mut app_id = provider_game_id
        .filter(|value| value.chars().all(|character| character.is_ascii_digit()))
        .filter(|value| !value.is_empty());
    let mut matched_name = game_name.trim().to_string();
    if app_id.is_none()
        && provider.as_deref().map_or(true, |value| {
            value.eq_ignore_ascii_case("steam") || value.eq_ignore_ascii_case("standalone")
        })
    {
        let mut search_url =
            url::Url::parse("https://store.steampowered.com/api/storesearch/").map_err(to_error)?;
        search_url
            .query_pairs_mut()
            .append_pair("term", game_name.trim())
            .append_pair("l", "french")
            .append_pair("cc", "FR");
        if let Ok(response) = client.get(search_url).send().await {
            if response.status().is_success() {
                if let Ok(payload) = response.json::<serde_json::Value>().await {
                    if let Some(item) = payload
                        .get("items")
                        .and_then(|value| value.as_array())
                        .and_then(|items| items.first())
                    {
                        app_id = item
                            .get("id")
                            .and_then(|value| value.as_u64())
                            .map(|value| value.to_string());
                        matched_name = item
                            .get("name")
                            .and_then(|value| value.as_str())
                            .unwrap_or(&matched_name)
                            .to_string();
                    }
                }
            }
        }
    }
    let app_id = app_id
        .ok_or_else(|| "Aucun identifiant Steam fiable n'a été trouvé pour ce jeu.".to_string())?;
    if !app_id.chars().all(|character| character.is_ascii_digit()) {
        return Err("The Steam application identifier is invalid.".into());
    }
    let details = client
        .get(format!(
            "https://store.steampowered.com/api/appdetails?appids={app_id}&l=french&cc=FR"
        ))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "La recherche Steam a expiré.".to_string()
            } else {
                "Steam est actuellement inaccessible.".to_string()
            }
        })?;
    let payload = if details.status().is_success() {
        details
            .json::<serde_json::Value>()
            .await
            .unwrap_or_default()
    } else {
        serde_json::Value::Null
    };
    let data = payload
        .get(&app_id)
        .and_then(|value| value.get("data"))
        .cloned()
        .unwrap_or_default();
    if let Some(name) = data.get("name").and_then(|value| value.as_str()) {
        matched_name = name.to_string();
    }
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    match kind.as_str() {
        "cover" => {
            push_artwork_candidate(&mut candidates, &mut seen, &matched_name, &kind, format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg"), Some(1200), Some(1800));
            push_artwork_candidate(&mut candidates, &mut seen, &matched_name, &kind, format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"), Some(600), Some(900));
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                nexus_json_string(&data, &["capsule_image", "header_image"]),
                None,
                None,
            );
        }
        "logo" => {
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/logo.png"),
                None,
                None,
            );
        }
        "background" => {
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_hero.jpg"
                ),
                Some(1920),
                Some(620),
            );
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                nexus_json_string(&data, &["background_raw", "background"]),
                None,
                None,
            );
            if let Some(url) = data
                .get("screenshots")
                .and_then(|value| value.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("path_full"))
                .and_then(|value| value.as_str())
            {
                push_artwork_candidate(
                    &mut candidates,
                    &mut seen,
                    &matched_name,
                    &kind,
                    url.into(),
                    None,
                    None,
                );
            }
        }
        "banner" => {
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_hero.jpg"
                ),
                Some(1920),
                Some(620),
            );
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                nexus_json_string(&data, &["header_image"]),
                None,
                None,
            );
        }
        "icon" => {
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/capsule_231x87.jpg"
                ),
                Some(231),
                Some(87),
            );
            push_artwork_candidate(
                &mut candidates,
                &mut seen,
                &matched_name,
                &kind,
                nexus_json_string(&data, &["header_image"]),
                None,
                None,
            );
        }
        _ => {}
    }
    if candidates.is_empty() {
        return Err("Steam n'a fourni aucune image pour cet emplacement.".into());
    }
    Ok(candidates)
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
    let allowed_hosts = [
        "gamebanana.com",
        "nexusmods.com",
        "curseforge.com",
        "ko-fi.com",
        "paypal.com",
        "haunt.gg",
    ];
    if !allowed_hosts
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
    {
        return Err("This source is not in ZAILON's trusted link list.".into());
    }
    let is_creator_host = ["ko-fi.com", "paypal.com", "haunt.gg"]
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")));
    if is_creator_host {
        let creator_link_is_exact = match host.as_str() {
            "ko-fi.com" => parsed.path() == "/souanptm",
            "www.paypal.com" => parsed.path() == "/paypalme/souanpt",
            "haunt.gg" => parsed.path() == "/souanpt",
            _ => false,
        };
        if !creator_link_is_exact || parsed.query().is_some() || parsed.fragment().is_some() {
            return Err("This creator link is not in ZAILON's exact HTTPS allowlist.".into());
        }
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
        storage: "game-folder".into(),
        stage_id: None,
        profile_ids: Vec::new(),
        deployment_status: "unknown".into(),
        diagnostics: Vec::new(),
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

fn has_direct_mod_signature(path: &Path) -> bool {
    if !path.is_dir() {
        return is_probable_mod_root(path);
    }
    let metadata = [
        "manifest.json",
        "mod.json",
        "info.json",
        "package.json",
        "meta.ini",
        "fomod/info.xml",
        "nexusmods.txt",
    ];
    if metadata.iter().any(|name| path.join(name).is_file()) {
        return true;
    }
    fs::read_dir(path)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| entry.is_file())
        .any(|entry| {
            matches!(
                entry
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase())
                    .as_deref(),
                Some("pak" | "archive" | "esp" | "esm" | "esl" | "dll" | "asi")
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
        "r6/tweaks",
        "red4ext/plugins",
        "bin/x64/plugins",
        "bin/x64/plugins/cyber_engine_tweaks/mods",
        "mods",
        "tools",
        "engine",
    ];
    if cyberpunk_locations
        .iter()
        .any(|location| path.join(location).exists())
    {
        // A game-root-shaped selection may contain several framework roots that belong
        // to the same composite mod. Keep it intact instead of splitting its payload.
        return vec![path.to_path_buf()];
    }
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
    if !direct.is_empty() && !has_direct_mod_signature(path) {
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
    if paths.is_empty() {
        return Err("Select at least one import folder.".into());
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

fn scan_mod_import_background_impl(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    channel: &Channel<BackgroundTaskEvent>,
    task_id: &str,
    paths: Vec<String>,
    game_name: String,
    cancel: &AtomicBool,
) -> Result<Vec<ModImportCandidate>, String> {
    if paths.is_empty() {
        return Err("Select at least one import folder.".into());
    }
    let mut unique = HashSet::new();
    let mut roots = Vec::new();
    for (index, selected) in paths.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err("TASK_CANCELLED".into());
        }
        let path = PathBuf::from(selected);
        if path.exists() {
            for root in import_candidate_roots(&path) {
                let canonical = fs::canonicalize(&root).map_err(to_error)?;
                if unique.insert(canonical.clone()) {
                    roots.push(canonical);
                }
            }
        }
        report_background_task(
            app,
            registry,
            Some(channel),
            task_id,
            index as u64 + 1,
            paths.len() as u64,
            format!(
                "Exploration du dossier racine {} / {}",
                index + 1,
                paths.len()
            ),
        );
    }
    let total = roots.len() as u64;
    report_background_task(
        app,
        registry,
        Some(channel),
        task_id,
        0,
        total,
        format!("{total} racine(s) de mod détectée(s). Analyse des fichiers…"),
    );
    let mut candidates = Vec::with_capacity(roots.len());
    for (index, canonical) in roots.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err("TASK_CANCELLED".into());
        }
        let inspected = inspect_native_mod(&canonical);
        let strong = inspected.framework != "Generic" || !inspected.manifests.is_empty();
        let mut warnings = Vec::new();
        if inspected.source_url.is_none() {
            warnings.push(
                "Aucune source exacte détectée : aucune mise à jour automatique ne sera autorisée."
                    .into(),
            );
        }
        if inspected.framework == "Generic" {
            warnings.push(format!(
                "Structure générique pour {game_name} : vérifiez la destination avant import."
            ));
        }
        let name = inspected.name.clone();
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
        report_background_task(
            app,
            registry,
            Some(channel),
            task_id,
            index as u64 + 1,
            total,
            format!("Analyse de {name} ({}/{total})", index + 1),
        );
    }
    candidates.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    Ok(candidates)
}

#[tauri::command]
async fn scan_mod_import_background(
    app: AppHandle,
    state: State<'_, BackgroundTaskRegistry>,
    task_id: String,
    paths: Vec<String>,
    game_name: String,
    on_event: Channel<BackgroundTaskEvent>,
) -> Result<Vec<ModImportCandidate>, String> {
    let registry = state.inner().clone();
    let cancel = register_background_task(
        &app,
        &registry,
        task_id.clone(),
        "mod-scan",
        &format!("Analyse des mods · {game_name}"),
        paths.len() as u64,
    )?;
    let worker_app = app.clone();
    let worker_registry = registry.clone();
    let worker_task_id = task_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        scan_mod_import_background_impl(
            &worker_app,
            &worker_registry,
            &on_event,
            &worker_task_id,
            paths,
            game_name,
            &cancel,
        )
    })
    .await
    .map_err(|_| "The background scan stopped unexpectedly.".to_string())?;
    match &result {
        Ok(candidates) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "completed",
            format!("{} mod(s) analysé(s).", candidates.len()),
            None,
        ),
        Err(error) if error == "TASK_CANCELLED" => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "cancelled",
            "Analyse annulée.".into(),
            None,
        ),
        Err(error) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "failed",
            "Échec de l'analyse des mods.".into(),
            Some(error.clone()),
        ),
    }
    result.map_err(|error| {
        if error == "TASK_CANCELLED" {
            "Analyse annulée.".into()
        } else {
            error
        }
    })
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
fn discord_write_frame(
    stream: &mut dyn DiscordStream,
    opcode: u32,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let body = serde_json::to_vec(payload)
        .map_err(|_| "Unable to encode the Discord activity.".to_string())?;
    if body.len() > 64 * 1024 {
        return Err("Discord activity payload is too large.".into());
    }
    stream
        .write_all(&opcode.to_le_bytes())
        .map_err(|_| "Unable to write to Discord IPC.".to_string())?;
    stream
        .write_all(&(body.len() as u32).to_le_bytes())
        .map_err(|_| "Unable to write to Discord IPC.".to_string())?;
    stream
        .write_all(&body)
        .map_err(|_| "Unable to write to Discord IPC.".to_string())?;
    stream
        .flush()
        .map_err(|_| "Unable to flush Discord IPC.".to_string())
}

fn open_discord_stream() -> Result<Box<dyn DiscordStream>, String> {
    #[cfg(target_os = "windows")]
    {
        for index in 0..10 {
            let path = format!(r"\\.\pipe\discord-ipc-{index}");
            if let Ok(stream) = fs::OpenOptions::new().read(true).write(true).open(path) {
                return Ok(Box::new(stream));
            }
        }
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::net::UnixStream;
        let mut roots = Vec::new();
        if let Some(path) = std::env::var_os("XDG_RUNTIME_DIR") {
            roots.push(PathBuf::from(path));
        }
        if let Some(path) = std::env::var_os("TMPDIR") {
            roots.push(PathBuf::from(path));
        }
        roots.push(PathBuf::from("/tmp"));
        for root in roots {
            for index in 0..10 {
                for path in [
                    root.join(format!("discord-ipc-{index}")),
                    root.join("app/com.discordapp.Discord")
                        .join(format!("discord-ipc-{index}")),
                ] {
                    if let Ok(stream) = UnixStream::connect(path) {
                        return Ok(Box::new(stream));
                    }
                }
            }
        }
    }
    Err("Discord n'est pas lancé ou son canal IPC est indisponible.".into())
}

fn valid_discord_identifier(value: &str) -> bool {
    (5..=32).contains(&value.len()) && value.chars().all(|character| character.is_ascii_digit())
}

fn discord_handshake(client_id: &str) -> Result<Box<dyn DiscordStream>, String> {
    if !valid_discord_identifier(client_id) {
        return Err(
            "L'identifiant d'application Discord doit contenir uniquement des chiffres.".into(),
        );
    }
    let mut stream = open_discord_stream()?;
    discord_write_frame(
        &mut *stream,
        0,
        &serde_json::json!({ "v": 1, "client_id": client_id }),
    )?;
    Ok(stream)
}

fn clean_discord_text(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>()
}

fn set_discord_activity(
    runtime: &DiscordRuntime,
    config: &DiscordPresenceConfig,
    game_name: &str,
    profile_name: &str,
    active_mods: usize,
) -> Result<(), String> {
    let mut stream = discord_handshake(config.client_id.trim())?;
    let state = match (config.show_profile, config.show_mod_count) {
        (true, true) => format!("Profil {profile_name} · {active_mods} mod(s) actif(s)"),
        (true, false) => format!("Profil {profile_name}"),
        (false, true) => format!("{active_mods} mod(s) actif(s)"),
        (false, false) => "Lancé avec ZAILON".into(),
    };
    let mut activity = serde_json::json!({
        "details": clean_discord_text(game_name),
        "state": clean_discord_text(&state),
        "instance": false
    });
    if config.show_elapsed {
        activity["timestamps"] = serde_json::json!({ "start": unix_timestamp() });
    }
    if let Some(image_key) = config
        .large_image_key
        .as_deref()
        .map(str::trim)
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 128
                && value.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                })
        })
    {
        activity["assets"] = serde_json::json!({
            "large_image": image_key,
            "large_text": clean_discord_text(game_name)
        });
    }
    discord_write_frame(
        &mut *stream,
        1,
        &serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": activity },
            "nonce": format!("{}-{}", unix_timestamp(), std::process::id())
        }),
    )?;
    *runtime
        .0
        .lock()
        .map_err(|_| "Discord runtime is unavailable.".to_string())? = Some(stream);
    Ok(())
}

fn clear_discord_activity(runtime: &DiscordRuntime) {
    if let Ok(mut current) = runtime.0.lock() {
        if let Some(mut stream) = current.take() {
            let _ = discord_write_frame(
                &mut *stream,
                1,
                &serde_json::json!({
                    "cmd": "SET_ACTIVITY",
                    "args": { "pid": std::process::id(), "activity": null },
                    "nonce": format!("clear-{}", unix_timestamp())
                }),
            );
        }
    }
}

fn file_signature(path: &Path) -> Result<u64, String> {
    let mut file = fs::File::open(path).map_err(to_error)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(to_error)?;
        if read == 0 {
            break;
        }
        buffer[..read].hash(&mut hasher);
    }
    Ok(hasher.finish())
}

fn deployment_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn known_game_path_exists(game_root: &Path, relative: &str) -> bool {
    let direct = game_root.join(relative);
    if direct.exists() {
        return true;
    }
    let mut current = game_root.to_path_buf();
    for component in relative
        .replace('\\', "/")
        .split('/')
        .filter(|item| !item.is_empty())
    {
        let Ok(entries) = fs::read_dir(&current) else {
            return false;
        };
        let Some(next) = entries.filter_map(Result::ok).find(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(component)
        }) else {
            return false;
        };
        current = next.path();
    }
    current.exists()
}

fn framework_diagnostics(game_root: &Path, relatives: &[PathBuf]) -> Result<Vec<String>, String> {
    let keys = relatives
        .iter()
        .map(|path| deployment_key(path))
        .collect::<Vec<_>>();
    let supplied = |needle: &str| keys.iter().any(|path| path.starts_with(needle));
    let existing_or_supplied = |relative: &str| {
        known_game_path_exists(game_root, relative) || supplied(&relative.to_ascii_lowercase())
    };
    let mut diagnostics = Vec::new();
    let mut blockers = Vec::new();
    if keys
        .iter()
        .any(|path| path.starts_with("bin/x64/plugins/cyber_engine_tweaks/mods/"))
    {
        if existing_or_supplied("bin/x64/plugins/cyber_engine_tweaks.asi")
            || existing_or_supplied("bin/x64/plugins/cyber_engine_tweaks/")
        {
            diagnostics
                .push("Cyber Engine Tweaks : disponible pour les mods CET sélectionnés.".into());
        } else {
            blockers.push("Cyber Engine Tweaks est requis par un mod sous bin/x64/plugins/cyber_engine_tweaks/mods/.".to_string());
        }
    }
    if keys.iter().any(|path| path.starts_with("r6/scripts/")) {
        if existing_or_supplied("engine/tools/scc.exe") {
            diagnostics.push("redscript : compilateur détecté pour r6/scripts.".into());
        } else {
            blockers.push("redscript est requis par un mod sous r6/scripts/.".to_string());
        }
    }
    if keys.iter().any(|path| path.starts_with("red4ext/plugins/")) {
        if existing_or_supplied("red4ext/red4ext.dll") {
            diagnostics.push("RED4ext : runtime détecté pour red4ext/plugins.".into());
        } else {
            blockers.push("RED4ext est requis par un plugin sous red4ext/plugins/.".to_string());
        }
    }
    if keys.iter().any(|path| path.starts_with("r6/tweaks/")) {
        let tweakxl = known_game_path_exists(game_root, "red4ext/plugins/TweakXL")
            || supplied("red4ext/plugins/tweakxl/");
        if tweakxl {
            diagnostics.push("TweakXL : détecté pour r6/tweaks.".into());
        } else {
            blockers.push("TweakXL est requis par un mod sous r6/tweaks/.".to_string());
        }
    }
    if keys.iter().any(|path| path.ends_with(".xl")) {
        if existing_or_supplied("red4ext/plugins/archivexl/") {
            diagnostics.push("ArchiveXL : détecté pour les ressources .xl sélectionnées.".into());
        } else {
            blockers.push("ArchiveXL est requis par une ressource .xl sélectionnée.".to_string());
        }
    } else if known_game_path_exists(game_root, "red4ext/plugins/ArchiveXL") {
        diagnostics.push("ArchiveXL : installation existante détectée.".into());
    } else {
        diagnostics.push("ArchiveXL : aucune dépendance déductible dans ce profil.".into());
    }
    if known_game_path_exists(game_root, "red4ext/plugins/Codeware")
        || supplied("red4ext/plugins/codeware/")
    {
        diagnostics.push("Codeware : runtime détecté.".into());
    } else {
        diagnostics
            .push("Codeware : aucune dépendance déductible dans les chemins sélectionnés.".into());
    }
    let redmod_layout = keys
        .iter()
        .any(|path| path.starts_with("mods/") && path.ends_with("/info.json"));
    if redmod_layout {
        if existing_or_supplied("tools/redmod/bin/redmod.exe") {
            diagnostics.push("REDmod : outil détecté pour le layout mods/<nom>/info.json.".into());
        } else {
            blockers.push("REDmod est requis par un paquet mods/<nom>/info.json.".to_string());
        }
    } else if known_game_path_exists(game_root, "tools/redmod/bin/redMod.exe") {
        diagnostics.push("REDmod : installation existante détectée.".into());
    } else {
        diagnostics.push("REDmod : aucun paquet REDmod déductible dans ce profil.".into());
    }
    if !blockers.is_empty() {
        return Err(format!(
            "Préparation bloquée : dépendance(s) manquante(s) : {}",
            blockers.join(" ")
        ));
    }
    if keys.iter().any(|path| path.starts_with("archive/pc/mod/")) {
        diagnostics.push("Archive Cyberpunk : chemin archive/pc/mod validé.".into());
    }
    Ok(diagnostics)
}

fn set_staged_deployment_status(app: &AppHandle, game_id: &str, ids: &[String], status: &str) {
    let Ok(root) = staged_mods_root(app, game_id) else {
        return;
    };
    for id in ids {
        if safe_game_id(id).is_err() {
            continue;
        }
        let manifest_path = root.join(id).join("manifest.json");
        let Ok(payload) = fs::read(&manifest_path) else {
            continue;
        };
        let Ok(mut manifest) = serde_json::from_slice::<serde_json::Value>(&payload) else {
            continue;
        };
        manifest["deploymentStatus"] = serde_json::Value::String(status.into());
        manifest["lastDeploymentAt"] = serde_json::json!(unix_timestamp());
        if let Ok(payload) = serde_json::to_vec_pretty(&manifest) {
            let _ = fs::write(&manifest_path, payload);
        }
    }
}

fn finish_temporary_copy(
    session: DeploymentSession,
    capture_overwrite: bool,
) -> Result<(), String> {
    let backup_root = session.session_root.join("backup");
    let mut errors = Vec::new();
    for entry in session.entries.iter().rev() {
        let destination = session.game_root.join(&entry.relative);
        if capture_overwrite && destination.is_file() {
            let capture_result = (|| -> Result<(), String> {
                let current_signature = file_signature(&destination)?;
                if current_signature != entry.deployed_signature {
                    let overwrite = session.overwrite_root.join(&entry.relative);
                    if let Some(parent) = overwrite.parent() {
                        fs::create_dir_all(parent).map_err(to_error)?;
                    }
                    fs::copy(&destination, overwrite).map_err(to_error)?;
                }
                Ok(())
            })();
            if let Err(error) = capture_result {
                errors.push(format!(
                    "Capture overwrite impossible pour {} : {error}",
                    entry.relative.display()
                ));
            }
        }
        let restore_result = (|| -> Result<(), String> {
            if entry.had_original {
                let backup = backup_root.join(&entry.relative);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(to_error)?;
                }
                fs::copy(backup, &destination).map_err(to_error)?;
            } else if destination.exists() {
                fs::remove_file(&destination).map_err(to_error)?;
            }
            Ok(())
        })();
        if let Err(error) = restore_result {
            errors.push(format!(
                "Restauration impossible pour {} : {error}",
                entry.relative.display()
            ));
        }
    }
    if let Err(error) = fs::remove_dir_all(&session.session_root) {
        if session.session_root.exists() {
            errors.push(format!("Nettoyage de la session impossible : {error}"));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join(" "))
    }
}

fn prepare_temporary_copy(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
    game_root: &Path,
    enabled_mod_ids: &[String],
    conflict_rules: &[LaunchConflictRule],
) -> Result<PreparedDeployment, String> {
    safe_game_id(game_id)?;
    safe_game_id(profile_id)?;
    let game_root = fs::canonicalize(game_root)
        .map_err(|_| "Le dossier d’installation du jeu est introuvable.".to_string())?;
    let staged_root = staged_mods_root(app, game_id)?;
    let mut owners: HashMap<String, Vec<(String, PathBuf, PathBuf)>> = HashMap::new();
    for id in enabled_mod_ids {
        if safe_game_id(id).is_err() {
            continue;
        }
        let content = staged_root.join(id).join("content");
        if !content.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&content)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(&content)
                .map_err(to_error)?
                .to_path_buf();
            validate_archive_relative(&relative)?;
            owners.entry(deployment_key(&relative)).or_default().push((
                id.clone(),
                entry.path().to_path_buf(),
                relative,
            ));
        }
    }
    if owners.is_empty() {
        return Ok(PreparedDeployment { session: None, deployed_files: 0, conflicts_resolved: 0, diagnostics: vec!["Aucun mod stocké actif à projeter ; les mods déjà présents dans le jeu restent inchangés.".into()] });
    }
    let rules = conflict_rules
        .iter()
        .map(|rule| {
            (
                rule.path.replace('\\', "/").to_ascii_lowercase(),
                rule.winner_mod_id.as_str(),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut chosen = Vec::new();
    let mut conflicts_resolved = 0;
    for (key, candidates) in owners {
        if candidates.len() > 1 {
            conflicts_resolved += 1;
        }
        let winner = rules
            .get(&key)
            .and_then(|winner_id| {
                candidates
                    .iter()
                    .find(|candidate| candidate.0 == *winner_id)
            })
            .unwrap_or_else(|| candidates.last().expect("non-empty deployment candidates"));
        chosen.push((winner.0.clone(), winner.1.clone(), winner.2.clone()));
    }
    chosen.sort_by(|left, right| deployment_key(&left.2).cmp(&deployment_key(&right.2)));
    let mut diagnostics = framework_diagnostics(
        &game_root,
        &chosen.iter().map(|item| item.2.clone()).collect::<Vec<_>>(),
    )?;
    diagnostics.push(format!(
        "{} conflit(s) résolu(s) selon l’ordre du profil et ses règles explicites.",
        conflicts_resolved
    ));

    let data_root = update_data_root(app)?.join("games").join(game_id);
    let session_root = unique_destination(
        &data_root.join("deployments"),
        &format!("session-{}", unix_timestamp()),
    );
    let backup_root = session_root.join("backup");
    let overwrite_root = data_root
        .join("profiles")
        .join(profile_id)
        .join("overwrite");
    fs::create_dir_all(&backup_root).map_err(to_error)?;
    fs::create_dir_all(&overwrite_root).map_err(to_error)?;
    let mut session = DeploymentSession {
        game_root: game_root.clone(),
        session_root: session_root.clone(),
        overwrite_root,
        entries: Vec::new(),
    };
    let result = (|| {
        let mut resolved_manifest = Vec::new();
        for (winner_id, source, relative) in chosen {
            let destination = game_root.join(&relative);
            if !destination.starts_with(&game_root) {
                return Err("Un chemin de déploiement sort du dossier du jeu.".to_string());
            }
            let had_original = destination.is_file();
            let source_signature = file_signature(&source)?;
            if had_original {
                let backup = backup_root.join(&relative);
                if let Some(parent) = backup.parent() {
                    fs::create_dir_all(parent).map_err(to_error)?;
                }
                fs::copy(&destination, backup).map_err(to_error)?;
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            session.entries.push(DeploymentEntry {
                relative: relative.clone(),
                had_original,
                deployed_signature: source_signature,
            });
            fs::copy(&source, &destination).map_err(to_error)?;
            let destination_signature = file_signature(&destination)?;
            if source_signature != destination_signature {
                return Err(format!(
                    "Vérification RuntimeVisible échouée pour {}.",
                    relative.display()
                ));
            }
            resolved_manifest.push(serde_json::json!({ "path": relative, "winnerModId": winner_id, "runtimeVisible": true }));
        }
        fs::write(
            session_root.join("resolved-files.json"),
            serde_json::to_vec_pretty(&resolved_manifest).map_err(to_error)?,
        )
        .map_err(to_error)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = finish_temporary_copy(session, false);
        return Err(error);
    }
    Ok(PreparedDeployment {
        deployed_files: session.entries.len(),
        conflicts_resolved,
        diagnostics,
        session: Some(session),
    })
}

#[tauri::command]
fn test_discord_connection(
    app: AppHandle,
    client_id: String,
) -> Result<DiscordConnectionStatus, String> {
    let _stream = discord_handshake(client_id.trim())?;
    let status = DiscordConnectionStatus {
        connected: true,
        message: "Discord IPC détecté. L'identifiant d'application est accepté localement.".into(),
    };
    let _ = app.emit("discord-status-changed", status.clone());
    Ok(status)
}

#[tauri::command]
fn launch_game(
    app: AppHandle,
    state: State<'_, DiscordRuntime>,
    exec_path: String,
    game_id: String,
    game_name: String,
    game_root: String,
    profile_id: String,
    profile_name: String,
    active_mods: usize,
    enabled_mod_ids: Vec<String>,
    conflict_rules: Vec<LaunchConflictRule>,
    discord: Option<DiscordPresenceConfig>,
) -> Result<LaunchGameResult, String> {
    let executable = fs::canonicalize(PathBuf::from(exec_path))
        .map_err(|_| "The game executable was not found.".to_string())?;
    if !executable.is_file() {
        return Err("The game executable was not found.".into());
    }
    let game_root_path = fs::canonicalize(PathBuf::from(game_root))
        .map_err(|_| "Le dossier d’installation du jeu est introuvable.".to_string())?;
    if !executable.starts_with(&game_root_path) {
        return Err("L’exécutable ne se trouve pas dans le dossier d’installation configuré. Corrigez le chemin du jeu avant le lancement.".into());
    }
    let prepared = match prepare_temporary_copy(
        &app,
        &game_id,
        &profile_id,
        &game_root_path,
        &enabled_mod_ids,
        &conflict_rules,
    ) {
        Ok(prepared) => prepared,
        Err(error) => {
            set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "failed");
            return Err(error);
        }
    };
    let mut child = match Command::new(&executable)
        .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            if let Some(session) = prepared.session {
                let _ = finish_temporary_copy(session, false);
            }
            set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "failed");
            return Err(to_error(error));
        }
    };
    set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "runtime-visible");
    let pid = child.id();
    let runtime = state.inner().clone();
    let (discord_connected, discord_message) =
        match discord.as_ref().filter(|config| config.enabled) {
            Some(config) => {
                match set_discord_activity(&runtime, config, &game_name, &profile_name, active_mods)
                {
                    Ok(()) => (true, "Discord Rich Presence actif.".to_string()),
                    Err(error) => (false, error),
                }
            }
            None => (false, "Discord Rich Presence désactivé.".into()),
        };
    let discord_status = DiscordConnectionStatus {
        connected: discord_connected,
        message: discord_message.clone(),
    };
    let _ = app.emit("discord-status-changed", discord_status);
    let _ = app.emit(
        "game-process-started",
        GameProcessEvent {
            pid,
            game_id: game_id.clone(),
            game_name: game_name.clone(),
            profile_id: profile_id.clone(),
            exit_code: None,
            cleanup_error: None,
        },
    );
    let worker_app = app.clone();
    let worker_runtime = runtime.clone();
    let worker_game_name = game_name.clone();
    let worker_app_for_cleanup = app.clone();
    let worker_game_id = game_id.clone();
    let worker_profile_id = profile_id.clone();
    let worker_enabled_mod_ids = enabled_mod_ids.clone();
    let deployment_session = prepared.session;
    std::thread::spawn(move || {
        let exit_code = child.wait().ok().and_then(|status| status.code());
        let cleanup_error =
            deployment_session.and_then(|session| finish_temporary_copy(session, true).err());
        set_staged_deployment_status(
            &worker_app_for_cleanup,
            &worker_game_id,
            &worker_enabled_mod_ids,
            if cleanup_error.is_some() {
                "failed"
            } else {
                "enabled"
            },
        );
        clear_discord_activity(&worker_runtime);
        let _ = worker_app.emit(
            "discord-status-changed",
            DiscordConnectionStatus {
                connected: false,
                message: "Le processus du jeu est terminé ; la présence Discord a été nettoyée."
                    .into(),
            },
        );
        let _ = worker_app.emit(
            "game-process-stopped",
            GameProcessEvent {
                pid,
                game_id: worker_game_id,
                game_name: worker_game_name,
                profile_id: worker_profile_id,
                exit_code,
                cleanup_error,
            },
        );
    });
    Ok(LaunchGameResult {
        pid,
        discord_connected,
        discord_message,
        deployment_backend: if prepared.deployed_files > 0 {
            "TemporaryCopy".into()
        } else {
            "None".into()
        },
        deployed_files: prepared.deployed_files,
        conflicts_resolved: prepared.conflicts_resolved,
        deployment_status: if prepared.deployed_files > 0 {
            "runtime-visible".into()
        } else {
            "unknown".into()
        },
        diagnostics: prepared.diagnostics,
    })
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
    if paths.is_empty() {
        return Err("Select at least one mod.".into());
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

fn copy_tree_cancellable(
    source: &Path,
    destination: &Path,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("TASK_CANCELLED".into());
    }
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
        if cancel.load(Ordering::Relaxed) {
            return Err("TASK_CANCELLED".into());
        }
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

const CYBERPUNK_ROOTS: [&str; 9] = [
    "archive", "r6", "red4ext", "bin", "mods", "tools", "engine", "plugins", "config",
];

fn contains_game_root_layout(path: &Path) -> bool {
    CYBERPUNK_ROOTS.iter().any(|name| path.join(name).exists())
}

fn unwrap_package_root(source: &Path) -> PathBuf {
    let mut current = source.to_path_buf();
    for _ in 0..4 {
        if contains_game_root_layout(&current) {
            break;
        }
        let children = fs::read_dir(&current)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
            .collect::<Vec<_>>();
        if children.len() != 1 || !children[0].path().is_dir() {
            break;
        }
        current = children[0].path();
    }
    current
}

fn stage_content(
    source: &Path,
    content: &Path,
    game_name: &str,
    cancel: &AtomicBool,
) -> Result<(String, Vec<String>), String> {
    let lower_game = game_name.to_ascii_lowercase();
    let cyberpunk = lower_game.contains("cyberpunk");
    let root = if source.is_dir() {
        unwrap_package_root(source)
    } else {
        source.to_path_buf()
    };
    let mut diagnostics = Vec::new();
    let layout;
    if root.is_file() {
        let extension = root
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let destination = if cyberpunk && extension == "archive" {
            layout = "CyberpunkArchive".to_string();
            content.join("archive/pc/mod").join(
                root.file_name()
                    .ok_or_else(|| "Invalid source file name.".to_string())?,
            )
        } else if cyberpunk && extension == "reds" {
            layout = "CyberpunkRedscript".to_string();
            content.join("r6/scripts").join(
                root.file_name()
                    .ok_or_else(|| "Invalid source file name.".to_string())?,
            )
        } else {
            layout = "GenericModsFolder".to_string();
            diagnostics.push("Fichier isolé sans racine connue : mappé sous mods/. Vérification manuelle conseillée.".into());
            content.join("mods").join(
                root.file_name()
                    .ok_or_else(|| "Invalid source file name.".to_string())?,
            )
        };
        copy_tree_cancellable(&root, &destination, cancel)?;
    } else {
        let root_name = root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if contains_game_root_layout(&root) {
            layout = if cyberpunk {
                "CyberpunkGameRoot"
            } else {
                "GameRoot"
            }
            .to_string();
            for entry in fs::read_dir(&root)
                .map_err(to_error)?
                .filter_map(Result::ok)
            {
                if cancel.load(Ordering::Relaxed) {
                    return Err("TASK_CANCELLED".into());
                }
                let name = entry.file_name();
                copy_tree_cancellable(&entry.path(), &content.join(name), cancel)?;
            }
        } else if CYBERPUNK_ROOTS
            .iter()
            .any(|name| root_name.eq_ignore_ascii_case(name))
        {
            layout = "GameRootFragment".to_string();
            copy_tree_cancellable(
                &root,
                &content.join(
                    root.file_name()
                        .ok_or_else(|| "Invalid root name.".to_string())?,
                ),
                cancel,
            )?;
        } else if cyberpunk
            && WalkDir::new(&root)
                .max_depth(2)
                .into_iter()
                .filter_map(Result::ok)
                .any(|entry| {
                    entry
                        .path()
                        .extension()
                        .and_then(|value| value.to_str())
                        .is_some_and(|value| value.eq_ignore_ascii_case("archive"))
                })
        {
            layout = "CyberpunkArchive".to_string();
            copy_tree_cancellable(&root, &content.join("archive/pc/mod"), cancel)?;
        } else {
            layout = "GenericModsFolder".to_string();
            diagnostics
                .push("Structure sans racine de jeu reconnue : mappée sous mods/<nom>.".into());
            let name = safe_archive_component(
                root.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("mod"),
            );
            copy_tree_cancellable(&root, &content.join("mods").join(name), cancel)?;
        }
    }
    Ok((layout, diagnostics))
}

fn staged_mods_root(app: &AppHandle, game_id: &str) -> Result<PathBuf, String> {
    Ok(update_data_root(app)?
        .join("games")
        .join(safe_game_id(game_id)?)
        .join("mods"))
}

fn staged_native_mod(stage_directory: &Path) -> Result<NativeMod, String> {
    let manifest_path = stage_directory.join("manifest.json");
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?).map_err(to_error)?;
    let content = stage_directory.join("content");
    if !content.is_dir() {
        return Err("Stored mod content is missing.".into());
    }
    let inspected = inspect_native_mod(&content);
    let text = |key: &str| {
        manifest
            .get(key)
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned)
    };
    let diagnostics = manifest
        .get("diagnostics")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default();
    let stage_id = stage_directory
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid stored mod identifier.".to_string())?
        .to_string();
    Ok(NativeMod {
        id: stage_id.clone(),
        name: text("name").unwrap_or(inspected.name),
        path: content.to_string_lossy().to_string(),
        enabled: true,
        mod_type: inspected.mod_type,
        size_bytes: inspected.size_bytes,
        files: inspected.files,
        fingerprint: text("fingerprint").unwrap_or(inspected.fingerprint),
        framework: text("framework").unwrap_or(inspected.framework),
        manifests: inspected.manifests,
        source_url: text("sourceUrl").or(inspected.source_url),
        version: text("version").or(inspected.version),
        storage: "staged".into(),
        stage_id: Some(stage_id),
        profile_ids: manifest
            .get("profiles")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        deployment_status: text("deploymentStatus").unwrap_or_else(|| "stored".into()),
        diagnostics,
    })
}

#[tauri::command]
fn list_staged_mods(app: AppHandle, game_id: String) -> Result<Vec<NativeMod>, String> {
    let root = staged_mods_root(&app, &game_id)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut mods = fs::read_dir(root)
        .map_err(to_error)?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| staged_native_mod(&entry.path()).ok())
        .collect::<Vec<_>>();
    mods.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    Ok(mods)
}

#[tauri::command]
fn delete_staged_mod(app: AppHandle, game_id: String, stage_id: String) -> Result<(), String> {
    safe_game_id(&stage_id)?;
    let root = staged_mods_root(&app, &game_id)?;
    let target = root.join(stage_id);
    if target.parent() != Some(root.as_path()) {
        return Err("Invalid stored mod path.".into());
    }
    if target.exists() {
        fs::remove_dir_all(target).map_err(to_error)?;
    }
    Ok(())
}

fn import_mods_with_staging(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    channel: &Channel<BackgroundTaskEvent>,
    task_id: &str,
    game_id: &str,
    profile_ids: &[String],
    paths: Vec<String>,
    game_name: &str,
    destination: String,
    deploy_now: bool,
    cancel: &AtomicBool,
) -> Result<Vec<String>, String> {
    let game_id = safe_game_id(game_id)?;
    let destination = PathBuf::from(destination);
    let staging_root = staged_mods_root(app, game_id)?;
    fs::create_dir_all(&staging_root).map_err(to_error)?;
    let total = paths.len() as u64;
    let mut installed = Vec::new();
    for (index, source) in paths.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err("TASK_CANCELLED".into());
        }
        let source = fs::canonicalize(source).map_err(to_error)?;
        if !source.exists() {
            return Err("One of the selected import sources no longer exists.".into());
        }
        let inspected = inspect_native_mod(&source);
        let stage_directory = unique_destination(&staging_root, &inspected.id);
        let stage_id = stage_directory
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Invalid stored mod identifier.".to_string())?
            .to_string();
        let staged_content = stage_directory.join("content");
        fs::create_dir_all(&staged_content).map_err(to_error)?;
        report_background_task(
            app,
            registry,
            Some(channel),
            task_id,
            index as u64,
            total,
            format!(
                "Staging de {} · {} fichier(s)",
                inspected.name,
                inspected.files.len()
            ),
        );
        let (layout, diagnostics) = match stage_content(&source, &staged_content, game_name, cancel)
        {
            Ok(result) => result,
            Err(error) => {
                let _ = fs::remove_dir_all(&stage_directory);
                return Err(error);
            }
        };
        if cancel.load(Ordering::Relaxed) {
            let _ = fs::remove_dir_all(&stage_directory);
            return Err("TASK_CANCELLED".into());
        }
        let content_inspection = inspect_native_mod(&staged_content);
        let deployment_status = if deploy_now { "enabled" } else { "stored" };
        let manifest_path = stage_directory.join("manifest.json");
        let manifest = serde_json::json!({
            "schemaVersion": 2,
            "id": stage_id,
            "name": inspected.name.clone(),
            "fingerprint": inspected.fingerprint.clone(),
            "framework": inspected.framework.clone(),
            "version": inspected.version.clone(),
            "sourceUrl": inspected.source_url.clone(),
            "profiles": profile_ids,
            "sourceFiles": inspected.files.clone(),
            "contentFiles": content_inspection.files,
            "layout": layout,
            "diagnostics": diagnostics,
            "stagedAt": unix_timestamp(),
            "deploymentBackend": "TemporaryCopy",
            "deploymentStatus": deployment_status,
            "legacyDestination": destination.to_string_lossy()
        });
        fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest).map_err(to_error)?,
        )
        .map_err(to_error)?;
        installed.push(stage_directory.to_string_lossy().to_string());
        report_background_task(
            app,
            registry,
            Some(channel),
            task_id,
            index as u64 + 1,
            total,
            format!("{} prêt ({}/{total})", inspected.name, index + 1),
        );
    }
    Ok(installed)
}

#[tauri::command]
async fn import_mod_candidates_background(
    app: AppHandle,
    state: State<'_, BackgroundTaskRegistry>,
    task_id: String,
    game_id: String,
    profile_ids: Vec<String>,
    paths: Vec<String>,
    game_name: String,
    destination: String,
    deploy_now: bool,
    on_event: Channel<BackgroundTaskEvent>,
) -> Result<Vec<String>, String> {
    if paths.is_empty() {
        return Err("Select at least one mod.".into());
    }
    let registry = state.inner().clone();
    let cancel = register_background_task(
        &app,
        &registry,
        task_id.clone(),
        "mod-import",
        "Import et déploiement des mods",
        paths.len() as u64,
    )?;
    let worker_app = app.clone();
    let worker_registry = registry.clone();
    let worker_task_id = task_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        import_mods_with_staging(
            &worker_app,
            &worker_registry,
            &on_event,
            &worker_task_id,
            &game_id,
            &profile_ids,
            paths,
            &game_name,
            destination,
            deploy_now,
            &cancel,
        )
    })
    .await
    .map_err(|_| "The background import stopped unexpectedly.".to_string())?;
    match &result {
        Ok(paths) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "completed",
            format!("{} mod(s) traité(s) avec Direct Copy.", paths.len()),
            None,
        ),
        Err(error) if error == "TASK_CANCELLED" => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "cancelled",
            "Import annulé ; les éléments déjà staged restent récupérables.".into(),
            None,
        ),
        Err(error) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "failed",
            "Échec de l'import. Aucun fichier existant n'a été écrasé.".into(),
            Some(error.clone()),
        ),
    }
    result.map_err(|error| {
        if error == "TASK_CANCELLED" {
            "Import annulé.".into()
        } else {
            error
        }
    })
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

fn validate_provider_secret(provider: &str, secret: &str) -> Result<(), String> {
    if !matches!(provider, "nexus" | "curseforge") {
        return Err("Unknown provider.".into());
    }
    if secret.len() < 16 || secret.len() > 512 {
        return Err("Provider credential has an invalid length.".into());
    }
    if !secret
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("Provider credential contains unsupported characters.".into());
    }
    Ok(())
}

fn masked_secret(secret: &str) -> String {
    let suffix = secret
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    format!("••••••••{suffix}")
}

fn header_number(headers: &reqwest::header::HeaderMap, names: &[&str]) -> Option<u64> {
    names.iter().find_map(|name| {
        headers
            .get(*name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
    })
}

fn provider_disconnected(
    provider: &str,
    configured: bool,
    secret: Option<&str>,
    message: String,
) -> ProviderConnectionStatus {
    ProviderConnectionStatus {
        provider: provider.into(),
        configured,
        connected: false,
        masked_secret: secret.map(masked_secret),
        account_name: None,
        last_checked_at: Some(unix_timestamp()),
        hourly_remaining: None,
        hourly_limit: None,
        daily_remaining: None,
        daily_limit: None,
        message,
    }
}

async fn validate_nexus_connection(secret: &str) -> ProviderConnectionStatus {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return provider_disconnected(
                "nexus",
                true,
                Some(secret),
                "Impossible d'initialiser la connexion sécurisée Nexus.".into(),
            )
        }
    };
    let response = match client
        .get("https://api.nexusmods.com/v1/users/validate.json")
        .header("apikey", secret)
        .header("Application-Name", "ZAILON")
        .header("Application-Version", env!("CARGO_PKG_VERSION"))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let message = if error.is_timeout() {
                "La vérification Nexus a expiré. La clé reste protégée dans le coffre système."
            } else if error.is_connect() {
                "Nexus est inaccessible. Vérifiez la connexion Internet puis réessayez."
            } else {
                "La connexion sécurisée à Nexus a échoué."
            };
            return provider_disconnected("nexus", true, Some(secret), message.into());
        }
    };
    let status_code = response.status();
    let headers = response.headers().clone();
    let hourly_remaining = header_number(
        &headers,
        &["x-rl-hourly-remaining", "x-ratelimit-hourly-remaining"],
    );
    let hourly_limit = header_number(&headers, &["x-rl-hourly-limit", "x-ratelimit-hourly-limit"]);
    let daily_remaining = header_number(
        &headers,
        &["x-rl-daily-remaining", "x-ratelimit-daily-remaining"],
    );
    let daily_limit = header_number(&headers, &["x-rl-daily-limit", "x-ratelimit-daily-limit"]);
    if !status_code.is_success() {
        let message = match status_code.as_u16() {
            401 | 403 => "La clé Nexus a été refusée ou révoquée.",
            429 => "La limite de requêtes Nexus est atteinte. Réessayez après la réinitialisation du quota.",
            _ => "Nexus n'a pas accepté la demande de vérification.",
        };
        let mut status = provider_disconnected("nexus", true, Some(secret), message.into());
        status.hourly_remaining = hourly_remaining;
        status.hourly_limit = hourly_limit;
        status.daily_remaining = daily_remaining;
        status.daily_limit = daily_limit;
        return status;
    }
    let payload = response
        .json::<serde_json::Value>()
        .await
        .unwrap_or_default();
    let account_name = payload
        .get("name")
        .or_else(|| payload.get("user_name"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string());
    ProviderConnectionStatus {
        provider: "nexus".into(),
        configured: true,
        connected: true,
        masked_secret: Some(masked_secret(secret)),
        account_name,
        last_checked_at: Some(unix_timestamp()),
        hourly_remaining,
        hourly_limit,
        daily_remaining,
        daily_limit,
        message: "Connexion Nexus vérifiée.".into(),
    }
}

fn untested_provider_status(provider: &str, secret: Option<&str>) -> ProviderConnectionStatus {
    ProviderConnectionStatus {
        provider: provider.into(),
        configured: secret.is_some(),
        connected: false,
        masked_secret: secret.map(masked_secret),
        account_name: None,
        last_checked_at: None,
        hourly_remaining: None,
        hourly_limit: None,
        daily_remaining: None,
        daily_limit: None,
        message: if secret.is_some() {
            "Identifiant présent dans le coffre système. Test de connexion requis."
        } else {
            "Non configuré."
        }
        .into(),
    }
}

#[tauri::command]
async fn set_provider_secret(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    provider: String,
    secret: String,
) -> Result<ProviderConnectionStatus, String> {
    let secret = secret.trim().to_string();
    validate_provider_secret(&provider, &secret)?;
    provider_credential(&provider)?
        .set_password(&secret)
        .map_err(|_| {
            "Impossible d'enregistrer l'identifiant dans le coffre sécurisé du système.".to_string()
        })?;
    let status = if provider == "nexus" {
        validate_nexus_connection(&secret).await
    } else {
        untested_provider_status(&provider, Some(&secret))
    };
    state
        .0
        .lock()
        .map_err(|_| "Provider status cache is unavailable.".to_string())?
        .insert(provider.clone(), status.clone());
    let _ = app.emit("provider-status-changed", status.clone());
    Ok(status)
}

#[tauri::command]
fn delete_provider_secret(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    provider: String,
) -> Result<ProviderConnectionStatus, String> {
    let entry = provider_credential(&provider)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => return Err("Impossible de supprimer l'identifiant du coffre système.".into()),
    };
    let status = untested_provider_status(&provider, None);
    state
        .0
        .lock()
        .map_err(|_| "Provider status cache is unavailable.".to_string())?
        .insert(provider, status.clone());
    let _ = app.emit("provider-status-changed", status.clone());
    Ok(status)
}

#[tauri::command]
fn provider_connection_statuses(
    state: State<'_, ProviderConnectionCache>,
) -> HashMap<String, ProviderConnectionStatus> {
    let cache = state.0.lock().ok();
    ["nexus", "curseforge"]
        .into_iter()
        .map(|provider| {
            let cached = cache
                .as_ref()
                .and_then(|items| items.get(provider))
                .cloned();
            let status = cached.unwrap_or_else(|| {
                let secret = provider_credential(provider)
                    .and_then(|entry| entry.get_password().map_err(to_error))
                    .ok();
                untested_provider_status(provider, secret.as_deref())
            });
            (provider.to_string(), status)
        })
        .collect()
}

#[tauri::command]
async fn test_provider_connection(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    provider: String,
) -> Result<ProviderConnectionStatus, String> {
    let secret = provider_credential(&provider)?
        .get_password()
        .map_err(|_| "Aucun identifiant n'est enregistré pour ce fournisseur.".to_string())?;
    let status = if provider == "nexus" {
        validate_nexus_connection(&secret).await
    } else {
        untested_provider_status(&provider, Some(&secret))
    };
    state
        .0
        .lock()
        .map_err(|_| "Provider status cache is unavailable.".to_string())?
        .insert(provider, status.clone());
    let _ = app.emit("provider-status-changed", status.clone());
    Ok(status)
}

fn nexus_json_string(value: &serde_json::Value, fields: &[&str]) -> String {
    fields
        .iter()
        .find_map(|field| value.get(*field).and_then(|item| item.as_str()))
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn nexus_json_u64(value: &serde_json::Value, fields: &[&str]) -> u64 {
    fields
        .iter()
        .find_map(|field| {
            value.get(*field).and_then(|item| {
                item.as_u64()
                    .or_else(|| item.as_i64().and_then(|number| u64::try_from(number).ok()))
                    .or_else(|| item.as_str().and_then(|text| text.parse::<u64>().ok()))
            })
        })
        .unwrap_or_default()
}

fn nexus_json_bool(value: &serde_json::Value, fields: &[&str]) -> bool {
    fields.iter().any(|field| {
        value.get(*field).is_some_and(|item| {
            item.as_bool().unwrap_or(false)
                || item.as_u64().is_some_and(|number| number > 0)
                || item
                    .as_str()
                    .is_some_and(|text| matches!(text, "1" | "true" | "yes"))
        })
    })
}

fn safe_remote_image(value: String) -> String {
    url::Url::parse(&value)
        .ok()
        .filter(|url| url.scheme() == "https" && url.host_str().is_some())
        .map(|url| url.to_string())
        .unwrap_or_default()
}

fn valid_nexus_domain(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '-' | '_')
        })
}

async fn nexus_api_json(
    path: &str,
) -> Result<(serde_json::Value, reqwest::header::HeaderMap), String> {
    let secret = provider_credential("nexus")?.get_password().map_err(|_| {
        "Connectez Nexus Mods dans les paramètres avant d'ouvrir le catalogue.".to_string()
    })?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Impossible d'initialiser la connexion sécurisée Nexus.".to_string())?;
    let response = client
        .get(format!("https://api.nexusmods.com/v1/{path}"))
        .header("apikey", secret)
        .header("Application-Name", "ZAILON")
        .header("Application-Version", env!("CARGO_PKG_VERSION"))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "La requête Nexus a expiré.".to_string()
            } else {
                "Nexus est actuellement inaccessible.".to_string()
            }
        })?;
    let status = response.status();
    let headers = response.headers().clone();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "La clé Nexus a été refusée ou ne permet pas cette opération.".into(),
            404 => "Ce jeu ou ce catalogue n'existe pas sur Nexus Mods.".into(),
            429 => "La limite de requêtes Nexus est atteinte.".into(),
            _ => format!(
                "Nexus n'a pas accepté la demande (HTTP {}).",
                status.as_u16()
            ),
        });
    }
    let payload = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "Nexus a renvoyé une réponse illisible.".to_string())?;
    Ok((payload, headers))
}

fn refresh_nexus_status_from_headers(
    app: &AppHandle,
    state: &State<'_, ProviderConnectionCache>,
    headers: &reqwest::header::HeaderMap,
) {
    let Ok(secret) =
        provider_credential("nexus").and_then(|entry| entry.get_password().map_err(to_error))
    else {
        return;
    };
    let mut status = state
        .0
        .lock()
        .ok()
        .and_then(|cache| cache.get("nexus").cloned())
        .unwrap_or_else(|| untested_provider_status("nexus", Some(&secret)));
    status.configured = true;
    status.connected = true;
    status.masked_secret = Some(masked_secret(&secret));
    status.last_checked_at = Some(unix_timestamp());
    status.hourly_remaining = header_number(
        headers,
        &["x-rl-hourly-remaining", "x-ratelimit-hourly-remaining"],
    );
    status.hourly_limit =
        header_number(headers, &["x-rl-hourly-limit", "x-ratelimit-hourly-limit"]);
    status.daily_remaining = header_number(
        headers,
        &["x-rl-daily-remaining", "x-ratelimit-daily-remaining"],
    );
    status.daily_limit = header_number(headers, &["x-rl-daily-limit", "x-ratelimit-daily-limit"]);
    status.message = "Catalogue Nexus connecté.".into();
    if let Ok(mut cache) = state.0.lock() {
        cache.insert("nexus".into(), status.clone());
    }
    let _ = app.emit("provider-status-changed", status);
}

#[tauri::command]
async fn nexus_catalog_games(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
) -> Result<Vec<NexusCatalogGame>, String> {
    let (payload, headers) = nexus_api_json("games.json").await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    let rows = payload
        .as_array()
        .or_else(|| payload.get("games").and_then(|value| value.as_array()))
        .cloned()
        .unwrap_or_default();
    let mut games = rows
        .iter()
        .filter_map(|row| {
            let name = nexus_json_string(row, &["name"]);
            let domain = nexus_json_string(row, &["domain_name", "domain"]);
            if name.is_empty() || !valid_nexus_domain(&domain) {
                return None;
            }
            Some(NexusCatalogGame {
                name,
                domain,
                mod_count: nexus_json_u64(row, &["mods", "mod_count"]),
                download_count: nexus_json_u64(row, &["downloads", "download_count"]),
            })
        })
        .collect::<Vec<_>>();
    games.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    Ok(games)
}

#[tauri::command]
async fn nexus_catalog_mods(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    game_domain: String,
    feed: String,
) -> Result<Vec<NexusCatalogMod>, String> {
    let domain = game_domain.trim().to_ascii_lowercase();
    if !valid_nexus_domain(&domain) {
        return Err("Le domaine Nexus du jeu est invalide.".into());
    }
    let endpoint = match feed.as_str() {
        "updated" => "latest_updated",
        "trending" | "popular" | "downloaded" => "trending",
        _ => "latest_added",
    };
    let (payload, headers) =
        nexus_api_json(&format!("games/{domain}/mods/{endpoint}.json")).await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    let rows = payload
        .as_array()
        .or_else(|| payload.get("mods").and_then(|value| value.as_array()))
        .cloned()
        .unwrap_or_default();
    Ok(rows
        .iter()
        .filter_map(|row| {
            let mod_id = nexus_json_u64(row, &["mod_id", "game_scoped_id", "id"]);
            let name = nexus_json_string(row, &["name"]);
            if mod_id == 0 || name.is_empty() {
                return None;
            }
            Some(NexusCatalogMod {
                id: format!("nexus-{domain}-{mod_id}"),
                mod_id,
                name,
                author: nexus_json_string(row, &["author", "uploaded_by", "user_name"]),
                game: nexus_json_string(row, &["game_name", "game"])
                    .trim()
                    .to_string(),
                game_domain: domain.clone(),
                thumbnail: safe_remote_image(nexus_json_string(
                    row,
                    &["picture_url", "thumbnail_url"],
                )),
                downloads: nexus_json_u64(row, &["mod_downloads", "downloads", "download_count"]),
                endorsements: nexus_json_u64(row, &["endorsement_count", "endorsements"]),
                description: nexus_json_string(row, &["summary", "description"]),
                version: Some(nexus_json_string(row, &["version"]))
                    .filter(|value| !value.is_empty()),
                updated_at: Some(nexus_json_u64(row, &["updated_timestamp", "updated_at"]))
                    .filter(|value| *value > 0),
                nsfw: nexus_json_bool(row, &["contains_adult_content", "adult_content", "nsfw"]),
                url: format!("https://www.nexusmods.com/{domain}/mods/{mod_id}"),
            })
        })
        .collect())
}

fn parse_shortcut_launch_url(raw: &str) -> Result<ShortcutLaunchRequest, String> {
    if raw.len() > 1024 {
        return Err("ZAILON launch URL is too long.".into());
    }
    let parsed = url::Url::parse(raw).map_err(|_| "Invalid ZAILON launch URL.".to_string())?;
    if parsed.scheme() != "zailon"
        || parsed.host_str() != Some("launch")
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Invalid ZAILON launch URL structure.".into());
    }
    let segments = parsed
        .path_segments()
        .map(|items| items.collect::<Vec<_>>())
        .unwrap_or_default();
    if segments.len() != 2 || segments[0] != "game" {
        return Err("ZAILON launch URL must match /game/{gameId}.".into());
    }
    let game_id = safe_game_id(segments[1])?.to_string();
    let profile_id = parsed
        .query_pairs()
        .find(|(key, _)| key == "profile")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| "ZAILON launch URL has no profile identifier.".to_string())?;
    safe_game_id(&profile_id)?;
    Ok(ShortcutLaunchRequest {
        raw_url: raw.into(),
        game_id,
        profile_id,
    })
}

#[cfg(desktop)]
fn enqueue_shortcut_launch(app: &AppHandle, raw: &str) {
    if let Ok(request) = parse_shortcut_launch_url(raw) {
        if let Ok(mut pending) = app.state::<PendingShortcutLaunches>().0.lock() {
            if !pending.iter().any(|item| item.raw_url == request.raw_url) {
                pending.push(request.clone());
            }
        }
        let _ = app.emit("zailon-launch", request);
    }
}

#[cfg(desktop)]
#[tauri::command]
fn pending_shortcut_launches(
    state: State<'_, PendingShortcutLaunches>,
) -> Vec<ShortcutLaunchRequest> {
    state
        .0
        .lock()
        .map(|items| items.clone())
        .unwrap_or_default()
}

#[cfg(desktop)]
#[tauri::command]
fn consume_shortcut_launch(
    state: State<'_, PendingShortcutLaunches>,
    raw_url: String,
) -> Result<(), String> {
    let mut pending = state.0.lock().map_err(to_error)?;
    pending.retain(|item| item.raw_url != raw_url);
    Ok(())
}

#[cfg(target_os = "windows")]
fn ensure_zailon_association() -> Result<(), String> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let classes = root
        .open_subkey_with_flags(
            "Software\\Classes",
            winreg::enums::KEY_READ | winreg::enums::KEY_WRITE,
        )
        .or_else(|_| root.create_subkey("Software\\Classes").map(|item| item.0))
        .map_err(to_error)?;
    let executable = std::env::current_exe().map_err(to_error)?;
    let (scheme, _) = classes.create_subkey("zailon").map_err(to_error)?;
    scheme
        .set_value("", &"URL:ZAILON Launch Protocol")
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
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn create_desktop_shortcut(
    game_id: String,
    profile_id: String,
    game_name: String,
    icon_path: Option<String>,
) -> Result<String, String> {
    safe_game_id(&game_id)?;
    safe_game_id(&profile_id)?;
    let desktop =
        dirs::desktop_dir().ok_or_else(|| "The desktop folder is unavailable.".to_string())?;
    let safe_name = safe_archive_component(&game_name);
    let uri = format!("zailon://launch/game/{game_id}?profile={profile_id}");
    #[cfg(target_os = "windows")]
    {
        ensure_zailon_association()?;
        let executable = std::env::current_exe().map_err(to_error)?;
        let icon = icon_path
            .map(PathBuf::from)
            .filter(|path| path.is_file())
            .unwrap_or(executable);
        let mut shortcut = desktop.join(format!("ZAILON - {safe_name}.url"));
        let mut suffix = 2;
        while shortcut.exists() {
            shortcut = desktop.join(format!("ZAILON - {safe_name} ({suffix}).url"));
            suffix += 1;
        }
        let content = format!(
            "[InternetShortcut]\r\nURL={uri}\r\nIconFile={}\r\nIconIndex=0\r\n",
            icon.to_string_lossy()
        );
        fs::write(&shortcut, content).map_err(to_error)?;
        return Ok(shortcut.to_string_lossy().to_string());
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let executable = std::env::current_exe().map_err(to_error)?;
        let mut shortcut = desktop.join(format!("ZAILON - {safe_name}.desktop"));
        let mut suffix = 2;
        while shortcut.exists() {
            shortcut = desktop.join(format!("ZAILON - {safe_name} ({suffix}).desktop"));
            suffix += 1;
        }
        let icon = icon_path
            .filter(|value| Path::new(value).is_file())
            .unwrap_or_default();
        let content = format!(
            "[Desktop Entry]\nType=Application\nName=ZAILON - {safe_name}\nExec=\"{}\" \"{uri}\"\nIcon={icon}\nTerminal=false\nCategories=Game;\n",
            executable.display()
        );
        fs::write(&shortcut, content).map_err(to_error)?;
        fs::set_permissions(&shortcut, fs::Permissions::from_mode(0o755)).map_err(to_error)?;
        return Ok(shortcut.to_string_lossy().to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let mut shortcut = desktop.join(format!("ZAILON - {safe_name}.webloc"));
        let mut suffix = 2;
        while shortcut.exists() {
            shortcut = desktop.join(format!("ZAILON - {safe_name} ({suffix}).webloc"));
            suffix += 1;
        }
        let escaped_uri = uri.replace('&', "&amp;");
        let content = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict><key>URL</key><string>{escaped_uri}</string></dict></plist>\n");
        fs::write(&shortcut, content).map_err(to_error)?;
        return Ok(shortcut.to_string_lossy().to_string());
    }
    #[allow(unreachable_code)]
    Err("Desktop shortcuts are not supported on this platform.".into())
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
    let mut request_hasher = std::collections::hash_map::DefaultHasher::new();
    raw.hash(&mut request_hasher);
    Ok(NxmRequest {
        raw_url: raw.into(),
        request_id: format!("nxm-{:016x}", request_hasher.finish()),
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
    request_id: String,
) -> Result<(), String> {
    let mut pending = state.0.lock().map_err(to_error)?;
    pending.retain(|item| item.request_id != request_id);
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
async fn install_mod(app: AppHandle, url: String, file_name: String) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(to_error)?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return Err("Only valid HTTPS mod downloads are allowed.".into());
    }
    let destination = update_data_root(&app)?.join("downloads");
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
        assert!(validate_external_url("https://ko-fi.com/souanptm").is_ok());
        assert!(validate_external_url("https://www.paypal.com/paypalme/souanpt").is_ok());
        assert!(validate_external_url("https://haunt.gg/souanpt").is_ok());
        assert!(validate_external_url("https://ko-fi.com/another-account").is_err());
        assert!(validate_external_url("https://www.paypal.com/paypalme/another-account").is_err());
        assert!(validate_external_url("https://haunt.gg/another-account").is_err());
        assert!(validate_external_url("https://paypal.com.evil.example/souanpt").is_err());
    }

    #[test]
    fn preserves_a_composite_cyberpunk_tree_during_staging() {
        let root = std::env::temp_dir().join(format!(
            "zailon-layout-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let package = root.join("wrapper/real-mod");
        fs::create_dir_all(package.join("archive/pc/mod")).expect("archive root");
        fs::create_dir_all(package.join("r6/scripts/example")).expect("script root");
        fs::write(package.join("archive/pc/mod/example.archive"), b"archive")
            .expect("archive file");
        fs::write(package.join("r6/scripts/example/main.reds"), b"script").expect("script file");
        let content = root.join("content");
        fs::create_dir_all(&content).expect("content root");
        let cancel = AtomicBool::new(false);
        let (layout, diagnostics) =
            stage_content(&root.join("wrapper"), &content, "Cyberpunk 2077", &cancel)
                .expect("stage composite mod");
        assert_eq!(layout, "CyberpunkGameRoot");
        assert!(diagnostics.is_empty());
        assert!(content.join("archive/pc/mod/example.archive").is_file());
        assert!(content.join("r6/scripts/example/main.reds").is_file());
        fs::remove_dir_all(root).expect("remove layout test");
    }

    #[test]
    fn dependency_diagnostics_block_and_accept_known_cyberpunk_frameworks() {
        let root = std::env::temp_dir().join(format!(
            "zailon-framework-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("game root");
        let paths = vec![PathBuf::from("r6/scripts/example/main.reds")];
        assert!(framework_diagnostics(&root, &paths).is_err());
        fs::create_dir_all(root.join("engine/tools")).expect("framework root");
        fs::write(root.join("engine/tools/scc.exe"), b"fake-test-runtime").expect("fake runtime");
        assert!(framework_diagnostics(&root, &paths).is_ok());
        fs::remove_dir_all(root).expect("remove framework test");
    }

    #[test]
    fn dependency_diagnostics_cover_archivexl_codeware_and_redmod() {
        let root = std::env::temp_dir().join(format!(
            "zailon-framework-matrix-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("game root");
        let paths = vec![
            PathBuf::from("archive/pc/mod/example.archive.xl"),
            PathBuf::from("mods/example/info.json"),
        ];
        assert!(framework_diagnostics(&root, &paths).is_err());
        fs::create_dir_all(root.join("red4ext/plugins/ArchiveXL")).expect("ArchiveXL root");
        fs::create_dir_all(root.join("red4ext/plugins/Codeware")).expect("Codeware root");
        fs::create_dir_all(root.join("tools/redmod/bin")).expect("REDmod root");
        fs::write(root.join("tools/redmod/bin/redMod.exe"), b"fake-redmod")
            .expect("fake REDmod runtime");
        let diagnostics = framework_diagnostics(&root, &paths).expect("framework diagnostics");
        assert!(diagnostics.iter().any(|item| item.contains("ArchiveXL")));
        assert!(diagnostics.iter().any(|item| item.contains("Codeware")));
        assert!(diagnostics.iter().any(|item| item.contains("REDmod")));
        fs::remove_dir_all(root).expect("remove framework test");
    }

    #[test]
    fn temporary_copy_restores_originals_and_captures_overwrite() {
        let root = std::env::temp_dir().join(format!(
            "zailon-rollback-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let game_root = root.join("game");
        let session_root = root.join("session");
        let overwrite_root = root.join("overwrite");
        let relative = PathBuf::from("archive/pc/mod/example.archive");
        let destination = game_root.join(&relative);
        let backup = session_root.join("backup").join(&relative);
        fs::create_dir_all(destination.parent().expect("destination parent")).expect("game tree");
        fs::create_dir_all(backup.parent().expect("backup parent")).expect("backup tree");
        fs::write(&destination, b"deployed").expect("deployed file");
        fs::write(&backup, b"original").expect("backup file");
        let deployed_signature = file_signature(&destination).expect("signature");
        fs::write(&destination, b"changed-by-game").expect("game overwrite");
        finish_temporary_copy(
            DeploymentSession {
                game_root: game_root.clone(),
                session_root,
                overwrite_root: overwrite_root.clone(),
                entries: vec![DeploymentEntry {
                    relative: relative.clone(),
                    had_original: true,
                    deployed_signature,
                }],
            },
            true,
        )
        .expect("finish deployment");
        assert_eq!(fs::read(&destination).expect("restored file"), b"original");
        assert_eq!(
            fs::read(overwrite_root.join(relative)).expect("captured overwrite"),
            b"changed-by-game"
        );
        fs::remove_dir_all(root).expect("remove rollback test");
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
    fn validates_shortcut_launch_urls_and_internal_ids() {
        let parsed = parse_shortcut_launch_url("zailon://launch/game/game-123?profile=profile-456")
            .expect("valid ZAILON shortcut URL");
        assert_eq!(parsed.game_id, "game-123");
        assert_eq!(parsed.profile_id, "profile-456");
        assert!(parse_shortcut_launch_url("zailon://launch/game/../outside?profile=p-1").is_err());
        assert!(parse_shortcut_launch_url("zailon://evil/game/game-1?profile=p-1").is_err());
        assert!(parse_shortcut_launch_url("zailon://launch/game/game-1?profile=../p").is_err());
    }

    #[test]
    fn masks_provider_secrets_without_returning_the_original() {
        let secret = "0123456789abcdef0123456789abcdef";
        let masked = masked_secret(secret);
        assert!(!masked.contains(secret));
        assert!(masked.ends_with("cdef"));
        assert!(validate_provider_secret("nexus", secret).is_ok());
        assert!(validate_provider_secret("nexus", "short").is_err());
        assert!(validate_provider_secret("nexus", "invalid secret with spaces").is_err());
    }

    #[test]
    fn validates_remote_image_signatures_and_nexus_domains() {
        assert!(valid_image_bytes(b"\x89PNG\r\n\x1a\nrest", "png"));
        assert!(!valid_image_bytes(b"MZ executable", "png"));
        assert!(valid_nexus_domain("skyrimspecialedition"));
        assert!(!valid_nexus_domain("../outside"));
        assert!(valid_discord_identifier("123456789012345678"));
        assert!(!valid_discord_identifier("client-secret"));
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
    fn imports_a_collection_with_more_than_one_hundred_mod_folders() {
        let root =
            std::env::temp_dir().join(format!("zailon-unlimited-import-test-{}", unix_timestamp()));
        let collection = root.join("collection");
        let destination = root.join("destination");
        fs::create_dir_all(&collection).expect("create collection");
        for index in 0..125 {
            let mod_root = collection.join(format!("mod-{index:03}"));
            fs::create_dir_all(&mod_root).expect("create mod folder");
            fs::write(mod_root.join(format!("mod-{index:03}.pak")), b"mod")
                .expect("write mod file");
        }

        let candidates = scan_mod_import(
            vec![collection.to_string_lossy().to_string()],
            "Test game".into(),
        )
        .expect("scan collection");
        assert_eq!(candidates.len(), 125);

        let installed = import_mod_candidates(
            candidates.into_iter().map(|item| item.path).collect(),
            destination.to_string_lossy().to_string(),
        )
        .expect("import collection");
        assert_eq!(installed.len(), 125);
        assert_eq!(
            fs::read_dir(&destination)
                .expect("read destination")
                .count(),
            125
        );
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
    let builder = tauri::Builder::default()
        .manage(ProviderConnectionCache(Mutex::new(HashMap::new())))
        .manage(BackgroundTaskRegistry(Arc::new(Mutex::new(HashMap::new()))))
        .manage(DiscordRuntime(Arc::new(Mutex::new(None))));
    #[cfg(desktop)]
    let builder = builder
        .manage(PendingExternalInstalls(Mutex::new(Vec::new())))
        .manage(PendingShortcutLaunches(Mutex::new(Vec::new())))
        .plugin(tauri_plugin_single_instance::init(
            |app, args, _working_directory| {
                for argument in args {
                    if argument.starts_with("nxm://") {
                        enqueue_nxm(app, &argument);
                    } else if argument.starts_with("zailon://") {
                        enqueue_shortcut_launch(app, &argument);
                    }
                }
            },
        ));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            restore_background_tasks(app.handle(), app.state::<BackgroundTaskRegistry>().inner());
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
                    } else if argument.starts_with("zailon://") {
                        enqueue_shortcut_launch(app.handle(), &argument);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_mods,
            list_staged_mods,
            scan_mod_import,
            scan_mod_import_background,
            toggle_mod,
            delete_mod,
            delete_staged_mod,
            ensure_dir,
            launch_game,
            test_discord_connection,
            guess_mods_path,
            install_mod,
            import_mod_candidates,
            import_mod_candidates_background,
            export_profile,
            preview_profile_import,
            extract_profile_archive,
            set_provider_secret,
            delete_provider_secret,
            provider_connection_statuses,
            test_provider_connection,
            nexus_catalog_games,
            nexus_catalog_mods,
            set_nxm_association,
            nxm_association_status,
            store_game_resource,
            cache_remote_game_resource,
            search_game_artwork,
            remove_game_resource,
            open_path,
            open_external_url,
            background_tasks,
            cancel_background_task,
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
            pending_shortcut_launches,
            #[cfg(desktop)]
            consume_shortcut_launch,
            #[cfg(desktop)]
            create_desktop_shortcut,
            #[cfg(desktop)]
            check_for_update,
            #[cfg(desktop)]
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZAILON");
}
