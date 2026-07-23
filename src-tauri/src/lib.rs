use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

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
    quarantine_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfilePaths {
    directory: String,
    manifest_path: String,
    load_order_path: String,
    settings_path: String,
    overwrite_path: String,
    generated_path: String,
    deployment_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileIntegrity {
    ok: bool,
    root: String,
    issues: Vec<String>,
    files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileTransactionResult {
    operation_id: String,
    profiles_written: usize,
    history_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BaseSnapshotResult {
    path: String,
    files: usize,
    changed_files: usize,
    created: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModImportCandidate {
    id: String,
    name: String,
    path: String,
    source_path: String,
    detected_root: String,
    detected_framework: String,
    relative_game_paths: Vec<String>,
    stripped_segments: Vec<String>,
    root_confidence: String,
    root_reason: String,
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
    sensitive_files: Vec<SensitiveFileAssessment>,
    recognized_destinations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SensitiveFileAssessment {
    relative_path: String,
    detected_type: String,
    extension: String,
    magic_type: String,
    size: u64,
    hash: String,
    signature_status: String,
    publisher: Option<String>,
    source_provider: Option<String>,
    source_mod_id: Option<String>,
    expected_by_manifest: bool,
    expected_by_game_adapter: bool,
    execution_required: bool,
    install_destination: String,
    risk_level: String,
    reasons: Vec<String>,
    recommended_action: String,
    decision: Option<String>,
    may_deploy: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecureImportResult {
    installed_paths: Vec<String>,
    status: String,
    warnings: Vec<String>,
    sensitive_files: Vec<SensitiveFileAssessment>,
    quarantine_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadedModResult {
    path: String,
    status: String,
    warnings: Vec<String>,
    sensitive_files: Vec<SensitiveFileAssessment>,
    quarantine_path: Option<String>,
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
struct NexusPaginationMetadata {
    page: u64,
    page_size: u64,
    total_results: u64,
    total_pages: u64,
    loaded_result_count: u64,
    provider_game_total_mods: Option<u64>,
    provider_game_total_collections: Option<u64>,
    has_previous: bool,
    has_next: bool,
    total_is_exact: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NexusCatalogPage {
    results: Vec<NexusCatalogMod>,
    pagination: NexusPaginationMetadata,
    source: String,
    fetched_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NexusAccountCapabilities {
    authenticated: bool,
    membership_tier: String,
    supports_direct_downloads: Option<bool>,
    supports_automatic_collection_downloads: Option<bool>,
    download_rate_limit: Option<String>,
    api_hourly_remaining: Option<u64>,
    api_hourly_limit: Option<u64>,
    api_daily_remaining: Option<u64>,
    api_daily_limit: Option<u64>,
    requires_manual_download_confirmation: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NexusCollectionSummary {
    id: u64,
    slug: String,
    name: String,
    summary: String,
    description: String,
    author: String,
    game: String,
    game_domain: String,
    tile_image: String,
    header_image: String,
    endorsements: u64,
    total_downloads: u64,
    unique_downloads: u64,
    updated_at: Option<u64>,
    adult: bool,
    collection_schema_id: Option<u64>,
    recommended_manager: String,
    compatibility: String,
    latest_revision_id: Option<u64>,
    latest_revision_number: Option<u64>,
    mod_count: u64,
    total_size: u64,
    game_versions: Vec<String>,
    provider_game_collection_count: Option<u64>,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NexusCollectionPage {
    results: Vec<NexusCollectionSummary>,
    pagination: NexusPaginationMetadata,
    source: String,
    fetched_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NexusCollectionEntry {
    collection_entry_id: String,
    nexus_game_domain: String,
    mod_id: u64,
    file_id: u64,
    expected_version: String,
    display_name: String,
    file_name: String,
    author: String,
    required: bool,
    install_order: u64,
    priority: i64,
    update_policy: String,
    expected_size: Option<u64>,
    virus_scan_status: String,
    source_url: String,
    status: String,
    local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NexusExternalRequirement {
    id: u64,
    name: String,
    author: String,
    required: bool,
    resource_type: String,
    resource_url: Option<String>,
    file_expression: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NexusCollectionDetail {
    collection: NexusCollectionSummary,
    revision_id: u64,
    revision_number: u64,
    revision_status: String,
    collection_schema_version: String,
    mod_count: u64,
    total_size: u64,
    assets_size_bytes: u64,
    temporary_bytes: u64,
    installation_info: String,
    adult: bool,
    game_versions: Vec<String>,
    entries: Vec<NexusCollectionEntry>,
    external_requirements: Vec<NexusExternalRequirement>,
    unsupported_instructions: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CollectionInstallPlan {
    schema_version: u64,
    install_id: String,
    collection_id: u64,
    collection_slug: String,
    collection_name: String,
    revision_id: u64,
    revision_number: u64,
    game_id: String,
    game_domain: String,
    profile_id: String,
    profile_name: String,
    profile_state: String,
    entries: Vec<NexusCollectionEntry>,
    external_requirements: Vec<NexusExternalRequirement>,
    download_bytes: u64,
    temporary_bytes: u64,
    final_additional_bytes: u64,
    account_capabilities: NexusAccountCapabilities,
    warnings: Vec<String>,
    created_at: u64,
    updated_at: u64,
    open_next_required_page: bool,
    automatic_execution: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedCollectionInstall {
    plan: CollectionInstallPlan,
    profile: serde_json::Value,
    profile_paths: ProfilePaths,
    plan_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingCollectionDownloadMatch {
    collection_install_id: String,
    entry_id: String,
    game_domain: String,
    mod_id: u64,
    file_id: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CyberpunkRepairMove {
    from: String,
    to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CyberpunkRepairItem {
    stage_id: String,
    name: String,
    detected_framework: String,
    moves: Vec<CyberpunkRepairMove>,
    conflicts: Vec<String>,
    confidence: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CyberpunkRepairPreview {
    game_id: String,
    packages_scanned: u64,
    files_affected: u64,
    items: Vec<CyberpunkRepairItem>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CyberpunkRepairResult {
    repair_id: String,
    snapshot_path: String,
    packages_repaired: u64,
    files_moved: u64,
    diagnostics: Vec<String>,
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

fn profile_directory(app: &AppHandle, game_id: &str, profile_id: &str) -> Result<PathBuf, String> {
    let game_id = safe_game_id(game_id)?;
    let profile_id = safe_game_id(profile_id)?;
    Ok(update_data_root(app)?
        .join("games")
        .join(game_id)
        .join("profiles")
        .join(profile_id))
}

fn write_json_atomic(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    let temp = path.with_extension(format!("tmp-{}", unix_timestamp()));
    fs::write(&temp, serde_json::to_vec_pretty(value).map_err(to_error)?).map_err(to_error)?;
    if path.exists() {
        fs::remove_file(path).map_err(to_error)?;
    }
    fs::rename(temp, path).map_err(to_error)
}

fn sync_profile_state_inner(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
    profile: &serde_json::Value,
) -> Result<ProfilePaths, String> {
    let payload_id = profile
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Profile payload has no identifier.".to_string())?;
    if payload_id != profile_id {
        return Err("Profile payload identifier does not match its target directory.".into());
    }
    let root = profile_directory(app, game_id, profile_id)?;
    let settings = root.join("settings");
    let overwrite = root.join("overwrite");
    let generated = root.join("generated");
    let deployment = root.join("deployment");
    let cache = root.join("cache");
    for directory in [
        &root,
        &settings,
        &overwrite,
        &generated,
        &deployment,
        &cache,
    ] {
        fs::create_dir_all(directory).map_err(to_error)?;
    }
    let states = profile
        .get("modStates")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let mut order = states
        .as_object()
        .into_iter()
        .flat_map(|map| map.iter())
        .map(|(mod_id, state)| {
            (
                state
                    .get("priority")
                    .and_then(|value| value.as_i64())
                    .unwrap_or(i64::MAX),
                mod_id.clone(),
            )
        })
        .collect::<Vec<_>>();
    order.sort_by_key(|entry| entry.0);
    let load_order = order.into_iter().map(|entry| entry.1).collect::<Vec<_>>();
    let profile_path = root.join("profile.json");
    let manifest_path = root.join("mods.manifest.json");
    let load_order_path = root.join("load-order.json");
    write_json_atomic(&profile_path, profile)?;
    write_json_atomic(
        &manifest_path,
        &serde_json::json!({
            "schemaVersion": 4,
            "gameId": game_id,
            "profileId": profile_id,
            "modStates": states,
            "updatedAt": unix_timestamp()
        }),
    )?;
    write_json_atomic(&load_order_path, &serde_json::json!(load_order))?;
    Ok(ProfilePaths {
        directory: root.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        load_order_path: load_order_path.to_string_lossy().to_string(),
        settings_path: settings.to_string_lossy().to_string(),
        overwrite_path: overwrite.to_string_lossy().to_string(),
        generated_path: generated.to_string_lossy().to_string(),
        deployment_path: deployment.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn sync_profile_state(
    app: AppHandle,
    game_id: String,
    profile_id: String,
    profile: serde_json::Value,
) -> Result<ProfilePaths, String> {
    sync_profile_state_inner(&app, &game_id, &profile_id, &profile)
}

#[tauri::command]
fn apply_profile_transaction(
    app: AppHandle,
    game_id: String,
    operation_id: String,
    before_profiles: Vec<serde_json::Value>,
    after_profiles: Vec<serde_json::Value>,
) -> Result<ProfileTransactionResult, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let operation_id = safe_game_id(&operation_id)?.to_string();
    let history_root = update_data_root(&app)?
        .join("games")
        .join(&game_id)
        .join("transactions");
    fs::create_dir_all(&history_root).map_err(to_error)?;
    let history_path = history_root.join(format!("{operation_id}.json"));
    write_json_atomic(
        &history_path,
        &serde_json::json!({
            "schemaVersion": 1,
            "operationId": operation_id,
            "createdAt": unix_timestamp(),
            "beforeProfiles": before_profiles,
            "afterProfiles": after_profiles,
        }),
    )?;
    let mut written = 0usize;
    for profile in &after_profiles {
        let profile_id = profile
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "A transaction profile has no identifier.".to_string())?;
        if let Err(error) = sync_profile_state_inner(&app, &game_id, profile_id, profile) {
            for previous in &before_profiles {
                if let Some(previous_id) = previous.get("id").and_then(|value| value.as_str()) {
                    let _ = sync_profile_state_inner(&app, &game_id, previous_id, previous);
                }
            }
            return Err(format!("Profile transaction rolled back: {error}"));
        }
        written += 1;
    }
    Ok(ProfileTransactionResult {
        operation_id,
        profiles_written: written,
        history_path: history_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn profile_integrity(
    app: AppHandle,
    game_id: String,
    profile_id: String,
) -> Result<ProfileIntegrity, String> {
    let root = profile_directory(&app, &game_id, &profile_id)?;
    let required_files = ["profile.json", "mods.manifest.json", "load-order.json"];
    let required_directories = ["settings", "overwrite", "generated", "deployment", "cache"];
    let mut issues = Vec::new();
    let mut files = Vec::new();
    for file in required_files {
        let path = root.join(file);
        if !path.is_file() {
            issues.push(format!("Fichier manquant : {file}"));
        } else {
            files.push(path.to_string_lossy().to_string());
            if serde_json::from_slice::<serde_json::Value>(&fs::read(&path).map_err(to_error)?)
                .is_err()
            {
                issues.push(format!("JSON invalide : {file}"));
            }
        }
    }
    for directory in required_directories {
        if !root.join(directory).is_dir() {
            issues.push(format!("Dossier manquant : {directory}"));
        }
    }
    Ok(ProfileIntegrity {
        ok: issues.is_empty(),
        root: root.to_string_lossy().to_string(),
        issues,
        files,
    })
}

#[tauri::command]
fn trash_profile_state(
    app: AppHandle,
    game_id: String,
    profile_id: String,
) -> Result<String, String> {
    let root = profile_directory(&app, &game_id, &profile_id)?;
    if !root.exists() {
        return Ok(String::new());
    }
    let trash = update_data_root(&app)?
        .join("games")
        .join(safe_game_id(&game_id)?)
        .join("trash")
        .join("profiles");
    fs::create_dir_all(&trash).map_err(to_error)?;
    let target = trash.join(format!(
        "{}-{}",
        unix_timestamp(),
        safe_game_id(&profile_id)?
    ));
    fs::rename(root, &target).map_err(to_error)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn initialize_fivem_base(
    app: AppHandle,
    game_id: String,
    install_directory: String,
) -> Result<BaseSnapshotResult, String> {
    let root = fs::canonicalize(install_directory).map_err(to_error)?;
    if !root.join("FiveM.exe").is_file() || !root.join("FiveM.app").is_dir() {
        return Err("Le dossier choisi n’est pas une installation client FiveM reconnue.".into());
    }
    let snapshot_path = update_data_root(&app)?
        .join("games")
        .join(safe_game_id(&game_id)?)
        .join("base-snapshot.json");
    let previous = fs::read(&snapshot_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    let previous_files = previous
        .as_ref()
        .and_then(|value| value.get("files"))
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    let mut files = serde_json::Map::new();
    for entry in WalkDir::new(&root)
        .max_depth(3)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(&root).map_err(to_error)?;
        let normalized = relative.to_string_lossy().replace('\\', "/");
        let lower = normalized.to_ascii_lowercase();
        if lower.contains("/cache/") || lower.contains("/logs/") || lower.contains("/crashes/") {
            continue;
        }
        let metadata = entry.metadata().map_err(to_error)?;
        files.insert(
            normalized,
            serde_json::json!({
                "size": metadata.len(),
                "signature": file_signature(entry.path())?,
            }),
        );
        if files.len() >= 20_000 {
            break;
        }
    }
    let changed_files = files
        .iter()
        .filter(|(path, metadata)| previous_files.get(*path) != Some(*metadata))
        .count()
        + previous_files
            .keys()
            .filter(|path| !files.contains_key(*path))
            .count();
    let file_count = files.len();
    write_json_atomic(
        &snapshot_path,
        &serde_json::json!({
            "schemaVersion": 1,
            "kind": "FiveMClientBase",
            "installDirectory": root,
            "capturedAt": unix_timestamp(),
            "files": files,
        }),
    )?;
    Ok(BaseSnapshotResult {
        path: snapshot_path.to_string_lossy().to_string(),
        files: file_count,
        changed_files,
        created: previous.is_none(),
    })
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
        quarantine_path: None,
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

fn case_insensitive_relative(root: &Path, relative: &str) -> Option<PathBuf> {
    let mut current = root.to_path_buf();
    for component in relative.split('/').filter(|part| !part.is_empty()) {
        let entry = fs::read_dir(&current)
            .ok()?
            .filter_map(Result::ok)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(component)
            })?;
        current = entry.path();
    }
    Some(current)
}

fn cyberpunk_relative_destination(source: &Path) -> Option<PathBuf> {
    let parts = source
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let lower = parts
        .iter()
        .map(|part| part.to_ascii_lowercase())
        .collect::<Vec<_>>();
    let signatures: &[(&[&str], &[&str])] = &[
        (
            &["bin", "x64", "plugins", "cyber_engine_tweaks", "mods"],
            &["bin", "x64", "plugins", "cyber_engine_tweaks", "mods"],
        ),
        (&["archive", "pc", "mod"], &["archive", "pc", "mod"]),
        (&["red4ext", "plugins"], &["red4ext", "plugins"]),
        (&["bin", "x64", "plugins"], &["bin", "x64", "plugins"]),
        (&["r6", "scripts"], &["r6", "scripts"]),
        (&["r6", "tweaks"], &["r6", "tweaks"]),
        (&["tools", "redmod"], &["tools", "redmod"]),
        (&["archive"], &["archive"]),
        (&["red4ext"], &["red4ext"]),
        (&["engine"], &["engine"]),
        (&["mods"], &["mods"]),
        (&["r6"], &["r6"]),
        (&["tools"], &["tools"]),
        (&["bin"], &["bin"]),
    ];
    for (index, _) in lower.iter().enumerate() {
        for (signature, normalized) in signatures {
            if index + signature.len() > lower.len()
                || !lower[index..index + signature.len()]
                    .iter()
                    .zip(signature.iter())
                    .all(|(part, expected)| part == expected)
            {
                continue;
            }
            let mut relative = PathBuf::new();
            for part in normalized.iter() {
                relative.push(part);
            }
            for part in &parts[index + signature.len()..] {
                relative.push(part);
            }
            return Some(relative);
        }
    }
    None
}

#[derive(Debug)]
struct RootDetectionResult {
    detected_root: PathBuf,
    relative_game_paths: Vec<String>,
    stripped_segments: Vec<String>,
    confidence: String,
    reason: String,
}

fn detect_candidate_root(path: &Path) -> RootDetectionResult {
    let detected_root = if path.is_dir() {
        unwrap_package_root(path)
    } else {
        path.to_path_buf()
    };
    let stripped_segments = detected_root
        .strip_prefix(path)
        .ok()
        .map(|relative| {
            relative
                .components()
                .filter_map(|component| match component {
                    std::path::Component::Normal(value) => {
                        Some(value.to_string_lossy().to_string())
                    }
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut relative_game_paths = Vec::new();
    let mut reason = String::new();
    if contains_game_root_layout(&detected_root) {
        for root in CYBERPUNK_ROOTS {
            if case_insensitive_relative(&detected_root, root).is_some() {
                relative_game_paths.push(root.to_string());
            }
        }
        reason = "Signatures de racine de jeu détectées après suppression des conteneurs.".into();
    } else if let Some(relative) = cyberpunk_relative_destination(&detected_root) {
        relative_game_paths.push(relative.to_string_lossy().replace('\\', "/"));
        reason = "Destination Cyberpunk reconstruite depuis un chemin de framework connu.".into();
    } else if detected_root
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("archive"))
    {
        relative_game_paths.push("archive/pc/mod".into());
        reason = "Archive Cyberpunk isolée reconnue par son extension.".into();
    } else if detected_root
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("reds"))
    {
        relative_game_paths.push("r6/scripts".into());
        reason = "Script REDscript isolé reconnu par son extension.".into();
    }
    relative_game_paths.sort();
    relative_game_paths.dedup();
    let confidence = if relative_game_paths.is_empty() {
        "low"
    } else if stripped_segments.is_empty() {
        "high"
    } else {
        "medium"
    };
    if reason.is_empty() {
        reason = "Aucune signature de racine Cyberpunk déterministe.".into();
    }
    RootDetectionResult {
        detected_root,
        relative_game_paths,
        stripped_segments,
        confidence: confidence.into(),
        reason,
    }
}

fn detect_cyberpunk_framework(path: &Path, files: &[String]) -> String {
    let joined = format!("{} {}", path.to_string_lossy(), files.join(" "))
        .replace('\\', "/")
        .to_ascii_lowercase();
    if joined.contains("cyber_engine_tweaks")
        && (joined.contains("cyber_engine_tweaks.asi") || joined.contains("/mods/"))
    {
        "Cyber Engine Tweaks".into()
    } else if joined.contains("red4ext/plugins/archivexl")
        || joined.contains("archive_xl.dll")
        || joined.contains("archivexl.dll")
    {
        "ArchiveXL".into()
    } else if joined.contains("red4ext/plugins/tweakxl") || joined.contains("tweak_xl.dll") {
        "TweakXL".into()
    } else if joined.contains("red4ext/plugins/codeware") || joined.contains("codeware.dll") {
        "Codeware".into()
    } else if joined.contains("redscript.toml")
        || joined.contains("engine/tools/scc.exe")
        || joined.contains("redscript.dll")
    {
        "redscript".into()
    } else if joined.contains("red4ext/red4ext.dll") || joined.contains("red4ext.dll") {
        "RED4ext".into()
    } else if joined.contains("red4ext/plugins/") {
        "RED4ext plugin".into()
    } else if joined.contains("/mods/") && joined.contains("info.json") {
        "REDmod".into()
    } else if joined.contains("r6/scripts/") {
        "REDscript mod".into()
    } else if joined.contains("r6/tweaks/") {
        "TweakXL content".into()
    } else if joined.contains("archive/pc/mod/") {
        "Cyberpunk archive".into()
    } else {
        "Unknown".into()
    }
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
    let mut specialized = Vec::new();
    for location in cyberpunk_locations {
        let Some(directory) = case_insensitive_relative(path, location) else {
            continue;
        };
        if let Ok(entries) = fs::read_dir(directory) {
            specialized.extend(
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .filter(|entry| {
                        let name = entry
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or_default();
                        !name.starts_with('.')
                            && !(location.eq_ignore_ascii_case("bin/x64/plugins")
                                && name.eq_ignore_ascii_case("cyber_engine_tweaks"))
                            && is_probable_mod_root(entry)
                    }),
            );
        }
    }
    let mut seen = HashSet::new();
    specialized.retain(|candidate| {
        let key = candidate
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();
        seen.insert(key)
    });
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

#[cfg(target_os = "windows")]
fn scan_fivem_client() -> Result<Vec<DetectedGame>, String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "LOCALAPPDATA est indisponible.".to_string())?;
    let root = local_app_data.join("FiveM");
    let executable = root.join("FiveM.exe");
    if !root.is_dir() || !executable.is_file() {
        return Ok(Vec::new());
    }
    let candidate = DetectedExecutable {
        name: "FiveM.exe".into(),
        path: executable.to_string_lossy().to_string(),
        size_bytes: fs::metadata(&executable)
            .map(|metadata| metadata.len())
            .unwrap_or(0),
    };
    Ok(vec![DetectedGame {
        name: "FiveM".into(),
        exec_path: candidate.path.clone(),
        mods_path: root
            .join("FiveM.app")
            .join("plugins")
            .to_string_lossy()
            .to_string(),
        platform: "standalone".into(),
        provider: "FiveM Client".into(),
        provider_game_id: Some("fivem-client".into()),
        install_directory: root.to_string_lossy().to_string(),
        steam_library: None,
        executable_candidates: vec![candidate],
        size_bytes: None,
        last_updated: fs::metadata(&executable)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs()),
        build_id: None,
        needs_executable: false,
        item_kind: "game".into(),
        confidence: "high".into(),
        version: None,
        publisher: Some("Cfx.re".into()),
        detection_source: "Dossier client officiel %LOCALAPPDATA%\\FiveM".into(),
    }])
}

#[cfg(not(target_os = "windows"))]
fn scan_fivem_client() -> Result<Vec<DetectedGame>, String> {
    Err("Le client FiveM officiel est détecté automatiquement sous Windows uniquement.".into())
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
    let providers = 4;

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
        current: 3,
        total: providers,
    });

    report_discovery_stage(
        &on_event,
        "FiveM Client",
        "Vérification ciblée du client et du dossier de plugins".into(),
    );
    match scan_fivem_client() {
        Ok(games) => {
            let found = games.len();
            discovered.extend(games);
            diagnostics.push(DiscoveryProviderDiagnostic {
                provider: "FiveM Client".into(),
                status: "ok".into(),
                found,
                detail: if found > 0 {
                    "Client détecté ; les ressources serveur restent volontairement séparées"
                } else {
                    "Client FiveM non trouvé dans son emplacement officiel"
                }
                .into(),
            });
        }
        Err(error) => diagnostics.push(DiscoveryProviderDiagnostic {
            provider: "FiveM Client".into(),
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
            let root_detection = detect_candidate_root(&canonical);
            let detected_framework =
                detect_cyberpunk_framework(&root_detection.detected_root, &inspected.files);
            let strong = inspected.framework != "Generic"
                || detected_framework != "Unknown"
                || !inspected.manifests.is_empty();
            let mut warnings = Vec::new();
            let sensitive_files = assess_sensitive_files(&canonical, &game_name)?;
            let mut destinations = root_detection.relative_game_paths.clone();
            if destinations.is_empty() {
                destinations = recognized_destinations(&inspected.files);
            }
            if inspected.source_url.is_none() {
                warnings.push("Aucune source exacte détectée : aucune mise à jour automatique ne sera autorisée.".into());
            }
            if inspected.framework == "Generic" {
                warnings.push(format!(
                    "Structure générique pour {game_name} : vérifiez la destination avant import."
                ));
            }
            if !sensitive_files.is_empty() {
                warnings.push(format!(
                    "{} fichier(s) sensible(s) détecté(s) : une décision sera demandée avant import.",
                    sensitive_files.len()
                ));
            }
            candidates.push(ModImportCandidate {
                id: inspected.id.clone(),
                name: inspected.name,
                path: inspected.path.clone(),
                source_path: inspected.path,
                detected_root: root_detection.detected_root.to_string_lossy().to_string(),
                detected_framework,
                relative_game_paths: root_detection.relative_game_paths,
                stripped_segments: root_detection.stripped_segments,
                root_confidence: root_detection.confidence.clone(),
                root_reason: root_detection.reason,
                enabled: inspected.enabled,
                mod_type: inspected.mod_type,
                size_bytes: inspected.size_bytes,
                files: inspected.files,
                fingerprint: inspected.fingerprint,
                framework: inspected.framework,
                manifests: inspected.manifests,
                source_url: inspected.source_url,
                version: inspected.version,
                confidence: if strong {
                    root_detection.confidence
                } else {
                    "low".into()
                },
                warnings,
                sensitive_files,
                recognized_destinations: destinations,
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
        let root_detection = detect_candidate_root(&canonical);
        let detected_framework =
            detect_cyberpunk_framework(&root_detection.detected_root, &inspected.files);
        let strong = inspected.framework != "Generic"
            || detected_framework != "Unknown"
            || !inspected.manifests.is_empty();
        let mut warnings = Vec::new();
        let sensitive_files = assess_sensitive_files(&canonical, &game_name)?;
        let mut destinations = root_detection.relative_game_paths.clone();
        if destinations.is_empty() {
            destinations = recognized_destinations(&inspected.files);
        }
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
        if !sensitive_files.is_empty() {
            warnings.push(format!(
                "{} fichier(s) sensible(s) détecté(s) : une décision sera demandée avant import.",
                sensitive_files.len()
            ));
        }
        let name = inspected.name.clone();
        candidates.push(ModImportCandidate {
            id: inspected.id.clone(),
            name: inspected.name,
            path: inspected.path.clone(),
            source_path: inspected.path,
            detected_root: root_detection.detected_root.to_string_lossy().to_string(),
            detected_framework,
            relative_game_paths: root_detection.relative_game_paths,
            stripped_segments: root_detection.stripped_segments,
            root_confidence: root_detection.confidence.clone(),
            root_reason: root_detection.reason,
            enabled: inspected.enabled,
            mod_type: inspected.mod_type,
            size_bytes: inspected.size_bytes,
            files: inspected.files,
            fingerprint: inspected.fingerprint,
            framework: inspected.framework,
            manifests: inspected.manifests,
            source_url: inspected.source_url,
            version: inspected.version,
            confidence: if strong {
                root_detection.confidence
            } else {
                "low".into()
            },
            warnings,
            sensitive_files,
            recognized_destinations: destinations,
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
    let cyberpunk_layout = keys.iter().any(|path| {
        [
            "archive/pc/",
            "r6/",
            "red4ext/",
            "bin/x64/plugins/cyber_engine_tweaks/",
            "tools/redmod/",
        ]
        .iter()
        .any(|prefix| path.starts_with(prefix))
    });
    if !cyberpunk_layout {
        return Ok(vec![
            "Layout générique validé : aucun diagnostic Cyberpunk/REDmod appliqué à ce jeu.".into(),
        ]);
    }
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
    let legacy = root.parent().map(|parent| parent.join("mods"));
    for id in ids {
        if safe_game_id(id).is_err() {
            continue;
        }
        let manifest_path = [
            Some(root.join(id).join("manifest.json")),
            legacy
                .as_ref()
                .map(|path| path.join(id).join("manifest.json")),
        ]
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .unwrap_or_else(|| root.join(id).join("manifest.json"));
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
    let legacy_root = staged_root.parent().map(|parent| parent.join("mods"));
    let mut owners: HashMap<String, Vec<(String, PathBuf, PathBuf)>> = HashMap::new();
    for id in enabled_mod_ids {
        if safe_game_id(id).is_err() {
            continue;
        }
        let content = [
            Some(staged_root.join(id).join("content")),
            legacy_root
                .as_ref()
                .map(|path| path.join(id).join("content")),
        ]
        .into_iter()
        .flatten()
        .find(|path| path.is_dir())
        .unwrap_or_else(|| staged_root.join(id).join("content"));
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
        .is_some_and(|value| SENSITIVE_EXTENSIONS.contains(&value.as_str()))
}

const SENSITIVE_EXTENSIONS: [&str; 21] = [
    "exe", "com", "scr", "msi", "msp", "bat", "cmd", "ps1", "vbs", "vbe", "js", "jse", "wsf",
    "wsh", "hta", "dll", "sys", "cpl", "reg", "lnk", "url",
];

struct MalwareScanResult {
    status: &'static str,
    detail: &'static str,
}

trait MalwareScanBackend {
    fn scan(&self, _path: &Path) -> MalwareScanResult;
}

struct NoScanBackend;

impl MalwareScanBackend for NoScanBackend {
    fn scan(&self, _path: &Path) -> MalwareScanResult {
        MalwareScanResult {
            status: "Unavailable",
            detail:
                "Analyse antivirus locale non disponible ; le fichier reste traité comme sensible.",
        }
    }
}

fn normalized_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(to_error)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(to_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn file_magic(path: &Path) -> Result<(String, bool), String> {
    let mut file = fs::File::open(path).map_err(to_error)?;
    let mut prefix = [0u8; 16];
    let read = file.read(&mut prefix).map_err(to_error)?;
    let prefix = &prefix[..read];
    if prefix.starts_with(b"MZ") {
        return Ok(("PE/COFF".into(), true));
    }
    if prefix.starts_with(b"\x7fELF") {
        return Ok(("ELF".into(), true));
    }
    if prefix.starts_with(&[0xfe, 0xed, 0xfa, 0xce])
        || prefix.starts_with(&[0xfe, 0xed, 0xfa, 0xcf])
        || prefix.starts_with(&[0xcf, 0xfa, 0xed, 0xfe])
        || prefix.starts_with(&[0xca, 0xfe, 0xba, 0xbe])
    {
        return Ok(("Mach-O".into(), true));
    }
    if prefix.starts_with(b"#!") {
        return Ok(("ScriptShebang".into(), true));
    }
    if prefix.starts_with(b"PK\x03\x04") {
        return Ok(("ZIP".into(), false));
    }
    Ok(("Unknown".into(), false))
}

fn game_adapter_allows_sensitive(game_name: &str, destination: &str, extension: &str) -> bool {
    let game = game_name.to_ascii_lowercase();
    let destination = destination.replace('\\', "/").to_ascii_lowercase();
    if game.contains("cyberpunk") {
        return (extension == "dll"
            && (destination.starts_with("red4ext/plugins/")
                || destination.starts_with("bin/x64/plugins/")))
            || (matches!(extension, "js" | "dll")
                && destination.starts_with("bin/x64/plugins/cyber_engine_tweaks/mods/"));
    }
    if game.contains("fivem") {
        return matches!(extension, "dll" | "asi") && destination.starts_with("fivem.app/plugins/");
    }
    false
}

fn assess_sensitive_file(
    file: &Path,
    relative: &Path,
    install_destination: &Path,
    game_name: &str,
    source_provider: Option<&str>,
    source_mod_id: Option<&str>,
) -> Result<Option<SensitiveFileAssessment>, String> {
    let extension = relative
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let (magic_type, magic_executable) = file_magic(file)?;
    let is_sensitive_extension = SENSITIVE_EXTENSIONS.contains(&extension.as_str());
    if !is_sensitive_extension && !magic_executable {
        return Ok(None);
    }
    let destination = normalized_path(install_destination);
    let file_name = relative
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let parts = file_name.split('.').collect::<Vec<_>>();
    let double_extension = parts.len() > 2
        && matches!(
            parts[parts.len() - 2].to_ascii_lowercase().as_str(),
            "jpg" | "jpeg" | "png" | "gif" | "pdf" | "txt" | "doc" | "docx"
        );
    let expected_by_game_adapter =
        game_adapter_allows_sensitive(game_name, &destination, &extension);
    let may_deploy = expected_by_game_adapter && matches!(extension.as_str(), "dll" | "asi" | "js");
    let at_root = relative.components().count() <= 1;
    let tool_path = normalized_path(relative)
        .to_ascii_lowercase()
        .contains("tools/");
    let blocked = matches!(extension.as_str(), "sys" | "cpl")
        || (extension == "exe" && destination.ends_with("/cyberpunk2077.exe"));
    let high_risk = blocked
        || double_extension
        || (magic_executable && extension.is_empty())
        || (at_root
            && matches!(
                extension.as_str(),
                "exe" | "com" | "msi" | "ps1" | "bat" | "cmd"
            ))
        || matches!(
            extension.as_str(),
            "ps1" | "bat" | "cmd" | "vbs" | "vbe" | "hta" | "lnk" | "url" | "reg"
        );
    let risk_level = if blocked {
        "Blocked"
    } else if high_risk {
        "HighRisk"
    } else {
        "Caution"
    };
    let mut reasons = Vec::new();
    if is_sensitive_extension {
        reasons.push(format!("Extension sensible .{extension}."));
    }
    if magic_executable {
        reasons.push(format!(
            "Signature de format exécutable détectée : {magic_type}."
        ));
    }
    if double_extension {
        reasons.push("Double extension potentiellement trompeuse.".into());
    }
    if tool_path && matches!(extension.as_str(), "exe" | "com") {
        reasons.push(
            "Outil facultatif dans un sous-dossier tools ; aucune exécution automatique autorisée."
                .into(),
        );
    }
    if expected_by_game_adapter {
        reasons.push("Emplacement binaire reconnu explicitement par l’adaptateur du jeu.".into());
    } else {
        reasons.push("Emplacement non déclaré par l’adaptateur du jeu.".into());
    }
    if blocked {
        reasons.push("Type ou destination bloqué par la politique de déploiement.".into());
    }
    let malware_scan = NoScanBackend.scan(file);
    reasons.push(format!("{} ({})", malware_scan.detail, malware_scan.status));
    let detected_type = if magic_executable {
        magic_type.clone()
    } else if extension == "dll" {
        "DynamicLibrary".into()
    } else if matches!(extension.as_str(), "ps1" | "bat" | "cmd" | "vbs" | "js") {
        "Script".into()
    } else {
        "SensitiveFile".into()
    };
    Ok(Some(SensitiveFileAssessment {
        relative_path: normalized_path(relative),
        detected_type,
        extension,
        magic_type,
        size: fs::metadata(file).map_err(to_error)?.len(),
        hash: file_sha256(file)?,
        signature_status: "Unknown".into(),
        publisher: None,
        source_provider: source_provider.map(ToOwned::to_owned),
        source_mod_id: source_mod_id.map(ToOwned::to_owned),
        expected_by_manifest: false,
        expected_by_game_adapter,
        execution_required: false,
        install_destination: destination,
        risk_level: risk_level.into(),
        reasons,
        recommended_action: if blocked {
            "exclude"
        } else if may_deploy {
            "include-adapter"
        } else {
            "quarantine"
        }
        .into(),
        decision: None,
        may_deploy,
    }))
}

fn assess_sensitive_files(
    source: &Path,
    game_name: &str,
) -> Result<Vec<SensitiveFileAssessment>, String> {
    let mut assessments = Vec::new();
    if source.is_file() {
        let relative = source
            .file_name()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("file"));
        if let Some(assessment) =
            assess_sensitive_file(source, &relative, &relative, game_name, None, None)?
        {
            assessments.push(assessment);
        }
        return Ok(assessments);
    }
    for entry in WalkDir::new(source)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(source).map_err(to_error)?;
        if let Some(assessment) =
            assess_sensitive_file(entry.path(), relative, relative, game_name, None, None)?
        {
            assessments.push(assessment);
        }
    }
    Ok(assessments)
}

fn recognized_destinations(files: &[String]) -> Vec<String> {
    let mut roots = files
        .iter()
        .filter_map(|file| {
            file.replace('\\', "/")
                .split('/')
                .next()
                .map(ToOwned::to_owned)
        })
        .filter(|root| {
            CYBERPUNK_ROOTS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(root))
        })
        .collect::<Vec<_>>();
    roots.sort();
    roots.dedup();
    roots
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
    Ok(())
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    if source.is_file() {
        if forbidden_archive_file(source) {
            return Err("Sensitive files must use ZAILON's secure import flow.".into());
        }
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
        if entry.file_type().is_file() && forbidden_archive_file(relative) {
            continue;
        }
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

struct SensitiveImportContext {
    action: String,
    game_name: String,
    content_root: PathBuf,
    inactive_root: PathBuf,
    quarantine_root: PathBuf,
    assessments: Vec<SensitiveFileAssessment>,
    quarantine_paths: Vec<String>,
}

fn validated_sensitive_action(action: &str) -> Result<String, String> {
    match action {
        "exclude" | "quarantine" | "inactive" => Ok(action.to_string()),
        _ => Err("Invalid sensitive-file decision.".into()),
    }
}

fn restrict_quarantine_file(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(to_error)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn copy_sensitive_aware_file(
    source: &Path,
    destination: &Path,
    context: &mut SensitiveImportContext,
) -> Result<(), String> {
    let relative_destination = destination
        .strip_prefix(&context.content_root)
        .unwrap_or(destination);
    let assessment = assess_sensitive_file(
        source,
        relative_destination,
        relative_destination,
        &context.game_name,
        None,
        None,
    )?;
    let Some(mut assessment) = assessment else {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        fs::copy(source, destination).map_err(to_error)?;
        return Ok(());
    };
    if assessment.may_deploy {
        assessment.decision = Some("deployed-by-game-adapter".into());
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        fs::copy(source, destination).map_err(to_error)?;
    } else if assessment.risk_level == "Blocked" || context.action == "exclude" {
        assessment.decision = Some("excluded".into());
    } else if context.action == "inactive" {
        let target = context.inactive_root.join(relative_destination);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        fs::copy(source, &target).map_err(to_error)?;
        assessment.decision = Some("stored-inactive".into());
    } else {
        let target = context
            .quarantine_root
            .join("files")
            .join(relative_destination);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        fs::copy(source, &target).map_err(to_error)?;
        restrict_quarantine_file(&target)?;
        assessment.decision = Some("quarantined".into());
        context
            .quarantine_paths
            .push(target.to_string_lossy().to_string());
    }
    context.assessments.push(assessment);
    Ok(())
}

fn copy_tree_cancellable_secure(
    source: &Path,
    destination: &Path,
    cancel: &AtomicBool,
    context: &mut SensitiveImportContext,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("TASK_CANCELLED".into());
    }
    if source.is_file() {
        return copy_sensitive_aware_file(source, destination, context);
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
            copy_sensitive_aware_file(entry.path(), &output, context)?;
        }
    }
    Ok(())
}

fn write_sensitive_import_records(
    context: &SensitiveImportContext,
    stage_directory: &Path,
    source: &Path,
) -> Result<(), String> {
    if context.assessments.is_empty() {
        return Ok(());
    }
    write_json_atomic(
        &stage_directory.join("sensitive-files.json"),
        &serde_json::to_value(&context.assessments).map_err(to_error)?,
    )?;
    if !context.quarantine_paths.is_empty() {
        write_json_atomic(
            &context.quarantine_root.join("assessment.json"),
            &serde_json::to_value(&context.assessments).map_err(to_error)?,
        )?;
        write_json_atomic(
            &context.quarantine_root.join("source.json"),
            &serde_json::json!({
                "sourcePath": source.to_string_lossy(),
                "game": context.game_name,
                "decision": context.action,
                "createdAt": unix_timestamp(),
                "automaticExecution": false
            }),
        )?;
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
    security: &mut SensitiveImportContext,
) -> Result<(String, Vec<String>), String> {
    let lower_game = game_name.to_ascii_lowercase();
    let cyberpunk = lower_game.contains("cyberpunk");
    let fivem_client = lower_game.contains("fivem");
    let root = if source.is_dir() {
        unwrap_package_root(source)
    } else {
        source.to_path_buf()
    };
    if fivem_client {
        let server_markers = WalkDir::new(&root)
            .max_depth(4)
            .into_iter()
            .filter_map(Result::ok)
            .filter_map(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .map(|name| name.to_ascii_lowercase())
            })
            .filter(|name| {
                matches!(
                    name.as_str(),
                    "fxmanifest.lua" | "__resource.lua" | "server.cfg"
                )
            })
            .collect::<Vec<_>>();
        if !server_markers.is_empty() {
            return Err(format!(
                "Ressource serveur FiveM détectée ({}) : l’adaptateur client refuse de la mélanger aux plugins client. Importez-la plus tard dans un gestionnaire serveur dédié.",
                server_markers.join(", ")
            ));
        }
    }
    let mut diagnostics = Vec::new();
    let layout;
    if root.is_file() {
        let extension = root
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let anchored_destination = cyberpunk
            .then(|| cyberpunk_relative_destination(&root))
            .flatten();
        let destination = if let Some(relative) = anchored_destination {
            layout = "CyberpunkNormalizedFragment".to_string();
            diagnostics.push(format!(
                "Chemin Cyberpunk normalisé vers {}.",
                relative.to_string_lossy().replace('\\', "/")
            ));
            content.join(relative)
        } else if fivem_client && matches!(extension.as_str(), "asi" | "dll" | "ini" | "fx") {
            layout = "FiveMClientPlugin".to_string();
            content.join("FiveM.app/plugins").join(
                root.file_name()
                    .ok_or_else(|| "Invalid source file name.".to_string())?,
            )
        } else if cyberpunk && extension == "archive" {
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
        copy_tree_cancellable_secure(&root, &destination, cancel, security)?;
    } else {
        let root_name = root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if fivem_client {
            layout = "FiveMClientPlugin".to_string();
            let root_name = root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let target = if root_name.eq_ignore_ascii_case("plugins") {
                content.join("FiveM.app/plugins")
            } else {
                content
                    .join("FiveM.app/plugins")
                    .join(safe_archive_component(root_name))
            };
            copy_tree_cancellable_secure(&root, &target, cancel, security)?;
            diagnostics.push("Paquet classé comme plugin client FiveM. Les ressources serveur ne sont jamais déployées par cet adaptateur.".into());
        } else if cyberpunk && !contains_game_root_layout(&root) {
            if let Some(relative) = cyberpunk_relative_destination(&root) {
                layout = "CyberpunkNormalizedFragment".to_string();
                diagnostics.push(format!(
                    "Racine Cyberpunk reconstruite vers {}.",
                    relative.to_string_lossy().replace('\\', "/")
                ));
                copy_tree_cancellable_secure(&root, &content.join(relative), cancel, security)?;
            } else if WalkDir::new(&root)
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
                diagnostics.push(
                    "Archive(s) Cyberpunk sans racine explicite : destination archive/pc/mod."
                        .into(),
                );
                copy_tree_cancellable_secure(
                    &root,
                    &content.join("archive/pc/mod"),
                    cancel,
                    security,
                )?;
            } else if WalkDir::new(&root)
                .max_depth(3)
                .into_iter()
                .filter_map(Result::ok)
                .any(|entry| {
                    entry
                        .path()
                        .extension()
                        .and_then(|value| value.to_str())
                        .is_some_and(|value| value.eq_ignore_ascii_case("reds"))
                })
            {
                layout = "CyberpunkRedscript".to_string();
                diagnostics.push(
                    "Script(s) REDscript sans racine explicite : destination r6/scripts.".into(),
                );
                copy_tree_cancellable_secure(&root, &content.join("r6/scripts"), cancel, security)?;
            } else {
                layout = "GenericModsFolder".to_string();
                diagnostics.push(
                    "Structure Cyberpunk ambiguë : aucun chemin de jeu déterministe, stockage sous mods/<nom> avec vérification manuelle.".into(),
                );
                let name = safe_archive_component(
                    root.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("mod"),
                );
                copy_tree_cancellable_secure(
                    &root,
                    &content.join("mods").join(name),
                    cancel,
                    security,
                )?;
            }
        } else if contains_game_root_layout(&root) {
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
                copy_tree_cancellable_secure(&entry.path(), &content.join(name), cancel, security)?;
            }
        } else if CYBERPUNK_ROOTS
            .iter()
            .any(|name| root_name.eq_ignore_ascii_case(name))
        {
            layout = "GameRootFragment".to_string();
            copy_tree_cancellable_secure(
                &root,
                &content.join(
                    root.file_name()
                        .ok_or_else(|| "Invalid root name.".to_string())?,
                ),
                cancel,
                security,
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
            copy_tree_cancellable_secure(&root, &content.join("archive/pc/mod"), cancel, security)?;
        } else {
            layout = "GenericModsFolder".to_string();
            diagnostics
                .push("Structure sans racine de jeu reconnue : mappée sous mods/<nom>.".into());
            let name = safe_archive_component(
                root.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("mod"),
            );
            copy_tree_cancellable_secure(
                &root,
                &content.join("mods").join(name),
                cancel,
                security,
            )?;
        }
    }
    Ok((layout, diagnostics))
}

fn staged_mods_root(app: &AppHandle, game_id: &str) -> Result<PathBuf, String> {
    Ok(update_data_root(app)?
        .join("games")
        .join(safe_game_id(game_id)?)
        .join("store"))
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
        quarantine_path: text("quarantineRoot"),
    })
}

#[tauri::command]
fn list_staged_mods(app: AppHandle, game_id: String) -> Result<Vec<NativeMod>, String> {
    let root = staged_mods_root(&app, &game_id)?;
    let legacy = root.parent().map(|parent| parent.join("mods"));
    let mut mods = [Some(root), legacy]
        .into_iter()
        .flatten()
        .filter(|path| path.is_dir())
        .flat_map(|path| {
            fs::read_dir(path)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .collect::<Vec<_>>()
        })
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
    let legacy = root.parent().map(|parent| parent.join("mods"));
    for target in [
        Some(root.join(&stage_id)),
        legacy.map(|path| path.join(&stage_id)),
    ]
    .into_iter()
    .flatten()
    {
        if target.exists() {
            fs::remove_dir_all(target).map_err(to_error)?;
        }
    }
    Ok(())
}

fn cyberpunk_repair_target(relative: &Path) -> Option<PathBuf> {
    let parts = relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    if parts.len() < 2 {
        return None;
    }
    let lower = parts
        .iter()
        .map(|part| part.to_ascii_lowercase())
        .collect::<Vec<_>>();
    let recognized = [
        "archive", "r6", "red4ext", "bin", "engine", "tools", "plugins", "config",
    ];
    if recognized.contains(&lower[0].as_str()) {
        return None;
    }
    let start = lower
        .iter()
        .enumerate()
        .skip(1)
        .find_map(|(index, part)| recognized.contains(&part.as_str()).then_some(index))?;
    let mut output = PathBuf::new();
    output.push(&lower[start]);
    for part in &parts[start + 1..] {
        output.push(part);
    }
    Some(output)
}

fn copy_tree_for_snapshot(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in WalkDir::new(source)
        .follow_links(false)
        .into_iter()
        .map(|entry| entry.map_err(to_error))
    {
        let entry = entry?;
        if entry.file_type().is_symlink() {
            return Err("Un lien symbolique empêche la création du snapshot.".into());
        }
        let relative = entry.path().strip_prefix(source).map_err(to_error)?;
        if relative.as_os_str().is_empty() {
            fs::create_dir_all(destination).map_err(to_error)?;
            continue;
        }
        validate_archive_relative(relative)?;
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(to_error)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            fs::copy(entry.path(), target).map_err(to_error)?;
        }
    }
    Ok(())
}

fn cyberpunk_structure_repair_preview_inner(
    app: &AppHandle,
    game_id: &str,
) -> Result<CyberpunkRepairPreview, String> {
    let game_id = safe_game_id(game_id)?.to_string();
    let store = staged_mods_root(app, &game_id)?;
    let mut packages_scanned = 0u64;
    let mut files_affected = 0u64;
    let mut items = Vec::new();
    for entry in fs::read_dir(store)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
    {
        packages_scanned += 1;
        let stage = entry.path();
        let content = stage.join("content");
        if !content.is_dir() {
            continue;
        }
        let stage_id = entry.file_name().to_string_lossy().to_string();
        if safe_game_id(&stage_id).is_err() {
            continue;
        }
        let manifest = fs::read(stage.join("manifest.json"))
            .ok()
            .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        let name = nexus_json_string(&manifest, &["name"]);
        let files = mod_files(&content);
        let detected_framework = detect_cyberpunk_framework(&content, &files);
        let mut moves = Vec::new();
        let mut targets: HashMap<String, Vec<String>> = HashMap::new();
        for file in &files {
            let relative = PathBuf::from(file);
            let Some(target) = cyberpunk_repair_target(&relative) else {
                continue;
            };
            let from = relative.to_string_lossy().replace('\\', "/");
            let to = target.to_string_lossy().replace('\\', "/");
            if from.eq_ignore_ascii_case(&to) {
                continue;
            }
            targets.entry(to.clone()).or_default().push(from.clone());
            moves.push(CyberpunkRepairMove { from, to });
        }
        if moves.is_empty() {
            continue;
        }
        files_affected += moves.len() as u64;
        let conflicts = targets
            .into_iter()
            .filter(|(_, sources)| sources.len() > 1)
            .map(|(target, sources)| format!("{target} ← {}", sources.join(" · ")))
            .collect::<Vec<_>>();
        items.push(CyberpunkRepairItem {
            stage_id,
            name: if name.is_empty() {
                entry.file_name().to_string_lossy().to_string()
            } else {
                name
            },
            detected_framework,
            confidence: if conflicts.is_empty() { "high" } else { "low" }.into(),
            moves,
            conflicts,
        });
    }
    items.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    let mut warnings = Vec::new();
    if items.iter().any(|item| !item.conflicts.is_empty()) {
        warnings.push(
            "Des collisions de chemins demandent une correction manuelle et bloquent l'application automatique."
                .into(),
        );
    }
    Ok(CyberpunkRepairPreview {
        game_id,
        packages_scanned,
        files_affected,
        items,
        warnings,
    })
}

#[tauri::command]
fn preview_cyberpunk_structure_repair(
    app: AppHandle,
    game_id: String,
) -> Result<CyberpunkRepairPreview, String> {
    cyberpunk_structure_repair_preview_inner(&app, &game_id)
}

#[tauri::command]
fn apply_cyberpunk_structure_repair(
    app: AppHandle,
    game_id: String,
    stage_ids: Vec<String>,
) -> Result<CyberpunkRepairResult, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let requested = stage_ids
        .into_iter()
        .map(|stage_id| safe_game_id(&stage_id).map(str::to_string))
        .collect::<Result<HashSet<_>, _>>()?;
    if requested.is_empty() {
        return Err("Aucun paquet Cyberpunk sélectionné pour réparation.".into());
    }
    let preview = cyberpunk_structure_repair_preview_inner(&app, &game_id)?;
    let selected = preview
        .items
        .into_iter()
        .filter(|item| requested.contains(&item.stage_id))
        .collect::<Vec<_>>();
    if selected.len() != requested.len() {
        return Err("Le plan de réparation a changé ; relancez l'aperçu.".into());
    }
    if selected.iter().any(|item| !item.conflicts.is_empty()) {
        return Err("Une collision de chemins bloque la réparation automatique.".into());
    }
    let repair_id = format!(
        "cyberpunk-repair-{}-{}",
        unix_timestamp(),
        std::process::id()
    );
    let repair_root = update_data_root(&app)?
        .join("games")
        .join(&game_id)
        .join("repairs")
        .join(&repair_id);
    let snapshot_root = repair_root.join("snapshot");
    let work_root = repair_root.join("work");
    fs::create_dir_all(&snapshot_root).map_err(to_error)?;
    fs::create_dir_all(&work_root).map_err(to_error)?;
    let store = staged_mods_root(&app, &game_id)?;
    let mut packages_repaired = 0u64;
    let mut files_moved = 0u64;
    let mut diagnostics = Vec::new();
    for item in selected {
        let stage = store.join(&item.stage_id);
        let content = stage.join("content");
        if !content.is_dir() {
            return Err(format!("Contenu manquant pour {}.", item.name));
        }
        copy_tree_for_snapshot(&stage, &snapshot_root.join(&item.stage_id))?;
        let repaired_content = work_root.join(&item.stage_id).join("content");
        fs::create_dir_all(&repaired_content).map_err(to_error)?;
        let move_map = item
            .moves
            .iter()
            .map(|entry| (entry.from.to_ascii_lowercase(), PathBuf::from(&entry.to)))
            .collect::<HashMap<_, _>>();
        for entry in WalkDir::new(&content)
            .follow_links(false)
            .into_iter()
            .map(|entry| entry.map_err(to_error))
        {
            let entry = entry?;
            if entry.file_type().is_symlink() {
                return Err("Un lien symbolique bloque la réparation.".into());
            }
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry.path().strip_prefix(&content).map_err(to_error)?;
            validate_archive_relative(relative)?;
            let key = relative
                .to_string_lossy()
                .replace('\\', "/")
                .to_ascii_lowercase();
            let target_relative = move_map
                .get(&key)
                .cloned()
                .unwrap_or_else(|| relative.to_path_buf());
            let target = repaired_content.join(target_relative);
            if target.exists() {
                return Err(format!(
                    "Collision imprévue pendant la réparation de {}.",
                    item.name
                ));
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            fs::copy(entry.path(), target).map_err(to_error)?;
        }
        let previous_content = stage.join(format!("content.before-{repair_id}"));
        fs::rename(&content, &previous_content).map_err(to_error)?;
        if let Err(error) = fs::rename(&repaired_content, &content).map_err(to_error) {
            let _ = fs::rename(&previous_content, &content);
            return Err(error);
        }
        let manifest_path = stage.join("manifest.json");
        let mut manifest = fs::read(&manifest_path)
            .ok()
            .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        manifest["layout"] = serde_json::json!("CyberpunkRepairedGameRelative");
        manifest["framework"] = serde_json::json!(item.detected_framework);
        manifest["lastCyberpunkRepairId"] = serde_json::json!(repair_id);
        manifest["lastCyberpunkRepairAt"] = serde_json::json!(unix_timestamp());
        manifest["repairSnapshot"] =
            serde_json::json!(snapshot_root.join(&item.stage_id).to_string_lossy());
        if let Err(error) = write_json_atomic(&manifest_path, &manifest) {
            let _ = fs::remove_dir_all(&content);
            let _ = fs::rename(&previous_content, &content);
            return Err(error);
        }
        fs::remove_dir_all(previous_content).map_err(to_error)?;
        packages_repaired += 1;
        files_moved += item.moves.len() as u64;
        diagnostics.push(format!(
            "{} : {} chemin(s) replacé(s) relativement à la racine du jeu.",
            item.name,
            item.moves.len()
        ));
    }
    write_json_atomic(
        &repair_root.join("repair.json"),
        &serde_json::json!({
            "schemaVersion": 1,
            "repairId": repair_id,
            "gameId": game_id,
            "createdAt": unix_timestamp(),
            "packagesRepaired": packages_repaired,
            "filesMoved": files_moved,
            "snapshotPath": snapshot_root,
            "diagnostics": diagnostics,
        }),
    )?;
    Ok(CyberpunkRepairResult {
        repair_id,
        snapshot_path: snapshot_root.to_string_lossy().to_string(),
        packages_repaired,
        files_moved,
        diagnostics,
    })
}

#[tauri::command]
fn rollback_cyberpunk_structure_repair(
    app: AppHandle,
    game_id: String,
    repair_id: String,
) -> Result<CyberpunkRepairResult, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let repair_id = safe_game_id(&repair_id)?.to_string();
    let repair_root = update_data_root(&app)?
        .join("games")
        .join(&game_id)
        .join("repairs")
        .join(&repair_id);
    let snapshot_root = repair_root.join("snapshot");
    if !snapshot_root.is_dir() {
        return Err("Snapshot de réparation introuvable.".into());
    }
    let store = staged_mods_root(&app, &game_id)?;
    let rollback_root = repair_root.join(format!("rollback-{}", unix_timestamp()));
    let mut packages_repaired = 0u64;
    for snapshot in fs::read_dir(&snapshot_root)
        .map_err(to_error)?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
    {
        let stage_id = snapshot.file_name().to_string_lossy().to_string();
        safe_game_id(&stage_id)?;
        let target = store.join(&stage_id);
        let restored = rollback_root.join("restored").join(&stage_id);
        copy_tree_for_snapshot(&snapshot.path(), &restored)?;
        if target.exists() {
            let displaced = rollback_root.join("replaced").join(&stage_id);
            if let Some(parent) = displaced.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            fs::rename(&target, &displaced).map_err(to_error)?;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        if let Err(error) = fs::rename(&restored, &target).map_err(to_error) {
            let displaced = rollback_root.join("replaced").join(&stage_id);
            if displaced.exists() {
                let _ = fs::rename(displaced, &target);
            }
            return Err(error);
        }
        packages_repaired += 1;
    }
    Ok(CyberpunkRepairResult {
        repair_id,
        snapshot_path: snapshot_root.to_string_lossy().to_string(),
        packages_repaired,
        files_moved: 0,
        diagnostics: vec![
            "Snapshot restauré. La version remplacée reste dans le dossier rollback du journal de réparation."
                .into(),
        ],
    })
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
    sensitive_action: &str,
    cancel: &AtomicBool,
) -> Result<SecureImportResult, String> {
    let game_id = safe_game_id(game_id)?;
    let sensitive_action = validated_sensitive_action(sensitive_action)?;
    let destination = PathBuf::from(destination);
    let staging_root = staged_mods_root(app, game_id)?;
    fs::create_dir_all(&staging_root).map_err(to_error)?;
    let total = paths.len() as u64;
    let mut installed = Vec::new();
    let mut all_sensitive_files = Vec::new();
    let mut all_quarantine_paths = Vec::new();
    let mut warnings = Vec::new();
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
        let mut security = SensitiveImportContext {
            action: sensitive_action.clone(),
            game_name: game_name.to_string(),
            content_root: staged_content.clone(),
            inactive_root: stage_directory.join("inactive-sensitive"),
            quarantine_root: update_data_root(app)?
                .join("quarantine")
                .join(format!("{task_id}-{stage_id}")),
            assessments: Vec::new(),
            quarantine_paths: Vec::new(),
        };
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
        let (layout, mut diagnostics) =
            match stage_content(&source, &staged_content, game_name, cancel, &mut security) {
                Ok(result) => result,
                Err(error) => {
                    let _ = fs::remove_dir_all(&stage_directory);
                    let _ = fs::remove_dir_all(&security.quarantine_root);
                    return Err(error);
                }
            };
        if cancel.load(Ordering::Relaxed) {
            let _ = fs::remove_dir_all(&stage_directory);
            let _ = fs::remove_dir_all(&security.quarantine_root);
            return Err("TASK_CANCELLED".into());
        }
        if let Err(error) = write_sensitive_import_records(&security, &stage_directory, &source) {
            let _ = fs::remove_dir_all(&stage_directory);
            let _ = fs::remove_dir_all(&security.quarantine_root);
            return Err(error);
        }
        if !security.assessments.is_empty() {
            let isolated = security
                .assessments
                .iter()
                .filter(|item| item.decision.as_deref() != Some("deployed-by-game-adapter"))
                .count();
            diagnostics.push(format!(
                "{} fichier(s) sensible(s) évalué(s), {} isolé(s) ou exclu(s). Aucun fichier n’a été exécuté.",
                security.assessments.len(),
                isolated
            ));
            warnings.push(format!(
                "{} : {} fichier(s) sensible(s) traité(s) avec la décision « {} ».",
                inspected.name,
                security.assessments.len(),
                sensitive_action
            ));
        }
        let content_inspection = inspect_native_mod(&staged_content);
        let explicit_framework =
            detect_cyberpunk_framework(&staged_content, &content_inspection.files);
        let deployment_status = if deploy_now { "enabled" } else { "stored" };
        let manifest_path = stage_directory.join("manifest.json");
        let manifest = serde_json::json!({
            "schemaVersion": 2,
            "id": stage_id,
            "name": inspected.name.clone(),
            "fingerprint": inspected.fingerprint.clone(),
            "framework": if explicit_framework == "Unknown" { inspected.framework.clone() } else { explicit_framework },
            "version": inspected.version.clone(),
            "sourceUrl": inspected.source_url.clone(),
            "profiles": profile_ids,
            "sourceFiles": inspected.files.clone(),
            "contentFiles": content_inspection.files,
            "layout": layout,
            "diagnostics": diagnostics,
            "sensitiveFiles": security.assessments.clone(),
            "quarantinePaths": security.quarantine_paths.clone(),
            "quarantineRoot": if security.quarantine_paths.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(security.quarantine_root.to_string_lossy().to_string()) },
            "sensitiveDecision": sensitive_action,
            "automaticExecution": false,
            "stagedAt": unix_timestamp(),
            "deploymentBackend": "TemporaryCopy",
            "deploymentStatus": deployment_status,
            "legacyDestination": destination.to_string_lossy()
        });
        if let Err(error) = fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest).map_err(to_error)?,
        )
        .map_err(to_error)
        {
            let _ = fs::remove_dir_all(&stage_directory);
            let _ = fs::remove_dir_all(&security.quarantine_root);
            return Err(error);
        }
        installed.push(stage_directory.to_string_lossy().to_string());
        all_sensitive_files.extend(security.assessments.clone());
        all_quarantine_paths.extend(security.quarantine_paths.clone());
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
    let status = if all_sensitive_files.is_empty() {
        "Completed"
    } else {
        "CompletedWithWarnings"
    };
    Ok(SecureImportResult {
        installed_paths: installed,
        status: status.into(),
        warnings,
        sensitive_files: all_sensitive_files,
        quarantine_paths: all_quarantine_paths,
    })
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
    sensitive_action: String,
    on_event: Channel<BackgroundTaskEvent>,
) -> Result<SecureImportResult, String> {
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
            &sensitive_action,
            &cancel,
        )
    })
    .await
    .map_err(|_| "The background import stopped unexpectedly.".to_string())?;
    match &result {
        Ok(import) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            if import.status == "CompletedWithWarnings" {
                "completed_with_warnings"
            } else {
                "completed"
            },
            if import.status == "CompletedWithWarnings" {
                format!(
                    "Import terminé avec avertissement : {} mod(s), {} fichier(s) sensible(s) isolé(s) ou contrôlé(s). Aucun fichier n’a été exécuté.",
                    import.installed_paths.len(), import.sensitive_files.len()
                )
            } else {
                format!(
                    "{} mod(s) traité(s) avec TemporaryCopy.",
                    import.installed_paths.len()
                )
            },
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
            if !entry.is_dir() && forbidden_archive_file(relative) {
                continue;
            }
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

async fn nexus_graphql_json(
    query: &str,
    variables: serde_json::Value,
) -> Result<(serde_json::Value, reqwest::header::HeaderMap), String> {
    let secret = provider_credential("nexus")?.get_password().map_err(|_| {
        "Connectez Nexus Mods dans les paramètres avant d'ouvrir le catalogue.".to_string()
    })?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Impossible d'initialiser la connexion sécurisée Nexus.".to_string())?;
    let response = client
        .post("https://api.nexusmods.com/v2/graphql")
        .header("apikey", secret)
        .header("Application-Name", "ZAILON")
        .header("Application-Version", env!("CARGO_PKG_VERSION"))
        .json(&serde_json::json!({ "query": query, "variables": variables }))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "La requête paginée Nexus a expiré.".to_string()
            } else {
                "Nexus est actuellement inaccessible.".to_string()
            }
        })?;
    let status = response.status();
    let headers = response.headers().clone();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "La clé Nexus a été refusée ou ne permet pas cette opération.".into(),
            429 => "La limite de requêtes Nexus est atteinte.".into(),
            _ => format!(
                "Nexus n'a pas accepté la demande paginée (HTTP {}).",
                status.as_u16()
            ),
        });
    }
    let payload = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "Nexus a renvoyé une réponse paginée illisible.".to_string())?;
    if let Some(errors) = payload.get("errors").and_then(|value| value.as_array()) {
        let detail = errors
            .iter()
            .filter_map(|error| error.get("message").and_then(|message| message.as_str()))
            .take(2)
            .collect::<Vec<_>>()
            .join(" · ");
        return Err(if detail.is_empty() {
            "Nexus a refusé la recherche paginée.".into()
        } else {
            format!("Nexus a refusé la recherche paginée : {detail}")
        });
    }
    Ok((payload, headers))
}

fn nexus_capabilities_from_validation(
    payload: &serde_json::Value,
    headers: &reqwest::header::HeaderMap,
) -> NexusAccountCapabilities {
    let premium = payload
        .get("is_premium")
        .or_else(|| payload.get("isPremium"))
        .and_then(|value| value.as_bool());
    NexusAccountCapabilities {
        // This helper is only called after users/validate.json returned a
        // successful response. Some accounts omit identifying fields.
        authenticated: true,
        membership_tier: match premium {
            Some(true) => "premium",
            Some(false) => "free",
            None => "unknown",
        }
        .into(),
        supports_direct_downloads: premium,
        supports_automatic_collection_downloads: premium,
        download_rate_limit: None,
        api_hourly_remaining: header_number(
            headers,
            &["x-rl-hourly-remaining", "x-ratelimit-hourly-remaining"],
        ),
        api_hourly_limit: header_number(
            headers,
            &["x-rl-hourly-limit", "x-ratelimit-hourly-limit"],
        ),
        api_daily_remaining: header_number(
            headers,
            &["x-rl-daily-remaining", "x-ratelimit-daily-remaining"],
        ),
        api_daily_limit: header_number(headers, &["x-rl-daily-limit", "x-ratelimit-daily-limit"]),
        requires_manual_download_confirmation: premium.map(|value| !value),
    }
}

#[tauri::command]
async fn nexus_account_capabilities(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
) -> Result<NexusAccountCapabilities, String> {
    let (payload, headers) = nexus_api_json("users/validate.json").await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    Ok(nexus_capabilities_from_validation(&payload, &headers))
}

fn parse_iso8601_utc(value: &str) -> Option<u64> {
    let bytes = value.as_bytes();
    if bytes.len() < 20
        || bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || bytes.get(10) != Some(&b'T')
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
        || !value.ends_with('Z')
    {
        return None;
    }
    let parse = |start: usize, end: usize| value.get(start..end)?.parse::<i64>().ok();
    let mut year = parse(0, 4)?;
    let month = parse(5, 7)?;
    let day = parse(8, 10)?;
    let hour = parse(11, 13)?;
    let minute = parse(14, 16)?;
    let second = parse(17, 19)?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&minute)
        || !(0..=60).contains(&second)
    {
        return None;
    }
    year -= i64::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days_since_epoch = era * 146_097 + day_of_era - 719_468;
    u64::try_from(days_since_epoch * 86_400 + hour * 3_600 + minute * 60 + second).ok()
}

fn nexus_mod_from_graphql(
    node: &serde_json::Value,
    fallback_domain: &str,
) -> Option<NexusCatalogMod> {
    let mod_id = nexus_json_u64(node, &["modId", "mod_id"]);
    let name = nexus_json_string(node, &["name"]);
    if mod_id == 0 || name.is_empty() {
        return None;
    }
    let game = node.get("game").unwrap_or(&serde_json::Value::Null);
    let domain = nexus_json_string(game, &["domainName", "domain_name"]);
    let game_domain = if valid_nexus_domain(&domain) {
        domain
    } else {
        fallback_domain.to_string()
    };
    Some(NexusCatalogMod {
        id: format!("nexus-{game_domain}-{mod_id}"),
        mod_id,
        name,
        author: nexus_json_string(node, &["author"]),
        game: nexus_json_string(game, &["name"]),
        game_domain: game_domain.clone(),
        thumbnail: safe_remote_image(nexus_json_string(
            node,
            &["thumbnailLargeUrl", "thumbnailUrl", "pictureUrl"],
        )),
        downloads: nexus_json_u64(node, &["downloads"]),
        endorsements: nexus_json_u64(node, &["endorsements"]),
        description: nexus_json_string(node, &["summary", "description"]),
        version: Some(nexus_json_string(node, &["version"])).filter(|value| !value.is_empty()),
        updated_at: node
            .get("updatedAt")
            .and_then(|value| value.as_str())
            .and_then(parse_iso8601_utc),
        nsfw: nexus_json_bool(node, &["adultContent", "adult"]),
        url: format!("https://www.nexusmods.com/{game_domain}/mods/{mod_id}"),
    })
}

fn nexus_collection_from_graphql(
    node: &serde_json::Value,
    fallback_domain: &str,
) -> Option<NexusCollectionSummary> {
    let id = nexus_json_u64(node, &["id"]);
    let slug = nexus_json_string(node, &["slug"]);
    let name = nexus_json_string(node, &["name"]);
    if id == 0
        || slug.is_empty()
        || name.is_empty()
        || !slug
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return None;
    }
    let game = node.get("game").unwrap_or(&serde_json::Value::Null);
    let candidate_domain = nexus_json_string(game, &["domainName"]);
    let game_domain = if valid_nexus_domain(&candidate_domain) {
        candidate_domain
    } else {
        fallback_domain.to_string()
    };
    let revision = node
        .get("latestPublishedRevision")
        .unwrap_or(&serde_json::Value::Null);
    let schema_id = nexus_json_u64(node, &["collectionSchemaId"])
        .max(nexus_json_u64(revision, &["collectionSchemaId"]));
    let manager = match schema_id {
        1 => "Vortex",
        2 => "Wabbajack",
        _ => "Inconnu",
    };
    let compatibility = match schema_id {
        1 => "partial",
        2 => "unsupported",
        _ => "unknown",
    };
    let tile = node.get("tileImage").unwrap_or(&serde_json::Value::Null);
    let header = node.get("headerImage").unwrap_or(&serde_json::Value::Null);
    let user = node.get("user").unwrap_or(&serde_json::Value::Null);
    let game_versions = revision
        .get("gameVersions")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .map(|item| nexus_json_string(item, &["reference"]))
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let updated_at = parse_iso8601_utc(&nexus_json_string(node, &["updatedAt"]))
        .or_else(|| parse_iso8601_utc(&nexus_json_string(revision, &["updatedAt"])));
    Some(NexusCollectionSummary {
        id,
        slug: slug.clone(),
        name,
        summary: nexus_json_string(node, &["summary"]),
        description: nexus_json_string(node, &["description"]),
        author: nexus_json_string(user, &["name"]),
        game: nexus_json_string(game, &["name"]),
        game_domain: game_domain.clone(),
        tile_image: safe_remote_image(nexus_json_string(tile, &["thumbnailUrl", "url"])),
        header_image: safe_remote_image(nexus_json_string(header, &["thumbnailUrl", "url"])),
        endorsements: nexus_json_u64(node, &["endorsements"]),
        total_downloads: nexus_json_u64(node, &["totalDownloads"]),
        unique_downloads: nexus_json_u64(node, &["uniqueDownloads"]),
        updated_at,
        adult: nexus_json_bool(revision, &["adultContent"])
            || nexus_json_bool(node, &["adultContent"]),
        collection_schema_id: (schema_id > 0).then_some(schema_id),
        recommended_manager: manager.into(),
        compatibility: compatibility.into(),
        latest_revision_id: Some(nexus_json_u64(revision, &["id"])).filter(|value| *value > 0),
        latest_revision_number: Some(nexus_json_u64(revision, &["revisionNumber"]))
            .filter(|value| *value > 0),
        mod_count: nexus_json_u64(revision, &["modCount"]),
        total_size: nexus_json_u64(revision, &["totalSize"]),
        game_versions,
        provider_game_collection_count: Some(nexus_json_u64(game, &["collectionCount"]))
            .filter(|value| *value > 0),
        url: format!("https://next.nexusmods.com/{game_domain}/collections/{slug}"),
    })
}

fn nexus_collection_variables(
    game_domain: &str,
    query: &str,
    sort: &str,
    page: u64,
    page_size: u64,
    include_adult: bool,
) -> serde_json::Value {
    let mut filter = serde_json::json!({
        "op": "AND",
        "gameDomain": [{ "value": game_domain, "op": "EQUALS" }],
        "hasPublishedRevision": [{ "value": true, "op": "EQUALS" }]
    });
    if !query.is_empty() {
        filter["generalSearch"] = serde_json::json!([{ "value": query, "op": "MATCHES" }]);
    }
    if !include_adult {
        filter["adultContent"] = serde_json::json!([{ "value": false, "op": "EQUALS" }]);
    }
    let sort_field = match sort {
        "updated" => "updatedAt",
        "popular" => "endorsements",
        "downloaded" => "downloads",
        _ => "createdAt",
    };
    serde_json::json!({
        "filter": filter,
        "sort": [{ (sort_field): { "direction": "DESC" } }],
        "offset": page.saturating_sub(1).saturating_mul(page_size),
        "count": page_size
    })
}

fn nexus_catalog_variables(
    game_domain: &str,
    query: &str,
    sort: &str,
    page: u64,
    page_size: u64,
    include_adult: bool,
) -> serde_json::Value {
    let mut filter = serde_json::json!({
        "op": "AND",
        "gameDomainName": [{ "value": game_domain, "op": "EQUALS" }]
    });
    if !query.is_empty() {
        filter["filter"] = serde_json::json!([{
            "op": "OR",
            "name": [{ "value": query, "op": "WILDCARD" }],
            "author": [{ "value": query, "op": "WILDCARD" }],
            "description": [{ "value": query, "op": "MATCHES" }]
        }]);
    }
    if !include_adult {
        filter["adultContent"] = serde_json::json!([{ "value": false, "op": "EQUALS" }]);
    }
    let sort_field = match sort {
        "updated" => "updatedAt",
        "popular" => "endorsements",
        "downloaded" | "trending" => "downloads",
        _ => "createdAt",
    };
    let offset = page.saturating_sub(1).saturating_mul(page_size);
    serde_json::json!({
        "filter": filter,
        "sort": [{ (sort_field): { "direction": "DESC" } }],
        "offset": offset,
        "count": page_size
    })
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
    query: String,
    sort: String,
    page: u64,
    page_size: u64,
    include_adult: bool,
) -> Result<NexusCatalogPage, String> {
    let domain = game_domain.trim().to_ascii_lowercase();
    if !valid_nexus_domain(&domain) {
        return Err("Le domaine Nexus du jeu est invalide.".into());
    }
    let query = query
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>();
    let page = page.clamp(1, 100_000);
    let page_size = page_size.clamp(10, 60);
    const CATALOG_QUERY: &str = r#"
        query ZailonMods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
          mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
            nodes {
              modId
              name
              author
              summary
              description
              downloads
              endorsements
              adultContent
              version
              updatedAt
              thumbnailUrl
              thumbnailLargeUrl
              pictureUrl
              game { name domainName modCount }
            }
            nodesCount
            totalCount
          }
        }
    "#;
    let variables = nexus_catalog_variables(&domain, &query, &sort, page, page_size, include_adult);
    let (payload, headers) = nexus_graphql_json(CATALOG_QUERY, variables).await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    let page_payload = payload
        .get("data")
        .and_then(|data| data.get("mods"))
        .ok_or_else(|| "Nexus n'a renvoyé aucune page de catalogue exploitable.".to_string())?;
    let rows = page_payload
        .get("nodes")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let results = rows
        .iter()
        .filter_map(|row| nexus_mod_from_graphql(row, &domain))
        .collect::<Vec<_>>();
    let total_results = nexus_json_u64(page_payload, &["totalCount"]);
    let total_pages = if total_results == 0 {
        1
    } else {
        total_results.saturating_add(page_size - 1) / page_size
    };
    let provider_game_total_mods = rows.first().and_then(|row| {
        row.get("game")
            .map(|game| nexus_json_u64(game, &["modCount"]))
            .filter(|value| *value > 0)
    });
    Ok(NexusCatalogPage {
        pagination: NexusPaginationMetadata {
            page,
            page_size,
            total_results,
            total_pages,
            loaded_result_count: results.len() as u64,
            provider_game_total_mods,
            provider_game_total_collections: None,
            has_previous: page > 1,
            has_next: page < total_pages,
            total_is_exact: true,
        },
        results,
        source: "nexus-graphql-v2".into(),
        fetched_at: unix_timestamp(),
    })
}

#[tauri::command]
async fn nexus_catalog_collections(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    game_domain: String,
    query: String,
    sort: String,
    page: u64,
    page_size: u64,
    include_adult: bool,
) -> Result<NexusCollectionPage, String> {
    let domain = game_domain.trim().to_ascii_lowercase();
    if !valid_nexus_domain(&domain) {
        return Err("Le domaine Nexus du jeu est invalide.".into());
    }
    let query = query
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>();
    let page = page.clamp(1, 100_000);
    let page_size = page_size.clamp(10, 60);
    const COLLECTIONS_QUERY: &str = r#"
        query ZailonCollections($filter: CollectionsSearchFilter, $sort: [CollectionsSearchSort!], $offset: Int, $count: Int) {
          collectionsV2(filter: $filter, sort: $sort, offset: $offset, count: $count) {
            nodes {
              id
              slug
              name
              summary
              endorsements
              totalDownloads
              uniqueDownloads
              updatedAt
              adultContent
              collectionSchemaId
              game { name domainName collectionCount }
              user { name }
              tileImage { url thumbnailUrl(size: med) }
              headerImage { url thumbnailUrl(size: large) }
              latestPublishedRevision {
                id
                revisionNumber
                modCount
                totalSize
                updatedAt
                adultContent
                collectionSchemaId
                gameVersions { reference }
              }
            }
            nodesCount
            totalCount
          }
        }
    "#;
    let variables =
        nexus_collection_variables(&domain, &query, &sort, page, page_size, include_adult);
    let (payload, headers) = nexus_graphql_json(COLLECTIONS_QUERY, variables).await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    let page_payload = payload
        .get("data")
        .and_then(|data| data.get("collectionsV2"))
        .ok_or_else(|| "Nexus n'a renvoyé aucune page de Collections exploitable.".to_string())?;
    let rows = page_payload
        .get("nodes")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let results = rows
        .iter()
        .filter_map(|node| nexus_collection_from_graphql(node, &domain))
        .collect::<Vec<_>>();
    let total_results = nexus_json_u64(page_payload, &["totalCount"]);
    let total_pages = if total_results == 0 {
        1
    } else {
        total_results.saturating_add(page_size - 1) / page_size
    };
    let provider_game_total_collections = results
        .first()
        .and_then(|item| item.provider_game_collection_count);
    Ok(NexusCollectionPage {
        pagination: NexusPaginationMetadata {
            page,
            page_size,
            total_results,
            total_pages,
            loaded_result_count: results.len() as u64,
            provider_game_total_mods: None,
            provider_game_total_collections,
            has_previous: page > 1,
            has_next: page < total_pages,
            total_is_exact: true,
        },
        results,
        source: "nexus-graphql-v2-collections".into(),
        fetched_at: unix_timestamp(),
    })
}

fn valid_collection_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

async fn nexus_collection_detail_value(
    game_domain: &str,
    slug: &str,
    revision: Option<u64>,
    include_adult: bool,
) -> Result<(NexusCollectionDetail, reqwest::header::HeaderMap), String> {
    if !valid_nexus_domain(game_domain) || !valid_collection_slug(slug) {
        return Err("La référence de Collection Nexus est invalide.".into());
    }
    const DETAIL_QUERY: &str = r#"
        query ZailonCollectionDetail($slug: String, $revision: Int, $viewAdultContent: Boolean, $domainName: String) {
          collection(slug: $slug, viewAdultContent: $viewAdultContent, domainName: $domainName) {
            id
            slug
            name
            summary
            description
            endorsements
            totalDownloads
            uniqueDownloads
            updatedAt
            adultContent
            collectionSchemaId
            game { name domainName collectionCount }
            user { name }
            tileImage { url thumbnailUrl(size: med) }
            headerImage { url thumbnailUrl(size: large) }
            latestPublishedRevision {
              id
              revisionNumber
              modCount
              totalSize
              updatedAt
              adultContent
              collectionSchemaId
              gameVersions { reference }
            }
          }
          collectionRevision(slug: $slug, revision: $revision, viewAdultContent: $viewAdultContent, domainName: $domainName) {
            id
            revisionNumber
            revisionStatus
            totalSize
            assetsSizeBytes
            modCount
            collectionSchemaId
            collectionSchema { version }
            installationInfo
            adultContent
            gameVersions { reference }
            externalResources {
              id
              name
              author
              optional
              resourceType
              resourceUrl
              fileExpression
            }
            modFiles {
              id
              fileId
              gameId
              optional
              updatePolicy
              version
              file {
                fileId
                modId
                name
                version
                sizeInBytes
                category
                scannedV2
                mod { name author game { domainName } }
              }
            }
          }
        }
    "#;
    let revision_value = revision.and_then(|value| i64::try_from(value).ok());
    let (payload, headers) = nexus_graphql_json(
        DETAIL_QUERY,
        serde_json::json!({
            "slug": slug,
            "revision": revision_value,
            "viewAdultContent": include_adult,
            "domainName": game_domain
        }),
    )
    .await?;
    let data = payload
        .get("data")
        .ok_or_else(|| "La fiche Collection Nexus est absente.".to_string())?;
    let collection_node = data
        .get("collection")
        .ok_or_else(|| "La Collection Nexus est introuvable.".to_string())?;
    let mut collection = nexus_collection_from_graphql(collection_node, game_domain)
        .ok_or_else(|| "La fiche Collection Nexus est incomplète.".to_string())?;
    let revision_node = data
        .get("collectionRevision")
        .ok_or_else(|| "La révision Nexus demandée est introuvable.".to_string())?;
    let revision_id = nexus_json_u64(revision_node, &["id"]);
    let revision_number = nexus_json_u64(revision_node, &["revisionNumber"]);
    if revision_id == 0 || revision_number == 0 {
        return Err("La révision Nexus n'a pas d'identifiant stable.".into());
    }
    collection.description = nexus_json_string(collection_node, &["description"]);
    collection.latest_revision_id = Some(revision_id);
    collection.latest_revision_number = Some(revision_number);
    collection.mod_count = nexus_json_u64(revision_node, &["modCount"]);
    collection.total_size = nexus_json_u64(revision_node, &["totalSize"]);
    let game_versions = revision_node
        .get("gameVersions")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .map(|item| nexus_json_string(item, &["reference"]))
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    collection.game_versions = game_versions.clone();
    let rows = revision_node
        .get("modFiles")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let entries = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let file = row.get("file").unwrap_or(&serde_json::Value::Null);
            let mod_node = file.get("mod").unwrap_or(&serde_json::Value::Null);
            let game = mod_node
                .get("game")
                .unwrap_or(&serde_json::Value::Null);
            let domain = nexus_json_string(game, &["domainName"]);
            let nexus_game_domain = if valid_nexus_domain(&domain) {
                domain
            } else {
                game_domain.to_string()
            };
            let mod_id = nexus_json_u64(file, &["modId"]);
            let file_id = nexus_json_u64(row, &["fileId"]).max(nexus_json_u64(file, &["fileId"]));
            let scan = nexus_json_string(file, &["scannedV2"]);
            let category = nexus_json_string(file, &["category"]);
            let available = mod_id > 0
                && file_id > 0
                && !matches!(category.as_str(), "REMOVED")
                && !matches!(scan.as_str(), "QUARANTINED" | "MOD_DOES_NOT_EXIST" | "FILE_NOT_FOUND");
            NexusCollectionEntry {
                collection_entry_id: nexus_json_string(row, &["id"]),
                nexus_game_domain: nexus_game_domain.clone(),
                mod_id,
                file_id,
                expected_version: nexus_json_string(row, &["version"]),
                display_name: nexus_json_string(mod_node, &["name"]),
                file_name: nexus_json_string(file, &["name"]),
                author: nexus_json_string(mod_node, &["author"]),
                required: !nexus_json_bool(row, &["optional"]),
                install_order: index as u64,
                priority: index as i64,
                update_policy: nexus_json_string(row, &["updatePolicy"]),
                expected_size: Some(nexus_json_u64(file, &["sizeInBytes"]))
                    .filter(|value| *value > 0),
                virus_scan_status: scan,
                source_url: if mod_id > 0 {
                    format!(
                        "https://www.nexusmods.com/{nexus_game_domain}/mods/{mod_id}?tab=files&file_id={file_id}"
                    )
                } else {
                    String::new()
                },
                status: if available { "Ready" } else { "Unavailable" }.into(),
                local_path: None,
            }
        })
        .collect::<Vec<_>>();
    let external_requirements = revision_node
        .get("externalResources")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    let raw_url = nexus_json_string(item, &["resourceUrl"]);
                    let resource_url = url::Url::parse(&raw_url)
                        .ok()
                        .filter(|url| url.scheme() == "https" && url.host_str().is_some())
                        .map(|url| url.to_string());
                    NexusExternalRequirement {
                        id: nexus_json_u64(item, &["id"]),
                        name: nexus_json_string(item, &["name"]),
                        author: nexus_json_string(item, &["author"]),
                        required: !nexus_json_bool(item, &["optional"]),
                        resource_type: nexus_json_string(item, &["resourceType"]),
                        resource_url,
                        file_expression: nexus_json_string(item, &["fileExpression"]),
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let schema_version = revision_node
        .get("collectionSchema")
        .map(|value| nexus_json_string(value, &["version"]))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".into());
    let installation_info = nexus_json_string(revision_node, &["installationInfo"]);
    let mut unsupported_instructions = Vec::new();
    let mut warnings = Vec::new();
    if schema_version != "1" {
        unsupported_instructions.push(format!(
            "Le schéma Collection {schema_version} n'est pas interprété par le moteur déclaratif ZAILON."
        ));
    }
    if !installation_info.is_empty() {
        unsupported_instructions.push(
            "La révision contient des instructions d'installation destinées au gestionnaire recommandé ; elles nécessitent une validation humaine.".into(),
        );
    }
    if external_requirements
        .iter()
        .any(|item| item.required && item.resource_type != "direct")
    {
        unsupported_instructions.push(
            "Au moins une ressource externe obligatoire demande une acquisition manuelle.".into(),
        );
    }
    let unavailable_required = entries
        .iter()
        .filter(|entry| entry.required && entry.status == "Unavailable")
        .count();
    if unavailable_required > 0 {
        warnings.push(format!(
            "{unavailable_required} fichier(s) obligatoire(s) sont indisponibles ; le profil ne pourra pas devenir Ready."
        ));
    }
    let assets_size_bytes = nexus_json_u64(revision_node, &["assetsSizeBytes"]);
    let total_size = nexus_json_u64(revision_node, &["totalSize"]);
    Ok((
        NexusCollectionDetail {
            collection,
            revision_id,
            revision_number,
            revision_status: nexus_json_string(revision_node, &["revisionStatus", "status"]),
            collection_schema_version: schema_version,
            mod_count: nexus_json_u64(revision_node, &["modCount"]),
            total_size,
            assets_size_bytes,
            temporary_bytes: total_size
                .saturating_add(assets_size_bytes)
                .saturating_mul(2),
            installation_info,
            adult: nexus_json_bool(revision_node, &["adultContent"]),
            game_versions,
            entries,
            external_requirements,
            unsupported_instructions,
            warnings,
        },
        headers,
    ))
}

#[tauri::command]
async fn nexus_collection_detail(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    game_domain: String,
    slug: String,
    revision: Option<u64>,
    include_adult: bool,
) -> Result<NexusCollectionDetail, String> {
    let domain = game_domain.trim().to_ascii_lowercase();
    let slug = slug.trim().to_ascii_lowercase();
    let (detail, headers) =
        nexus_collection_detail_value(&domain, &slug, revision, include_adult).await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    Ok(detail)
}

fn collection_installs_root(app: &AppHandle, game_id: &str) -> Result<PathBuf, String> {
    Ok(update_data_root(app)?
        .join("games")
        .join(safe_game_id(game_id)?)
        .join("collection-installs"))
}

fn collection_install_plan_path(
    app: &AppHandle,
    game_id: &str,
    install_id: &str,
) -> Result<PathBuf, String> {
    Ok(collection_installs_root(app, game_id)?
        .join(safe_game_id(install_id)?)
        .join("plan.json"))
}

fn read_collection_install_plan(path: &Path) -> Result<CollectionInstallPlan, String> {
    serde_json::from_slice(&fs::read(path).map_err(to_error)?).map_err(to_error)
}

fn write_collection_install_plan(path: &Path, plan: &CollectionInstallPlan) -> Result<(), String> {
    write_json_atomic(path, &serde_json::to_value(plan).map_err(to_error)?)
}

fn has_exact_staged_nexus_file(
    app: &AppHandle,
    game_id: &str,
    game_domain: &str,
    mod_id: u64,
    file_id: u64,
) -> bool {
    let Ok(root) = staged_mods_root(app, game_id) else {
        return false;
    };
    fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .any(|entry| {
            let Ok(payload) = fs::read(entry.path().join("manifest.json")) else {
                return false;
            };
            let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&payload) else {
                return false;
            };
            nexus_json_string(&manifest, &["nexusGameDomain"]).eq_ignore_ascii_case(game_domain)
                && nexus_json_u64(&manifest, &["nexusModId"]) == mod_id
                && nexus_json_u64(&manifest, &["nexusFileId"]) == file_id
        })
}

#[tauri::command]
async fn prepare_nexus_collection_install(
    app: AppHandle,
    provider_state: State<'_, ProviderConnectionCache>,
    task_state: State<'_, BackgroundTaskRegistry>,
    game_id: String,
    install_id: String,
    profile: serde_json::Value,
    game_domain: String,
    slug: String,
    revision: Option<u64>,
    include_adult: bool,
) -> Result<PreparedCollectionInstall, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let install_id = safe_game_id(&install_id)?.to_string();
    let profile_id = profile
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Le nouveau profil Collection n'a pas d'identifiant.".to_string())?
        .to_string();
    safe_game_id(&profile_id)?;
    if profile.get("gameId").and_then(|value| value.as_str()) != Some(game_id.as_str()) {
        return Err("Le profil Collection ne correspond pas au jeu cible.".into());
    }
    if profile
        .get("modStates")
        .and_then(|value| value.as_object())
        .is_none()
    {
        return Err("Le profil Collection doit contenir un état de mods explicite.".into());
    }
    let profile_name = profile
        .get("name")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 160)
        .ok_or_else(|| "Le nom du profil Collection est invalide.".to_string())?
        .to_string();
    let domain = game_domain.trim().to_ascii_lowercase();
    let slug = slug.trim().to_ascii_lowercase();
    let (detail, detail_headers) =
        nexus_collection_detail_value(&domain, &slug, revision, include_adult).await?;
    refresh_nexus_status_from_headers(&app, &provider_state, &detail_headers);

    let (validation, validation_headers) = nexus_api_json("users/validate.json").await?;
    refresh_nexus_status_from_headers(&app, &provider_state, &validation_headers);
    let capabilities = nexus_capabilities_from_validation(&validation, &validation_headers);
    let premium_automation = capabilities.supports_automatic_collection_downloads == Some(true);

    let mut entries = detail.entries.clone();
    let mut already_downloaded = 0u64;
    let mut unavailable_required = 0u64;
    let mut waiting_for_user = 0u64;
    for entry in &mut entries {
        if entry.status == "Unavailable" {
            if entry.required {
                unavailable_required += 1;
            }
            continue;
        }
        if has_exact_staged_nexus_file(
            &app,
            &game_id,
            &entry.nexus_game_domain,
            entry.mod_id,
            entry.file_id,
        ) {
            entry.status = "Downloaded".into();
            already_downloaded += 1;
        } else if premium_automation {
            entry.status = "Queued".into();
        } else {
            entry.status = "WaitingForUser".into();
            waiting_for_user += 1;
        }
    }

    let mut warnings = detail.warnings.clone();
    warnings.extend(detail.unsupported_instructions.clone());
    if waiting_for_user > 0 {
        warnings.push(format!(
            "{waiting_for_user} fichier(s) attendent une confirmation sur la page Nexus officielle."
        ));
    }
    if unavailable_required > 0 {
        warnings.push(format!(
            "{unavailable_required} fichier(s) obligatoire(s) sont indisponibles."
        ));
    }
    if already_downloaded > 0 {
        warnings.push(format!(
            "{already_downloaded} fichier(s) exact(s) sont déjà présents dans le store ZAILON."
        ));
    }
    let profile_state = if unavailable_required > 0
        || !detail.unsupported_instructions.is_empty()
        || detail
            .external_requirements
            .iter()
            .any(|item| item.required)
    {
        "NeedsAttention"
    } else {
        "Preparing"
    };
    let now = unix_timestamp();
    let plan = CollectionInstallPlan {
        schema_version: 1,
        install_id: install_id.clone(),
        collection_id: detail.collection.id,
        collection_slug: detail.collection.slug.clone(),
        collection_name: detail.collection.name.clone(),
        revision_id: detail.revision_id,
        revision_number: detail.revision_number,
        game_id: game_id.clone(),
        game_domain: domain.clone(),
        profile_id: profile_id.clone(),
        profile_name: profile_name.clone(),
        profile_state: profile_state.into(),
        entries,
        external_requirements: detail.external_requirements.clone(),
        download_bytes: detail.total_size,
        temporary_bytes: detail.temporary_bytes,
        final_additional_bytes: detail.total_size.saturating_add(detail.assets_size_bytes),
        account_capabilities: capabilities,
        warnings,
        created_at: now,
        updated_at: now,
        open_next_required_page: waiting_for_user > 0,
        automatic_execution: false,
    };
    let mut persisted_profile = profile;
    if let Some(object) = persisted_profile.as_object_mut() {
        object.insert("locked".into(), serde_json::json!(true));
        object.insert("collectionState".into(), serde_json::json!(profile_state));
        object.insert(
            "collectionMetadata".into(),
            serde_json::json!({
                "installId": install_id.clone(),
                "collectionId": detail.collection.id,
                "slug": detail.collection.slug.clone(),
                "installedRevisionId": serde_json::Value::Null,
                "latestKnownRevisionId": detail.revision_id,
                "sourceGameDomain": domain,
                "selections": [],
                "localOverrides": []
            }),
        );
    }

    let plan_path = collection_install_plan_path(&app, &game_id, &install_id)?;
    if plan_path.exists() {
        return Err("Ce plan d'installation Collection existe déjà.".into());
    }
    write_collection_install_plan(&plan_path, &plan)?;
    let profile_paths =
        match sync_profile_state_inner(&app, &game_id, &profile_id, &persisted_profile) {
            Ok(paths) => paths,
            Err(error) => {
                let _ = fs::remove_file(&plan_path);
                return Err(format!(
                    "Création du profil Collection annulée et restaurée : {error}"
                ));
            }
        };

    let task_id = format!("collection-{install_id}");
    register_background_task(
        &app,
        task_state.inner(),
        task_id.clone(),
        "collection-install",
        &format!("Collection Nexus · {}", detail.collection.name),
        plan.entries.len() as u64,
    )?;
    finish_background_task(
        &app,
        task_state.inner(),
        None,
        &task_id,
        "awaiting_user_decision",
        if premium_automation {
            "Plan vérifié. La file Premium attend votre confirmation de démarrage.".into()
        } else {
            "Plan vérifié. Les téléchargements gratuits attendent les confirmations Nexus officielles.".into()
        },
        None,
    );
    let _ = app.emit("collection-install-changed", plan.clone());
    Ok(PreparedCollectionInstall {
        plan,
        profile: persisted_profile,
        profile_paths,
        plan_path: plan_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_collection_install_plans(
    app: AppHandle,
    game_id: String,
) -> Result<Vec<CollectionInstallPlan>, String> {
    let root = collection_installs_root(&app, &game_id)?;
    let mut plans = fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| read_collection_install_plan(&entry.path().join("plan.json")).ok())
        .collect::<Vec<_>>();
    plans.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(plans)
}

#[tauri::command]
fn update_collection_install(
    app: AppHandle,
    game_id: String,
    install_id: String,
    action: String,
) -> Result<CollectionInstallPlan, String> {
    let path = collection_install_plan_path(&app, &game_id, &install_id)?;
    let mut plan = read_collection_install_plan(&path)?;
    match action.as_str() {
        "pause" => {
            if !matches!(plan.profile_state.as_str(), "Ready" | "Cancelled") {
                plan.profile_state = "Paused".into();
                plan.automatic_execution = false;
            }
        }
        "resume" => {
            if plan.profile_state == "Paused" {
                plan.profile_state = if plan
                    .entries
                    .iter()
                    .any(|entry| entry.status == "WaitingForUser")
                {
                    "NeedsAttention".into()
                } else {
                    "Preparing".into()
                };
            }
        }
        "cancel" => {
            plan.profile_state = "Cancelled".into();
            plan.automatic_execution = false;
        }
        _ => return Err("Action de plan Collection inconnue.".into()),
    }
    plan.updated_at = unix_timestamp();
    write_collection_install_plan(&path, &plan)?;
    let _ = app.emit("collection-install-changed", plan.clone());
    Ok(plan)
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
fn collection_plan_paths(app: &AppHandle) -> Vec<PathBuf> {
    let Ok(games_root) = update_data_root(app).map(|root| root.join("games")) else {
        return Vec::new();
    };
    fs::read_dir(games_root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|game| game.path().join("collection-installs"))
        .filter(|root| root.is_dir())
        .flat_map(|root| {
            fs::read_dir(root)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .map(|entry| entry.path().join("plan.json"))
                .collect::<Vec<_>>()
        })
        .collect()
}

#[cfg(desktop)]
fn update_collection_entry_download(
    app: &AppHandle,
    request: &NxmRequest,
    status: &str,
    local_path: Option<&Path>,
) {
    for plan_path in collection_plan_paths(app) {
        let Ok(mut plan) = read_collection_install_plan(&plan_path) else {
            continue;
        };
        let mut changed = false;
        for entry in &mut plan.entries {
            if entry
                .nexus_game_domain
                .eq_ignore_ascii_case(&request.game_domain)
                && entry.mod_id == request.mod_id
                && entry.file_id == request.file_id
                && entry.status != "Unavailable"
            {
                entry.status = status.into();
                entry.local_path = local_path.map(|path| path.to_string_lossy().to_string());
                changed = true;
            }
        }
        if changed {
            plan.profile_state = if status == "Failed" {
                "NeedsAttention"
            } else if plan.entries.iter().all(|entry| {
                matches!(
                    entry.status.as_str(),
                    "Downloaded" | "Installed" | "Skipped" | "Unavailable"
                )
            }) {
                "NeedsAttention"
            } else {
                "Downloading"
            }
            .into();
            plan.updated_at = unix_timestamp();
            let _ = write_collection_install_plan(&plan_path, &plan);
            let _ = app.emit("collection-install-changed", plan);
        }
    }
}

#[cfg(desktop)]
async fn download_collection_nxm_file(
    app: AppHandle,
    request: NxmRequest,
) -> Result<PathBuf, String> {
    if request
        .expires
        .is_some_and(|expires| expires <= unix_timestamp())
    {
        update_collection_entry_download(&app, &request, "Failed", None);
        return Err("Le lien NXM a expiré ; ouvrez de nouveau la page Nexus officielle.".into());
    }
    let query = {
        let mut serializer = url::form_urlencoded::Serializer::new(String::new());
        if let Some(key) = request.key.as_deref() {
            serializer.append_pair("key", key);
        }
        if let Some(expires) = request.expires {
            serializer.append_pair("expires", &expires.to_string());
        }
        if let Some(user_id) = request.user_id {
            serializer.append_pair("user_id", &user_id.to_string());
        }
        serializer.finish()
    };
    let endpoint = format!(
        "games/{}/mods/{}/files/{}/download_link.json{}{}",
        request.game_domain,
        request.mod_id,
        request.file_id,
        if query.is_empty() { "" } else { "?" },
        query
    );
    let (payload, _) = nexus_api_json(&endpoint).await?;
    let uri = payload
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| {
            item.get("URI")
                .or_else(|| item.get("uri"))
                .and_then(|value| value.as_str())
        })
        .ok_or_else(|| "Nexus n'a fourni aucun serveur autorisé pour ce fichier.".to_string())?;
    let download_url = url::Url::parse(uri)
        .ok()
        .filter(|url| {
            url.scheme() == "https"
                && url.host_str().is_some_and(|host| {
                    let host = host.to_ascii_lowercase();
                    host == "nexusmods.com"
                        || host.ends_with(".nexusmods.com")
                        || host == "nexus-cdn.com"
                        || host.ends_with(".nexus-cdn.com")
                })
        })
        .ok_or_else(|| {
            "Nexus a fourni une destination de téléchargement non autorisée.".to_string()
        })?;

    let expected = collection_plan_paths(&app)
        .into_iter()
        .filter_map(|path| read_collection_install_plan(&path).ok())
        .flat_map(|plan| plan.entries.into_iter())
        .find(|entry| {
            entry
                .nexus_game_domain
                .eq_ignore_ascii_case(&request.game_domain)
                && entry.mod_id == request.mod_id
                && entry.file_id == request.file_id
        });
    let safe_name = expected
        .as_ref()
        .map(|entry| safe_archive_component(&entry.file_name))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| format!("nexus-{}-{}.archive", request.mod_id, request.file_id));
    let cache = update_data_root(&app)?
        .join("collection-download-cache")
        .join(&request.game_domain)
        .join(request.mod_id.to_string())
        .join(request.file_id.to_string());
    fs::create_dir_all(&cache).map_err(to_error)?;
    let output = cache.join(safe_name);
    if output.is_file() {
        let size = fs::metadata(&output).map_err(to_error)?.len();
        if size > 0
            && expected
                .as_ref()
                .and_then(|entry| entry.expected_size)
                .map_or(true, |expected_size| expected_size == size)
        {
            update_collection_entry_download(&app, &request, "Downloaded", Some(&output));
            return Ok(output);
        }
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Impossible de préparer le téléchargement Nexus.".to_string())?;
    let mut response = client
        .get(download_url)
        .send()
        .await
        .map_err(|_| "Le téléchargement Nexus a échoué.".to_string())?
        .error_for_status()
        .map_err(|_| "Le serveur de fichiers Nexus a refusé le téléchargement.".to_string())?;
    const MAX_COLLECTION_FILE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
    if response
        .content_length()
        .is_some_and(|size| size > MAX_COLLECTION_FILE_BYTES)
    {
        return Err("Le fichier Nexus dépasse la limite de sécurité de 8 Gio.".into());
    }
    let partial = output.with_extension(format!("part-{}", unix_timestamp()));
    let mut file = fs::File::create(&partial).map_err(to_error)?;
    let mut downloaded = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Le flux Nexus a été interrompu.".to_string())?
    {
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_COLLECTION_FILE_BYTES {
            let _ = fs::remove_file(&partial);
            return Err("Le fichier Nexus dépasse la limite de sécurité de 8 Gio.".into());
        }
        file.write_all(&chunk).map_err(to_error)?;
    }
    drop(file);
    if downloaded == 0 {
        let _ = fs::remove_file(&partial);
        return Err("Nexus a renvoyé un fichier vide.".into());
    }
    if let Some(expected_size) = expected.and_then(|entry| entry.expected_size) {
        if expected_size != downloaded {
            let _ = fs::remove_file(&partial);
            return Err(format!(
                "Taille Nexus inattendue : {downloaded} octets reçus, {expected_size} attendus."
            ));
        }
    }
    if output.exists() {
        fs::remove_file(&output).map_err(to_error)?;
    }
    fs::rename(&partial, &output).map_err(to_error)?;
    update_collection_entry_download(&app, &request, "Downloaded", Some(&output));
    Ok(output)
}

#[cfg(desktop)]
#[tauri::command]
async fn start_collection_install(
    app: AppHandle,
    state: State<'_, ProviderConnectionCache>,
    game_id: String,
    install_id: String,
) -> Result<CollectionInstallPlan, String> {
    let plan_path = collection_install_plan_path(&app, &game_id, &install_id)?;
    let mut plan = read_collection_install_plan(&plan_path)?;
    if plan.profile_state == "Cancelled" {
        return Err("Cette installation Collection a été annulée.".into());
    }
    if plan.automatic_execution && plan.profile_state == "Downloading" {
        return Err("Les téléchargements Premium sont déjà en cours.".into());
    }
    let (validation, headers) = nexus_api_json("users/validate.json").await?;
    refresh_nexus_status_from_headers(&app, &state, &headers);
    let capabilities = nexus_capabilities_from_validation(&validation, &headers);
    if capabilities.supports_automatic_collection_downloads != Some(true) {
        return Err(
            "Le compte Nexus connecté ne permet pas les téléchargements automatiques de Collections. Utilisez les validations officielles Nexus.".into(),
        );
    }
    plan.account_capabilities = capabilities;
    for entry in &mut plan.entries {
        if matches!(entry.status.as_str(), "WaitingForUser" | "Failed") {
            entry.status = "Queued".into();
        }
    }
    if !plan.entries.iter().any(|entry| entry.status == "Queued") {
        return Err("Aucun fichier Nexus ne reste dans la file Premium.".into());
    }
    plan.profile_state = "Downloading".into();
    plan.automatic_execution = true;
    plan.open_next_required_page = false;
    plan.updated_at = unix_timestamp();
    write_collection_install_plan(&plan_path, &plan)?;
    let _ = app.emit("collection-install-changed", plan.clone());

    let worker_app = app.clone();
    let worker_plan_path = plan_path.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let Ok(current) = read_collection_install_plan(&worker_plan_path) else {
                return;
            };
            if !current.automatic_execution
                || matches!(current.profile_state.as_str(), "Paused" | "Cancelled")
            {
                return;
            }
            let Some(entry) = current
                .entries
                .iter()
                .find(|entry| entry.status == "Queued")
                .cloned()
            else {
                let mut completed = current;
                completed.automatic_execution = false;
                completed.profile_state = "NeedsAttention".into();
                completed.updated_at = unix_timestamp();
                if !completed
                    .warnings
                    .iter()
                    .any(|warning| warning.contains("téléchargements sont terminés"))
                {
                    completed.warnings.push(
                        "Les téléchargements sont terminés. L’analyse, le staging et les instructions de la Collection doivent encore être validés avant de marquer le profil prêt.".into(),
                    );
                }
                let _ = write_collection_install_plan(&worker_plan_path, &completed);
                let _ = worker_app.emit("collection-install-changed", completed);
                return;
            };
            let request = NxmRequest {
                raw_url: String::new(),
                request_id: format!(
                    "collection-{}-{}-{}",
                    current.install_id, entry.mod_id, entry.file_id
                ),
                game_domain: entry.nexus_game_domain,
                mod_id: entry.mod_id,
                file_id: entry.file_id,
                key: None,
                expires: None,
                user_id: None,
            };
            update_collection_entry_download(&worker_app, &request, "Downloading", None);
            if let Err(error) =
                download_collection_nxm_file(worker_app.clone(), request.clone()).await
            {
                update_collection_entry_download(&worker_app, &request, "Failed", None);
                if let Ok(mut failed) = read_collection_install_plan(&worker_plan_path) {
                    failed.automatic_execution = false;
                    failed.profile_state = "NeedsAttention".into();
                    failed.updated_at = unix_timestamp();
                    failed.warnings.push(format!(
                        "Téléchargement interrompu pour le fichier Nexus {} : {}",
                        request.file_id, error
                    ));
                    let _ = write_collection_install_plan(&worker_plan_path, &failed);
                    let _ = worker_app.emit("collection-install-changed", failed);
                }
                let _ = worker_app.emit(
                    "collection-download-failed",
                    serde_json::json!({
                        "gameDomain": request.game_domain,
                        "modId": request.mod_id,
                        "fileId": request.file_id,
                        "error": error
                    }),
                );
                return;
            }
        }
    });
    Ok(plan)
}

#[cfg(desktop)]
fn record_collection_nxm_match(
    app: &AppHandle,
    request: &NxmRequest,
) -> Vec<PendingCollectionDownloadMatch> {
    let mut matched = Vec::new();
    for plan_path in collection_plan_paths(app) {
        let Ok(mut plan) = read_collection_install_plan(&plan_path) else {
            continue;
        };
        let mut changed = false;
        for entry in &mut plan.entries {
            if entry
                .nexus_game_domain
                .eq_ignore_ascii_case(&request.game_domain)
                && entry.mod_id == request.mod_id
                && entry.file_id == request.file_id
                && !matches!(
                    entry.status.as_str(),
                    "Downloaded" | "Installed" | "Unavailable"
                )
            {
                entry.status = "NxmReceived".into();
                matched.push(PendingCollectionDownloadMatch {
                    collection_install_id: plan.install_id.clone(),
                    entry_id: entry.collection_entry_id.clone(),
                    game_domain: entry.nexus_game_domain.clone(),
                    mod_id: entry.mod_id,
                    file_id: entry.file_id,
                });
                changed = true;
            }
        }
        if changed {
            plan.profile_state = "Downloading".into();
            plan.updated_at = unix_timestamp();
            let _ = write_collection_install_plan(&plan_path, &plan);
            let _ = app.emit("collection-install-changed", plan);
        }
    }
    matched
}

#[cfg(desktop)]
fn enqueue_nxm(app: &AppHandle, raw: &str) {
    if let Ok(request) = parse_nxm_url(raw) {
        let collection_matches = record_collection_nxm_match(app, &request);
        if !collection_matches.is_empty() {
            // Never emit or persist the raw NXM URL because it may contain
            // short-lived credentials.
            let _ = app.emit("collection-nxm-matched", collection_matches);
            let worker_app = app.clone();
            let worker_request = request.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    download_collection_nxm_file(worker_app.clone(), worker_request.clone()).await
                {
                    update_collection_entry_download(&worker_app, &worker_request, "Failed", None);
                    let _ = worker_app.emit(
                        "collection-download-failed",
                        serde_json::json!({
                            "gameDomain": worker_request.game_domain,
                            "modId": worker_request.mod_id,
                            "fileId": worker_request.file_id,
                            "error": error
                        }),
                    );
                }
            });
            return;
        }
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
async fn install_mod(
    app: AppHandle,
    url: String,
    file_name: String,
    game_name: String,
    sensitive_action: String,
) -> Result<DownloadedModResult, String> {
    let sensitive_action = validated_sensitive_action(&sensitive_action)?;
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
        .get(parsed.clone())
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

    let source_provider = parsed
        .host_str()
        .map(|host| {
            if host.to_ascii_lowercase().contains("gamebanana") {
                "gamebanana"
            } else if host.to_ascii_lowercase().contains("nexusmods") {
                "nexus"
            } else {
                "https"
            }
        })
        .unwrap_or("https");
    let quarantine_root = unique_destination(
        &update_data_root(&app)?.join("quarantine"),
        &format!("download-{}", unix_timestamp()),
    );

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
        let inspection_root = stage.join(".inspection");
        fs::create_dir_all(&inspection_root).map_err(to_error)?;
        let mut sensitive_files = Vec::new();
        let mut quarantine_paths = Vec::new();
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
                let output = extract_root.join(&relative_path);
                if entry.is_dir() {
                    fs::create_dir_all(&output).map_err(to_error)?;
                } else {
                    let inspection = inspection_root.join(format!("entry-{index:06}"));
                    let mut file = fs::File::create(&inspection).map_err(to_error)?;
                    copy(&mut entry, &mut file).map_err(to_error)?;
                    drop(file);
                    if let Some(mut assessment) = assess_sensitive_file(
                        &inspection,
                        &relative_path,
                        &relative_path,
                        &game_name,
                        Some(source_provider),
                        None,
                    )? {
                        if assessment.may_deploy {
                            if let Some(parent) = output.parent() {
                                fs::create_dir_all(parent).map_err(to_error)?;
                            }
                            fs::rename(&inspection, &output).map_err(to_error)?;
                            assessment.decision = Some("deployed-by-game-adapter".into());
                        } else if assessment.risk_level == "Blocked"
                            || sensitive_action == "exclude"
                        {
                            fs::remove_file(&inspection).map_err(to_error)?;
                            assessment.decision = Some("excluded".into());
                        } else {
                            let area = if sensitive_action == "inactive" {
                                "inactive-files"
                            } else {
                                "files"
                            };
                            let target = quarantine_root.join(area).join(&relative_path);
                            if let Some(parent) = target.parent() {
                                fs::create_dir_all(parent).map_err(to_error)?;
                            }
                            fs::rename(&inspection, &target).map_err(to_error)?;
                            restrict_quarantine_file(&target)?;
                            assessment.decision = Some(
                                if sensitive_action == "inactive" {
                                    "stored-inactive"
                                } else {
                                    "quarantined"
                                }
                                .into(),
                            );
                            quarantine_paths.push(target.to_string_lossy().to_string());
                        }
                        sensitive_files.push(assessment);
                    } else {
                        if let Some(parent) = output.parent() {
                            fs::create_dir_all(parent).map_err(to_error)?;
                        }
                        fs::rename(&inspection, &output).map_err(to_error)?;
                    }
                }
            }
            Ok(())
        })();
        if let Err(error) = extraction {
            let _ = fs::remove_dir_all(&stage);
            let _ = fs::remove_dir_all(&quarantine_root);
            return Err(error);
        }
        if !sensitive_files.is_empty() {
            write_json_atomic(
                &quarantine_root.join("assessment.json"),
                &serde_json::to_value(&sensitive_files).map_err(to_error)?,
            )?;
            write_json_atomic(
                &quarantine_root.join("source.json"),
                &serde_json::json!({
                    "sourceProvider": source_provider,
                    "sourceHost": parsed.host_str(),
                    "fileName": safe_name,
                    "game": game_name,
                    "decision": sensitive_action,
                    "createdAt": unix_timestamp(),
                    "automaticExecution": false
                }),
            )?;
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
        let warning_count = sensitive_files
            .iter()
            .filter(|item| item.decision.as_deref() != Some("deployed-by-game-adapter"))
            .count();
        Ok(DownloadedModResult {
            path: final_path.to_string_lossy().to_string(),
            status: if sensitive_files.is_empty() {
                "Completed"
            } else {
                "CompletedWithWarnings"
            }
            .into(),
            warnings: if sensitive_files.is_empty() {
                Vec::new()
            } else {
                vec![format!("{warning_count} fichier(s) sensible(s) isolé(s) ou exclu(s). Aucun fichier n’a été exécuté.")]
            },
            sensitive_files,
            quarantine_path: if quarantine_paths.is_empty() {
                None
            } else {
                Some(quarantine_root.to_string_lossy().to_string())
            },
        })
    } else {
        if forbidden_archive_file(Path::new(&safe_name)) {
            fs::create_dir_all(quarantine_root.join("files")).map_err(to_error)?;
            let target = quarantine_root.join("files").join(&safe_name);
            fs::write(&target, bytes).map_err(to_error)?;
            restrict_quarantine_file(&target)?;
            let relative = PathBuf::from(&safe_name);
            let mut assessment = assess_sensitive_file(
                &target,
                &relative,
                &relative,
                &game_name,
                Some(source_provider),
                None,
            )?
            .ok_or_else(|| "Sensitive download assessment failed.".to_string())?;
            assessment.decision = Some("quarantined".into());
            write_json_atomic(
                &quarantine_root.join("assessment.json"),
                &serde_json::to_value(vec![assessment.clone()]).map_err(to_error)?,
            )?;
            write_json_atomic(
                &quarantine_root.join("source.json"),
                &serde_json::json!({ "sourceProvider": source_provider, "sourceHost": parsed.host_str(), "fileName": safe_name, "game": game_name, "automaticExecution": false }),
            )?;
            return Ok(DownloadedModResult {
                path: String::new(),
                status: "CompletedWithWarnings".into(),
                warnings: vec!["Le téléchargement est uniquement un fichier exécutable : il a été conservé en quarantaine et n’a pas été lancé.".into()],
                sensitive_files: vec![assessment],
                quarantine_path: Some(quarantine_root.to_string_lossy().to_string()),
            });
        }
        let output = destination.join(safe_name);
        if output.exists() {
            return Err("A mod archive with the same file name already exists.".into());
        }
        fs::write(&output, bytes).map_err(to_error)?;
        Ok(DownloadedModResult {
            path: output.to_string_lossy().to_string(),
            status: "Completed".into(),
            warnings: Vec::new(),
            sensitive_files: Vec::new(),
            quarantine_path: None,
        })
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

    fn test_security_context(
        root: &Path,
        content: &Path,
        game_name: &str,
        action: &str,
    ) -> SensitiveImportContext {
        SensitiveImportContext {
            action: action.into(),
            game_name: game_name.into(),
            content_root: content.to_path_buf(),
            inactive_root: root.join("inactive"),
            quarantine_root: root.join("quarantine"),
            assessments: Vec::new(),
            quarantine_paths: Vec::new(),
        }
    }

    #[test]
    fn accepts_only_safe_game_identifiers() {
        assert!(safe_game_id("4b2d66ca-5c39-4d35_a").is_ok());
        assert!(safe_game_id("../outside").is_err());
        assert!(safe_game_id("").is_err());
    }

    #[test]
    fn nexus_catalog_variables_use_real_server_page_offsets() {
        let variables =
            nexus_catalog_variables("cyberpunk2077", "vehicle", "downloaded", 50, 20, false);
        assert_eq!(variables["offset"], 980);
        assert_eq!(variables["count"], 20);
        assert_eq!(
            variables["filter"]["gameDomainName"][0]["value"],
            "cyberpunk2077"
        );
        assert_eq!(variables["filter"]["adultContent"][0]["value"], false);
        assert_eq!(variables["sort"][0]["downloads"]["direction"], "DESC");
    }

    #[test]
    fn nexus_collection_variables_keep_filters_and_page_offset_separate() {
        let variables =
            nexus_collection_variables("cyberpunk2077", "essentials", "updated", 3, 40, true);
        assert_eq!(variables["offset"], 80);
        assert_eq!(variables["count"], 40);
        assert_eq!(
            variables["filter"]["gameDomain"][0]["value"],
            "cyberpunk2077"
        );
        assert_eq!(
            variables["filter"]["generalSearch"][0]["value"],
            "essentials"
        );
        assert!(variables["filter"].get("adultContent").is_none());
        assert_eq!(variables["sort"][0]["updatedAt"]["direction"], "DESC");
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
        let mut security = test_security_context(&root, &content, "Cyberpunk 2077", "quarantine");
        let (layout, diagnostics) = stage_content(
            &root.join("wrapper"),
            &content,
            "Cyberpunk 2077",
            &cancel,
            &mut security,
        )
        .expect("stage composite mod");
        assert_eq!(layout, "CyberpunkGameRoot");
        assert!(diagnostics.is_empty());
        assert!(content.join("archive/pc/mod/example.archive").is_file());
        assert!(content.join("r6/scripts/example/main.reds").is_file());
        fs::remove_dir_all(root).expect("remove layout test");
    }

    #[test]
    fn bulk_cyberpunk_game_root_is_split_into_independent_candidates() {
        let root = std::env::temp_dir().join(format!(
            "zailon-cyberpunk-bulk-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(root.join("archive/pc/mod")).expect("archive root");
        fs::create_dir_all(root.join("r6/scripts/VehicleHandling")).expect("script root");
        fs::create_dir_all(root.join("red4ext/plugins/TweakXL")).expect("plugin root");
        fs::write(root.join("archive/pc/mod/vehicle.archive"), b"archive").expect("archive one");
        fs::write(root.join("archive/pc/mod/ui.archive"), b"archive").expect("archive two");
        fs::write(root.join("r6/scripts/VehicleHandling/main.reds"), b"script")
            .expect("redscript mod");
        fs::write(root.join("red4ext/plugins/TweakXL/TweakXL.dll"), b"dll")
            .expect("TweakXL plugin");

        let candidates = import_candidate_roots(&root);
        assert!(candidates.len() >= 4);
        assert!(!candidates.iter().any(|candidate| candidate == &root));
        assert!(candidates
            .iter()
            .any(|candidate| candidate.ends_with("VehicleHandling")));
        assert!(candidates
            .iter()
            .any(|candidate| candidate.ends_with("TweakXL")));
        fs::remove_dir_all(root).expect("remove bulk test");
    }

    #[test]
    fn nested_cyberpunk_candidate_reports_stripped_container_and_real_paths() {
        let root = std::env::temp_dir().join(format!(
            "zailon-cyberpunk-root-detection-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let selected = root.join("download/redscript-v1/redscript");
        fs::create_dir_all(selected.join("r6/scripts")).expect("scripts");
        fs::create_dir_all(selected.join("engine/tools")).expect("tools");
        fs::write(selected.join("engine/tools/scc.exe"), b"compiler").expect("compiler");
        let detection = detect_candidate_root(&root.join("download"));
        assert!(detection.detected_root.ends_with("redscript"));
        assert!(detection
            .relative_game_paths
            .iter()
            .any(|path| path == "r6"));
        assert!(detection
            .relative_game_paths
            .iter()
            .any(|path| path == "engine"));
        assert!(!detection.stripped_segments.is_empty());
        fs::remove_dir_all(root).expect("remove root detection test");
    }

    #[test]
    fn stages_a_split_redscript_mod_at_its_game_relative_path() {
        let root = std::env::temp_dir().join(format!(
            "zailon-cyberpunk-normalized-stage-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let source = root.join("r6/scripts/VehicleHandling");
        fs::create_dir_all(&source).expect("source");
        fs::write(source.join("main.reds"), b"script").expect("script");
        let content = root.join("content");
        fs::create_dir_all(&content).expect("content");
        let cancel = AtomicBool::new(false);
        let mut security = test_security_context(&root, &content, "Cyberpunk 2077", "quarantine");
        let (layout, _) =
            stage_content(&source, &content, "Cyberpunk 2077", &cancel, &mut security)
                .expect("stage normalized redscript");
        assert_eq!(layout, "CyberpunkNormalizedFragment");
        assert!(content
            .join("r6/scripts/VehicleHandling/main.reds")
            .is_file());
        assert!(!content.join("mods/VehicleHandling").exists());
        fs::remove_dir_all(root).expect("remove normalized stage test");
    }

    #[test]
    fn detects_cyberpunk_frameworks_from_files_not_only_folder_names() {
        assert_eq!(
            detect_cyberpunk_framework(
                Path::new("package"),
                &["engine/tools/scc.exe".into(), "redscript.toml".into()]
            ),
            "redscript"
        );
        assert_eq!(
            detect_cyberpunk_framework(
                Path::new("package"),
                &["red4ext/plugins/ArchiveXL/ArchiveXL.dll".into()]
            ),
            "ArchiveXL"
        );
        assert_eq!(
            detect_cyberpunk_framework(
                Path::new("package"),
                &["red4ext/plugins/Example/plugin.dll".into()]
            ),
            "RED4ext plugin"
        );
    }

    #[test]
    fn repair_normalizer_removes_only_proven_cyberpunk_containers() {
        assert_eq!(
            cyberpunk_repair_target(Path::new("mods/redscript/r6/scripts/core.reds")),
            Some(PathBuf::from("r6/scripts/core.reds"))
        );
        assert_eq!(
            cyberpunk_repair_target(Path::new(
                "Cyberpunk 2077/red4ext/plugins/Example/plugin.dll"
            )),
            Some(PathBuf::from("red4ext/plugins/Example/plugin.dll"))
        );
        assert_eq!(
            cyberpunk_repair_target(Path::new("redscript/engine/tools/scc.exe")),
            Some(PathBuf::from("engine/tools/scc.exe"))
        );
        assert_eq!(
            cyberpunk_repair_target(Path::new("mods/real-redmod/info.json")),
            None
        );
        assert_eq!(
            cyberpunk_repair_target(Path::new("archive/pc/mod/already-correct.archive")),
            None
        );
    }

    #[test]
    fn fivem_client_staging_maps_plugins_and_rejects_server_resources() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fivem-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let client = root.join("client-pack");
        fs::create_dir_all(&client).expect("client pack");
        fs::write(client.join("example.asi"), b"client-plugin").expect("client plugin");
        let content = root.join("content");
        fs::create_dir_all(&content).expect("content root");
        let cancel = AtomicBool::new(false);
        let mut security = test_security_context(&root, &content, "FiveM", "quarantine");
        let (layout, diagnostics) =
            stage_content(&client, &content, "FiveM", &cancel, &mut security)
                .expect("stage FiveM client plugin");
        assert_eq!(layout, "FiveMClientPlugin");
        assert!(content
            .join("FiveM.app/plugins/client-pack/example.asi")
            .is_file());
        assert!(diagnostics.iter().any(|item| item.contains("client FiveM")));

        let server = root.join("server-resource");
        fs::create_dir_all(&server).expect("server pack");
        fs::write(server.join("fxmanifest.lua"), b"fx_version 'cerulean'")
            .expect("server manifest");
        let rejected = root.join("rejected");
        let mut rejected_security = test_security_context(&root, &rejected, "FiveM", "quarantine");
        let error = stage_content(&server, &rejected, "FiveM", &cancel, &mut rejected_security)
            .expect_err("server resource must be rejected by client adapter");
        assert!(error.contains("Ressource serveur FiveM"));
        fs::remove_dir_all(root).expect("remove FiveM test");
    }

    #[test]
    fn generic_layout_does_not_report_cyberpunk_dependencies() {
        let root = std::env::temp_dir().join(format!(
            "zailon-generic-diagnostics-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("generic game root");
        let diagnostics = framework_diagnostics(
            &root,
            &[PathBuf::from("FiveM.app/plugins/example/example.asi")],
        )
        .expect("generic diagnostics");
        assert_eq!(diagnostics.len(), 1);
        assert!(!diagnostics[0].contains("ArchiveXL"));
        fs::remove_dir_all(root).expect("remove generic diagnostics test");
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
    fn blocks_archive_traversal_and_reserved_names_but_assesses_executables() {
        assert!(validate_archive_relative(Path::new("safe/mod.archive")).is_ok());
        assert!(validate_archive_relative(Path::new("../outside.txt")).is_err());
        assert!(validate_archive_relative(Path::new("CON/readme.txt")).is_err());
        assert!(validate_archive_relative(Path::new("files/setup.exe")).is_ok());
        assert!(validate_archive_relative(Path::new("folder/name.")).is_err());
    }

    #[test]
    fn quarantines_tools_scc_without_rejecting_or_executing_the_mod() {
        let root = std::env::temp_dir().join(format!(
            "zailon-sensitive-scc-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let package = root.join("package");
        let content = root.join("content");
        fs::create_dir_all(package.join("tools")).expect("tools directory");
        fs::write(package.join("readme.txt"), b"mod content").expect("readme");
        fs::write(
            package.join("tools/scc.exe"),
            b"MZfake-scc-test-do-not-execute",
        )
        .expect("scc fixture");
        fs::create_dir_all(&content).expect("content directory");
        let cancel = AtomicBool::new(false);
        let mut security = test_security_context(&root, &content, "Cyberpunk 2077", "quarantine");
        copy_tree_cancellable_secure(&package, &content, &cancel, &mut security)
            .expect("secure copy");
        assert!(content.join("readme.txt").is_file());
        assert!(!content.join("tools/scc.exe").exists());
        assert!(root.join("quarantine/files/tools/scc.exe").is_file());
        assert_eq!(security.assessments.len(), 1);
        let assessment = &security.assessments[0];
        assert_eq!(assessment.relative_path, "tools/scc.exe");
        assert_eq!(assessment.magic_type, "PE/COFF");
        assert_eq!(assessment.risk_level, "Caution");
        assert_eq!(assessment.decision.as_deref(), Some("quarantined"));
        assert_eq!(
            assessment.hash,
            "4b6d9f18bf5f9691b01595278001002d167ddd472b7a25e9b87af89642f3b089"
        );
        fs::remove_dir_all(root).expect("remove sensitive test");
    }

    #[test]
    fn deploys_only_adapter_expected_dll_and_flags_disguised_files() {
        let root = std::env::temp_dir().join(format!(
            "zailon-sensitive-adapter-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(root.join("red4ext/plugins/Example")).expect("plugin directory");
        let expected = root.join("red4ext/plugins/Example/Example.dll");
        fs::write(&expected, b"MZexpected-plugin").expect("expected dll");
        let allowed = assess_sensitive_file(
            &expected,
            Path::new("red4ext/plugins/Example/Example.dll"),
            Path::new("red4ext/plugins/Example/Example.dll"),
            "Cyberpunk 2077",
            None,
            None,
        )
        .expect("assessment")
        .expect("sensitive assessment");
        assert!(allowed.expected_by_game_adapter);
        assert!(allowed.may_deploy);

        let disguised = root.join("manual.jpg.exe");
        fs::write(&disguised, b"MZdisguised").expect("disguised executable");
        let blocked = assess_sensitive_file(
            &disguised,
            Path::new("manual.jpg.exe"),
            Path::new("manual.jpg.exe"),
            "Cyberpunk 2077",
            None,
            None,
        )
        .expect("assessment")
        .expect("sensitive assessment");
        assert_eq!(blocked.risk_level, "HighRisk");
        assert!(blocked
            .reasons
            .iter()
            .any(|reason| reason.contains("Double extension")));
        fs::remove_dir_all(root).expect("remove adapter test");
    }

    #[test]
    fn sensitive_decisions_are_hash_scoped_and_support_exclude_inactive_and_cancel() {
        let root = std::env::temp_dir().join(format!(
            "zailon-sensitive-decision-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let package = root.join("package");
        fs::create_dir_all(package.join("tools")).expect("tools directory");
        let executable = package.join("tools/helper.exe");
        fs::write(&executable, b"MZversion-one").expect("first version");
        let first = assess_sensitive_file(
            &executable,
            Path::new("tools/helper.exe"),
            Path::new("tools/helper.exe"),
            "Test game",
            Some("local"),
            Some("mod-1"),
        )
        .expect("first assessment")
        .expect("sensitive file");
        fs::write(&executable, b"MZversion-two").expect("second version");
        let second = assess_sensitive_file(
            &executable,
            Path::new("tools/helper.exe"),
            Path::new("tools/helper.exe"),
            "Test game",
            Some("local"),
            Some("mod-1"),
        )
        .expect("second assessment")
        .expect("sensitive file");
        assert_ne!(
            first.hash, second.hash,
            "a changed binary must require a new decision"
        );

        let excluded_content = root.join("excluded-content");
        fs::create_dir_all(&excluded_content).expect("excluded content");
        let cancel = AtomicBool::new(false);
        let mut excluded = test_security_context(&root, &excluded_content, "Test game", "exclude");
        copy_tree_cancellable_secure(&package, &excluded_content, &cancel, &mut excluded)
            .expect("exclude sensitive file");
        assert!(!excluded_content.join("tools/helper.exe").exists());
        assert_eq!(
            excluded.assessments[0].decision.as_deref(),
            Some("excluded")
        );

        let inactive_content = root.join("inactive-content");
        fs::create_dir_all(&inactive_content).expect("inactive content");
        let mut inactive = test_security_context(&root, &inactive_content, "Test game", "inactive");
        copy_tree_cancellable_secure(&package, &inactive_content, &cancel, &mut inactive)
            .expect("store sensitive file inactive");
        assert!(!inactive_content.join("tools/helper.exe").exists());
        assert!(root.join("inactive/tools/helper.exe").is_file());
        assert_eq!(
            inactive.assessments[0].decision.as_deref(),
            Some("stored-inactive")
        );

        let cancelled_content = root.join("cancelled-content");
        fs::create_dir_all(&cancelled_content).expect("cancelled content");
        let cancelled = AtomicBool::new(true);
        let mut cancelled_security =
            test_security_context(&root, &cancelled_content, "Test game", "quarantine");
        assert!(copy_tree_cancellable_secure(
            &package,
            &cancelled_content,
            &cancelled,
            &mut cancelled_security
        )
        .is_err());
        assert!(fs::read_dir(&cancelled_content)
            .expect("cancelled directory")
            .next()
            .is_none());
        fs::remove_dir_all(root).expect("remove decision test");
    }

    #[test]
    fn assesses_scripts_installers_links_and_extensionless_pe_without_declaring_them_safe() {
        let root = std::env::temp_dir().join(format!(
            "zailon-sensitive-matrix-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("matrix directory");
        for name in [
            "install.ps1",
            "setup.bat",
            "package.msi",
            "shortcut.lnk",
            "system.sys",
        ] {
            let path = root.join(name);
            fs::write(&path, b"sensitive fixture").expect("matrix file");
            let assessment = assess_sensitive_file(
                &path,
                Path::new(name),
                Path::new(name),
                "Test game",
                None,
                None,
            )
            .expect("matrix assessment")
            .expect("sensitive assessment");
            assert_ne!(assessment.risk_level, "Informational");
            assert_eq!(assessment.signature_status, "Unknown");
            assert!(assessment
                .reasons
                .iter()
                .any(|reason| reason.contains("antivirus")));
        }
        let extensionless = root.join("payload");
        fs::write(&extensionless, b"MZextensionless").expect("extensionless PE");
        let assessment = assess_sensitive_file(
            &extensionless,
            Path::new("payload"),
            Path::new("payload"),
            "Test game",
            None,
            None,
        )
        .expect("extensionless assessment")
        .expect("sensitive assessment");
        assert_eq!(assessment.magic_type, "PE/COFF");
        assert_eq!(assessment.risk_level, "HighRisk");
        fs::remove_dir_all(root).expect("remove matrix test");
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
            preview_cyberpunk_structure_repair,
            apply_cyberpunk_structure_repair,
            rollback_cyberpunk_structure_repair,
            sync_profile_state,
            apply_profile_transaction,
            profile_integrity,
            trash_profile_state,
            initialize_fivem_base,
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
            nexus_account_capabilities,
            nexus_catalog_games,
            nexus_catalog_mods,
            nexus_catalog_collections,
            nexus_collection_detail,
            prepare_nexus_collection_install,
            list_collection_install_plans,
            update_collection_install,
            #[cfg(desktop)]
            start_collection_install,
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
