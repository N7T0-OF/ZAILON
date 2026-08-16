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

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

mod input_backends;
mod process_priority;
mod process_scanner;
mod quick_panel;
mod steam_presence;
mod visual_profiles;
mod window_watcher;

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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStateCounts {
    games: u64,
    profiles: u64,
    mods: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CitizenFxRead {
    path: String,
    exists: bool,
    text: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CitizenFxWrite {
    path: String,
    backup_path: Option<String>,
    bytes: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiveMFolders {
    mods: bool,
    citizen: bool,
    plugins: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiveMEnvironment {
    root: String,
    app_data: Option<String>,
    has_citizenfx_ini: bool,
    folders: FiveMFolders,
    gta_v_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiveMPackScanResult {
    path: String,
    is_archive: bool,
    files: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiveMPackApplyResult {
    installed: usize,
    backups: usize,
    manifest_path: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiveMPackRemoveResult {
    removed: usize,
    restored: usize,
    manifest_path: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiveMPackManifestRead {
    exists: bool,
    name: Option<String>,
    file_count: usize,
    installed_at: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct PackManifestInput {
    #[serde(rename = "schemaVersion")]
    schema_version: i64,
    kind: String,
    name: String,
    installed_at: Option<u64>,
    files: Vec<PackManifestFileInput>,
    sensitive: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct PackManifestFileInput {
    target: String,
    source: String,
    kind: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIntegrityReport {
    ok: bool,
    backup_path: String,
    before: UpdateStateCounts,
    current: UpdateStateCounts,
    issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ProfilePreview {
    name: String,
    mod_count: u64,
    enabled_count: u64,
    disabled_count: u64,
    separator_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ExecutablePreview {
    title: String,
    binary_present: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ImportPreview {
    root: String,
    version: Option<String>,
    install_type: String,
    game_name: Option<String>,
    selected_profile: Option<String>,
    profiles: Vec<Mo2ProfilePreview>,
    executables: Vec<Mo2ExecutablePreview>,
    installed_mods: u64,
    downloads: u64,
    overwrite_files: u64,
    overwrite_bytes: u64,
    plugin_files: u64,
    hidden_files: u64,
    secret_keys_detected: u64,
    required_bytes: u64,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct VortexModSummary {
    name: String,
    file_count: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct VortexInstance {
    exists: bool,
    instance: Option<String>,
    version: Option<u64>,
    deployment_path: Option<String>,
    mods_dir: Option<String>,
    file_count: u64,
    mods: Vec<VortexModSummary>,
}

/// Fichier `.fbmod` découvert dans une installation Frosty (lecture seule).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrostyModFileInfo {
    name: String,
    path: String,
    size: u64,
}

/// Résultat de détection d'une installation Frosty existante (mods `.fbmod`).
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrostyInstallation {
    exists: bool,
    mods_dir: Option<String>,
    mods: Vec<FrostyModFileInfo>,
    file_count: u64,
    total_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ProfileMapping {
    source_name: String,
    target_id: String,
    target_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ImportOptions {
    mods: bool,
    metadata: bool,
    overwrite: bool,
    downloads: bool,
    executables: bool,
    categories: bool,
    notes: bool,
    hidden_files: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ImportRequest {
    source_path: String,
    game_id: String,
    game_name: String,
    profiles: Vec<Mo2ProfileMapping>,
    options: Mo2ImportOptions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mo2ImportResult {
    profiles: Vec<serde_json::Value>,
    installed_paths: Vec<String>,
    managed_executables: Vec<serde_json::Value>,
    imported_mods: u64,
    skipped_mods: u64,
    copied_downloads: u64,
    overwrite_files: u64,
    report_path: String,
    snapshot_path: String,
    source_unchanged: bool,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageFileEntry {
    source_physical_path: String,
    package_relative_path: String,
    game_relative_path: String,
    hash: String,
    size: u64,
    deployable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageReferenceStatus {
    profile_id: String,
    package_id: String,
    package_directory: String,
    exists: bool,
    manifest_exists: bool,
    files_exist: bool,
    source_still_available: bool,
    normalized: bool,
    deployable: bool,
    file_count: u64,
    version_id: Option<String>,
    content_hash: Option<String>,
    expected_version_id: Option<String>,
    expected_content_hash: Option<String>,
    identity_matches: bool,
    errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameworkProviderStatus {
    framework_id: String,
    package_id: String,
    files: Vec<String>,
    enabled: bool,
    runtime_visible: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualFileMapEntry {
    game_relative_path: String,
    package_id: String,
    source_physical_path: String,
    hash: String,
    size: u64,
    overridden_package_ids: Vec<String>,
    winner_reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileDeploymentAudit {
    game_id: String,
    profile_id: String,
    referenced_packages: u64,
    accessible_packages: u64,
    broken_references: u64,
    manifested_files: u64,
    virtual_file_count: u64,
    conflicts: u64,
    deployable: bool,
    packages: Vec<PackageReferenceStatus>,
    providers: Vec<FrameworkProviderStatus>,
    virtual_files: Vec<VirtualFileMapEntry>,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mo2DeploymentRepairResult {
    repair_id: String,
    packages_audited: u64,
    packages_restaged: u64,
    manifests_rebuilt: u64,
    normalized_files: u64,
    virtual_file_count: u64,
    broken_references: u64,
    providers: Vec<FrameworkProviderStatus>,
    snapshot_path: String,
    report_path: String,
    deployable: bool,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone)]
struct VirtualProfileMap {
    entries: Vec<VirtualFileMapEntry>,
    packages: Vec<PackageReferenceStatus>,
    providers: Vec<FrameworkProviderStatus>,
    conflicts: u64,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone)]
struct Mo2ModListEntry {
    name: String,
    enabled: bool,
    separator: bool,
    priority: i64,
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

/// Gate d'add-ons natifs (spec Add-ons §74) : le Core natif ne démarre aucun
/// service (providers, lectures Nexus, artwork) sans l'add-on
/// correspondant installé ET activé. La liste des add-ons activés est poussée
/// par le frontend à chaque changement (jamais de code mort côté natif).
#[derive(Default)]
struct AddonGate(Arc<Mutex<HashSet<String>>>);

fn addon_gate_enabled(gate: &State<'_, AddonGate>, addon_id: &str) -> bool {
    gate.0
        .lock()
        .map(|items| items.contains(addon_id))
        .unwrap_or(false)
}

fn addon_gate_error(addon_id: &str, label: &str) -> String {
    format!("L'add-on {label} n'est pas installé (ou est désactivé) — fonctionnalité indisponible ({addon_id}).")
}

/// Synchronise la liste des add-ons activés depuis le frontend (installés ET
/// activés). Appelé au démarrage et à chaque changement de la liste.
#[tauri::command]
fn set_enabled_addons(state: State<'_, AddonGate>, addons: Vec<String>) {
    let mut items = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    items.clear();
    items.extend(addons.into_iter().filter(|id| !id.trim().is_empty()));
}

/// Décode et valide la clé publique Ed25519 (base64, exactement 32 octets).
/// La clé publique n'est jamais un secret — elle ne sert qu'à vérifier.
fn parse_verifying_key(public_key: &str) -> Result<ed25519_dalek::VerifyingKey, String> {
    use base64::Engine;

    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(public_key.trim())
        .map_err(|_| "Clé publique invalide (base64).".to_string())?;
    let key_bytes: [u8; 32] = key_bytes
        .try_into()
        .map_err(|_| "Clé publique invalide (doit faire 32 octets).".to_string())?;
    ed25519_dalek::VerifyingKey::from_bytes(&key_bytes)
        .map_err(|error| format!("Clé publique Ed25519 invalide : {error}"))
}

/// Vérifie la signature Ed25519 d'un package d'add-on (spec §14, §52) : la
/// signature (base64) est validée contre le SHA-256 du fichier et la clé
/// publique (base64, 32 octets) fournie par le catalogue. La clé publique n'est
/// jamais un secret — elle n'autorise que la vérification.
#[tauri::command]
fn addon_verify_signature(
    file_path: String,
    signature: String,
    public_key: String,
) -> Result<bool, String> {
    use base64::Engine;
    use ed25519_dalek::Signature;
    use sha2::{Digest, Sha256};

    let bytes = std::fs::read(&file_path)
        .map_err(|error| format!("Lecture du package impossible : {error}"))?;
    let digest = Sha256::digest(&bytes);

    let verifying_key = parse_verifying_key(&public_key)?;

    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature.trim())
        .map_err(|_| "Signature invalide (base64).".to_string())?;
    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|error| format!("Signature Ed25519 invalide : {error}"))?;

    Ok(verifying_key.verify_strict(&digest, &signature).is_ok())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchGameResult {
    pid: u32,
    deployment_backend: String,
    deployed_files: usize,
    conflicts_resolved: usize,
    deployment_status: String,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeploymentProgressEvent {
    phase: String,
    current: usize,
    total: usize,
    message: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NexusModGallery {
    images: Vec<String>,
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
    #[serde(default)]
    unsupported_instructions: Vec<String>,
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
struct CollectionStagingResult {
    plan: CollectionInstallPlan,
    profile: serde_json::Value,
    installed_paths: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StagedDuplicateGroup {
    canonical_id: String,
    duplicate_ids: Vec<String>,
    name: String,
    reclaimable_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StagedDuplicatePreview {
    game_id: String,
    packages_scanned: u64,
    duplicate_packages: u64,
    reclaimable_bytes: u64,
    groups: Vec<StagedDuplicateGroup>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StagedDedupReplacement {
    duplicate_id: String,
    canonical_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StagedDedupResult {
    game_id: String,
    removed_packages: u64,
    reclaimed_bytes: u64,
    replacements: Vec<StagedDedupReplacement>,
    warnings: Vec<String>,
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

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

fn find_cached_resource(directory: &Path, prefix: &str) -> Option<PathBuf> {
    let needle = format!("{prefix}.");
    fs::read_dir(directory)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&needle))
        })
}

fn update_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_local_data_dir().map_err(to_error)?;
    fs::create_dir_all(&root).map_err(to_error)?;
    Ok(root)
}

fn background_tasks_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(update_data_root(app)?.join("background-tasks.json"))
}

/// Dossier d'installation des add-ons : code dans `addons/installed`, données
/// utilisateur séparées dans `addon-data` (spec §16).
#[tauri::command]
fn addon_install_dir(app: AppHandle) -> Result<String, String> {
    let root = update_data_root(&app)?;
    let dir = root.join("addons").join("installed");
    fs::create_dir_all(&dir).map_err(to_error)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Écrit une archive projet `.zailon-frosty-project` de façon atomique
/// (spec Frosty Editor §108) : temp + rename, jamais d'écriture partielle.
#[tauri::command]
fn save_project_archive(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    let temp = target.with_extension(format!("tmp-{}", unix_timestamp()));
    fs::write(&temp, &bytes).map_err(to_error)?;
    if target.exists() {
        fs::remove_file(&target).map_err(to_error)?;
    }
    fs::rename(&temp, &target).map_err(to_error)?;
    Ok(())
}

// ────────────────── Frosty Editor : runtime officiel + Worker natif ─────────
// Spec Frosty Editor §76-86 : le runtime Frosty est TOUJOURS externe (jamais
// bundle — licence CC BY-NC-ND, docs/frosty-license-audit.md). ZAILON le
// détecte, l'inventorie et le pilote en processus séparé.

/// Fichier réel du jeu scanné (inventaire — jamais de hash lourd).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GameDataFile {
    path: String,
    size: u64,
    modified: u64,
}

/// Résultat de détection du runtime Frosty officiel.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FrostyRuntimeInfo {
    path: String,
    exe: String,
    size: u64,
}

const FROSTY_RUNTIME_NAMES: [&str; 3] =
    ["FrostyModManager.exe", "FrostyEditor.exe", "FrostyCmd.exe"];

/// Cherche le runtime Frosty officiel dans une liste de dossiers (pur,
/// testable). Ordre de préférence : ModManager > Editor > Cmd.
fn find_frosty_runtime_in(
    dirs: &[std::path::PathBuf],
) -> Option<(std::path::PathBuf, String, u64)> {
    for dir in dirs {
        for name in FROSTY_RUNTIME_NAMES {
            let candidate = dir.join(name);
            if let Ok(meta) = candidate.metadata() {
                if meta.is_file() {
                    return Some((candidate, name.to_string(), meta.len()));
                }
            }
        }
    }
    None
}

/// Détecte le runtime Frosty officiel : dossier du jeu, à côté, dossier
/// Frosty du jeu, addon-data/official.zailon.frosty, et chemins fournis.
#[tauri::command]
fn frosty_detect_runtime(
    app: AppHandle,
    game_path: String,
    extra_paths: Vec<String>,
) -> Result<Option<FrostyRuntimeInfo>, String> {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(exe_dir) = std::path::Path::new(&game_path).parent() {
        dirs.push(exe_dir.to_path_buf());
        dirs.push(exe_dir.join("Frosty"));
        if let Some(parent) = exe_dir.parent() {
            dirs.push(parent.to_path_buf());
        }
    }
    if let Ok(root) = update_data_root(&app) {
        dirs.push(root.join("addon-data").join("official.zailon.frosty"));
    }
    for extra in &extra_paths {
        dirs.push(std::path::PathBuf::from(extra));
    }
    Ok(
        find_frosty_runtime_in(&dirs).map(|(path, exe, size)| FrostyRuntimeInfo {
            path: path.to_string_lossy().to_string(),
            exe,
            size,
        }),
    )
}

/// Inventaire réel des données du jeu (Data, sinon racine) — alimente l'index
/// des assets avec de vraies tailles (spec §16). Plafonné pour ne jamais
/// bloquer ni saturer le canal IPC.
#[tauri::command]
fn frosty_scan_game_data(game_path: String) -> Result<Vec<GameDataFile>, String> {
    const MAX_FILES: usize = 50_000;
    let root = std::path::PathBuf::from(&game_path);
    let mut scan_root = root.join("Data");
    if !scan_root.is_dir() {
        scan_root = root.clone();
    }
    let mut out: Vec<GameDataFile> = Vec::new();
    let mut stack = vec![scan_root];
    while let Some(dir) = stack.pop() {
        if out.len() >= MAX_FILES {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(path);
            } else if meta.is_file() {
                if out.len() >= MAX_FILES {
                    break;
                }
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push(GameDataFile {
                    path: path
                        .strip_prefix(&root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string(),
                    size: meta.len(),
                    modified,
                });
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Lit un fichier catalogue `.cat` du jeu (borné — les catalogues Frostbite
/// font quelques Mo ; jamais plus de 64 Mo). Renvoie les octets bruts ; le
/// parsing vit côté TS (src/lib/frostyCat.ts, validé par tests).
#[tauri::command]
fn frosty_read_cat_file(game_path: String, relative_path: String) -> Result<Vec<u8>, String> {
    const MAX_CAT_BYTES: u64 = 64 * 1024 * 1024;
    let root = std::path::PathBuf::from(&game_path);
    let target = root.join(&relative_path);
    // Garde : le chemin relatif doit rester sous la racine du jeu.
    let canonical_target = target.canonicalize().map_err(to_error)?;
    let canonical_root = root.canonicalize().map_err(to_error)?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err("Chemin hors du dossier du jeu.".to_string());
    }
    let meta = canonical_target.metadata().map_err(to_error)?;
    if !meta.is_file() {
        return Err("Fichier catalogue introuvable.".to_string());
    }
    if meta.len() > MAX_CAT_BYTES {
        return Err(format!(
            "Catalogue trop volumineux ({} Mo max).",
            MAX_CAT_BYTES / 1024 / 1024
        ));
    }
    std::fs::read(&canonical_target).map_err(to_error)
}

/// Démarre le runtime Frosty officiel en tant que Worker isolé (§76-78).
#[tauri::command]
fn frosty_worker_start(runtime_path: String) -> Result<u32, String> {
    let path = std::path::PathBuf::from(&runtime_path);
    if !path.is_file() {
        return Err("Runtime Frosty introuvable.".to_string());
    }
    let child = Command::new(&path)
        .current_dir(path.parent().unwrap_or_else(|| std::path::Path::new(".")))
        .spawn()
        .map_err(to_error)?;
    Ok(child.id())
}

/// État du Worker : running + RAM utilisée (Windows via tasklist).
#[tauri::command]
fn frosty_worker_status(pid: u32) -> Result<serde_json::Value, String> {
    let running = process_is_running(pid);
    let memory_mb = if running {
        process_memory_mb(pid)
    } else {
        None
    };
    Ok(serde_json::json!({ "running": running, "memoryMb": memory_mb }))
}

/// Arrête le Worker (kill propre, spec §79-81).
#[tauri::command]
fn frosty_worker_stop(pid: u32) -> Result<(), String> {
    kill_process(pid)
}

/// RAM d'un processus (Mo) — Windows via tasklist, ailleurs non disponible.
fn process_memory_mb(pid: u32) -> Option<u64> {
    #[cfg(target_os = "windows")]
    {
        let filter = format!("PID eq {pid}");
        let output = Command::new("tasklist")
            .args(["/FI", &filter, "/FO", "CSV", "/NH"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let field = text
            .split(',')
            .nth(4)
            .map(|v| v.trim_matches(['"', ' ', '\r', '\n']).to_string())?;
        let kb = field.trim_end_matches(" K").parse::<u64>().ok()?;
        return Some(kb / 1024);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        None
    }
}

/// Tue un processus (cross-platform, cf. process_is_running).
fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
            .map_err(to_error)?;
        if status.success() || !process_is_running(pid) {
            return Ok(());
        }
        return Err(format!("Impossible d'arrêter le processus {pid}."));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
            .map_err(to_error)?;
        if status.success() || !process_is_running(pid) {
            return Ok(());
        }
        Err(format!("Impossible d'arrêter le processus {pid}."))
    }
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
    reconcile_staged_profile_reference(app, game_id, profile_id, &states)?;
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
    reconcile_staged_profile_reference(&app, &game_id, &profile_id, &serde_json::json!({}))?;
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

/// Extrait le chemin GTA V (`[Game] IVPath=...`) d'un texte CitizenFX.ini.
/// Lecture seule : la valeur n'est jamais modifiée par ZAILON.
fn citizenfx_iv_path(text: &str) -> Option<String> {
    let mut in_game = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_game = trimmed.eq_ignore_ascii_case("[game]");
            continue;
        }
        if in_game {
            if let Some((key, value)) = trimmed.split_once('=') {
                if key.trim().eq_ignore_ascii_case("IVPath") {
                    let value = value.trim().trim_matches('"');
                    if !value.is_empty() {
                        return Some(value.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Localise `FiveM.app` (dossier de données applicatives) sous une racine FiveM.
fn locate_fivem_app(root: &Path) -> Option<PathBuf> {
    let direct = root.join("FiveM.app");
    if direct.is_dir() {
        return Some(direct);
    }
    // Cas d'une racine donnée plus profonde : remonte jusqu'à trouver FiveM.app.
    for ancestor in root.ancestors() {
        let candidate = ancestor.join("FiveM.app");
        if candidate.is_dir() {
            return Some(candidate);
        }
    }
    None
}

#[tauri::command]
fn read_citizenfx(citizenfx_path: String) -> Result<CitizenFxRead, String> {
    let path = PathBuf::from(&citizenfx_path);
    match fs::read(&path) {
        Ok(bytes) => Ok(CitizenFxRead {
            path: citizenfx_path,
            exists: true,
            text: String::from_utf8_lossy(&bytes).to_string(),
        }),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(CitizenFxRead {
            path: citizenfx_path,
            exists: false,
            text: String::new(),
        }),
        Err(err) => Err(to_error(err)),
    }
}

/// Écrit `CitizenFX.ini` APRÈS avoir sauvegardé l'existant (spéc §8, §19) :
/// le fichier courant est copié vers `citizenfx.ini.zailon-backup` (avec
/// horodatage si un backup existe déjà). Aucune autre modification.
#[tauri::command]
fn write_citizenfx(citizenfx_path: String, text: String) -> Result<CitizenFxWrite, String> {
    let path = PathBuf::from(&citizenfx_path);
    let backup_path = if path.is_file() {
        let mut backup = path.clone();
        backup.set_file_name(format!("citizenfx.ini.zailon-backup-{}", unix_timestamp()));
        fs::copy(&path, &backup).map_err(to_error)?;
        Some(backup.to_string_lossy().to_string())
    } else {
        None
    };
    let bytes = text.as_bytes();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    let temp = path.with_extension(format!("tmp-{}", unix_timestamp()));
    fs::write(&temp, bytes).map_err(to_error)?;
    if path.exists() {
        fs::remove_file(&path).map_err(to_error)?;
    }
    fs::rename(&temp, &path).map_err(to_error)?;
    Ok(CitizenFxWrite {
        path: citizenfx_path,
        backup_path,
        bytes: bytes.len(),
    })
}

/// Détection disque de l'environnement FiveM (spéc §1, §12) : FiveM.app,
/// CitizenFX.ini, dossiers mods/citizen/plugins et chemin GTA V (`[Game]
/// IVPath`). Le chemin de FiveM.app n'est jamais codé en dur.
#[tauri::command]
fn detect_fivem_environment(install_directory: String) -> Result<FiveMEnvironment, String> {
    let root = fs::canonicalize(&install_directory).map_err(to_error)?;
    let app_data = locate_fivem_app(&root);
    let app_path = match &app_data {
        Some(path) => path.clone(),
        None => root.join("FiveM.app"),
    };
    let citizenfx_path = app_path.join("citizenfx.ini");
    let has_citizenfx_ini = citizenfx_path.is_file();
    let citizenfx_text = has_citizenfx_ini
        .then(|| fs::read_to_string(&citizenfx_path).ok())
        .flatten();
    Ok(FiveMEnvironment {
        root: root.to_string_lossy().to_string(),
        app_data: app_data.map(|path| path.to_string_lossy().to_string()),
        has_citizenfx_ini,
        folders: FiveMFolders {
            mods: app_path.join("mods").is_dir(),
            citizen: app_path.join("citizen").is_dir(),
            plugins: app_path.join("plugins").is_dir(),
        },
        gta_v_path: citizenfx_text.as_deref().and_then(citizenfx_iv_path),
    })
}

/// Normalise un chemin de pack (`\` → `/`, segments vides supprimés) pour
/// comparer les sources du plan avec les entrées réelles de l'archive.
fn pack_norm_path(value: &str) -> String {
    value
        .replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

/// Inventorie le contenu réel d'une archive de pack graphique FiveM (spéc
/// « Analyse intelligente du ZIP ») : liste relative normalisée `/`, symlinks et
/// chemins de traversée rejetés. Retourne aussi `is_archive:false` pour un
/// dossier (le scan `scan_mod_import` existant sert alors de listing).
#[tauri::command]
fn fivem_pack_scan(selected_path: String) -> Result<FiveMPackScanResult, String> {
    let path = PathBuf::from(&selected_path);
    if !path.exists() {
        return Err("The selected pack does not exist.".into());
    }
    if path.is_dir() {
        return Ok(FiveMPackScanResult {
            path: selected_path,
            is_archive: false,
            files: Vec::new(),
        });
    }
    let file = fs::File::open(&path).map_err(to_error)?;
    let mut archive = zip::ZipArchive::new(file).map_err(to_error)?;
    if archive.len() > 100_000 {
        return Err("Pack archive contains too many entries.".into());
    }
    let mut files = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(to_error)?;
        if archive_is_symlink(entry.unix_mode()) {
            return Err("Pack archive contains a symbolic link.".into());
        }
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| "Pack archive contains an unsafe traversal path.".to_string())?;
        validate_archive_relative(&relative)?;
        if !entry.is_dir() {
            files.push(pack_norm_path(&relative.to_string_lossy()));
        }
    }
    Ok(FiveMPackScanResult {
        path: selected_path,
        is_archive: true,
        files,
    })
}

/// Applique réellement un pack graphique dans `target_dir` (spéc
/// « Application + rollback ») : chaque entrée du plan est extraite de
/// l'archive vers sa cible (relative validée), tout fichier existant est
/// sauvegardé (`<name>.zailon-pack-backup-<ts>`), puis le manifeste
/// `zailon-manifest.json` est écrit avec `installedAt` et les backups.
#[tauri::command]
fn fivem_pack_apply(
    archive_path: String,
    target_dir: String,
    manifest_json: String,
) -> Result<FiveMPackApplyResult, String> {
    let target = fs::canonicalize(&target_dir).map_err(to_error)?;
    if !target.is_dir() {
        return Err("The pack target directory does not exist.".into());
    }
    let manifest: PackManifestInput = serde_json::from_str(&manifest_json).map_err(to_error)?;
    if manifest.files.is_empty() {
        return Err("The pack plan contains no files to install.".into());
    }
    if manifest.files.len() > 100_000 {
        return Err("Pack contains too many entries.".into());
    }
    let archive_file = fs::File::open(&archive_path).map_err(to_error)?;
    let mut archive = zip::ZipArchive::new(archive_file).map_err(to_error)?;
    if archive.len() > 100_000 {
        return Err("Pack archive contains too many entries.".into());
    }
    let mut installed = 0usize;
    let mut backups = 0usize;
    let mut output_entries: Vec<serde_json::Value> = Vec::new();
    for file in &manifest.files {
        let target_rel = Path::new(&file.target);
        validate_archive_relative(target_rel)?;
        let source_norm = pack_norm_path(&file.source);
        let destination = target.join(target_rel);
        let mut found = false;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(to_error)?;
            if archive_is_symlink(entry.unix_mode()) {
                return Err("Pack archive contains a symbolic link.".into());
            }
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| "Pack archive contains an unsafe traversal path.".to_string())?;
            if pack_norm_path(&relative.to_string_lossy()) != source_norm {
                continue;
            }
            found = true;
            if entry.is_dir() {
                fs::create_dir_all(&destination).map_err(to_error)?;
                break;
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            let backup = if destination.is_file() {
                let name = destination
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("file");
                let mut backup = destination.clone();
                backup.set_file_name(format!("{name}.zailon-pack-backup-{}", unix_timestamp()));
                fs::copy(&destination, &backup).map_err(to_error)?;
                backups += 1;
                // Chemin RELATIF au target (sous-dossier conservé) pour le rollback.
                backup
                    .strip_prefix(&target)
                    .ok()
                    .map(|value| value.to_string_lossy().to_string())
            } else {
                None
            };
            let mut output = fs::File::create(&destination).map_err(to_error)?;
            std::io::copy(&mut entry, &mut output).map_err(to_error)?;
            installed += 1;
            output_entries.push(serde_json::json!({
                "target": file.target,
                "source": file.source,
                "kind": file.kind,
                "backup": backup,
            }));
            break;
        }
        if !found {
            return Err(format!("Pack archive is missing entry: {}", file.source));
        }
    }
    let manifest_path = target.join("zailon-manifest.json");
    let written = serde_json::json!({
        "schemaVersion": 1,
        "kind": manifest.kind,
        "name": manifest.name,
        "installedAt": unix_timestamp(),
        "files": output_entries,
        "sensitive": manifest.sensitive,
    });
    write_json_atomic(&manifest_path, &written)?;
    Ok(FiveMPackApplyResult {
        installed,
        backups,
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

/// Désinstallation propre (spéc « Désinstallation propre ») : lit
/// `zailon-manifest.json`, restaure les fichiers sauvegardés (backup) et
/// supprime UNIQUEMENT les fichiers possédés par le manifeste — jamais un
/// fichier utilisateur. Le manifeste est ensuite retiré.
#[tauri::command]
fn fivem_pack_remove(target_dir: String) -> Result<FiveMPackRemoveResult, String> {
    let target = fs::canonicalize(&target_dir).map_err(to_error)?;
    let manifest_path = target.join("zailon-manifest.json");
    if !manifest_path.is_file() {
        return Err("No installed pack manifest found in this directory.".into());
    }
    let bytes = fs::read(&manifest_path).map_err(to_error)?;
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).map_err(to_error)?;
    let mut removed = 0usize;
    let mut restored = 0usize;
    if let Some(files) = manifest.get("files").and_then(|value| value.as_array()) {
        for entry in files {
            let Some(target_rel) = entry.get("target").and_then(|value| value.as_str()) else {
                continue;
            };
            let relative = Path::new(target_rel);
            if validate_archive_relative(relative).is_err() {
                continue;
            }
            let destination = target.join(target_rel);
            let backup_name = entry.get("backup").and_then(|value| value.as_str());
            if let Some(relative) = backup_name {
                let backup = target.join(relative);
                if backup.is_file() {
                    if destination.is_file() {
                        let _ = fs::remove_file(&destination);
                    }
                    if fs::rename(&backup, &destination).is_ok() {
                        restored += 1;
                        continue;
                    }
                }
            }
            if destination.is_file() {
                let _ = fs::remove_file(&destination);
                removed += 1;
            }
        }
    }
    let _ = fs::remove_file(&manifest_path);
    Ok(FiveMPackRemoveResult {
        removed,
        restored,
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

/// Lit le manifeste installé d'un dossier (état « pack installé » pour l'UI).
#[tauri::command]
fn fivem_pack_manifest(target_dir: String) -> Result<FiveMPackManifestRead, String> {
    let target = fs::canonicalize(&target_dir).map_err(to_error)?;
    let manifest_path = target.join("zailon-manifest.json");
    if !manifest_path.is_file() {
        return Ok(FiveMPackManifestRead {
            exists: false,
            name: None,
            file_count: 0,
            installed_at: None,
        });
    }
    let bytes = fs::read(&manifest_path).map_err(to_error)?;
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).map_err(to_error)?;
    Ok(FiveMPackManifestRead {
        exists: true,
        name: manifest
            .get("name")
            .and_then(|value| value.as_str())
            .map(String::from),
        file_count: manifest
            .get("files")
            .and_then(|value| value.as_array())
            .map(|files| files.len())
            .unwrap_or(0),
        installed_at: manifest.get("installedAt").and_then(|value| value.as_u64()),
    })
}

/// Applique la priorité OS au processus d'un jeu (add-on Performance+) :
/// `normal` / `above-normal` / `high`. `auto` ou inconnu → rien (le système
/// garde la main). Non critique : l'échec est remonté mais ne bloque jamais
/// le lancement.
#[tauri::command]
fn set_game_process_priority(pid: u32, priority: String) -> Result<(), String> {
    let parsed = process_priority::parse_process_priority(&priority)
        .ok_or_else(|| "Unsupported process priority.".to_string())?;
    process_priority::set_process_priority(pid, parsed)
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
    // §8 — cache image stable : le hash de l'URL sert de clé. Une même
    // illustration est réutilisée sans aucun appel réseau ni duplication disque.
    let cache_prefix = format!("{kind}-{}", sha256_hex(source_url.as_bytes()));
    let directory = game_resource_directory(&app, &game_id)?;
    if let Some(existing) = find_cached_resource(&directory, &cache_prefix) {
        return Ok(existing.to_string_lossy().to_string());
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
    let destination = directory.join(format!("{cache_prefix}.{extension}"));
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
    gate: State<'_, AddonGate>,
    game_name: String,
    provider: Option<String>,
    provider_game_id: Option<String>,
    kind: String,
    api_keys: Option<HashMap<String, String>>,
) -> Result<Vec<ArtworkCandidate>, String> {
    if !addon_gate_enabled(&gate, "official.zailon.artwork") {
        return Err(addon_gate_error("official.zailon.artwork", "Artwork+"));
    }
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
    if let Some(api_keys) = api_keys.as_ref() {
        if let Some(api_key) = api_keys
            .iter()
            .find(|(provider, _)| provider.eq_ignore_ascii_case("steamgriddb"))
            .map(|(_, key)| key)
        {
            let sgdb_endpoint = match kind.as_str() {
                "cover" => Some(("grids", "600x900")),
                "banner" | "background" => Some(("heroes", "1920x620")),
                "logo" => Some(("logos", "")),
                "icon" => Some(("icons", "")),
                _ => None,
            };
            if let Some((endpoint, dimensions)) = sgdb_endpoint {
                let mut sgdb_url = url::Url::parse(&format!(
                    "https://www.steamgriddb.com/api/v2/{endpoint}/{app_id}"
                ))
                .map_err(to_error)?;
                if !dimensions.is_empty() {
                    sgdb_url
                        .query_pairs_mut()
                        .append_pair("dimensions", dimensions);
                }
                let request = client
                    .get(sgdb_url)
                    .header(reqwest::header::AUTHORIZATION, format!("Bearer {api_key}"));
                if let Ok(response) = request.send().await {
                    if response.status().is_success() {
                        if let Ok(payload) = response.json::<serde_json::Value>().await {
                            if let Some(items) =
                                payload.get("data").and_then(|value| value.as_array())
                            {
                                for item in items {
                                    if let Some(url) = item
                                        .get("url")
                                        .and_then(|value| value.as_str())
                                        .map(str::to_string)
                                    {
                                        push_steamgriddb_candidate(
                                            &mut candidates,
                                            &mut seen,
                                            &matched_name,
                                            &kind,
                                            url,
                                            item.get("width").and_then(|value| value.as_u64()),
                                            item.get("height").and_then(|value| value.as_u64()),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
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
    if let Some(api_keys) = api_keys.as_ref() {
        let igdb_client_id = api_keys.get("igdbClientId");
        let igdb_client_secret = api_keys.get("igdbClientSecret");
        if let (Some(client_id), Some(client_secret)) = (igdb_client_id, igdb_client_secret) {
            let igdb_endpoint = match kind.as_str() {
                "cover" => Some(("cover", "t_cover_big", 264, 352)),
                "banner" | "background" => Some(("artworks", "t_1080p", 1920, 1080)),
                _ => None,
            };
            if let Some((field, size, width, height)) = igdb_endpoint {
                let token_response = client
                    .post("https://id.twitch.tv/oauth2/token")
                    .form(&[
                        ("client_id", client_id.as_str()),
                        ("client_secret", client_secret.as_str()),
                        ("grant_type", "client_credentials"),
                    ])
                    .send()
                    .await;
                if let Ok(token_response) = token_response {
                    if token_response.status().is_success() {
                        if let Ok(token_payload) = token_response.json::<serde_json::Value>().await
                        {
                            if let Some(access_token) = token_payload
                                .get("access_token")
                                .and_then(|value| value.as_str())
                            {
                                let query = format!(
                                    "search \"{}\"; fields name,{field}.image_id; limit 4;",
                                    game_name.trim().replace('"', "")
                                );
                                let search = client
                                    .post("https://api.igdb.com/v4/games")
                                    .header("Client-ID", client_id.as_str())
                                    .header(
                                        reqwest::header::AUTHORIZATION,
                                        format!("Bearer {access_token}"),
                                    )
                                    .body(query)
                                    .send()
                                    .await;
                                if let Ok(search) = search {
                                    if search.status().is_success() {
                                        if let Ok(games) = search.json::<serde_json::Value>().await
                                        {
                                            if let Some(games) = games.as_array() {
                                                for game in games.iter().take(3) {
                                                    let mut image_ids: Vec<&str> = Vec::new();
                                                    if field == "cover" {
                                                        if let Some(image_id) = game
                                                            .get("cover")
                                                            .and_then(|value| value.get("image_id"))
                                                            .and_then(|value| value.as_str())
                                                        {
                                                            image_ids.push(image_id);
                                                        }
                                                    } else if let Some(items) = game
                                                        .get(field)
                                                        .and_then(|value| value.as_array())
                                                    {
                                                        for item in items {
                                                            if let Some(image_id) = item
                                                                .get("image_id")
                                                                .and_then(|value| value.as_str())
                                                            {
                                                                image_ids.push(image_id);
                                                            }
                                                        }
                                                    }
                                                    for image_id in image_ids.iter().take(4) {
                                                        push_igdb_candidate(
                                                            &mut candidates,
                                                            &mut seen,
                                                            &matched_name,
                                                            &kind,
                                                            format!(
                                                                "https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg"
                                                            ),
                                                            Some(width),
                                                            Some(height),
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if matches!(kind.as_str(), "cover" | "banner" | "background") {
        let mut search_url =
            url::Url::parse("https://api.gamebanana.com/Core/List/Like").map_err(to_error)?;
        search_url
            .query_pairs_mut()
            .append_pair("itemtype", "Game")
            .append_pair("field", "name")
            .append_pair("like", game_name.trim())
            .append_pair("limit", "4");
        if let Ok(response) = client.get(search_url).send().await {
            if response.status().is_success() {
                if let Ok(ids) = response.json::<serde_json::Value>().await {
                    if let Some(ids) = ids.as_array() {
                        for id in ids.iter().take(2) {
                            if let Some(id) = id
                                .as_u64()
                                .or_else(|| id.as_str().and_then(|value| value.parse().ok()))
                            {
                                let mut item_url =
                                    url::Url::parse("https://api.gamebanana.com/Core/Item/Data")
                                        .map_err(to_error)?;
                                item_url
                                    .query_pairs_mut()
                                    .append_pair("itemtype", "Game")
                                    .append_pair("id", &id.to_string())
                                    .append_pair("fields", "name,screenshots");
                                if let Ok(item_response) = client.get(item_url).send().await {
                                    if item_response.status().is_success() {
                                        if let Ok(item) =
                                            item_response.json::<serde_json::Value>().await
                                        {
                                            if let Some(screenshots) = item
                                                .get("screenshots")
                                                .and_then(|value| value.as_array())
                                            {
                                                for screenshot in screenshots.iter().take(4) {
                                                    let url = screenshot
                                                        .get("sUrl")
                                                        .and_then(|value| value.as_str())
                                                        .map(str::to_string)
                                                        .or_else(|| {
                                                            screenshot
                                                                .get("iFilename")
                                                                .and_then(|value| value.as_str())
                                                                .map(|name| {
                                                                    format!(
                                                                        "https://images.gamebanana.com/img/ss/games/{name}"
                                                                    )
                                                                })
                                                        });
                                                    if let Some(url) = url {
                                                        push_gamebanana_candidate(
                                                            &mut candidates,
                                                            &mut seen,
                                                            &matched_name,
                                                            &kind,
                                                            url,
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if candidates.is_empty() {
        return Err("Aucune source n'a fourni d'image pour cet emplacement.".into());
    }
    Ok(candidates)
}

fn push_steamgriddb_candidate(
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
        id: format!("steamgriddb-{}", candidates.len() + 1),
        provider: "steamgriddb".into(),
        source_label: "SteamGridDB".into(),
        game_name: game_name.into(),
        kind: kind.into(),
        url,
        width,
        height,
        attribution: "Image fournie par SteamGridDB. Vérifiez l'aperçu avant utilisation.".into(),
    });
}

fn push_igdb_candidate(
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
        id: format!("igdb-{}", candidates.len() + 1),
        provider: "igdb".into(),
        source_label: "IGDB".into(),
        game_name: game_name.into(),
        kind: kind.into(),
        url,
        width,
        height,
        attribution: "Image fournie par IGDB. Vérifiez l'aperçu avant utilisation.".into(),
    });
}

fn push_gamebanana_candidate(
    candidates: &mut Vec<ArtworkCandidate>,
    seen: &mut HashSet<String>,
    game_name: &str,
    kind: &str,
    url: String,
) {
    let url = safe_remote_image(url);
    if url.is_empty() || !seen.insert(url.clone()) {
        return;
    }
    candidates.push(ArtworkCandidate {
        id: format!("gamebanana-{}", candidates.len() + 1),
        provider: "gamebanana".into(),
        source_label: "GameBanana".into(),
        game_name: game_name.into(),
        kind: kind.into(),
        url,
        width: None,
        height: None,
        attribution:
            "Image fournie par GameBanana (API publique). Vérifiez l'aperçu avant utilisation."
                .into(),
    });
}

#[tauri::command]
async fn test_artwork_provider(
    gate: State<'_, AddonGate>,
    provider: String,
    api_keys: HashMap<String, String>,
) -> Result<String, String> {
    if !addon_gate_enabled(&gate, "official.zailon.artwork") {
        return Err(addon_gate_error("official.zailon.artwork", "Artwork+"));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Unable to initialize the artwork connection test.".to_string())?;
    match provider.to_ascii_lowercase().as_str() {
        "steamgriddb" => {
            let api_key = api_keys
                .get("steamgriddb")
                .ok_or_else(|| "Aucune clé SteamGridDB n'est enregistrée.".to_string())?;
            let response = client
                .get("https://www.steamgriddb.com/api/v2/grids/1?type=grid&dimensions=600x900")
                .header(reqwest::header::AUTHORIZATION, format!("Bearer {api_key}"))
                .send()
                .await
                .map_err(|error| {
                    if error.is_timeout() {
                        "SteamGridDB a expiré.".to_string()
                    } else {
                        "SteamGridDB est actuellement inaccessible.".to_string()
                    }
                })?;
            if response.status().is_success() {
                Ok("Connexion OK : la clé SteamGridDB est acceptée.".into())
            } else if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
                Err("Clé SteamGridDB invalide ou révoquée.".into())
            } else {
                Err(format!(
                    "Réponse inattendue de SteamGridDB (code {}).",
                    response.status().as_u16()
                ))
            }
        }
        "igdb" => {
            let client_id = api_keys
                .get("igdbClientId")
                .ok_or_else(|| "Aucun Client ID Twitch n'est enregistré.".to_string())?;
            let client_secret = api_keys
                .get("igdbClientSecret")
                .ok_or_else(|| "Aucun Client Secret Twitch n'est enregistré.".to_string())?;
            let response = client
                .post("https://id.twitch.tv/oauth2/token")
                .form(&[
                    ("client_id", client_id.as_str()),
                    ("client_secret", client_secret.as_str()),
                    ("grant_type", "client_credentials"),
                ])
                .send()
                .await
                .map_err(|error| {
                    if error.is_timeout() {
                        "Twitch a expiré.".to_string()
                    } else {
                        "Twitch est actuellement inaccessible.".to_string()
                    }
                })?;
            if response.status().is_success() {
                Ok("Connexion OK : le Client Twitch est accepté (IGDB).".into())
            } else {
                Err(format!(
                    "Client Twitch refusé par IGDB (code {}). Vérifiez le Client ID et le Client Secret.",
                    response.status().as_u16()
                ))
            }
        }
        "gamebanana" => {
            let response = client
                .get("https://api.gamebanana.com/Core/List/Like?itemtype=Game&field=name&like=test&limit=1")
                .send()
                .await
                .map_err(|error| {
                    if error.is_timeout() {
                        "GameBanana a expiré.".to_string()
                    } else {
                        "GameBanana est actuellement inaccessible.".to_string()
                    }
                })?;
            if response.status().is_success() {
                Ok("Connexion OK : l'API publique GameBanana répond sans clé.".into())
            } else {
                Err(format!(
                    "Réponse inattendue de GameBanana (code {}).",
                    response.status().as_u16()
                ))
            }
        }
        _ => Err("Ce fournisseur d'illustrations ne propose pas de test de connexion.".into()),
    }
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResourceCleanupResult {
    removed: usize,
    freed_bytes: u64,
}

/// Préfixes des fichiers d'artwork dans `games/<id>/resources/` (locaux et
/// téléchargés, anciens `*-remote-*` et nouveaux `*-{hash}.*`). Tout le reste
/// est ignoré — défense en profondeur, on ne supprime jamais un fichier
/// inconnu.
const ARTWORK_CACHE_PREFIXES: [&str; 7] = [
    "cover-",
    "logo-",
    "icon-",
    "background-",
    "banner-",
    "hero-",
    "video-",
];

fn is_artwork_cache_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    ARTWORK_CACHE_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        && name.contains('.')
}

/// Normalisation d'un chemin pour la comparaison d'ensemble (Windows : cas
/// insensible, séparateurs unifiés).
fn resource_cleanup_fingerprint(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

/// §10 « Nettoyage automatique » : supprime les fichiers d'artwork orphelins
/// dans `games/<id>/resources/` — ceux qui ne sont référencés par aucun jeu du
/// store (anciennes URLs remplacées, legacy `*-remote-*`).
///
/// Gardes de sécurité :
/// - référentiel vide → ne JAMAIS supprimer quoi que ce soit (le store peut ne
///   pas être hydraté au démarrage) ;
/// - uniquement les fichiers au motif d'artwork connu ;
/// - jamais un fichier modifié dans la dernière heure (écriture en cours ou
///   référence non encore persistée).
#[tauri::command]
fn cleanup_orphaned_game_resources(
    app: AppHandle,
    referenced_paths: Vec<String>,
) -> Result<ResourceCleanupResult, String> {
    if referenced_paths.is_empty() {
        return Ok(ResourceCleanupResult {
            removed: 0,
            freed_bytes: 0,
        });
    }
    let referenced: HashSet<String> = referenced_paths
        .iter()
        .map(|path| resource_cleanup_fingerprint(Path::new(path)))
        .collect();
    let result = cleanup_orphaned_resources_in(
        &update_data_root(&app)?.join("games"),
        &referenced,
        unix_timestamp(),
    );
    Ok(result)
}

/// Cœur pur du nettoyage (testable sans AppHandle).
fn cleanup_orphaned_resources_in(
    games_root: &Path,
    referenced: &HashSet<String>,
    now: u64,
) -> ResourceCleanupResult {
    let mut removed = 0usize;
    let mut freed_bytes = 0u64;
    let Ok(games) = fs::read_dir(games_root) else {
        return ResourceCleanupResult {
            removed,
            freed_bytes,
        };
    };
    for game_entry in games.flatten() {
        let resources_dir = game_entry.path().join("resources");
        if !resources_dir.is_dir() {
            continue;
        }
        let Ok(files) = fs::read_dir(&resources_dir) else {
            continue;
        };
        for file_entry in files.flatten() {
            let path = file_entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            if !is_artwork_cache_file(name) {
                continue;
            }
            let metadata = match fs::metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            if now.saturating_sub(modified) < 3600 {
                continue;
            }
            if referenced.contains(&resource_cleanup_fingerprint(&path)) {
                continue;
            }
            freed_bytes += metadata.len();
            if fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    ResourceCleanupResult {
        removed,
        freed_bytes,
    }
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

/// Résout une URL YouTube vers un fichier vidéo LOCAL (spec « Fix vidéo YouTube
/// de l'Accueil ») : yt-dlp télécharge la meilleure vidéo MP4 + vignette dans
/// `media/backgrounds/`, puis ZAILON lit le fichier local (hors-ligne, jamais
/// re-téléchargé à chaque lancement). Si `yt-dlp` n'est pas installé, renvoie
/// un statut explicite (`ytdlp_missing`) — jamais d'erreur opaque — et l'UI
/// bascule sur le lecteur embarqué.
#[derive(serde::Serialize)]
struct ResolvedBackgroundVideo {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    video_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

fn truncate_message(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        trimmed.to_string()
    } else {
        let head: String = trimmed.chars().take(max).collect();
        format!("{head}…")
    }
}

#[tauri::command]
fn resolve_youtube_video(
    app: AppHandle,
    url: String,
    video_id: String,
) -> Result<ResolvedBackgroundVideo, String> {
    // Identifiant sanitisé : jamais utilisé tel quel dans un chemin disque.
    if video_id.is_empty()
        || video_id.len() > 24
        || !video_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid YouTube video id.".into());
    }
    let cache_dir = update_data_root(&app)?.join("media").join("backgrounds");
    fs::create_dir_all(&cache_dir).map_err(to_error)?;
    let template = cache_dir.join(format!("video_{video_id}.%(ext)s"));
    // `b[ext=mp4]` d'abord : un seul flux MP4 déjà complet (audio+vidéo) évite
    // de dépendre de ffmpeg pour le merge ; les formats suivants servent de repli.
    let spawned = Command::new("yt-dlp")
        .arg("-f")
        .arg("b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b")
        .arg("--merge-output-format")
        .arg("mp4")
        .arg("--write-thumbnail")
        .arg("--convert-thumbnails")
        .arg("jpg")
        .arg("--no-playlist")
        .arg("--no-progress")
        .arg("-o")
        .arg(&template)
        .arg(&url)
        .output();
    let output = match spawned {
        Ok(out) => out,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ResolvedBackgroundVideo {
                status: "ytdlp_missing".into(),
                video_path: None,
                thumbnail_path: None,
                size_bytes: None,
                message: Some(
                    "yt-dlp is not installed. Install it (https://github.com/yt-dlp/yt-dlp) or the video will play via the embedded player."
                        .into(),
                ),
            });
        }
        Err(err) => return Err(to_error(err)),
    };
    if !output.status.success() {
        return Ok(ResolvedBackgroundVideo {
            status: "failed".into(),
            video_path: None,
            thumbnail_path: None,
            size_bytes: None,
            message: Some(truncate_message(
                &String::from_utf8_lossy(&output.stderr),
                400,
            )),
        });
    }
    let video_path = cache_dir.join(format!("video_{video_id}.mp4"));
    if !video_path.exists() {
        return Err("yt-dlp finished but no MP4 was produced.".into());
    }
    let thumbnail_path = ["jpg", "webp", "png"]
        .iter()
        .map(|ext| cache_dir.join(format!("video_{video_id}.{ext}")))
        .find(|path| path.exists());
    let size_bytes = fs::metadata(&video_path).map(|meta| meta.len()).ok();
    Ok(ResolvedBackgroundVideo {
        status: "cached".into(),
        video_path: Some(video_path.to_string_lossy().to_string()),
        thumbnail_path: thumbnail_path.map(|path| path.to_string_lossy().to_string()),
        size_bytes,
        message: None,
    })
}

/// Entrée du cache des fonds vidéo (spec « Gestion du cache ») — inventaire
/// RÉEL des fichiers `video_<id>.mp4` dans `media/backgrounds/` (le disque est
/// la source de vérité, jamais un manifeste deviné).
#[derive(serde::Serialize)]
struct CachedBackgroundMediaEntry {
    video_id: String,
    video_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail_path: Option<String>,
    size_bytes: u64,
    cached_at: u64,
}

fn sanitize_background_video_id(video_id: &str) -> bool {
    !video_id.is_empty()
        && video_id.len() <= 24
        && video_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[tauri::command]
fn list_cached_background_media(app: AppHandle) -> Result<Vec<CachedBackgroundMediaEntry>, String> {
    let cache_dir = update_data_root(&app)?.join("media").join("backgrounds");
    if !cache_dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&cache_dir)
        .map_err(to_error)?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        // Format stable : `video_<id>.mp4` — la vignette réelle est
        // `video_<id>.jpg|webp|png` (écrite par yt-dlp).
        let Some(video_id) = name
            .strip_prefix("video_")
            .and_then(|rest| rest.strip_suffix(".mp4"))
        else {
            continue;
        };
        if !sanitize_background_video_id(video_id) {
            continue;
        }
        let meta = fs::metadata(&path).map_err(to_error)?;
        if !meta.is_file() {
            continue;
        }
        let cached_at = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        let thumbnail_path = ["jpg", "webp", "png"]
            .iter()
            .map(|ext| cache_dir.join(format!("video_{video_id}.{ext}")))
            .find(|thumb| thumb.exists());
        entries.push(CachedBackgroundMediaEntry {
            video_id: video_id.to_string(),
            video_path: path.to_string_lossy().to_string(),
            thumbnail_path: thumbnail_path.map(|thumb| thumb.to_string_lossy().to_string()),
            size_bytes: meta.len(),
            cached_at,
        });
    }
    entries.sort_by(|left, right| right.cached_at.cmp(&left.cached_at));
    Ok(entries)
}

/// Supprime une vidéo + sa vignette (jamais d'écriture hors du dossier cache,
/// identifiant sanitisé avant tout accès disque).
#[tauri::command]
fn remove_cached_background_media(app: AppHandle, video_id: String) -> Result<bool, String> {
    if !sanitize_background_video_id(&video_id) {
        return Err("Invalid YouTube video id.".into());
    }
    let cache_dir = update_data_root(&app)?.join("media").join("backgrounds");
    let video = cache_dir.join(format!("video_{video_id}.mp4"));
    let mut removed = false;
    if video.exists() {
        fs::remove_file(&video).map_err(to_error)?;
        removed = true;
    }
    for ext in ["jpg", "webp", "png"] {
        let thumb = cache_dir.join(format!("video_{video_id}.{ext}"));
        if thumb.exists() {
            fs::remove_file(&thumb).map_err(to_error)?;
            removed = true;
        }
    }
    Ok(removed)
}

/// Vide le cache des fonds vidéo (vidéos + vignettes), retourne le nombre de
/// fichiers supprimés.
#[tauri::command]
fn clear_cached_background_media(app: AppHandle) -> Result<u32, String> {
    let cache_dir = update_data_root(&app)?.join("media").join("backgrounds");
    if !cache_dir.exists() {
        return Ok(0);
    }
    let mut removed = 0u32;
    for entry in fs::read_dir(&cache_dir)
        .map_err(to_error)?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !path.is_file() || !(name.starts_with("video_") || name.starts_with("thumbnail_")) {
            continue;
        }
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
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
    let mut hasher = Sha256::new();
    if path.is_file() {
        if let Ok(hash) = file_sha256(path) {
            hasher.update(hash.as_bytes());
        }
    } else {
        let mut files = WalkDir::new(path)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
            .filter_map(|entry| {
                let relative = entry.path().strip_prefix(path).ok()?.to_path_buf();
                Some((relative, entry.path().to_path_buf()))
            })
            .collect::<Vec<_>>();
        files.sort_by(|left, right| {
            left.0
                .to_string_lossy()
                .to_ascii_lowercase()
                .cmp(&right.0.to_string_lossy().to_ascii_lowercase())
        });
        for (relative, physical) in files {
            hasher.update(
                relative
                    .to_string_lossy()
                    .replace('\\', "/")
                    .to_ascii_lowercase()
                    .as_bytes(),
            );
            hasher.update([0]);
            if let Ok(hash) = file_sha256(&physical) {
                hasher.update(hash.as_bytes());
            }
            hasher.update([0]);
        }
    }
    format!("{:x}", hasher.finalize())
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
    let fingerprint = fingerprint_path(path);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    NativeMod {
        id: fingerprint.clone(),
        name: normalized_name(path),
        path: path.to_string_lossy().to_string(),
        enabled: !file_name.starts_with("DISABLED_"),
        mod_type: mod_type(path),
        size_bytes: entry_size(path),
        files,
        fingerprint,
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
            Some(
                "zip"
                    | "7z"
                    | "rar"
                    | "pak"
                    | "archive"
                    | "esp"
                    | "esm"
                    | "esl"
                    | "dll"
                    | "asi"
                    | "reds"
            )
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
                Some("pak" | "archive" | "esp" | "esm" | "esl" | "dll" | "asi" | "ini" | "reds")
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
                Some("pak" | "archive" | "esp" | "esm" | "esl" | "dll" | "asi" | "reds")
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

/// Spec « Import Cyberpunk façon MO2 » §23-27 : destination jeu d'un fichier
/// relatif à la racine d'un paquet. Chaque fichier est mappé à sa racine la
/// plus spécifique ; les conteneurs inutiles (nom du mod, « Cyberpunk 2077 »…)
/// sont supprimés — le nom du dossier n'est JAMAIS une partie du chemin jeu.
/// `None` = aucune racine Cyberpunk déterministe (l'appelant décide).
fn cyberpunk_map_file(relative: &Path) -> Option<PathBuf> {
    let parts = relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    let lower = parts
        .iter()
        .map(|part| part.to_ascii_lowercase())
        .collect::<Vec<_>>();
    const ROOTS: [&str; 9] = [
        "archive", "r6", "red4ext", "bin", "mods", "tools", "engine", "plugins", "config",
    ];
    // `plugins` en tête → red4ext/plugins (mods RED4ext ; `bin/x64/plugins`
    // reste sous `bin/…` grâce à la boucle qui matche `bin` d'abord).
    if lower[0] == "plugins" {
        let mut destination = PathBuf::from("red4ext").join("plugins");
        for part in &parts[1..] {
            destination.push(part);
        }
        return Some(destination);
    }
    if ROOTS.contains(&lower[0].as_str()) {
        return Some(relative.to_path_buf());
    }
    // Conteneurs inutiles en tête → chercher la première racine connue en
    // profondeur (un framework multi-racines comme TweakXL fournit r6/tweaks
    // ET red4ext/plugins sous le même dossier racine).
    for (index, segment) in lower.iter().enumerate().skip(1) {
        if ROOTS.contains(&segment.as_str()) {
            let mut destination = PathBuf::new();
            if segment == "plugins" {
                destination.push("red4ext");
            }
            for part in &parts[index..] {
                destination.push(part);
            }
            return Some(destination);
        }
    }
    None
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

/// Extrait le temps de jeu Steam (minutes) par AppID depuis `localconfig.vdf`
/// (format KeyValues VDF) : `UserLocalConfigStore > Software > Valve > Steam >
/// apps > <appid> > PlaytimeForever`. Le temps est en MINUTES dans ce fichier —
/// jamais en heures. Pur et sans I/O : testable en unitaire.
#[cfg(desktop)]
fn parse_steam_localconfig_playtime(text: &str) -> HashMap<u32, u64> {
    let mut result = HashMap::new();
    let Ok(parsed) = keyvalues_parser::parse(text) else {
        return result;
    };
    // La clé racine « UserLocalConfigStore » est portée par `parsed.key` —
    // `parsed.value` est DÉJÀ l'objet racine (Software/Valve/Steam/...).
    let Some(root) = parsed.value.get_obj() else {
        return result;
    };
    let Some(software) = root
        .0
        .get("Software")
        .and_then(|values| values.first())
        .and_then(|value| value.get_obj())
    else {
        return result;
    };
    let Some(valve) = software
        .0
        .get("Valve")
        .and_then(|values| values.first())
        .and_then(|value| value.get_obj())
    else {
        return result;
    };
    let Some(steam) = valve
        .0
        .get("Steam")
        .and_then(|values| values.first())
        .and_then(|value| value.get_obj())
    else {
        return result;
    };
    let Some(apps) = steam
        .0
        .get("apps")
        .and_then(|values| values.first())
        .and_then(|value| value.get_obj())
    else {
        return result;
    };
    for (appid, values) in &apps.0 {
        let Ok(appid) = appid.as_ref().parse::<u32>() else {
            continue;
        };
        let Some(entry) = values.first().and_then(|value| value.get_obj()) else {
            continue;
        };
        let Some(playtime) = entry
            .0
            .get("PlaytimeForever")
            .and_then(|values| values.first())
            .and_then(|value| value.get_str())
        else {
            continue;
        };
        let Ok(minutes) = playtime.trim().parse::<u64>() else {
            continue;
        };
        result
            .entry(appid)
            .and_modify(|current| *current = (*current).max(minutes))
            .or_insert(minutes);
    }
    result
}

/// Temps de jeu Steam par AppID (minutes) lu depuis les `localconfig.vdf` de
/// TOUS les comptes `userdata/<id>/config/`. Plusieurs comptes : on conserve le
/// MAXIMUM par AppID — jamais de double comptage. Lecture seule, aucune
/// écriture dans les fichiers Steam.
#[cfg(desktop)]
#[tauri::command]
fn steam_playtime(steam_path: Option<String>) -> Result<HashMap<String, u64>, String> {
    let steam = steam_installation(steam_path)?;
    let userdata = steam.path().join("userdata");
    if !userdata.is_dir() {
        return Ok(HashMap::new());
    }
    let mut merged: HashMap<u32, u64> = HashMap::new();
    for entry in fs::read_dir(&userdata).map_err(to_error)? {
        let Ok(entry) = entry else { continue };
        if !entry.path().is_dir() {
            continue;
        }
        let config = entry.path().join("config").join("localconfig.vdf");
        if !config.is_file() {
            continue;
        }
        let Ok(text) = fs::read_to_string(&config) else {
            continue;
        };
        for (appid, minutes) in parse_steam_localconfig_playtime(&text) {
            merged
                .entry(appid)
                .and_modify(|current| *current = (*current).max(minutes))
                .or_insert(minutes);
        }
    }
    Ok(merged
        .into_iter()
        .map(|(appid, minutes)| (appid.to_string(), minutes))
        .collect())
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

/// Empreinte LÉGÈRE d'un dossier Mods (spec §37-38 « cache mods intelligent »)
/// : uniquement des métadonnées (nom + taille + mtime de chaque entrée, nombre
/// d'entrées) — JAMAIS de lecture de contenu. Comparée à l'empreinte précédente,
/// elle permet de réutiliser un scan déjà fait quand rien n'a changé, au lieu de
/// re-parcourir chaque mod à chaque ouverture. Un renommage (toggle
/// `DISABLED_*`), un ajout ou une suppression change le résultat.
#[tauri::command]
fn mods_folder_fingerprint(mods_path: String) -> Result<String, String> {
    let folder = PathBuf::from(mods_path);
    if !folder.exists() {
        return Ok(String::new());
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut count: u64 = 0;
    for entry in fs::read_dir(&folder)
        .map_err(to_error)?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        count += 1;
        name.hash(&mut hasher);
        if let Ok(meta) = fs::metadata(&path) {
            meta.len().hash(&mut hasher);
            if let Ok(modified) = meta.modified() {
                if let Ok(since_epoch) = modified.duration_since(UNIX_EPOCH) {
                    since_epoch.as_nanos().hash(&mut hasher);
                }
            }
        }
    }
    count.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
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
fn scan_game_presence(
    requests: Vec<process_scanner::GamePresenceRequest>,
) -> Vec<process_scanner::GamePresence> {
    process_scanner::scan_requests(&requests)
}

#[tauri::command]
fn steam_running_state(app_ids: Vec<u32>) -> steam_presence::SteamRunningState {
    steam_presence::steam_running_state(&app_ids)
}

#[tauri::command]
fn scan_game_windows(
    requests: Vec<window_watcher::GameWindowRequest>,
) -> Vec<window_watcher::GameWindowMatch> {
    window_watcher::scan_requests(&requests)
}

/// Vrai si la fenêtre au premier plan est en plein écran exclusif (le mode
/// d'affichage a quitté la résolution du bureau). Utilisé par le Quick Game
/// Panel : en exclusif, une fenêtre ZAILON ne peut pas s'afficher au-dessus du
/// jeu — on montre le message « Utiliser Borderless » au lieu d'ouvrir le
/// panneau. Heuristique documentée (spec #41).
#[tauri::command]
fn exclusive_fullscreen_active() -> bool {
    window_watcher::exclusive_fullscreen_active()
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

fn report_deployment_progress(
    channel: &Channel<DeploymentProgressEvent>,
    phase: &str,
    current: usize,
    total: usize,
    message: String,
) {
    let _ = channel.send(DeploymentProgressEvent {
        phase: phase.into(),
        current,
        total,
        message,
    });
}

fn update_deployment_session_state(
    session: &DeploymentSession,
    status: &str,
    process_id: Option<u32>,
) -> Result<(), String> {
    let path = session.session_root.join("session.json");
    let mut state = fs::read(&path)
        .ok()
        .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())
        .unwrap_or_else(|| {
            serde_json::json!({
                "schemaVersion": 3,
                "createdAt": unix_timestamp(),
                "gameRoot": session.game_root.to_string_lossy(),
                "overwriteRoot": session.overwrite_root.to_string_lossy()
            })
        });
    state["status"] = serde_json::json!(status);
    state["updatedAt"] = serde_json::json!(unix_timestamp());
    state["processId"] = process_id
        .map(serde_json::Value::from)
        .unwrap_or(serde_json::Value::Null);
    write_json_atomic(&path, &state)
}

fn append_deployment_journal(
    session: &DeploymentSession,
    entry: &DeploymentEntry,
) -> Result<(), String> {
    let path = session.session_root.join("journal.jsonl");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(to_error)?;
    let payload = serde_json::to_string(&serde_json::json!({
        "relative": entry.relative.to_string_lossy().replace('\\', "/"),
        "hadOriginal": entry.had_original,
        "deployedSignature": entry.deployed_signature,
        "recordedAt": unix_timestamp()
    }))
    .map_err(to_error)?;
    writeln!(file, "{payload}").map_err(to_error)?;
    file.sync_data().map_err(to_error)
}

fn deployment_journal_entries(path: &Path) -> Result<Vec<DeploymentEntry>, String> {
    let payload = fs::read_to_string(path).map_err(to_error)?;
    let mut entries = Vec::new();
    for line in payload.lines().filter(|line| !line.trim().is_empty()) {
        let value: serde_json::Value = serde_json::from_str(line).map_err(to_error)?;
        let relative = PathBuf::from(
            value
                .get("relative")
                .and_then(|item| item.as_str())
                .ok_or_else(|| "Entrée de journal sans chemin.".to_string())?,
        );
        validate_archive_relative(&relative)?;
        entries.push(DeploymentEntry {
            relative,
            had_original: value
                .get("hadOriginal")
                .and_then(|item| item.as_bool())
                .unwrap_or(false),
            deployed_signature: value
                .get("deployedSignature")
                .and_then(|item| item.as_u64())
                .ok_or_else(|| "Entrée de journal sans signature.".to_string())?,
        });
    }
    Ok(entries)
}

fn process_is_running(process_id: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        let filter = format!("PID eq {process_id}");
        return Command::new("tasklist")
            .args(["/FI", &filter, "/FO", "CSV", "/NH"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .split(',')
                    .nth(1)
                    .map(|value| {
                        value.trim_matches(['"', ' ', '\r', '\n']) == process_id.to_string()
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false);
    }
    #[cfg(target_os = "linux")]
    {
        return Path::new("/proc").join(process_id.to_string()).exists();
    }
    #[cfg(target_os = "macos")]
    {
        return Command::new("kill")
            .args(["-0", &process_id.to_string()])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
}

fn recover_deployment_session(session_root: &Path, game_root: &Path) -> Result<usize, String> {
    let state_path = session_root.join("session.json");
    let payload = fs::read(&state_path).map_err(to_error)?;
    let mut state: serde_json::Value = serde_json::from_slice(&payload).map_err(to_error)?;
    let recorded_root = state
        .get("gameRoot")
        .and_then(|value| value.as_str())
        .map(PathBuf::from)
        .and_then(|path| fs::canonicalize(path).ok())
        .ok_or_else(|| "Une session interrompue possède une racine de jeu invalide.".to_string())?;
    if recorded_root != game_root {
        return Err(
            "Une session interrompue vise une autre racine de jeu ; récupération automatique refusée."
                .into(),
        );
    }
    let journal = session_root.join("journal.jsonl");
    let entries = if journal.is_file() {
        deployment_journal_entries(&journal)?
    } else {
        Vec::new()
    };
    let backup_root = session_root.join("backup");
    for item in entries.iter().rev() {
        let destination = game_root.join(&item.relative);
        if !destination.starts_with(game_root) {
            return Err("Un chemin de récupération sort de la racine du jeu.".into());
        }
        if item.had_original {
            let backup = backup_root.join(&item.relative);
            if !backup.is_file() {
                return Err(format!(
                    "Sauvegarde manquante pour la session interrompue : {}.",
                    item.relative.display()
                ));
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            fs::copy(backup, destination).map_err(to_error)?;
        } else if destination.is_file() && file_signature(&destination)? == item.deployed_signature
        {
            fs::remove_file(destination).map_err(to_error)?;
        }
    }
    state["status"] = serde_json::json!("recovered");
    state["updatedAt"] = serde_json::json!(unix_timestamp());
    state["recoveredAt"] = serde_json::json!(unix_timestamp());
    state["recoveredEntries"] = serde_json::json!(entries.len());
    write_json_atomic(&state_path, &state)?;
    Ok(entries.len())
}

fn recover_interrupted_preparations(
    app: &AppHandle,
    game_id: &str,
    game_root: &Path,
) -> Result<usize, String> {
    let deployments = update_data_root(app)?
        .join("games")
        .join(safe_game_id(game_id)?)
        .join("deployments");
    let mut recovered = 0usize;
    for entry in fs::read_dir(&deployments)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
    {
        let session_root = entry.path();
        let state_path = session_root.join("session.json");
        let Ok(payload) = fs::read(&state_path) else {
            continue;
        };
        let state: serde_json::Value = serde_json::from_slice(&payload).map_err(to_error)?;
        let status = state
            .get("status")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let recoverable = matches!(
            status,
            "preparing" | "prepared" | "cleaning" | "recovery-required"
        );
        if status == "active" {
            let process_id = state
                .get("processId")
                .and_then(|value| value.as_u64())
                .and_then(|value| u32::try_from(value).ok());
            if process_id.is_some_and(process_is_running) {
                return Err(
                    "Une session de jeu ZAILON est encore active. Fermez le jeu avant de relancer."
                        .into(),
                );
            }
        } else if !recoverable {
            continue;
        }
        recover_deployment_session(&session_root, game_root)?;
        recovered += 1;
    }
    Ok(recovered)
}

/// Restaure TOUT déploiement temporaire restant d'un jeu (fin de session
/// explicite, appelé par le frontend quand une session se termine). Pour un jeu
/// lancé via un launcher intermédiaire, le déploiement reste en place après la
/// fermeture du launcher (`launch_game` avec `launcher_based`) — c'est ici
/// qu'il est restauré, jamais au moment où le launcher quitte. Les sessions
/// encore « active » avec un processus vivant sont laissées intactes (le jeu
/// tourne). Retourne le nombre de sessions restaurées.
#[tauri::command]
fn restore_deployment_session(
    app: AppHandle,
    game_id: String,
    game_root: String,
) -> Result<usize, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let game_root = fs::canonicalize(PathBuf::from(&game_root))
        .map_err(|_| "Le dossier d’installation du jeu est introuvable.".to_string())?;
    let deployments = update_data_root(&app)?
        .join("games")
        .join(&game_id)
        .join("deployments");
    let mut restored = 0usize;
    for entry in fs::read_dir(&deployments)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
    {
        let session_root = entry.path();
        let state_path = session_root.join("session.json");
        let Ok(payload) = fs::read(&state_path) else {
            continue;
        };
        let Ok(state) = serde_json::from_slice::<serde_json::Value>(&payload) else {
            continue;
        };
        let status = state
            .get("status")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        if status == "active" {
            let process_id = state
                .get("processId")
                .and_then(|value| value.as_u64())
                .and_then(|value| u32::try_from(value).ok());
            if process_id.is_some_and(process_is_running) {
                continue;
            }
        }
        if recover_deployment_session(&session_root, &game_root).is_ok() {
            restored += 1;
        }
    }
    Ok(restored)
}

fn finish_temporary_copy(
    session: DeploymentSession,
    capture_overwrite: bool,
) -> Result<(), String> {
    let _ = update_deployment_session_state(&session, "cleaning", None);
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
    if errors.is_empty() {
        if let Err(error) = fs::remove_dir_all(&session.session_root) {
            if session.session_root.exists() {
                errors.push(format!("Nettoyage de la session impossible : {error}"));
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        let _ = update_deployment_session_state(&session, "recovery-required", None);
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

fn prepare_profile_deployment(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
    game_root: &Path,
    enabled_mod_ids: &[String],
    conflict_rules: &[LaunchConflictRule],
    on_event: &Channel<DeploymentProgressEvent>,
) -> Result<PreparedDeployment, String> {
    safe_game_id(game_id)?;
    safe_game_id(profile_id)?;
    report_deployment_progress(
        on_event,
        "indexing",
        0,
        enabled_mod_ids.len(),
        format!("Analyse de {} mod(s) actif(s)…", enabled_mod_ids.len()),
    );
    let game_root = fs::canonicalize(game_root)
        .map_err(|_| "Le dossier d’installation du jeu est introuvable.".to_string())?;
    let virtual_map = build_virtual_profile_map(
        app,
        game_id,
        profile_id,
        enabled_mod_ids,
        conflict_rules,
        true,
    )?;
    let broken = virtual_map
        .packages
        .iter()
        .filter(|package| !package.deployable)
        .collect::<Vec<_>>();
    if !broken.is_empty() {
        let examples = broken
            .iter()
            .take(4)
            .map(|package| format!("{} ({})", package.package_id, package.errors.join(" ")))
            .collect::<Vec<_>>();
        return Err(format!(
            "Préparation bloquée : {} référence(s) de paquet ne sont pas déployables. {} Utilisez « Réparer l’import MO2 et le déploiement ».",
            broken.len(),
            examples.join(" · ")
        ));
    }
    if !enabled_mod_ids.is_empty() && virtual_map.entries.is_empty() {
        return Err(format!(
            "Préparation bloquée : le profil contient {} mod(s) actif(s), mais 0 fichier déployable a été produit.",
            enabled_mod_ids.len()
        ));
    }
    let mut diagnostics = framework_diagnostics(
        &game_root,
        &virtual_map
            .entries
            .iter()
            .map(|entry| PathBuf::from(&entry.game_relative_path))
            .collect::<Vec<_>>(),
    )?;
    diagnostics.extend(virtual_map.diagnostics.clone());
    diagnostics.push(format!(
        "Table virtuelle construite : {} fichier(s), {} paquet(s), {} framework(s) fournisseur(s).",
        virtual_map.entries.len(),
        virtual_map.packages.len(),
        virtual_map.providers.len()
    ));
    diagnostics.push(format!(
        "{} conflit(s) résolu(s) selon l’ordre du profil et ses règles explicites.",
        virtual_map.conflicts
    ));
    if virtual_map.entries.is_empty() {
        report_deployment_progress(
            on_event,
            "ready",
            0,
            0,
            "Aucun fichier temporaire à déployer.".into(),
        );
        return Ok(PreparedDeployment {
            session: None,
            deployed_files: 0,
            conflicts_resolved: virtual_map.conflicts as usize,
            diagnostics,
        });
    }
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
    update_deployment_session_state(&session, "preparing", None)?;
    report_deployment_progress(
        on_event,
        "copying",
        0,
        virtual_map.entries.len(),
        format!(
            "Préparation de {} fichier(s) sans bloquer l’interface…",
            virtual_map.entries.len()
        ),
    );
    let result = (|| {
        let mut resolved_manifest = Vec::new();
        for (index, entry) in virtual_map.entries.iter().enumerate() {
            let source = PathBuf::from(&entry.source_physical_path);
            if !source.is_file() {
                return Err(format!(
                    "Le fichier source du paquet {} est introuvable : {}.",
                    entry.package_id, entry.game_relative_path
                ));
            }
            let relative = PathBuf::from(&entry.game_relative_path);
            validate_archive_relative(&relative)?;
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
            let deployment_entry = DeploymentEntry {
                relative: relative.clone(),
                had_original,
                deployed_signature: source_signature,
            };
            append_deployment_journal(&session, &deployment_entry)?;
            session.entries.push(deployment_entry);
            fs::copy(&source, &destination).map_err(to_error)?;
            if file_signature(&destination)? != source_signature {
                return Err(format!(
                    "Vérification RuntimeVisible échouée pour {}.",
                    relative.display()
                ));
            }
            resolved_manifest.push(serde_json::json!({
                "path": entry.game_relative_path,
                "winnerModId": entry.package_id,
                "sourcePhysicalPath": entry.source_physical_path,
                "hash": entry.hash,
                "runtimeVisible": true
            }));
            let completed = index + 1;
            if completed == virtual_map.entries.len() || completed % 10 == 0 {
                report_deployment_progress(
                    on_event,
                    "copying",
                    completed,
                    virtual_map.entries.len(),
                    format!(
                        "Préparation des mods : {completed}/{} fichier(s)…",
                        virtual_map.entries.len()
                    ),
                );
            }
        }
        write_json_atomic(
            &session_root.join("resolved-files.json"),
            &serde_json::json!({
                "schemaVersion": 2,
                "profileId": profile_id,
                "backend": "TemporaryCopy",
                "plannedFiles": virtual_map.entries.len(),
                "deployedFiles": session.entries.len(),
                "files": resolved_manifest
            }),
        )?;
        update_deployment_session_state(&session, "prepared", None)
    })();
    if let Err(error) = result {
        let _ = finish_temporary_copy(session, false);
        return Err(error);
    }
    if session.entries.len() != virtual_map.entries.len() {
        let planned = virtual_map.entries.len();
        let deployed = session.entries.len();
        let _ = finish_temporary_copy(session, false);
        return Err(format!(
            "Déploiement incomplet : {planned} fichier(s) planifié(s), {deployed} déployé(s)."
        ));
    }
    report_deployment_progress(
        on_event,
        "ready",
        session.entries.len(),
        virtual_map.entries.len(),
        format!(
            "{} fichier(s) vérifié(s). Démarrage du jeu…",
            session.entries.len()
        ),
    );
    Ok(PreparedDeployment {
        deployed_files: session.entries.len(),
        conflicts_resolved: virtual_map.conflicts as usize,
        diagnostics,
        session: Some(session),
    })
}

#[tauri::command]
async fn launch_game(
    app: AppHandle,
    visual_state: State<'_, visual_profiles::VisualRuntime>,
    exec_path: String,
    game_id: String,
    game_name: String,
    game_root: String,
    profile_id: String,
    profile_name: String,
    active_mods: usize,
    enabled_mod_ids: Vec<String>,
    conflict_rules: Vec<LaunchConflictRule>,
    launcher_based: bool,
    on_event: Channel<DeploymentProgressEvent>,
) -> Result<LaunchGameResult, String> {
    let visual_runtime = visual_state.inner().clone();
    let preparation_app = app.clone();
    let preparation_game_id = game_id.clone();
    let preparation_profile_id = profile_id.clone();
    let preparation_enabled_mod_ids = enabled_mod_ids.clone();
    let preparation = tauri::async_runtime::spawn_blocking(move || {
        let executable = fs::canonicalize(PathBuf::from(exec_path))
            .map_err(|_| "L’exécutable du jeu est introuvable.".to_string())?;
        if !executable.is_file() {
            return Err("L’exécutable du jeu est introuvable.".into());
        }
        let game_root_path = fs::canonicalize(PathBuf::from(game_root))
            .map_err(|_| "Le dossier d’installation du jeu est introuvable.".to_string())?;
        if !executable.starts_with(&game_root_path) {
            return Err("L’exécutable ne se trouve pas dans le dossier d’installation configuré. Corrigez le chemin du jeu avant le lancement.".into());
        }
        report_deployment_progress(
            &on_event,
            "recovery",
            0,
            0,
            "Vérification des préparations précédentes…".into(),
        );
        let recovered = recover_interrupted_preparations(
            &preparation_app,
            &preparation_game_id,
            &game_root_path,
        )?;
        let mut prepared = prepare_profile_deployment(
            &preparation_app,
            &preparation_game_id,
            &preparation_profile_id,
            &game_root_path,
            &preparation_enabled_mod_ids,
            &conflict_rules,
            &on_event,
        )?;
        if recovered > 0 {
            prepared.diagnostics.insert(
                0,
                format!(
                    "{recovered} préparation(s) interrompue(s) restaurée(s) automatiquement."
                ),
            );
        }
        Ok::<_, String>((executable, prepared))
    })
    .await
    .map_err(|_| "La tâche de préparation des mods s’est interrompue.".to_string())?;
    let (executable, mut prepared) = match preparation {
        Ok(prepared) => prepared,
        Err(error) => {
            set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "failed");
            return Err(error);
        }
    };
    let associated_visual_applied = match visual_profiles::apply_associated_profile(
        &app,
        &visual_runtime,
        &game_id,
        &profile_id,
    ) {
        Ok(Some(result)) => {
            prepared.diagnostics.push(format!(
                "Profil visuel {} appliqué via {}.",
                result.profile_id, result.backend_id
            ));
            result.applied
        }
        Ok(None) => false,
        Err(error) => {
            prepared
                .diagnostics
                .push(format!("Profil visuel non appliqué : {error}"));
            false
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
            if associated_visual_applied {
                visual_profiles::restore_for_shutdown(&app, &visual_runtime);
            }
            set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "failed");
            return Err(to_error(error));
        }
    };
    set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "runtime-visible");
    let pid = child.id();
    if let Some(session) = prepared.session.as_ref() {
        if let Err(error) = update_deployment_session_state(session, "active", Some(pid)) {
            let session = prepared.session.take().expect("session checked above");
            let _ = child.kill();
            let _ = child.wait();
            let cleanup_error = finish_temporary_copy(session, false).err();
            if associated_visual_applied {
                visual_profiles::restore_for_shutdown(&app, &visual_runtime);
            }
            set_staged_deployment_status(&app, &game_id, &enabled_mod_ids, "failed");
            return Err(match cleanup_error {
                Some(cleanup) => format!(
                    "Impossible de sécuriser la session de lancement : {error} Restauration incomplète : {cleanup}"
                ),
                None => format!("Impossible de sécuriser la session de lancement : {error}"),
            });
        }
    }
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
    let worker_game_name = game_name.clone();
    let worker_app_for_cleanup = app.clone();
    let worker_game_id = game_id.clone();
    let worker_profile_id = profile_id.clone();
    let worker_enabled_mod_ids = enabled_mod_ids.clone();
    let worker_visual_runtime = visual_runtime.clone();
    let deployment_session = prepared.session;
    let worker_launcher_based = launcher_based;
    std::thread::spawn(move || {
        let exit_code = child.wait().ok().and_then(|status| status.code());
        // Jeu lancé via un launcher intermédiaire (NTE, Steam…) : le processus
        // enfant EST le launcher — sa fermeture ne doit JAMAIS démonter le
        // déploiement (le vrai jeu démarre encore). La session passe en
        // « prepared » (récupérable) et le déploiement est restauré à la fin
        // réelle de la session par `restore_deployment_session` (ou par la
        // récupération du lancement suivant). C'est la correction racine du
        // « déploiement démonté quand le launcher intermédiaire ferme ».
        let cleanup_error = if worker_launcher_based {
            if let Some(session) = deployment_session.as_ref() {
                let _ = update_deployment_session_state(session, "prepared", None);
            }
            None
        } else {
            deployment_session.and_then(|session| finish_temporary_copy(session, true).err())
        };
        set_staged_deployment_status(
            &worker_app_for_cleanup,
            &worker_game_id,
            &worker_enabled_mod_ids,
            if worker_launcher_based {
                "runtime-visible"
            } else if cleanup_error.is_some() {
                "failed"
            } else {
                "enabled"
            },
        );
        if associated_visual_applied {
            visual_profiles::restore_for_shutdown(&worker_app_for_cleanup, &worker_visual_runtime);
        }
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

fn normalized_cyberpunk_game_relative(relative: &Path) -> PathBuf {
    cyberpunk_repair_target(relative).unwrap_or_else(|| relative.to_path_buf())
}

fn normalized_tree_paths(root: &Path) -> HashSet<String> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            let relative = entry.path().strip_prefix(root).ok()?;
            Some(deployment_key(&normalized_cyberpunk_game_relative(
                relative,
            )))
        })
        .collect()
}

fn cyberpunk_framework_providers_from_paths(paths: &HashSet<String>) -> HashSet<String> {
    let has = |path: &str| paths.contains(path);
    let mut providers = HashSet::new();
    if has("engine/tools/scc.exe")
        && has("engine/tools/scc_lib.dll")
        && has("engine/config/base/scripts.ini")
        && has("r6/config/cybercmd/scc.toml")
    {
        providers.insert("redscript".into());
    }
    if has("red4ext/red4ext.dll") && has("bin/x64/winmm.dll") {
        providers.insert("red4ext".into());
    }
    if has("bin/x64/plugins/cyber_engine_tweaks.asi")
        && (has("bin/x64/version.dll") || has("bin/x64/winmm.dll"))
    {
        providers.insert("cyber-engine-tweaks".into());
    }
    providers
}

fn detect_cyberpunk_framework_providers(root: &Path) -> HashSet<String> {
    cyberpunk_framework_providers_from_paths(&normalized_tree_paths(root))
}

fn framework_provider_allows_sensitive(providers: &HashSet<String>, destination: &Path) -> bool {
    let destination = deployment_key(destination);
    (providers.contains("redscript")
        && matches!(
            destination.as_str(),
            "engine/tools/scc.exe" | "engine/tools/scc_lib.dll"
        ))
        || (providers.contains("red4ext")
            && matches!(
                destination.as_str(),
                "red4ext/red4ext.dll" | "bin/x64/winmm.dll"
            ))
        || (providers.contains("cyber-engine-tweaks")
            && matches!(
                destination.as_str(),
                "bin/x64/plugins/cyber_engine_tweaks.asi"
                    | "bin/x64/version.dll"
                    | "bin/x64/winmm.dll"
            ))
}

fn framework_runtime_targets(providers: &HashSet<String>) -> Vec<PathBuf> {
    let mut targets = Vec::new();
    if providers.contains("redscript") {
        targets.extend([
            PathBuf::from("engine/tools/scc.exe"),
            PathBuf::from("engine/tools/scc_lib.dll"),
        ]);
    }
    if providers.contains("red4ext") {
        targets.extend([
            PathBuf::from("red4ext/red4ext.dll"),
            PathBuf::from("bin/x64/winmm.dll"),
        ]);
    }
    if providers.contains("cyber-engine-tweaks") {
        targets.push(PathBuf::from("bin/x64/plugins/cyber_engine_tweaks.asi"));
        targets.push(PathBuf::from("bin/x64/version.dll"));
        targets.push(PathBuf::from("bin/x64/winmm.dll"));
    }
    targets.sort();
    targets.dedup();
    targets
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
    framework_providers: HashSet<String>,
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
    if !assessment.may_deploy
        && framework_provider_allows_sensitive(&context.framework_providers, relative_destination)
    {
        assessment.expected_by_manifest = true;
        assessment.expected_by_game_adapter = true;
        assessment.may_deploy = true;
        assessment.recommended_action = "include-framework-runtime".into();
        assessment.reasons.push(
            "Fichier runtime confirmé par plusieurs signatures du framework dans le même paquet."
                .into(),
        );
    }
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

fn cyberpunk_package_root(source: &Path) -> PathBuf {
    let unwrapped = unwrap_package_root(source);
    if !unwrapped.is_dir() {
        return unwrapped;
    }
    for wrapper in ["root", "game", "cyberpunk 2077"] {
        let Some(candidate) = case_insensitive_relative(&unwrapped, wrapper) else {
            continue;
        };
        if candidate.parent() == Some(unwrapped.as_path())
            && candidate.is_dir()
            && contains_game_root_layout(&candidate)
        {
            return unwrap_package_root(&candidate);
        }
    }
    unwrapped
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
        if cyberpunk {
            cyberpunk_package_root(source)
        } else {
            unwrap_package_root(source)
        }
    } else {
        source.to_path_buf()
    };
    if cyberpunk {
        security.framework_providers = detect_cyberpunk_framework_providers(&root);
    }
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
            // Spec §23-27 : résolution par FICHIER pour les paquets multi-racines.
            // Un framework fournit souvent plusieurs racines (TweakXL → r6/tweaks
            // + red4ext/plugins) ; une destination globale unique empilait le
            // contenu restant au mauvais endroit (→ « TweakXL requis » alors
            // qu'il est présent). Les fragments propres (ex. r6/scripts/foo)
            // conservent leur destination globale — le mapping par fichier ne
            // s'applique que quand les sous-contenus divergent.
            let single = cyberpunk_relative_destination(&root);
            let mut sub_destinations = HashSet::new();
            if let Ok(entries) = fs::read_dir(&root) {
                for entry in entries.filter_map(Result::ok) {
                    if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    if let Some(destination) = cyberpunk_map_file(&PathBuf::from(entry.file_name()))
                    {
                        sub_destinations.insert(destination);
                    }
                }
            }
            let multi_root =
                sub_destinations.len() > 1 || (single.is_none() && !sub_destinations.is_empty());
            if multi_root {
                let root_name = safe_archive_component(
                    root.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("mod"),
                );
                let mut mapped = 0usize;
                for entry in WalkDir::new(&root)
                    .follow_links(false)
                    .into_iter()
                    .map(|entry| entry.map_err(to_error))
                {
                    if cancel.load(Ordering::Relaxed) {
                        return Err("TASK_CANCELLED".into());
                    }
                    let entry = entry?;
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    let relative = entry
                        .path()
                        .strip_prefix(&root)
                        .map_err(to_error)?
                        .to_path_buf();
                    validate_archive_relative(&relative)?;
                    let destination = cyberpunk_map_file(&relative).unwrap_or_else(|| {
                        let extension = relative
                            .extension()
                            .and_then(|value| value.to_str())
                            .unwrap_or_default()
                            .to_ascii_lowercase();
                        if extension == "archive" {
                            PathBuf::from("archive/pc/mod").join(&relative)
                        } else if extension == "reds" {
                            PathBuf::from("r6/scripts").join(&relative)
                        } else {
                            PathBuf::from("mods").join(&root_name).join(&relative)
                        }
                    });
                    validate_archive_relative(&destination)?;
                    copy_sensitive_aware_file(entry.path(), &content.join(&destination), security)?;
                    mapped += 1;
                }
                layout = "CyberpunkMappedByFile".to_string();
                diagnostics.push(format!(
                    "Racines Cyberpunk reconstruites fichier par fichier : {} fichier(s) mappés, conteneurs inutiles supprimés.",
                    mapped
                ));
            } else if let Some(relative) = single {
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

fn staged_storage_roots(app: &AppHandle, game_id: &str) -> Result<Vec<PathBuf>, String> {
    let root = staged_mods_root(app, game_id)?;
    Ok(vec![
        root.clone(),
        root.parent()
            .map(|parent| parent.join("mods"))
            .unwrap_or_default(),
    ])
}

fn staged_package_directory(app: &AppHandle, game_id: &str, package_id: &str) -> Option<PathBuf> {
    if safe_game_id(package_id).is_err() {
        return None;
    }
    staged_storage_roots(app, game_id)
        .ok()?
        .into_iter()
        .map(|root| root.join(package_id))
        .find(|path| path.is_dir())
}

fn manager_metadata_file(relative: &Path) -> bool {
    if relative.components().count() != 1 {
        return false;
    }
    matches!(
        relative
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some(
            "meta.ini"
                | "modlist.txt"
                | "archives.txt"
                | "lockedorder.txt"
                | "settings.ini"
                | "usersettings.json"
        )
    )
}

fn framework_providers_from_entries(
    package_id: &str,
    entries: &[PackageFileEntry],
    enabled: bool,
    runtime_visible: bool,
) -> Vec<FrameworkProviderStatus> {
    let paths = entries
        .iter()
        .filter(|entry| entry.deployable)
        .map(|entry| entry.game_relative_path.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    let mut providers = Vec::new();
    let mut push = |framework_id: String, files: Vec<String>| {
        providers.push(FrameworkProviderStatus {
            framework_id,
            package_id: package_id.into(),
            files,
            enabled,
            runtime_visible,
        });
    };
    // Cores compilés : présence exacte des fichiers attendus (spec §38-39).
    let redscript_core = [
        "engine/tools/scc.exe",
        "engine/tools/scc_lib.dll",
        "engine/config/base/scripts.ini",
        "r6/config/cybercmd/scc.toml",
    ];
    if redscript_core.iter().all(|path| paths.contains(*path)) {
        push(
            "redscript".into(),
            redscript_core
                .iter()
                .map(|path| (*path).to_string())
                .collect(),
        );
    }
    if paths.contains("red4ext/red4ext.dll") && paths.contains("bin/x64/winmm.dll") {
        push(
            "RED4ext".into(),
            vec!["red4ext/red4ext.dll".into(), "bin/x64/winmm.dll".into()],
        );
    }
    if paths.contains("bin/x64/plugins/cyber_engine_tweaks.asi")
        && (paths.contains("bin/x64/version.dll") || paths.contains("bin/x64/winmm.dll"))
    {
        let loader = if paths.contains("bin/x64/version.dll") {
            "bin/x64/version.dll"
        } else {
            "bin/x64/winmm.dll"
        };
        push(
            "Cyber Engine Tweaks".into(),
            vec![
                "bin/x64/plugins/cyber_engine_tweaks.asi".into(),
                loader.into(),
            ],
        );
    }
    // Frameworks RED4ext natifs (spec §28) : dossier canonique OU signature de
    // fichier — jamais par nom de dossier seul (spec §31).
    for (framework_id, prefix, signatures) in [
        (
            "TweakXL",
            "red4ext/plugins/tweakxl/",
            &["tweakxl.dll", "tweak_xl.dll"] as &[&str],
        ),
        (
            "ArchiveXL",
            "red4ext/plugins/archivexl/",
            &["archivexl.dll"] as &[&str],
        ),
        (
            "Codeware",
            "red4ext/plugins/codeware/",
            &["codeware.dll"] as &[&str],
        ),
    ] {
        let mut files: Vec<String> = paths
            .iter()
            .filter(|path| path.starts_with(prefix))
            .cloned()
            .collect();
        let has_folder = !files.is_empty();
        let mut signature_hits: Vec<String> = paths
            .iter()
            .filter(|path| {
                signatures
                    .iter()
                    .any(|signature| path.ends_with(&format!("/{signature}")) || path == signature)
            })
            .cloned()
            .collect();
        if !has_folder && signature_hits.is_empty() {
            continue;
        }
        files.append(&mut signature_hits);
        files.sort();
        files.dedup();
        push(framework_id.into(), files);
    }
    providers
}

fn copy_verified_framework_runtime(
    source: &Path,
    destination: &Path,
    expected_hash: &str,
) -> Result<bool, String> {
    if !source.is_file() {
        return Ok(false);
    }
    let source_hash = file_sha256(source)?;
    if !source_hash.eq_ignore_ascii_case(expected_hash) {
        return Err(format!(
            "Le runtime {} ne correspond plus à son empreinte validée.",
            source.to_string_lossy()
        ));
    }
    if destination.is_file() {
        if file_sha256(destination)?.eq_ignore_ascii_case(expected_hash) {
            return Ok(false);
        }
        return Err(format!(
            "Un runtime différent existe déjà dans le paquet : {}.",
            destination.to_string_lossy()
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Destination de récupération invalide.".to_string())?;
    fs::create_dir_all(parent).map_err(to_error)?;
    let temporary = parent.join(format!(
        ".zailon-runtime-recovery-{}-{}",
        unix_timestamp(),
        std::process::id()
    ));
    fs::copy(source, &temporary).map_err(to_error)?;
    if !file_sha256(&temporary)?.eq_ignore_ascii_case(expected_hash) {
        let _ = fs::remove_file(&temporary);
        return Err("La copie temporaire du runtime a échoué à la vérification SHA-256.".into());
    }
    fs::rename(&temporary, destination).map_err(to_error)?;
    Ok(true)
}

fn record_framework_runtime_recovery(
    stage: &Path,
    recovered: &[String],
    decision: &str,
    detail: &str,
) -> Result<(), String> {
    if recovered.is_empty() {
        return Ok(());
    }
    let manifest_path = stage.join("manifest.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?).map_err(to_error)?;
    let recovered_keys = recovered
        .iter()
        .map(|path| path.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    if let Some(assessments) = manifest
        .get_mut("sensitiveFiles")
        .and_then(|value| value.as_array_mut())
    {
        for assessment in assessments {
            let Some(relative) = assessment
                .get("relativePath")
                .and_then(|value| value.as_str())
            else {
                continue;
            };
            let normalized =
                deployment_key(&normalized_cyberpunk_game_relative(Path::new(relative)));
            if recovered_keys.contains(&normalized) {
                assessment["decision"] = serde_json::json!(decision);
                assessment["mayDeploy"] = serde_json::json!(true);
                assessment["expectedByManifest"] = serde_json::json!(true);
                assessment["expectedByGameAdapter"] = serde_json::json!(true);
            }
        }
    }
    let mut diagnostics = manifest
        .get("diagnostics")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    diagnostics.push(serde_json::json!(detail));
    manifest["diagnostics"] = serde_json::Value::Array(diagnostics);
    manifest["recoveredFrameworkRuntimes"] = serde_json::json!(recovered);
    manifest["lastFrameworkRuntimeRecoveryAt"] = serde_json::json!(unix_timestamp());
    write_json_atomic(&manifest_path, &manifest)
}

fn repair_reused_framework_package_from_source(
    stage: &Path,
    source: &Path,
    game_name: &str,
) -> Result<Vec<String>, String> {
    if !game_name.to_ascii_lowercase().contains("cyberpunk") || !source.is_dir() {
        return Ok(Vec::new());
    }
    let source_root = cyberpunk_package_root(source);
    let providers = detect_cyberpunk_framework_providers(&source_root);
    if providers.is_empty() {
        return Ok(Vec::new());
    }
    let content = stage.join("content");
    let mut recovered = Vec::new();
    for target in framework_runtime_targets(&providers) {
        let relative = target.to_string_lossy().replace('\\', "/");
        let Some(source_file) = case_insensitive_relative(&source_root, &relative) else {
            continue;
        };
        if !source_file.is_file() || !framework_provider_allows_sensitive(&providers, &target) {
            continue;
        }
        let hash = file_sha256(&source_file)?;
        if copy_verified_framework_runtime(&source_file, &content.join(&target), &hash)? {
            recovered.push(relative);
        }
    }
    record_framework_runtime_recovery(
        stage,
        &recovered,
        "restored-from-verified-source",
        "Paquet déjà présent réparé depuis la source sélectionnée : runtimes confirmés par plusieurs signatures, copiés sans exécution.",
    )?;
    Ok(recovered)
}

fn recover_framework_runtimes_from_quarantine(
    stage: &Path,
    quarantine_root: &Path,
) -> Result<Vec<String>, String> {
    let manifest_path = stage.join("manifest.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?).map_err(to_error)?;
    let Some(assessment_values) = manifest
        .get("sensitiveFiles")
        .and_then(|value| value.as_array())
    else {
        return Ok(Vec::new());
    };
    let assessments = assessment_values
        .iter()
        .filter_map(|value| serde_json::from_value::<SensitiveFileAssessment>(value.clone()).ok())
        .filter(|assessment| assessment.decision.as_deref() == Some("quarantined"))
        .collect::<Vec<_>>();
    if assessments.is_empty() || !quarantine_root.is_dir() {
        return Ok(Vec::new());
    }
    let allowed_root = fs::canonicalize(quarantine_root).map_err(to_error)?;
    let quarantine_paths = manifest
        .get("quarantinePaths")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|value| value.as_str().map(PathBuf::from))
        .collect::<Vec<_>>();
    let content = stage.join("content");
    let mut all_paths = normalized_tree_paths(&content);
    let mut candidates = Vec::<(PathBuf, PathBuf, String)>::new();
    for assessment in assessments {
        let normalized = normalized_cyberpunk_game_relative(Path::new(&assessment.relative_path));
        let assessment_key = deployment_key(Path::new(&assessment.relative_path));
        let Some(source) = quarantine_paths.iter().find_map(|path| {
            let canonical = fs::canonicalize(path).ok()?;
            if !canonical.starts_with(&allowed_root)
                || !deployment_key(&canonical).ends_with(&assessment_key)
            {
                return None;
            }
            file_sha256(&canonical)
                .ok()
                .is_some_and(|hash| hash.eq_ignore_ascii_case(&assessment.hash))
                .then_some(canonical)
        }) else {
            continue;
        };
        all_paths.insert(deployment_key(&normalized));
        candidates.push((source, normalized, assessment.hash));
    }
    let providers = cyberpunk_framework_providers_from_paths(&all_paths);
    if providers.is_empty() {
        return Ok(Vec::new());
    }
    let mut recovered = Vec::new();
    for (source, target, hash) in candidates {
        if !framework_provider_allows_sensitive(&providers, &target) {
            continue;
        }
        if copy_verified_framework_runtime(&source, &content.join(&target), &hash)? {
            recovered.push(target.to_string_lossy().replace('\\', "/"));
        }
    }
    record_framework_runtime_recovery(
        stage,
        &recovered,
        "restored-from-verified-quarantine",
        "Migration automatique : runtimes restaurés depuis la quarantaine après validation du chemin, du SHA-256 et des signatures complètes du framework. Aucun fichier n’a été exécuté.",
    )?;
    Ok(recovered)
}

fn package_manifest_entries(
    stage: &Path,
    game_id: &str,
    persist: bool,
) -> Result<(Vec<PackageFileEntry>, Vec<FrameworkProviderStatus>), String> {
    let package_id = stage
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Identifiant de paquet stocké invalide.".to_string())?;
    safe_game_id(package_id)?;
    let content = stage.join("content");
    if !content.is_dir() {
        return Err("Le paquet physique ne contient aucun dossier content.".into());
    }
    let mut entries = Vec::new();
    for item in WalkDir::new(&content)
        .follow_links(false)
        .into_iter()
        .map(|entry| entry.map_err(to_error))
    {
        let item = item?;
        if item.file_type().is_symlink() {
            return Err("Un lien symbolique empêche la construction du manifeste.".into());
        }
        if !item.file_type().is_file() {
            continue;
        }
        let relative = item.path().strip_prefix(&content).map_err(to_error)?;
        validate_archive_relative(relative)?;
        let normalized = normalized_cyberpunk_game_relative(relative);
        validate_archive_relative(&normalized)?;
        let hidden = relative
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.to_ascii_lowercase().ends_with(".mohidden"));
        let deployable = !hidden && !manager_metadata_file(relative);
        entries.push(PackageFileEntry {
            source_physical_path: item.path().to_string_lossy().to_string(),
            package_relative_path: relative.to_string_lossy().replace('\\', "/"),
            game_relative_path: normalized.to_string_lossy().replace('\\', "/"),
            hash: file_sha256(item.path())?,
            size: item.metadata().map_err(to_error)?.len(),
            deployable,
        });
    }
    entries.sort_by(|left, right| {
        left.game_relative_path
            .to_ascii_lowercase()
            .cmp(&right.game_relative_path.to_ascii_lowercase())
    });
    let content_hash = package_entries_content_hash(&entries);
    let providers = framework_providers_from_entries(package_id, &entries, true, false);
    if persist {
        let package_manifest_path = stage.join("package-manifest.json");
        write_json_atomic(
            &package_manifest_path,
            &serde_json::json!({
                "schemaVersion": 2,
                "packageId": package_id,
                "gameId": game_id,
                "contentHash": content_hash.clone(),
                "storage": {
                    "type": "InternalStore",
                    "path": stage,
                    "accessible": true,
                    "writable": true,
                    "sourceApplication": "ZAILON"
                },
                "files": entries,
                "providers": providers,
                "generatedAt": unix_timestamp()
            }),
        )?;
        let manifest_path = stage.join("manifest.json");
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?)
                .map_err(to_error)?;
        manifest["packageManifestPath"] =
            serde_json::json!(package_manifest_path.to_string_lossy());
        manifest["contentHash"] = serde_json::json!(content_hash.clone());
        if manifest.get("sourceFingerprint").is_none() {
            let source_fingerprint = manifest
                .get("fingerprint")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            manifest["sourceFingerprint"] = source_fingerprint;
        }
        let version_id = manifest
            .get("version")
            .filter(|value| value.is_string())
            .cloned()
            .unwrap_or_else(|| serde_json::json!(content_hash.clone()));
        manifest["versionId"] = version_id;
        manifest["normalized"] = serde_json::json!(true);
        manifest["deployableFiles"] =
            serde_json::json!(entries.iter().filter(|entry| entry.deployable).count());
        manifest["contentFiles"] = serde_json::json!(entries
            .iter()
            .map(|entry| entry.package_relative_path.clone())
            .collect::<Vec<_>>());
        manifest["pipelineStatus"] = serde_json::json!("Normalized");
        manifest["providedFrameworks"] = serde_json::json!(providers
            .iter()
            .map(|provider| provider.framework_id.clone())
            .collect::<Vec<_>>());
        write_json_atomic(&manifest_path, &manifest)?;
    }
    Ok((entries, providers))
}

fn package_entries_content_hash(entries: &[PackageFileEntry]) -> String {
    let mut content_hasher = Sha256::new();
    for entry in entries.iter().filter(|entry| entry.deployable) {
        content_hasher.update(entry.game_relative_path.to_ascii_lowercase().as_bytes());
        content_hasher.update([0]);
        content_hasher.update(entry.hash.as_bytes());
        content_hasher.update([0]);
    }
    format!("{:x}", content_hasher.finalize())
}

#[derive(Debug, Clone, Default)]
struct ProfilePackageIdentity {
    version_id: Option<String>,
    content_hash: Option<String>,
}

fn profile_package_identities(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
) -> HashMap<String, ProfilePackageIdentity> {
    let Ok(path) = profile_directory(app, game_id, profile_id) else {
        return HashMap::new();
    };
    let Ok(payload) = fs::read(path.join("profile.json")) else {
        return HashMap::new();
    };
    let Ok(profile) = serde_json::from_slice::<serde_json::Value>(&payload) else {
        return HashMap::new();
    };
    profile
        .get("modStates")
        .and_then(|value| value.as_object())
        .into_iter()
        .flatten()
        .map(|(state_id, state)| {
            let package_id = state
                .get("packageId")
                .and_then(|value| value.as_str())
                .unwrap_or(state_id)
                .to_string();
            (
                package_id,
                ProfilePackageIdentity {
                    version_id: state
                        .get("versionId")
                        .and_then(|value| value.as_str())
                        .map(ToOwned::to_owned),
                    content_hash: state
                        .get("contentHash")
                        .and_then(|value| value.as_str())
                        .map(ToOwned::to_owned),
                },
            )
        })
        .collect()
}

fn profile_hidden_rules(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
) -> HashSet<(String, String)> {
    let Ok(path) = profile_directory(app, game_id, profile_id) else {
        return HashSet::new();
    };
    let Ok(payload) = fs::read(path.join("profile.json")) else {
        return HashSet::new();
    };
    let Ok(profile) = serde_json::from_slice::<serde_json::Value>(&payload) else {
        return HashSet::new();
    };
    profile
        .get("hiddenFileRules")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|rule| {
            Some((
                rule.get("modId")?.as_str()?.to_string(),
                rule.get("path")?
                    .as_str()?
                    .replace('\\', "/")
                    .to_ascii_lowercase(),
            ))
        })
        .collect()
}

fn build_virtual_profile_map(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
    enabled_mod_ids: &[String],
    conflict_rules: &[LaunchConflictRule],
    persist_manifests: bool,
) -> Result<VirtualProfileMap, String> {
    safe_game_id(game_id)?;
    safe_game_id(profile_id)?;
    let hidden = profile_hidden_rules(app, game_id, profile_id);
    let expected_identities = profile_package_identities(app, game_id, profile_id);
    let rules = conflict_rules
        .iter()
        .map(|rule| {
            (
                rule.path.replace('\\', "/").to_ascii_lowercase(),
                rule.winner_mod_id.as_str(),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut owners = HashMap::<String, Vec<(String, PackageFileEntry)>>::new();
    let mut packages = Vec::new();
    let mut all_providers = Vec::new();
    let mut diagnostics = Vec::new();
    for package_id in enabled_mod_ids {
        let expected_identity = expected_identities
            .get(package_id)
            .cloned()
            .unwrap_or_default();
        let mut status = PackageReferenceStatus {
            profile_id: profile_id.into(),
            package_id: package_id.clone(),
            package_directory: String::new(),
            exists: false,
            manifest_exists: false,
            files_exist: false,
            source_still_available: false,
            normalized: false,
            deployable: false,
            file_count: 0,
            version_id: None,
            content_hash: None,
            expected_version_id: expected_identity.version_id,
            expected_content_hash: expected_identity.content_hash,
            identity_matches: true,
            errors: Vec::new(),
        };
        let Some(stage) = staged_package_directory(app, game_id, package_id) else {
            status
                .errors
                .push("Le dossier physique du paquet est introuvable.".into());
            packages.push(status);
            continue;
        };
        status.package_directory = stage.to_string_lossy().to_string();
        status.exists = true;
        status.source_still_available = stage.join("content").is_dir();
        status.manifest_exists =
            stage.join("manifest.json").is_file() && stage.join("package-manifest.json").is_file();
        if let Ok(payload) = fs::read(stage.join("manifest.json")) {
            if let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&payload) {
                status.version_id = manifest
                    .get("versionId")
                    .or_else(|| manifest.get("version"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned);
                status.content_hash = manifest
                    .get("contentHash")
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned);
            }
        }
        if persist_manifests {
            let quarantine_root = update_data_root(app)?.join("quarantine");
            let recovered = recover_framework_runtimes_from_quarantine(&stage, &quarantine_root)?;
            if !recovered.is_empty() {
                diagnostics.push(format!(
                    "{} : {} runtime(s) de framework restauré(s) depuis la quarantaine vérifiée.",
                    package_id,
                    recovered.len()
                ));
            }
        }
        match package_manifest_entries(&stage, game_id, persist_manifests) {
            Ok((entries, providers)) => {
                let calculated_content_hash = package_entries_content_hash(&entries);
                status.content_hash = Some(calculated_content_hash.clone());
                if status.version_id.is_none() {
                    status.version_id = Some(calculated_content_hash.clone());
                }
                let version_matches = status
                    .expected_version_id
                    .as_ref()
                    .map_or(true, |expected| {
                        status.version_id.as_ref() == Some(expected)
                    });
                let hash_matches = status
                    .expected_content_hash
                    .as_ref()
                    .map_or(true, |expected| {
                        expected.eq_ignore_ascii_case(&calculated_content_hash)
                    });
                status.identity_matches = version_matches && hash_matches;
                status.files_exist = !entries.is_empty();
                status.file_count = entries.iter().filter(|entry| entry.deployable).count() as u64;
                status.normalized = entries.iter().all(|entry| {
                    !entry
                        .game_relative_path
                        .to_ascii_lowercase()
                        .starts_with("root/")
                });
                status.deployable =
                    status.file_count > 0 && status.normalized && status.identity_matches;
                if persist_manifests {
                    status.manifest_exists = true;
                }
                if status.file_count == 0 {
                    status
                        .errors
                        .push("Le manifeste ne contient aucun fichier déployable.".into());
                }
                if !status.normalized {
                    status
                        .errors
                        .push("Un chemin de jeu conserve un préfixe de stockage.".into());
                }
                if !status.identity_matches {
                    status.errors.push(
                        "La version physique ne correspond pas à la référence immuable du profil."
                            .into(),
                    );
                }
                all_providers.extend(providers);
                for entry in entries.into_iter().filter(|entry| entry.deployable) {
                    let key = entry.game_relative_path.to_ascii_lowercase();
                    if hidden.contains(&(package_id.clone(), key.clone())) {
                        continue;
                    }
                    owners
                        .entry(key)
                        .or_default()
                        .push((package_id.clone(), entry));
                }
            }
            Err(error) => status.errors.push(error),
        }
        packages.push(status);
    }
    let mut entries = Vec::new();
    let mut conflicts = 0u64;
    for (path, candidates) in owners {
        if candidates.len() > 1 {
            conflicts += 1;
        }
        let explicit_winner = rules.get(&path).copied();
        let winner = explicit_winner
            .and_then(|winner_id| candidates.iter().find(|candidate| candidate.0 == winner_id))
            .unwrap_or_else(|| candidates.last().expect("non-empty virtual candidates"));
        let overridden_package_ids = candidates
            .iter()
            .filter(|candidate| candidate.0 != winner.0)
            .map(|candidate| candidate.0.clone())
            .collect::<Vec<_>>();
        entries.push(VirtualFileMapEntry {
            game_relative_path: winner.1.game_relative_path.clone(),
            package_id: winner.0.clone(),
            source_physical_path: winner.1.source_physical_path.clone(),
            hash: winner.1.hash.clone(),
            size: winner.1.size,
            overridden_package_ids,
            winner_reason: if explicit_winner.is_some() {
                "Règle explicite du profil".into()
            } else if candidates.len() > 1 {
                "Priorité la plus élevée dans le profil".into()
            } else {
                "Seul fournisseur du fichier".into()
            },
        });
    }
    entries.sort_by(|left, right| {
        left.game_relative_path
            .to_ascii_lowercase()
            .cmp(&right.game_relative_path.to_ascii_lowercase())
    });
    let winning_paths = entries
        .iter()
        .map(|entry| entry.game_relative_path.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    all_providers.retain(|provider| {
        provider.files.iter().all(|path| {
            winning_paths.contains(&path.to_ascii_lowercase())
                && entries.iter().any(|entry| {
                    entry.package_id == provider.package_id
                        && entry.game_relative_path.eq_ignore_ascii_case(path)
                })
        })
    });
    all_providers.sort_by(|left, right| left.framework_id.cmp(&right.framework_id));
    all_providers.dedup_by(|left, right| {
        left.framework_id == right.framework_id && left.package_id == right.package_id
    });
    if !enabled_mod_ids.is_empty() && entries.is_empty() {
        diagnostics.push(format!(
            "Le profil contient {} mod(s) actif(s), mais 0 fichier déployable a été produit.",
            enabled_mod_ids.len()
        ));
    }
    let broken = packages
        .iter()
        .filter(|package| !package.deployable)
        .count();
    if broken > 0 {
        diagnostics.push(format!(
            "{broken} référence(s) de paquet sont absentes, vides ou non normalisées."
        ));
    }
    Ok(VirtualProfileMap {
        entries,
        packages,
        providers: all_providers,
        conflicts,
        diagnostics,
    })
}

fn reconcile_staged_profile_reference(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
    states: &serde_json::Value,
) -> Result<(), String> {
    safe_game_id(profile_id)?;
    let referenced = states
        .as_object()
        .map(|items| {
            items
                .iter()
                .map(|(state_id, state)| {
                    state
                        .get("packageId")
                        .and_then(|value| value.as_str())
                        .unwrap_or(state_id)
                })
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();
    for root in staged_storage_roots(app, game_id)? {
        for entry in fs::read_dir(root)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
        {
            let manifest_path = entry.path().join("manifest.json");
            let Ok(payload) = fs::read(&manifest_path) else {
                continue;
            };
            let Ok(mut manifest) = serde_json::from_slice::<serde_json::Value>(&payload) else {
                continue;
            };
            let stage_id = entry.file_name().to_string_lossy().to_string();
            if safe_game_id(&stage_id).is_err() {
                continue;
            }
            let mut profiles = manifest
                .get("profiles")
                .and_then(|value| value.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                        .filter(|id| id != profile_id)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if referenced.contains(stage_id.as_str()) {
                profiles.push(profile_id.to_string());
            }
            profiles.sort();
            profiles.dedup();
            let profiles_value = serde_json::json!(profiles);
            if manifest.get("profiles") != Some(&profiles_value) {
                manifest["profiles"] = profiles_value;
                write_json_atomic(&manifest_path, &manifest)?;
            }
        }
    }
    Ok(())
}

fn staged_package_by_fingerprint(root: &Path, fingerprint: &str) -> Option<PathBuf> {
    fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .find_map(|entry| {
            let manifest_path = entry.path().join("manifest.json");
            let manifest = fs::read(&manifest_path)
                .ok()
                .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())?;
            ["sourceFingerprint", "fingerprint", "contentHash"]
                .into_iter()
                .any(|key| manifest.get(key).and_then(|value| value.as_str()) == Some(fingerprint))
                .then(|| entry.path())
        })
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
        fingerprint: text("contentHash")
            .or_else(|| text("fingerprint"))
            .unwrap_or(inspected.fingerprint),
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
        .filter_map(|entry| {
            let stage = entry.path();
            let has_content_identity = fs::read(stage.join("manifest.json"))
                .ok()
                .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())
                .and_then(|manifest| {
                    manifest
                        .get("contentHash")
                        .and_then(|value| value.as_str())
                        .map(|value| !value.is_empty())
                })
                .unwrap_or(false);
            if !has_content_identity && package_manifest_entries(&stage, &game_id, true).is_err() {
                return None;
            }
            staged_native_mod(&stage).ok()
        })
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

#[derive(Debug, Clone)]
struct StagedPackageDigest {
    id: String,
    name: String,
    path: PathBuf,
    fingerprint: String,
    content_digest: String,
    size_bytes: u64,
    primary: bool,
}

#[derive(Debug, Clone)]
struct StagedDuplicatePlanGroup {
    canonical: StagedPackageDigest,
    duplicates: Vec<StagedPackageDigest>,
}

fn content_tree_sha256(root: &Path) -> Result<String, String> {
    if !root.is_dir() {
        return Err("Stored mod content is missing.".into());
    }
    let mut files = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .map(|entry| entry.map_err(to_error))
        .filter_map(|entry| match entry {
            Ok(entry) if entry.file_type().is_symlink() => Some(Err(
                "A symbolic link prevents exact duplicate verification.".into(),
            )),
            Ok(entry) if entry.file_type().is_file() => Some(Ok(entry.path().to_path_buf())),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<Result<Vec<_>, String>>()?;
    files.sort_by_key(|path| {
        path.strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase()
    });
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    for path in files {
        let relative = path.strip_prefix(root).map_err(to_error)?;
        validate_archive_relative(relative)?;
        let normalized = relative.to_string_lossy().replace('\\', "/");
        hasher.update((normalized.len() as u64).to_le_bytes());
        hasher.update(normalized.as_bytes());
        hasher.update(fs::metadata(&path).map_err(to_error)?.len().to_le_bytes());
        let mut file = fs::File::open(&path).map_err(to_error)?;
        loop {
            let read = file.read(&mut buffer).map_err(to_error)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn staged_duplicate_plan(
    app: &AppHandle,
    game_id: &str,
) -> Result<(u64, Vec<StagedDuplicatePlanGroup>), String> {
    let game_id = safe_game_id(game_id)?;
    let primary_root = staged_mods_root(app, game_id)?;
    let mut packages_scanned = 0u64;
    let mut candidates: HashMap<String, Vec<(String, String, PathBuf, u64, bool)>> = HashMap::new();
    for root in staged_storage_roots(app, game_id)? {
        for entry in fs::read_dir(&root)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
        {
            let path = entry.path();
            let manifest_path = path.join("manifest.json");
            let content = path.join("content");
            if !manifest_path.is_file() || !content.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            if safe_game_id(&id).is_err() {
                continue;
            }
            let manifest = fs::read(&manifest_path)
                .ok()
                .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())
                .unwrap_or_else(|| serde_json::json!({}));
            let fingerprint = manifest
                .get("fingerprint")
                .and_then(|value| value.as_str())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| fingerprint_path(&content));
            let name = manifest
                .get("name")
                .and_then(|value| value.as_str())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| id.clone());
            packages_scanned += 1;
            candidates.entry(fingerprint).or_default().push((
                id,
                name,
                path.clone(),
                entry_size(&path),
                path.starts_with(&primary_root),
            ));
        }
    }
    let mut groups = Vec::new();
    for (fingerprint, entries) in candidates {
        if entries.len() < 2 {
            continue;
        }
        let mut exact: HashMap<String, Vec<StagedPackageDigest>> = HashMap::new();
        for (id, name, path, size_bytes, primary) in entries {
            let content_digest = content_tree_sha256(&path.join("content"))?;
            exact
                .entry(content_digest.clone())
                .or_default()
                .push(StagedPackageDigest {
                    id,
                    name,
                    path,
                    fingerprint: fingerprint.clone(),
                    content_digest,
                    size_bytes,
                    primary,
                });
        }
        for mut packages in exact.into_values().filter(|items| items.len() > 1) {
            packages.sort_by(|left, right| {
                right
                    .primary
                    .cmp(&left.primary)
                    .then_with(|| left.id.cmp(&right.id))
                    .then_with(|| left.path.cmp(&right.path))
            });
            let canonical = packages.remove(0);
            groups.push(StagedDuplicatePlanGroup {
                canonical,
                duplicates: packages,
            });
        }
    }
    groups.sort_by(|left, right| {
        left.canonical
            .name
            .to_ascii_lowercase()
            .cmp(&right.canonical.name.to_ascii_lowercase())
    });
    Ok((packages_scanned, groups))
}

fn staged_duplicate_preview_inner(
    app: &AppHandle,
    game_id: &str,
) -> Result<StagedDuplicatePreview, String> {
    let game_id = safe_game_id(game_id)?.to_string();
    let (packages_scanned, groups) = staged_duplicate_plan(app, &game_id)?;
    let duplicate_packages = groups
        .iter()
        .map(|group| group.duplicates.len() as u64)
        .sum();
    let reclaimable_bytes = groups
        .iter()
        .flat_map(|group| &group.duplicates)
        .map(|package| package.size_bytes)
        .sum();
    Ok(StagedDuplicatePreview {
        game_id,
        packages_scanned,
        duplicate_packages,
        reclaimable_bytes,
        groups: groups
            .into_iter()
            .map(|group| {
                let reclaimable_bytes = group
                    .duplicates
                    .iter()
                    .map(|package| package.size_bytes)
                    .sum();
                StagedDuplicateGroup {
                    canonical_id: group.canonical.id,
                    duplicate_ids: group
                        .duplicates
                        .into_iter()
                        .map(|package| package.id)
                        .collect(),
                    name: group.canonical.name,
                    reclaimable_bytes,
                }
            })
            .collect(),
    })
}

#[tauri::command]
fn preview_staged_duplicates(
    app: AppHandle,
    game_id: String,
) -> Result<StagedDuplicatePreview, String> {
    staged_duplicate_preview_inner(&app, &game_id)
}

fn merge_profile_mod_state(
    states: &mut serde_json::Map<String, serde_json::Value>,
    canonical_id: &str,
    duplicate_id: &str,
) -> bool {
    let Some(duplicate) = states.remove(duplicate_id) else {
        return false;
    };
    let Some(canonical) = states.get(canonical_id).cloned() else {
        states.insert(canonical_id.to_string(), duplicate);
        return true;
    };
    let enabled = canonical
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
        || duplicate
            .get("enabled")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
    let priority = canonical
        .get("priority")
        .and_then(|value| value.as_i64())
        .unwrap_or(i64::MAX)
        .min(
            duplicate
                .get("priority")
                .and_then(|value| value.as_i64())
                .unwrap_or(i64::MAX),
        );
    let note = canonical
        .get("note")
        .and_then(|value| value.as_str())
        .or_else(|| duplicate.get("note").and_then(|value| value.as_str()))
        .map(ToOwned::to_owned);
    let mut merged = canonical;
    merged["enabled"] = serde_json::json!(enabled);
    merged["priority"] = serde_json::json!(priority);
    if let Some(note) = note {
        merged["note"] = serde_json::json!(note);
    }
    states.insert(canonical_id.to_string(), merged);
    true
}

#[tauri::command]
fn deduplicate_staged_mods(app: AppHandle, game_id: String) -> Result<StagedDedupResult, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let (_, groups) = staged_duplicate_plan(&app, &game_id)?;
    let mut replacements = Vec::new();
    let mut warnings = Vec::new();
    let mut removed_packages = 0u64;
    let mut reclaimed_bytes = 0u64;

    let profiles_root = update_data_root(&app)?
        .join("games")
        .join(&game_id)
        .join("profiles");
    for entry in fs::read_dir(&profiles_root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
    {
        let profile_path = entry.path().join("profile.json");
        let Ok(payload) = fs::read(&profile_path) else {
            continue;
        };
        let Ok(mut profile) = serde_json::from_slice::<serde_json::Value>(&payload) else {
            warnings.push(format!(
                "Profil illisible ignoré : {}.",
                profile_path.to_string_lossy()
            ));
            continue;
        };
        let Some(profile_id) = profile
            .get("id")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned)
        else {
            continue;
        };
        let mut changed = false;
        if let Some(states) = profile
            .get_mut("modStates")
            .and_then(|value| value.as_object_mut())
        {
            for group in &groups {
                for duplicate in &group.duplicates {
                    if duplicate.id != group.canonical.id {
                        changed |=
                            merge_profile_mod_state(states, &group.canonical.id, &duplicate.id);
                    }
                }
            }
        }
        if changed {
            sync_profile_state_inner(&app, &game_id, &profile_id, &profile)?;
        }
    }

    for group in groups {
        let canonical_manifest_path = group.canonical.path.join("manifest.json");
        let mut canonical_manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&canonical_manifest_path).map_err(to_error)?)
                .map_err(to_error)?;
        let mut profile_ids = canonical_manifest
            .get("profiles")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for duplicate in &group.duplicates {
            if duplicate.fingerprint != group.canonical.fingerprint
                || duplicate.content_digest != group.canonical.content_digest
            {
                return Err("Le plan de doublons a changé ; relancez l’analyse.".into());
            }
            if let Ok(payload) = fs::read(duplicate.path.join("manifest.json")) {
                if let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&payload) {
                    profile_ids.extend(
                        manifest
                            .get("profiles")
                            .and_then(|value| value.as_array())
                            .into_iter()
                            .flatten()
                            .filter_map(|value| value.as_str().map(ToOwned::to_owned)),
                    );
                }
            }
        }
        profile_ids.sort();
        profile_ids.dedup();
        canonical_manifest["profiles"] = serde_json::json!(profile_ids);
        canonical_manifest["deduplicatedAt"] = serde_json::json!(unix_timestamp());
        write_json_atomic(&canonical_manifest_path, &canonical_manifest)?;

        for duplicate in group.duplicates {
            if duplicate.id != group.canonical.id {
                replacements.push(StagedDedupReplacement {
                    duplicate_id: duplicate.id.clone(),
                    canonical_id: group.canonical.id.clone(),
                });
            }
            match fs::remove_dir_all(&duplicate.path) {
                Ok(()) => {
                    removed_packages += 1;
                    reclaimed_bytes = reclaimed_bytes.saturating_add(duplicate.size_bytes);
                }
                Err(error) => warnings.push(format!(
                    "{} n’a pas pu être supprimé : {error}",
                    duplicate.path.to_string_lossy()
                )),
            }
        }
    }
    Ok(StagedDedupResult {
        game_id,
        removed_packages,
        reclaimed_bytes,
        replacements,
        warnings,
    })
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

type IniDocument = HashMap<String, HashMap<String, String>>;

fn read_ini_document(path: &Path) -> Result<IniDocument, String> {
    let payload = fs::read(path).map_err(to_error)?;
    let text = String::from_utf8_lossy(&payload);
    let mut document = IniDocument::new();
    let mut section = String::new();
    for raw_line in text.lines() {
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = line[1..line.len() - 1].trim().to_ascii_lowercase();
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        document
            .entry(section.clone())
            .or_default()
            .insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    Ok(document)
}

fn ini_value(document: &IniDocument, keys: &[&str]) -> Option<String> {
    for values in document.values() {
        for key in keys {
            if let Some(value) = values.get(&key.to_ascii_lowercase()) {
                let value = value.trim().trim_matches('"').to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn ini_leaf_value(document: &IniDocument, leaf: &str) -> Option<String> {
    let leaf = leaf.to_ascii_lowercase();
    for values in document.values() {
        for (key, value) in values {
            let normalized = key.replace('\\', "/");
            if normalized.rsplit('/').next() == Some(leaf.as_str()) {
                let value = value.trim().trim_matches('"').to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn mo2_root(source_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(source_path)
        .map_err(|_| "Le dossier Mod Organizer 2 est introuvable ou inaccessible.".to_string())?;
    if !root.is_dir()
        || !root.join("ModOrganizer.exe").is_file()
        || !root.join("ModOrganizer.ini").is_file()
        || !root.join("mods").is_dir()
        || !root.join("profiles").is_dir()
    {
        return Err(
            "Ce dossier ne ressemble pas à une instance portable Mod Organizer 2 valide.".into(),
        );
    }
    Ok(root)
}

fn safe_mo2_child(root: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
    {
        return Err("Nom de dossier MO2 invalide.".into());
    }
    let root = fs::canonicalize(root).map_err(to_error)?;
    let candidate = root.join(name);
    if fs::symlink_metadata(&candidate)
        .map_err(to_error)?
        .file_type()
        .is_symlink()
    {
        return Err("Les liens symboliques MO2 ne sont pas importés.".into());
    }
    let child = fs::canonicalize(candidate).map_err(to_error)?;
    if child.parent() != Some(root.as_path()) || !child.is_dir() {
        return Err("Un dossier MO2 sort de la racine autorisée.".into());
    }
    Ok(child)
}

fn parse_mo2_modlist(path: &Path) -> Result<Vec<Mo2ModListEntry>, String> {
    let payload = fs::read(path).map_err(to_error)?;
    let text = String::from_utf8_lossy(&payload);
    let records = text
        .lines()
        .filter_map(|raw_line| {
            let line = raw_line.trim().trim_start_matches('\u{feff}');
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (enabled, name) = match line.chars().next() {
                Some('+') | Some('*') => (true, &line[1..]),
                Some('-') => (false, &line[1..]),
                _ => (true, line),
            };
            let name = name.trim();
            (!name.is_empty()).then(|| (name.to_string(), enabled))
        })
        .collect::<Vec<_>>();
    let total = records.len() as i64;
    Ok(records
        .into_iter()
        .enumerate()
        .map(|(index, (name, enabled))| Mo2ModListEntry {
            separator: name.to_ascii_lowercase().ends_with("_separator"),
            name,
            enabled,
            // MO2 écrit modlist.txt dans l'ordre inverse. ZAILON utilise un ordre
            // croissant où le dernier gagne, donc on inverse explicitement ici.
            priority: total - index as i64 - 1,
        })
        .collect())
}

fn tree_stats(root: &Path) -> Result<(u64, u64), String> {
    if !root.is_dir() {
        return Ok((0, 0));
    }
    let mut files = 0u64;
    let mut bytes = 0u64;
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(to_error)?;
        if entry.file_type().is_symlink() {
            continue;
        }
        if entry.file_type().is_file() {
            files += 1;
            bytes = bytes.saturating_add(entry.metadata().map_err(to_error)?.len());
        }
    }
    Ok((files, bytes))
}

fn direct_directory_count(root: &Path) -> u64 {
    fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .count() as u64
}

fn mo2_secret_key_count(document: &IniDocument) -> u64 {
    let sensitive = [
        "apikey",
        "api_key",
        "token",
        "cookie",
        "password",
        "credential",
        "secret",
    ];
    document
        .values()
        .flat_map(|values| values.keys())
        .filter(|key| sensitive.iter().any(|needle| key.contains(needle)))
        .count() as u64
}

fn clean_qt_ini_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .replace("\\\\", "\\")
        .replace("%BASE_DIR%", ".")
}

fn mo2_executables(root: &Path, document: &IniDocument) -> Vec<(String, PathBuf)> {
    let mut values = HashMap::<String, HashMap<String, String>>::new();
    for (section, entries) in document {
        for (key, value) in entries {
            let combined = format!("{section}/{key}").replace('\\', "/");
            if !combined.to_ascii_lowercase().contains("customexecutables") {
                continue;
            }
            let parts = combined.split('/').collect::<Vec<_>>();
            let Some(field) = parts.last() else { continue };
            if !matches!(*field, "title" | "binary") {
                continue;
            }
            let group = parts
                .get(parts.len().saturating_sub(2))
                .copied()
                .unwrap_or("0")
                .to_string();
            values
                .entry(group)
                .or_default()
                .insert((*field).to_string(), clean_qt_ini_value(value));
        }
    }
    let mut executables = values
        .into_values()
        .filter_map(|entry| {
            let title = entry.get("title")?.trim().to_string();
            let binary = PathBuf::from(entry.get("binary")?);
            let binary = if binary.is_absolute() {
                binary
            } else {
                root.join(binary)
            };
            (!title.is_empty()).then_some((title, binary))
        })
        .collect::<Vec<_>>();
    executables.sort_by(|left, right| {
        left.0
            .to_ascii_lowercase()
            .cmp(&right.0.to_ascii_lowercase())
    });
    executables
}

fn mo2_configuration_snapshot(
    root: &Path,
    profile_names: &[String],
) -> Result<HashMap<String, String>, String> {
    let mut files = vec![root.join("ModOrganizer.ini")];
    for name in profile_names {
        let profile = safe_mo2_child(&root.join("profiles"), name)?;
        for file_name in [
            "modlist.txt",
            "archives.txt",
            "settings.ini",
            "initweaks.ini",
        ] {
            let path = profile.join(file_name);
            if path.is_file() {
                files.push(path);
            }
        }
    }
    files
        .into_iter()
        .map(|path| {
            let relative = path.strip_prefix(root).map_err(to_error)?;
            Ok((
                relative.to_string_lossy().replace('\\', "/"),
                file_sha256(&path)?,
            ))
        })
        .collect()
}

fn mo2_metadata(
    source_mod: &Path,
    options: &Mo2ImportOptions,
) -> Result<serde_json::Value, String> {
    let path = source_mod.join("meta.ini");
    if !options.metadata || !path.is_file() {
        return Ok(serde_json::json!({}));
    }
    let document = read_ini_document(&path)?;
    let mut output = serde_json::Map::new();
    for key in [
        "modid",
        "fileid",
        "gamename",
        "repository",
        "url",
        "version",
        "newestversion",
        "installationfile",
        "validated",
        "converted",
        "endorsed",
        "tracked",
    ] {
        if let Some(value) = ini_leaf_value(&document, key) {
            output.insert(key.to_string(), serde_json::json!(value));
        }
    }
    if options.categories {
        for key in ["category", "nexuscategory"] {
            if let Some(value) = ini_leaf_value(&document, key) {
                output.insert(key.to_string(), serde_json::json!(value));
            }
        }
    }
    if options.notes {
        for key in ["notes", "comments", "color"] {
            if let Some(value) = ini_leaf_value(&document, key) {
                output.insert(key.to_string(), serde_json::json!(value));
            }
        }
    }
    Ok(serde_json::Value::Object(output))
}

fn mo2_hidden_rules(source_mod: &Path, stage_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut rules = Vec::new();
    for entry in WalkDir::new(source_mod).follow_links(false) {
        let entry = entry.map_err(to_error)?;
        if entry.file_type().is_symlink() {
            return Err("Un lien symbolique bloque l'import des fichiers cachés MO2.".into());
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(source_mod).map_err(to_error)?;
        validate_archive_relative(relative)?;
        let normalized = relative.to_string_lossy().replace('\\', "/");
        if let Some(original) = normalized.strip_suffix(".mohidden") {
            rules.push(serde_json::json!({
                "modId": stage_id,
                "path": original,
                "sourceConvention": ".mohidden"
            }));
        }
    }
    Ok(rules)
}

fn copy_mo2_downloads(source: &Path, destination: &Path) -> Result<u64, String> {
    if !source.is_dir() {
        return Ok(0);
    }
    let mut copied = 0u64;
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry.map_err(to_error)?;
        if entry.file_type().is_symlink() {
            return Err("Un lien symbolique bloque l'import des téléchargements MO2.".into());
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(source).map_err(to_error)?;
        validate_archive_relative(relative)?;
        let lower = relative.to_string_lossy().to_ascii_lowercase();
        if lower.ends_with(".unfinished") || lower.ends_with(".part") {
            continue;
        }
        let mut target = destination.join(relative);
        if lower.ends_with(".meta") {
            let document = read_ini_document(entry.path())?;
            let mut sanitized = serde_json::Map::new();
            for key in [
                "category",
                "description",
                "filecategory",
                "fileid",
                "filetime",
                "gamename",
                "installed",
                "modid",
                "modname",
                "name",
                "newestversion",
                "paused",
                "removed",
                "repository",
                "uninstalled",
                "version",
            ] {
                if let Some(value) = ini_leaf_value(&document, key) {
                    sanitized.insert(key.to_string(), serde_json::json!(value));
                }
            }
            target = PathBuf::from(format!("{}.sanitized.json", target.to_string_lossy()));
            write_json_atomic(&target, &serde_json::Value::Object(sanitized))?;
            copied += 1;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
        fs::copy(entry.path(), target).map_err(to_error)?;
        copied += 1;
    }
    Ok(copied)
}

/// Détection de l'instance Vortex d'un jeu (spec « Finalisation des add-ons »
/// §35) : lit `vortex.deployment.json` (fallback `vortex.deployment.manifest.json`)
/// à la racine du jeu — lecture seule, jamais d'écriture — et déduit les mods
/// actifs + le dossier de staging `Vortex/mods/<instance>`. ZAILON ne re-déploie
/// RIEN : Vortex a déjà déployé (hardlink/symlink/move).
#[tauri::command]
fn detect_vortex_instance(game_root: String) -> Result<VortexInstance, String> {
    let root = PathBuf::from(&game_root);
    if !root.is_dir() {
        return Ok(VortexInstance {
            exists: false,
            ..Default::default()
        });
    }
    let deployment_path = ["vortex.deployment.json", "vortex.deployment.manifest.json"]
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.is_file());
    let Some(manifest_path) = deployment_path else {
        return Ok(VortexInstance {
            exists: false,
            ..Default::default()
        });
    };
    let bytes = fs::read(&manifest_path).map_err(to_error)?;
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).map_err(to_error)?;
    let Some(instance) = manifest
        .get("instance")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
    else {
        return Ok(VortexInstance {
            exists: false,
            ..Default::default()
        });
    };
    let files = manifest
        .get("files")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let mut mods: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    for entry in &files {
        let Some(source) = entry.get("source").and_then(|value| value.as_str()) else {
            continue;
        };
        if entry
            .get("relPath")
            .and_then(|value| value.as_str())
            .is_none()
        {
            continue;
        }
        *mods.entry(source.to_string()).or_insert(0) += 1;
    }
    let file_count = mods.values().sum::<u64>();
    let mods_dir = vortex_mods_dir(&instance);
    Ok(VortexInstance {
        exists: true,
        instance: Some(instance),
        version: manifest.get("version").and_then(|value| value.as_u64()),
        deployment_path: Some(manifest_path.to_string_lossy().to_string()),
        mods_dir: mods_dir
            .as_ref()
            .filter(|dir| dir.is_dir())
            .map(|dir| dir.to_string_lossy().to_string()),
        file_count,
        mods: mods
            .into_iter()
            .map(|(name, count)| VortexModSummary {
                name,
                file_count: count,
            })
            .collect(),
    })
}

/// Dossier de staging Vortex : `%APPDATA%/Vortex/mods/<instance>` (Windows) ou
/// `~/.config/vortex/mods/<instance>` (Linux/macOS) — jamais codé en dur.
fn vortex_mods_dir(instance: &str) -> Option<PathBuf> {
    if cfg!(windows) {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return Some(
                PathBuf::from(appdata)
                    .join("Vortex")
                    .join("mods")
                    .join(instance),
            );
        }
    }
    if let Some(config) = std::env::var_os("XDG_CONFIG_HOME") {
        return Some(
            PathBuf::from(config)
                .join("vortex")
                .join("mods")
                .join(instance),
        );
    }
    std::env::var_os("HOME").map(|home| {
        PathBuf::from(home)
            .join(".config")
            .join("vortex")
            .join("mods")
            .join(instance)
    })
}

/// Dossiers conventionnels des mods Frosty (lecture seule, jamais codés en
/// dur) : `%LOCALAPPDATA%\Frosty\Mods`, `%APPDATA%\Frosty\Mods` (Windows),
/// `~/.config/Frosty/Mods`, plus chaque chemin fourni et ses variantes `Mods`.
fn frosty_mods_candidate_dirs(extra_paths: &[String]) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join("Frosty").join("Mods"));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(appdata).join("Frosty").join("Mods"));
        }
    }
    if let Some(config) = std::env::var_os("XDG_CONFIG_HOME") {
        dirs.push(PathBuf::from(config).join("Frosty").join("Mods"));
    }
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(
            PathBuf::from(home)
                .join(".config")
                .join("Frosty")
                .join("Mods"),
        );
    }
    for extra in extra_paths {
        let path = PathBuf::from(extra);
        dirs.push(path.clone());
        dirs.push(path.join("Mods"));
        dirs.push(path.join("Frosty").join("Mods"));
    }
    dirs
}

/// Liste les `.fbmod` d'un dossier (entrées de premier niveau uniquement,
/// plafonnées) — pur, testable.
fn list_fbmods_in(dir: &std::path::Path) -> Vec<FrostyModFileInfo> {
    const MAX_MODS: usize = 1000;
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<FrostyModFileInfo> = Vec::new();
    for entry in entries.flatten() {
        if out.len() >= MAX_MODS {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_ascii_lowercase().ends_with(".fbmod") {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        out.push(FrostyModFileInfo {
            name,
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
        });
    }
    out.sort_by(|a, b| {
        a.name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase())
    });
    out
}

/// Détecte une installation Frosty existante (dossier de mods `.fbmod`) —
/// lecture seule, jamais d'écriture. ZAILON ne re-déploie RIEN : Frosty Mod
/// Manager reste l'unique gestionnaire des mods.
#[tauri::command]
fn frosty_detect_installation(extra_paths: Vec<String>) -> Result<FrostyInstallation, String> {
    for dir in frosty_mods_candidate_dirs(&extra_paths) {
        if !dir.is_dir() {
            continue;
        }
        let mods = list_fbmods_in(&dir);
        if mods.is_empty() {
            continue;
        }
        let file_count = mods.len() as u64;
        let total_bytes = mods.iter().map(|mod_file| mod_file.size).sum();
        return Ok(FrostyInstallation {
            exists: true,
            mods_dir: Some(dir.to_string_lossy().to_string()),
            mods,
            file_count,
            total_bytes,
        });
    }
    Ok(FrostyInstallation {
        exists: false,
        ..Default::default()
    })
}

#[tauri::command]
fn preview_mo2_import(source_path: String) -> Result<Mo2ImportPreview, String> {
    let root = mo2_root(&source_path)?;
    let ini = read_ini_document(&root.join("ModOrganizer.ini"))?;
    let profiles_root = root.join("profiles");
    let mut profiles = Vec::new();
    for entry in fs::read_dir(&profiles_root)
        .map_err(to_error)?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
    {
        let name = entry.file_name().to_string_lossy().to_string();
        let modlist = entry.path().join("modlist.txt");
        if !modlist.is_file() {
            continue;
        }
        let entries = parse_mo2_modlist(&modlist)?;
        let mods = entries
            .iter()
            .filter(|item| !item.separator)
            .collect::<Vec<_>>();
        profiles.push(Mo2ProfilePreview {
            name,
            mod_count: mods.len() as u64,
            enabled_count: mods.iter().filter(|item| item.enabled).count() as u64,
            disabled_count: mods.iter().filter(|item| !item.enabled).count() as u64,
            separator_count: entries.iter().filter(|item| item.separator).count() as u64,
        });
    }
    profiles.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    let (mods_files, mods_bytes) = tree_stats(&root.join("mods"))?;
    let (overwrite_files, overwrite_bytes) = tree_stats(&root.join("overwrite"))?;
    let (download_files, download_bytes) = tree_stats(&root.join("downloads"))?;
    let (plugin_files, _) = tree_stats(&root.join("plugins"))?;
    let hidden_files = WalkDir::new(root.join("mods"))
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_file()
                && entry
                    .file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .ends_with(".mohidden")
        })
        .count() as u64;
    let executables = mo2_executables(&root, &ini)
        .into_iter()
        .map(|(title, binary)| Mo2ExecutablePreview {
            title,
            binary_present: binary.is_file(),
        })
        .collect();
    let mut warnings = vec![
        "Aucun binaire, plugin, thème, icône ou traduction MO2 ne sera copié.".into(),
        "Les DLL et exécutables contenus dans les mods restent soumis au contrôle de sécurité ZAILON.".into(),
        "Le moteur TemporaryCopy de ZAILON n'est pas le VFS usvfs de MO2.".into(),
    ];
    let secret_keys_detected = mo2_secret_key_count(&ini);
    if secret_keys_detected > 0 {
        warnings.push(format!(
            "{secret_keys_detected} clé(s) potentiellement sensible(s) détectée(s) : elles seront ignorées."
        ));
    }
    Ok(Mo2ImportPreview {
        root: root.to_string_lossy().to_string(),
        version: ini_value(&ini, &["version", "modorganizerversion"]),
        install_type: "Portable".into(),
        game_name: ini_value(&ini, &["gamename", "game_name"]),
        selected_profile: ini_value(&ini, &["selected_profile", "selectedprofile"]),
        profiles,
        executables,
        installed_mods: direct_directory_count(&root.join("mods")),
        downloads: download_files,
        overwrite_files,
        overwrite_bytes,
        plugin_files,
        hidden_files,
        secret_keys_detected,
        required_bytes: mods_bytes
            .saturating_add(overwrite_bytes)
            .saturating_add(download_bytes),
        warnings,
    })
}

fn import_mo2_instance_inner(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    task_id: &str,
    request: Mo2ImportRequest,
    cancel: &AtomicBool,
) -> Result<Mo2ImportResult, String> {
    let root = mo2_root(&request.source_path)?;
    let game_id = safe_game_id(&request.game_id)?.to_string();
    if request.profiles.is_empty() {
        return Err("Sélectionnez au moins un profil MO2.".into());
    }
    let mut target_ids = HashSet::new();
    let mut source_names = HashSet::new();
    for mapping in &request.profiles {
        safe_game_id(&mapping.target_id)?;
        if mapping.target_name.trim().is_empty()
            || !target_ids.insert(mapping.target_id.clone())
            || !source_names.insert(mapping.source_name.to_ascii_lowercase())
        {
            return Err(
                "Le mapping des profils MO2 contient un doublon ou un nom invalide.".into(),
            );
        }
    }
    let source_profile_names = request
        .profiles
        .iter()
        .map(|mapping| mapping.source_name.clone())
        .collect::<Vec<_>>();
    let before_snapshot = mo2_configuration_snapshot(&root, &source_profile_names)?;
    let ini = read_ini_document(&root.join("ModOrganizer.ini"))?;
    let selected_source_profile =
        ini_value(&ini, &["selected_profile", "selectedprofile"]).unwrap_or_default();
    let mut parsed_profiles = HashMap::<String, Vec<Mo2ModListEntry>>::new();
    let mut references = HashMap::<String, (String, Vec<String>)>::new();
    for mapping in &request.profiles {
        let source_profile = safe_mo2_child(&root.join("profiles"), &mapping.source_name)?;
        let entries = parse_mo2_modlist(&source_profile.join("modlist.txt"))?;
        for entry in entries.iter().filter(|entry| !entry.separator) {
            let key = entry.name.to_ascii_lowercase();
            let reference = references
                .entry(key)
                .or_insert_with(|| (entry.name.clone(), Vec::new()));
            if !reference.1.contains(&mapping.target_id) {
                reference.1.push(mapping.target_id.clone());
            }
        }
        parsed_profiles.insert(mapping.source_name.to_ascii_lowercase(), entries);
    }
    let total = if request.options.mods {
        references.len() as u64
    } else {
        0
    };
    report_background_task(
        app,
        registry,
        None,
        task_id,
        0,
        total,
        "Validation de l'instance MO2 terminée.".into(),
    );
    let destination = update_data_root(app)?
        .join("games")
        .join(&game_id)
        .join("legacy-import-target");
    let mut stage_by_name = HashMap::<String, String>::new();
    let mut installed_paths = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped_mods = 0u64;
    if request.options.mods {
        let mut ordered = references.into_iter().collect::<Vec<_>>();
        ordered.sort_by(|left, right| left.0.cmp(&right.0));
        for (index, (key, (name, profile_ids))) in ordered.into_iter().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err("TASK_CANCELLED".into());
            }
            let source_mod = match safe_mo2_child(&root.join("mods"), &name) {
                Ok(path) => path,
                Err(_) => {
                    skipped_mods += 1;
                    warnings.push(format!("Mod MO2 absent ou non sûr ignoré : {name}"));
                    continue;
                }
            };
            let imported = import_mods_with_staging(
                app,
                registry,
                None,
                task_id,
                &game_id,
                &profile_ids,
                vec![source_mod.to_string_lossy().to_string()],
                &request.game_name,
                destination.to_string_lossy().to_string(),
                false,
                "quarantine",
                cancel,
            )?;
            let Some(stage_path) = imported.installed_paths.first() else {
                skipped_mods += 1;
                continue;
            };
            let stage = PathBuf::from(stage_path);
            let stage_id = stage
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "Identifiant de paquet importé invalide.".to_string())?
                .to_string();
            safe_game_id(&stage_id)?;
            let metadata = mo2_metadata(&source_mod, &request.options)?;
            let manifest_path = stage.join("manifest.json");
            let mut manifest: serde_json::Value =
                serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?)
                    .map_err(to_error)?;
            manifest["importedFrom"] = serde_json::json!("Mod Organizer 2");
            manifest["mo2Metadata"] = metadata;
            manifest["mo2SourceDigest"] = serde_json::json!(content_tree_sha256(&source_mod)?);
            manifest["mo2SourcePath"] = serde_json::json!(source_mod.to_string_lossy());
            manifest["packageStorageLocation"] = serde_json::json!({
                "type": "InternalStore",
                "path": stage.to_string_lossy(),
                "accessible": true,
                "writable": true,
                "sourceApplication": "Mod Organizer 2"
            });
            write_json_atomic(&manifest_path, &manifest)?;
            package_manifest_entries(&stage, &game_id, true)?;
            warnings.extend(imported.warnings);
            stage_by_name.insert(key, stage_id);
            installed_paths.push(stage_path.clone());
            report_background_task(
                app,
                registry,
                None,
                task_id,
                index as u64 + 1,
                total,
                format!("Import MO2 : {} / {total}", index + 1),
            );
        }
    }
    let mut profiles = Vec::new();
    for mapping in &request.profiles {
        let entries = parsed_profiles
            .get(&mapping.source_name.to_ascii_lowercase())
            .ok_or_else(|| "Profil MO2 analysé introuvable.".to_string())?;
        let mut states = serde_json::Map::new();
        let mut separators = Vec::new();
        let mut hidden_rules = Vec::new();
        for entry in entries {
            if entry.separator {
                separators.push(serde_json::json!({
                    "name": entry.name.trim_end_matches("_separator"),
                    "priority": entry.priority
                }));
                continue;
            }
            let Some(stage_id) = stage_by_name.get(&entry.name.to_ascii_lowercase()) else {
                continue;
            };
            states.insert(
                stage_id.clone(),
                serde_json::json!({
                    "enabled": entry.enabled,
                    "priority": entry.priority
                }),
            );
            if request.options.hidden_files {
                if let Ok(source_mod) = safe_mo2_child(&root.join("mods"), &entry.name) {
                    hidden_rules.extend(mo2_hidden_rules(&source_mod, stage_id)?);
                }
            }
        }
        let profile = serde_json::json!({
            "id": mapping.target_id,
            "gameId": game_id,
            "name": mapping.target_name,
            "modStates": states,
            "modSeparators": separators,
            "hiddenFileRules": hidden_rules,
            "playtime": 0,
            "createdAt": unix_timestamp().saturating_mul(1000),
            "description": format!("Importé depuis Mod Organizer 2 · {}", mapping.source_name),
            "installOptions": {
                "mo2Metadata": request.options.metadata,
                "mo2Categories": request.options.categories,
                "mo2Notes": request.options.notes,
                "mo2HiddenFiles": request.options.hidden_files
            }
        });
        sync_profile_state_inner(app, &game_id, &mapping.target_id, &profile)?;
        profiles.push(profile);
    }
    let mut overwrite_files = 0u64;
    if request.options.overwrite && root.join("overwrite").is_dir() {
        if let Some(mapping) = request.profiles.iter().find(|mapping| {
            mapping
                .source_name
                .eq_ignore_ascii_case(&selected_source_profile)
        }) {
            let target = profile_directory(app, &game_id, &mapping.target_id)?.join("overwrite");
            copy_tree_for_snapshot(&root.join("overwrite"), &target)?;
            overwrite_files = tree_stats(&target)?.0;
        } else {
            warnings.push(
                "Le profil MO2 actif n'était pas sélectionné : le dossier Overwrite global n'a pas été copié."
                    .into(),
            );
        }
    }
    let migration_id = format!("mo2-{}-{}", unix_timestamp(), std::process::id());
    let migration_root = update_data_root(app)?
        .join("games")
        .join(&game_id)
        .join("migrations")
        .join("mo2")
        .join(&migration_id);
    fs::create_dir_all(&migration_root).map_err(to_error)?;
    let copied_downloads = if request.options.downloads {
        copy_mo2_downloads(&root.join("downloads"), &migration_root.join("downloads"))?
    } else {
        0
    };
    let managed_executables = if request.options.executables {
        mo2_executables(&root, &ini)
            .into_iter()
            .filter(|(_, binary)| binary.is_file())
            .map(|(title, binary)| {
                serde_json::json!({
                    "id": format!("mo2-executable-{}", safe_archive_component(&title)),
                    "name": title,
                    "path": binary.to_string_lossy(),
                    "source": "Mod Organizer 2",
                    "enabled": false
                })
            })
            .collect()
    } else {
        Vec::new()
    };
    let after_snapshot = mo2_configuration_snapshot(&root, &source_profile_names)?;
    let source_unchanged = before_snapshot == after_snapshot;
    if !source_unchanged {
        warnings.push(
            "Les fichiers de configuration source ont changé pendant l'import ; vérifiez qu'aucun autre programme ne modifiait MO2."
                .into(),
        );
    }
    let snapshot_path = migration_root.join("source-snapshot.json");
    write_json_atomic(
        &snapshot_path,
        &serde_json::json!({
            "schemaVersion": 1,
            "createdAt": unix_timestamp(),
            "sourceConfigurationBefore": before_snapshot,
            "sourceConfigurationAfter": after_snapshot,
            "sourceUnchanged": source_unchanged
        }),
    )?;
    let report_path = migration_root.join("migration-report.json");
    write_json_atomic(
        &report_path,
        &serde_json::json!({
            "schemaVersion": 1,
            "migrationId": migration_id,
            "createdAt": unix_timestamp(),
            "sourceManager": "Mod Organizer 2",
            "sourceRoot": root,
            "gameId": game_id,
            "profilesCreated": profiles.len(),
            "modsImported": installed_paths.len(),
            "modsSkipped": skipped_mods,
            "downloadsCopied": copied_downloads,
            "overwriteFilesCopied": overwrite_files,
            "sourceUnchanged": source_unchanged,
            "options": {
                "mods": request.options.mods,
                "metadata": request.options.metadata,
                "overwrite": request.options.overwrite,
                "downloads": request.options.downloads,
                "executables": request.options.executables,
                "categories": request.options.categories,
                "notes": request.options.notes,
                "hiddenFiles": request.options.hidden_files
            },
            "warnings": warnings
        }),
    )?;
    Ok(Mo2ImportResult {
        imported_mods: installed_paths.len() as u64,
        skipped_mods,
        profiles,
        installed_paths,
        managed_executables,
        copied_downloads,
        overwrite_files,
        report_path: report_path.to_string_lossy().to_string(),
        snapshot_path: snapshot_path.to_string_lossy().to_string(),
        source_unchanged,
        warnings,
    })
}

#[tauri::command]
async fn import_mo2_instance(
    app: AppHandle,
    state: State<'_, BackgroundTaskRegistry>,
    task_id: String,
    request: Mo2ImportRequest,
) -> Result<Mo2ImportResult, String> {
    let registry = state.inner().clone();
    let total = if request.options.mods {
        preview_mo2_import(request.source_path.clone())?.installed_mods
    } else {
        0
    };
    let cancel = register_background_task(
        &app,
        &registry,
        task_id.clone(),
        "mo2-import",
        "Import depuis Mod Organizer 2",
        total,
    )?;
    let worker_app = app.clone();
    let worker_registry = registry.clone();
    let worker_task_id = task_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        import_mo2_instance_inner(
            &worker_app,
            &worker_registry,
            &worker_task_id,
            request,
            &cancel,
        )
    })
    .await
    .map_err(|_| "L'import MO2 s'est arrêté de façon inattendue.".to_string())?;
    match &result {
        Ok(import) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "completed",
            format!(
                "{} mod(s) et {} profil(s) importés depuis MO2.",
                import.imported_mods,
                import.profiles.len()
            ),
            None,
        ),
        Err(error) if error == "TASK_CANCELLED" => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "cancelled",
            "Import MO2 annulé. Les paquets déjà stockés restent récupérables.".into(),
            None,
        ),
        Err(error) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "failed",
            "Échec de l'import MO2. La source n'a pas été modifiée.".into(),
            Some(error.clone()),
        ),
    }
    result
}

#[tauri::command]
fn audit_profile_deployment(
    app: AppHandle,
    game_id: String,
    profile_id: String,
    enabled_mod_ids: Vec<String>,
    conflict_rules: Vec<LaunchConflictRule>,
    game_root: Option<String>,
) -> Result<ProfileDeploymentAudit, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let profile_id = safe_game_id(&profile_id)?.to_string();
    let map = build_virtual_profile_map(
        &app,
        &game_id,
        &profile_id,
        &enabled_mod_ids,
        &conflict_rules,
        false,
    )?;
    let mut diagnostics = map.diagnostics.clone();
    let dependency_ok = if let Some(root) = game_root
        .filter(|value| !value.trim().is_empty())
        .and_then(|value| fs::canonicalize(value).ok())
    {
        match framework_diagnostics(
            &root,
            &map.entries
                .iter()
                .map(|entry| PathBuf::from(&entry.game_relative_path))
                .collect::<Vec<_>>(),
        ) {
            Ok(items) => {
                diagnostics.extend(items);
                true
            }
            Err(error) => {
                diagnostics.push(error);
                false
            }
        }
    } else {
        diagnostics.push(
            "Racine du jeu indisponible : la visibilité d’une installation existante ne peut pas être vérifiée."
                .into(),
        );
        true
    };
    let broken_references = map
        .packages
        .iter()
        .filter(|package| !package.deployable)
        .count() as u64;
    let manifested_files = map.packages.iter().map(|package| package.file_count).sum();
    Ok(ProfileDeploymentAudit {
        game_id,
        profile_id,
        referenced_packages: enabled_mod_ids.len() as u64,
        accessible_packages: map.packages.iter().filter(|package| package.exists).count() as u64,
        broken_references,
        manifested_files,
        virtual_file_count: map.entries.len() as u64,
        conflicts: map.conflicts,
        deployable: dependency_ok
            && broken_references == 0
            && (enabled_mod_ids.is_empty() || !map.entries.is_empty()),
        packages: map.packages,
        providers: map.providers,
        virtual_files: map.entries,
        diagnostics,
    })
}

fn stage_by_fingerprint_or_name(app: &AppHandle, game_id: &str, source: &Path) -> Option<PathBuf> {
    let fingerprint = fingerprint_path(source);
    for root in staged_storage_roots(app, game_id).ok()? {
        if let Some(stage) = staged_package_by_fingerprint(&root, &fingerprint) {
            return Some(stage);
        }
    }
    let source_name = source.file_name()?.to_string_lossy();
    staged_storage_roots(app, game_id)
        .ok()?
        .into_iter()
        .flat_map(|root| {
            fs::read_dir(root)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .collect::<Vec<_>>()
        })
        .filter(|entry| entry.path().is_dir())
        .find_map(|entry| {
            let manifest = fs::read(entry.path().join("manifest.json"))
                .ok()
                .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())?;
            manifest
                .get("name")
                .and_then(|value| value.as_str())
                .is_some_and(|name| name.eq_ignore_ascii_case(&source_name))
                .then(|| entry.path())
        })
}

fn rollback_mo2_repair(snapshot_root: &Path, stages: &[PathBuf]) {
    for stage in stages.iter().rev() {
        let Some(stage_id) = stage.file_name() else {
            continue;
        };
        let snapshot = snapshot_root.join(stage_id);
        if !snapshot.is_dir() {
            continue;
        }
        let rollback_displaced = snapshot_root
            .parent()
            .unwrap_or(snapshot_root)
            .join("failed-repair")
            .join(stage_id);
        if stage.exists() {
            let _ = fs::rename(stage, &rollback_displaced);
        }
        let _ = copy_tree_for_snapshot(&snapshot, stage);
    }
}

#[tauri::command]
fn repair_mo2_profile_deployment(
    app: AppHandle,
    game_id: String,
    profile_id: String,
    source_path: String,
    game_name: String,
    game_root: Option<String>,
    enabled_mod_ids: Vec<String>,
    conflict_rules: Vec<LaunchConflictRule>,
) -> Result<Mo2DeploymentRepairResult, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let profile_id = safe_game_id(&profile_id)?.to_string();
    let mo2 = mo2_root(&source_path)?;
    let repair_id = format!(
        "mo2-deployment-v2-{}-{}",
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
    let profile_snapshot = snapshot_root.join("profile");
    let profile_source = profile_directory(&app, &game_id, &profile_id)?;
    copy_tree_for_snapshot(&profile_source, &profile_snapshot)?;
    let mut restaged = Vec::<PathBuf>::new();
    let mut packages_restaged = 0u64;
    let mut normalized_files = 0u64;
    let repair_result = (|| -> Result<(), String> {
        for source_entry in fs::read_dir(mo2.join("mods"))
            .map_err(to_error)?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
        {
            let source_mod = source_entry.path();
            let effective_source = cyberpunk_package_root(&source_mod);
            let source_providers = detect_cyberpunk_framework_providers(&effective_source);
            if source_providers.is_empty() {
                continue;
            }
            let Some(stage) = stage_by_fingerprint_or_name(&app, &game_id, &source_mod) else {
                continue;
            };
            let package_id = stage
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "Identifiant de paquet à réparer invalide.".to_string())?;
            if !enabled_mod_ids.iter().any(|id| id == package_id) {
                continue;
            }
            let (current_entries, current_providers) =
                package_manifest_entries(&stage, &game_id, false)?;
            let current_ids = current_providers
                .iter()
                .map(|provider| provider.framework_id.to_ascii_lowercase())
                .collect::<HashSet<_>>();
            let providers_missing = source_providers
                .iter()
                .any(|provider| !current_ids.contains(&provider.to_ascii_lowercase()));
            let malformed = current_entries.iter().any(|entry| {
                entry.package_relative_path != entry.game_relative_path
                    || entry
                        .game_relative_path
                        .to_ascii_lowercase()
                        .starts_with("root/")
            });
            if !providers_missing && !malformed {
                continue;
            }
            let snapshot = snapshot_root.join(package_id);
            copy_tree_for_snapshot(&stage, &snapshot)?;
            restaged.push(stage.clone());
            let work_stage = work_root.join(package_id);
            let work_content = work_stage.join("content");
            fs::create_dir_all(&work_content).map_err(to_error)?;
            let mut security = SensitiveImportContext {
                action: "quarantine".into(),
                game_name: game_name.clone(),
                framework_providers: HashSet::new(),
                content_root: work_content.clone(),
                inactive_root: work_stage.join("inactive-sensitive"),
                quarantine_root: update_data_root(&app)?
                    .join("quarantine")
                    .join(format!("{repair_id}-{package_id}")),
                assessments: Vec::new(),
                quarantine_paths: Vec::new(),
            };
            let cancel = AtomicBool::new(false);
            let (layout, mut diagnostics) = stage_content(
                &source_mod,
                &work_content,
                &game_name,
                &cancel,
                &mut security,
            )?;
            let normalized_inspection = inspect_native_mod(&work_content);
            let framework = detect_cyberpunk_framework(&work_content, &normalized_inspection.files);
            if framework == "Unknown" {
                return Err(format!(
                    "Le framework du paquet {package_id} reste indéterminé après normalisation."
                ));
            }
            diagnostics.push(format!(
                "Migration MO2 V2 : {} fournisseur(s) validé(s) par signatures physiques.",
                security.framework_providers.len()
            ));
            let previous_content = stage.join("content");
            let displaced = work_root.join(format!("{package_id}-previous-content"));
            fs::rename(&previous_content, &displaced).map_err(to_error)?;
            if let Err(error) = fs::rename(&work_content, &previous_content).map_err(to_error) {
                let _ = fs::rename(&displaced, &previous_content);
                return Err(error);
            }
            let manifest_path = stage.join("manifest.json");
            let mut manifest: serde_json::Value =
                serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?)
                    .map_err(to_error)?;
            manifest["layout"] = serde_json::json!(layout);
            manifest["framework"] = serde_json::json!(framework);
            manifest["contentFiles"] = serde_json::json!(normalized_inspection.files);
            manifest["diagnostics"] = serde_json::json!(diagnostics);
            manifest["sensitiveFiles"] = serde_json::json!(security.assessments);
            manifest["quarantinePaths"] = serde_json::json!(security.quarantine_paths);
            manifest["lastMo2DeploymentRepairId"] = serde_json::json!(repair_id);
            manifest["mo2SourcePath"] = serde_json::json!(source_mod.to_string_lossy());
            manifest["pipelineStatus"] = serde_json::json!("Normalized");
            write_json_atomic(&manifest_path, &manifest)?;
            if !security.assessments.is_empty() {
                write_sensitive_import_records(&security, &stage, &source_mod)?;
            }
            let (rebuilt, providers) = package_manifest_entries(&stage, &game_id, true)?;
            let rebuilt_ids = providers
                .iter()
                .map(|provider| provider.framework_id.to_ascii_lowercase())
                .collect::<HashSet<_>>();
            if source_providers
                .iter()
                .any(|provider| !rebuilt_ids.contains(&provider.to_ascii_lowercase()))
            {
                return Err(format!(
                    "Le fournisseur attendu du paquet {package_id} n’apparaît pas dans son manifeste reconstruit."
                ));
            }
            normalized_files += rebuilt
                .iter()
                .filter(|entry| entry.package_relative_path != entry.game_relative_path)
                .count() as u64;
            packages_restaged += 1;
        }
        for package_id in &enabled_mod_ids {
            if let Some(stage) = staged_package_directory(&app, &game_id, package_id) {
                package_manifest_entries(&stage, &game_id, true)?;
            }
        }
        Ok(())
    })();
    if let Err(error) = repair_result {
        rollback_mo2_repair(&snapshot_root, &restaged);
        let _ = fs::remove_dir_all(&profile_source);
        let _ = copy_tree_for_snapshot(&profile_snapshot, &profile_source);
        return Err(format!(
            "Réparation MO2 annulée et rollback appliqué : {error}"
        ));
    }
    let map = build_virtual_profile_map(
        &app,
        &game_id,
        &profile_id,
        &enabled_mod_ids,
        &conflict_rules,
        true,
    )?;
    let broken_references = map
        .packages
        .iter()
        .filter(|package| !package.deployable)
        .count() as u64;
    let mut diagnostics = map.diagnostics.clone();
    let dependencies_resolved = if let Some(root) = game_root
        .filter(|value| !value.trim().is_empty())
        .and_then(|value| fs::canonicalize(value).ok())
    {
        match framework_diagnostics(
            &root,
            &map.entries
                .iter()
                .map(|entry| PathBuf::from(&entry.game_relative_path))
                .collect::<Vec<_>>(),
        ) {
            Ok(items) => {
                diagnostics.extend(items);
                true
            }
            Err(error) => {
                diagnostics.push(error);
                false
            }
        }
    } else {
        true
    };
    diagnostics.push(format!(
        "Réparation terminée : {} paquet(s) restagé(s), {} manifeste(s), {} fichier(s) dans la table virtuelle.",
        packages_restaged,
        enabled_mod_ids.len(),
        map.entries.len()
    ));
    let report_path = repair_root.join("repair-report.json");
    write_json_atomic(
        &report_path,
        &serde_json::json!({
            "schemaVersion": 2,
            "repairId": repair_id,
            "createdAt": unix_timestamp(),
            "gameId": game_id,
            "profileId": profile_id,
            "backend": "TemporaryCopy",
            "packagesAudited": enabled_mod_ids.len(),
            "packagesRestaged": packages_restaged,
            "manifestsRebuilt": enabled_mod_ids.len(),
            "normalizedFiles": normalized_files,
            "virtualFileCount": map.entries.len(),
            "brokenReferences": broken_references,
            "providers": map.providers,
            "dependenciesResolved": dependencies_resolved,
            "deployable": dependencies_resolved
                && broken_references == 0
                && (enabled_mod_ids.is_empty() || !map.entries.is_empty()),
            "diagnostics": diagnostics
        }),
    )?;
    Ok(Mo2DeploymentRepairResult {
        repair_id,
        packages_audited: enabled_mod_ids.len() as u64,
        packages_restaged,
        manifests_rebuilt: enabled_mod_ids.len() as u64,
        normalized_files,
        virtual_file_count: map.entries.len() as u64,
        broken_references,
        providers: map.providers,
        snapshot_path: snapshot_root.to_string_lossy().to_string(),
        report_path: report_path.to_string_lossy().to_string(),
        deployable: dependencies_resolved
            && broken_references == 0
            && (enabled_mod_ids.is_empty() || !map.entries.is_empty()),
        diagnostics,
    })
}

fn import_mods_with_staging(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    channel: Option<&Channel<BackgroundTaskEvent>>,
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
        if let Some(existing_stage) =
            staged_package_by_fingerprint(&staging_root, &inspected.fingerprint)
        {
            let recovered =
                repair_reused_framework_package_from_source(&existing_stage, &source, game_name)?;
            for profile_id in profile_ids {
                attach_staged_package_to_profile(&existing_stage, profile_id)?;
            }
            if deploy_now {
                let manifest_path = existing_stage.join("manifest.json");
                let mut manifest: serde_json::Value =
                    serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?)
                        .map_err(to_error)?;
                manifest["deploymentStatus"] = serde_json::json!("enabled");
                manifest["lastReusedAt"] = serde_json::json!(unix_timestamp());
                write_json_atomic(&manifest_path, &manifest)?;
            }
            package_manifest_entries(&existing_stage, game_id, true)?;
            if !recovered.is_empty() {
                warnings.push(format!(
                    "{} : {} runtime(s) de framework restauré(s) dans le paquet existant après validation complète.",
                    inspected.name,
                    recovered.len()
                ));
            }
            installed.push(existing_stage.to_string_lossy().to_string());
            report_background_task(
                app,
                registry,
                channel,
                task_id,
                index as u64 + 1,
                total,
                if recovered.is_empty() {
                    format!(
                        "{} déjà présent : paquet réutilisé sans nouvelle copie ({}/{total})",
                        inspected.name,
                        index + 1
                    )
                } else {
                    format!(
                        "{} déjà présent : paquet réparé, {} runtime(s) restauré(s) ({}/{total})",
                        inspected.name,
                        recovered.len(),
                        index + 1
                    )
                },
            );
            continue;
        }
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
            framework_providers: HashSet::new(),
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
            channel,
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
            "sourceFingerprint": inspected.fingerprint.clone(),
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
        if let Err(error) = package_manifest_entries(&stage_directory, game_id, true) {
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
            channel,
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
            Some(&on_event),
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

/// Spec « Import Cyberpunk façon MO2 » §33, §47 — « Réparer cet import » :
/// re-stage le CONTENU des paquets déjà importés depuis leur source enregistrée
/// (`sourcePath` du manifeste) avec la résolution de racines par fichier. Le
/// contenu existant est RENOMMÉ en backup (jamais supprimé) ; en cas d'échec,
/// le contenu d'origine est restauré (rollback). Les fichiers sensibles sont
/// traités avec la décision « quarantine » (jamais exécutés).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedImportRepairReport {
    stage_id: String,
    name: String,
    repaired: bool,
    files_before: usize,
    files_after: usize,
    layout: String,
    backup_path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn repair_staged_imports(
    app: AppHandle,
    game_id: String,
    game_name: String,
    stage_ids: Vec<String>,
) -> Result<Vec<StagedImportRepairReport>, String> {
    let game_id = safe_game_id(&game_id)?;
    let staging_root = staged_mods_root(&app, game_id)?;
    let mut reports = Vec::new();
    for raw in stage_ids {
        let stage_id = safe_archive_component(&raw);
        let stage = staging_root.join(&stage_id);
        let manifest_path = stage.join("manifest.json");
        let manifest: serde_json::Value = match fs::read(&manifest_path) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(value) => value,
                Err(error) => {
                    reports.push(StagedImportRepairReport {
                        stage_id: stage_id.clone(),
                        name: stage_id.clone(),
                        repaired: false,
                        files_before: 0,
                        files_after: 0,
                        layout: String::new(),
                        backup_path: None,
                        error: Some(format!("Manifeste illisible : {error}")),
                    });
                    continue;
                }
            },
            Err(_) => {
                reports.push(StagedImportRepairReport {
                    stage_id: stage_id.clone(),
                    name: stage_id.clone(),
                    repaired: false,
                    files_before: 0,
                    files_after: 0,
                    layout: String::new(),
                    backup_path: None,
                    error: Some("Manifeste introuvable — paquet staged absent.".into()),
                });
                continue;
            }
        };
        let name = manifest
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or(&stage_id)
            .to_string();
        let source_path = match manifest.get("sourcePath").and_then(|value| value.as_str()) {
            Some(path) => path.to_string(),
            None => {
                reports.push(StagedImportRepairReport {
                    stage_id: stage_id.clone(),
                    name,
                    repaired: false,
                    files_before: 0,
                    files_after: 0,
                    layout: String::new(),
                    backup_path: None,
                    error: Some(
                        "Aucune source enregistrée (sourcePath absent). Réimportez ce mod.".into(),
                    ),
                });
                continue;
            }
        };
        let source = PathBuf::from(source_path);
        if !source.exists() {
            reports.push(StagedImportRepairReport {
                stage_id: stage_id.clone(),
                name,
                repaired: false,
                files_before: 0,
                files_after: 0,
                layout: String::new(),
                backup_path: None,
                error: Some("Source introuvable — le contenu n'a pas pu être re-stagé.".into()),
            });
            continue;
        }
        let content = stage.join("content");
        let files_before = staged_file_count(&content);
        let backup = stage.join(format!("content.repair-backup-{}", unix_timestamp()));
        if content.exists() {
            fs::rename(&content, &backup).map_err(to_error)?;
        }
        fs::create_dir_all(&content).map_err(to_error)?;
        let cancel = AtomicBool::new(false);
        let mut security = SensitiveImportContext {
            action: "quarantine".into(),
            game_name: game_name.clone(),
            framework_providers: HashSet::new(),
            content_root: content.clone(),
            inactive_root: stage.join("inactive-sensitive"),
            quarantine_root: stage.join("quarantine-repair"),
            assessments: Vec::new(),
            quarantine_paths: Vec::new(),
        };
        let staged = stage_content(&source, &content, &game_name, &cancel, &mut security);
        let (layout, repaired, files_after, error) = match staged {
            Ok((layout, _)) => match package_manifest_entries(&stage, game_id, true) {
                Ok(_) => (layout, true, staged_file_count(&content), None),
                Err(error) => (
                    layout,
                    false,
                    0,
                    Some(format!("Manifeste non reconstruit : {error}")),
                ),
            },
            Err(error) => (
                String::new(),
                false,
                0,
                Some(format!("Re-staging impossible : {error}")),
            ),
        };
        if !repaired {
            // Rollback : restaure le contenu d'origine, jamais perdu.
            let _ = fs::remove_dir_all(&content);
            if backup.exists() {
                let _ = fs::rename(&backup, &content);
            }
        }
        reports.push(StagedImportRepairReport {
            stage_id,
            name,
            repaired,
            files_before,
            files_after,
            layout,
            backup_path: if repaired {
                Some(backup.to_string_lossy().to_string())
            } else {
                None
            },
            error,
        });
    }
    Ok(reports)
}

fn staged_file_count(path: &Path) -> usize {
    if !path.exists() {
        return 0;
    }
    WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .count()
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
    gate: State<'_, AddonGate>,
    state: State<'_, ProviderConnectionCache>,
) -> HashMap<String, ProviderConnectionStatus> {
    let cache = state.0.lock().ok();
    // Spec Add-ons §21 : sans l'add-on d'un provider, aucun état n'est rapporté.
    ["nexus", "curseforge"]
        .into_iter()
        .filter(|provider| {
            let addon = match *provider {
                "nexus" => "official.zailon.provider.nexus",
                "curseforge" => "official.zailon.provider.curseforge",
                _ => return false,
            };
            addon_gate_enabled(&gate, addon)
        })
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
    gate: State<'_, AddonGate>,
    state: State<'_, ProviderConnectionCache>,
    provider: String,
) -> Result<ProviderConnectionStatus, String> {
    let addon = match provider.as_str() {
        "nexus" => "official.zailon.provider.nexus",
        "curseforge" => "official.zailon.provider.curseforge",
        other => return Err(format!("Fournisseur inconnu : {other}.")),
    };
    if !addon_gate_enabled(&gate, addon) {
        return Err(addon_gate_error(addon, &format!("provider {provider}")));
    }
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

fn html_attribute<'a>(tag: &'a str, attribute: &str) -> Option<&'a str> {
    let marker = format!("{attribute}=\"");
    let start = tag.find(&marker)? + marker.len();
    let value = tag.get(start..)?;
    let end = value.find('"')?;
    value.get(..end)
}

fn nexus_gallery_images_from_html(html: &str, mod_id: u64) -> Vec<String> {
    let expected_path = format!("/images/{mod_id}/");
    let mut images = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find("<a ") {
        rest = &rest[start..];
        let Some(end) = rest.find('>') else {
            break;
        };
        let tag = &rest[..=end];
        rest = &rest[end + 1..];
        let class = html_attribute(tag, "class").unwrap_or_default();
        if !class
            .split_ascii_whitespace()
            .any(|token| token == "mod-image")
        {
            continue;
        }
        let Some(href) = html_attribute(tag, "href") else {
            continue;
        };
        let Ok(url) = url::Url::parse(href) else {
            continue;
        };
        let trusted_host = matches!(
            url.host_str(),
            Some("staticdelivery.nexusmods.com" | "images.nexusmods.com")
        );
        let path = url.path().to_ascii_lowercase();
        let is_full_mod_image = path.contains(&expected_path)
            && !path.contains("/thumbnails/")
            && matches!(
                path.rsplit('.').next(),
                Some("jpg" | "jpeg" | "png" | "webp" | "gif")
            );
        if url.scheme() == "https" && trusted_host && is_full_mod_image {
            let image = url.to_string();
            if !images.contains(&image) {
                images.push(image);
            }
        }
        if images.len() >= 100 {
            break;
        }
    }
    images
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
    gate: State<'_, AddonGate>,
    state: State<'_, ProviderConnectionCache>,
) -> Result<Vec<NexusCatalogGame>, String> {
    if !addon_gate_enabled(&gate, "official.zailon.provider.nexus") {
        return Err(addon_gate_error(
            "official.zailon.provider.nexus",
            "Nexus Provider",
        ));
    }
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
    gate: State<'_, AddonGate>,
    state: State<'_, ProviderConnectionCache>,
    game_domain: String,
    query: String,
    sort: String,
    page: u64,
    page_size: u64,
    include_adult: bool,
) -> Result<NexusCatalogPage, String> {
    if !addon_gate_enabled(&gate, "official.zailon.provider.nexus") {
        return Err(addon_gate_error(
            "official.zailon.provider.nexus",
            "Nexus Provider",
        ));
    }
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
async fn nexus_mod_gallery(
    gate: State<'_, AddonGate>,
    game_domain: String,
    mod_id: u64,
) -> Result<NexusModGallery, String> {
    if !addon_gate_enabled(&gate, "official.zailon.provider.nexus") {
        return Err(addon_gate_error(
            "official.zailon.provider.nexus",
            "Nexus Provider",
        ));
    }
    let domain = game_domain.trim().to_ascii_lowercase();
    if !valid_nexus_domain(&domain) || mod_id == 0 {
        return Err("La référence du mod Nexus est invalide.".into());
    }
    let source = format!("https://www.nexusmods.com/{domain}/mods/{mod_id}?tab=images");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Impossible d'initialiser la galerie Nexus.".to_string())?;
    let response = client
        .get(&source)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml;q=0.9",
        )
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Le chargement de la galerie Nexus a expiré.".to_string()
            } else {
                "La galerie Nexus est actuellement inaccessible.".to_string()
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            403 => "Nexus demande une connexion pour afficher cette galerie.".into(),
            404 => "La galerie de ce mod Nexus n'existe plus.".into(),
            429 => "Nexus limite temporairement le chargement des galeries.".into(),
            _ => format!(
                "Nexus n'a pas accepté la galerie (HTTP {}).",
                status.as_u16()
            ),
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > 5_000_000)
    {
        return Err("La page de galerie Nexus dépasse la taille de sécurité autorisée.".into());
    }
    let html = response
        .text()
        .await
        .map_err(|_| "Nexus a renvoyé une galerie illisible.".to_string())?;
    Ok(NexusModGallery {
        images: nexus_gallery_images_from_html(&html, mod_id),
        source,
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

fn exact_staged_nexus_file(
    app: &AppHandle,
    game_id: &str,
    game_domain: &str,
    mod_id: u64,
    file_id: u64,
) -> Option<PathBuf> {
    let Ok(root) = staged_mods_root(app, game_id) else {
        return None;
    };
    fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .find_map(|entry| {
            let Ok(payload) = fs::read(entry.path().join("manifest.json")) else {
                return None;
            };
            let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&payload) else {
                return None;
            };
            (nexus_json_string(&manifest, &["nexusGameDomain"]).eq_ignore_ascii_case(game_domain)
                && nexus_json_u64(&manifest, &["nexusModId"]) == mod_id
                && nexus_json_u64(&manifest, &["nexusFileId"]) == file_id)
                .then(|| entry.path())
        })
}

fn attach_staged_package_to_profile(stage: &Path, profile_id: &str) -> Result<(), String> {
    let manifest_path = stage.join("manifest.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?).map_err(to_error)?;
    let profiles = manifest
        .get_mut("profiles")
        .and_then(|value| value.as_array_mut())
        .ok_or_else(|| "Le manifeste du paquet ne contient pas de liste de profils.".to_string())?;
    if !profiles
        .iter()
        .any(|value| value.as_str() == Some(profile_id))
    {
        profiles.push(serde_json::json!(profile_id));
        write_json_atomic(&manifest_path, &manifest)?;
    }
    Ok(())
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
    let mut reused_stages = Vec::new();
    for entry in &mut entries {
        if entry.status == "Unavailable" {
            if entry.required {
                unavailable_required += 1;
            }
            continue;
        }
        if let Some(stage) = exact_staged_nexus_file(
            &app,
            &game_id,
            &entry.nexus_game_domain,
            entry.mod_id,
            entry.file_id,
        ) {
            let stage_id = stage
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "Identifiant de paquet Nexus local invalide.".to_string())?
                .to_string();
            safe_game_id(&stage_id)?;
            attach_staged_package_to_profile(&stage, &profile_id)?;
            entry.status = "Installed".into();
            entry.local_path = Some(stage.join("content").to_string_lossy().to_string());
            reused_stages.push((stage_id, entry.priority));
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
        unsupported_instructions: detail.unsupported_instructions.clone(),
        created_at: now,
        updated_at: now,
        open_next_required_page: waiting_for_user > 0,
        automatic_execution: false,
    };
    let mut persisted_profile = profile;
    if let Some(object) = persisted_profile.as_object_mut() {
        object.insert("locked".into(), serde_json::json!(true));
        object.insert("collectionState".into(), serde_json::json!(profile_state));
        if let Some(states) = object
            .get_mut("modStates")
            .and_then(|value| value.as_object_mut())
        {
            for (stage_id, priority) in &reused_stages {
                states.insert(
                    stage_id.clone(),
                    serde_json::json!({
                        "enabled": true,
                        "priority": priority
                    }),
                );
            }
        }
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

fn extract_collection_zip(archive_path: &Path, destination: &Path) -> Result<PathBuf, String> {
    let extension = archive_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("zip") {
        return Err(
            "Cette archive n’est pas un ZIP. Les formats 7z/RAR restent en intervention manuelle."
                .into(),
        );
    }
    let file = fs::File::open(archive_path).map_err(to_error)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| "L’archive ZIP de la Collection est illisible.".to_string())?;
    if archive.len() > 100_000 {
        return Err("L’archive ZIP contient trop d’entrées.".into());
    }
    fs::create_dir_all(destination).map_err(to_error)?;
    const MAX_COLLECTION_EXTRACTED_BYTES: u64 = 32 * 1024 * 1024 * 1024;
    let extraction = (|| -> Result<(), String> {
        let mut total = 0u64;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(to_error)?;
            if archive_is_symlink(entry.unix_mode()) {
                return Err("L’archive ZIP contient un lien symbolique refusé.".into());
            }
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| "L’archive ZIP contient un chemin de traversal.".to_string())?;
            validate_archive_relative(&relative)?;
            total = total.saturating_add(entry.size());
            if total > MAX_COLLECTION_EXTRACTED_BYTES {
                return Err("L’archive ZIP dépasse la limite extraite de 32 Gio.".into());
            }
            let output = destination.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&output).map_err(to_error)?;
            } else {
                if let Some(parent) = output.parent() {
                    fs::create_dir_all(parent).map_err(to_error)?;
                }
                let mut file = fs::File::create(output).map_err(to_error)?;
                copy(&mut entry, &mut file).map_err(to_error)?;
            }
        }
        Ok(())
    })();
    if let Err(error) = extraction {
        let _ = fs::remove_dir_all(destination);
        return Err(error);
    }
    Ok(destination.to_path_buf())
}

fn install_collection_downloads_inner(
    app: &AppHandle,
    registry: &BackgroundTaskRegistry,
    task_id: &str,
    game_id: &str,
    install_id: &str,
    game_name: &str,
    cancel: &AtomicBool,
) -> Result<CollectionStagingResult, String> {
    let plan_path = collection_install_plan_path(app, game_id, install_id)?;
    let mut plan = read_collection_install_plan(&plan_path)?;
    let profile_path = profile_directory(app, game_id, &plan.profile_id)?.join("profile.json");
    let mut profile: serde_json::Value =
        serde_json::from_slice(&fs::read(&profile_path).map_err(to_error)?).map_err(to_error)?;
    let work_root = plan_path
        .parent()
        .ok_or_else(|| "Dossier du plan Collection invalide.".to_string())?
        .join("staging-work");
    fs::create_dir_all(&work_root).map_err(to_error)?;
    let mut installed_paths = Vec::new();
    let mut operation_warnings = Vec::new();
    let installable = plan
        .entries
        .iter()
        .filter(|entry| entry.status == "Downloaded")
        .count();
    let mut processed = 0u64;

    for index in 0..plan.entries.len() {
        if cancel.load(Ordering::Relaxed) {
            return Err("TASK_CANCELLED".into());
        }
        if plan.entries[index].status != "Downloaded" {
            continue;
        }
        let entry = plan.entries[index].clone();
        let archive_path = entry
            .local_path
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| path.is_file());
        let Some(archive_path) = archive_path else {
            let message = format!(
                "{} : le fichier téléchargé exact est introuvable.",
                entry.display_name
            );
            plan.entries[index].status = if entry.required { "Failed" } else { "Skipped" }.into();
            operation_warnings.push(message);
            continue;
        };
        let extraction = unique_destination(
            &work_root,
            &format!(
                "{}-{}",
                safe_archive_component(&entry.collection_entry_id),
                entry.file_id
            ),
        );
        report_background_task(
            app,
            registry,
            None,
            task_id,
            processed,
            installable as u64,
            format!("Analyse de {}.", entry.display_name),
        );
        let staged = (|| -> Result<(PathBuf, SecureImportResult), String> {
            let extracted = extract_collection_zip(&archive_path, &extraction)?;
            let imported = import_mods_with_staging(
                app,
                registry,
                None,
                task_id,
                game_id,
                &[plan.profile_id.clone()],
                vec![extracted.to_string_lossy().to_string()],
                game_name,
                String::new(),
                true,
                "quarantine",
                cancel,
            )?;
            let stage = imported
                .installed_paths
                .first()
                .map(PathBuf::from)
                .ok_or_else(|| "Le staging n’a créé aucun paquet.".to_string())?;
            Ok((stage, imported))
        })();
        let _ = fs::remove_dir_all(&extraction);
        match staged {
            Ok((stage, imported)) => {
                let stage_id = stage
                    .file_name()
                    .and_then(|value| value.to_str())
                    .ok_or_else(|| "Identifiant du paquet Collection invalide.".to_string())?
                    .to_string();
                safe_game_id(&stage_id)?;
                let manifest_path = stage.join("manifest.json");
                let mut manifest: serde_json::Value =
                    serde_json::from_slice(&fs::read(&manifest_path).map_err(to_error)?)
                        .map_err(to_error)?;
                manifest["name"] = serde_json::json!(entry.display_name);
                manifest["version"] = serde_json::json!(entry.expected_version);
                manifest["sourceUrl"] = serde_json::json!(entry.source_url);
                manifest["nexusGameDomain"] = serde_json::json!(entry.nexus_game_domain);
                manifest["nexusModId"] = serde_json::json!(entry.mod_id);
                manifest["nexusFileId"] = serde_json::json!(entry.file_id);
                manifest["collectionInstallId"] = serde_json::json!(plan.install_id);
                manifest["collectionEntryId"] = serde_json::json!(entry.collection_entry_id);
                manifest["collectionRevisionId"] = serde_json::json!(plan.revision_id);
                write_json_atomic(&manifest_path, &manifest)?;
                let states = profile
                    .get_mut("modStates")
                    .and_then(|value| value.as_object_mut())
                    .ok_or_else(|| {
                        "Le profil Collection ne contient plus de modStates.".to_string()
                    })?;
                states.insert(
                    stage_id,
                    serde_json::json!({
                        "enabled": true,
                        "priority": entry.priority
                    }),
                );
                plan.entries[index].status = "Installed".into();
                installed_paths.push(stage.to_string_lossy().to_string());
                operation_warnings.extend(imported.warnings);
            }
            Err(error) => {
                plan.entries[index].status =
                    if entry.required { "Failed" } else { "Skipped" }.into();
                operation_warnings.push(format!("{} : {error}", entry.display_name));
            }
        }
        processed += 1;
        plan.updated_at = unix_timestamp();
        write_collection_install_plan(&plan_path, &plan)?;
        let _ = app.emit("collection-install-changed", plan.clone());
    }
    let _ = fs::remove_dir_all(&work_root);

    let required_ready = plan
        .entries
        .iter()
        .all(|entry| !entry.required || entry.status == "Installed");
    let external_ready = !plan
        .external_requirements
        .iter()
        .any(|requirement| requirement.required);
    let ready = required_ready && external_ready && plan.unsupported_instructions.is_empty();
    let profile_state = if ready { "Ready" } else { "NeedsAttention" };
    if let Some(object) = profile.as_object_mut() {
        object.insert("collectionState".into(), serde_json::json!(profile_state));
        if ready {
            if let Some(metadata) = object
                .get_mut("collectionMetadata")
                .and_then(|value| value.as_object_mut())
            {
                metadata.insert(
                    "installedRevisionId".into(),
                    serde_json::json!(plan.revision_id),
                );
                metadata.insert("installedAt".into(), serde_json::json!(unix_timestamp()));
            }
        }
    }
    sync_profile_state_inner(app, game_id, &plan.profile_id, &profile)?;
    plan.profile_state = profile_state.into();
    plan.automatic_execution = false;
    plan.updated_at = unix_timestamp();
    plan.warnings.extend(operation_warnings.clone());
    write_collection_install_plan(&plan_path, &plan)?;
    let _ = app.emit("collection-install-changed", plan.clone());
    Ok(CollectionStagingResult {
        plan,
        profile,
        installed_paths,
        warnings: operation_warnings,
    })
}

#[tauri::command]
async fn install_collection_downloads(
    app: AppHandle,
    state: State<'_, BackgroundTaskRegistry>,
    game_id: String,
    install_id: String,
    game_name: String,
) -> Result<CollectionStagingResult, String> {
    let game_id = safe_game_id(&game_id)?.to_string();
    let install_id = safe_game_id(&install_id)?.to_string();
    let game_name = game_name.trim().chars().take(160).collect::<String>();
    if game_name.is_empty() {
        return Err("Le nom du jeu cible est invalide.".into());
    }
    let plan_path = collection_install_plan_path(&app, &game_id, &install_id)?;
    let mut plan = read_collection_install_plan(&plan_path)?;
    if plan.profile_state == "Cancelled" {
        return Err("Cette installation Collection a été annulée.".into());
    }
    if !plan
        .entries
        .iter()
        .any(|entry| matches!(entry.status.as_str(), "Downloaded" | "Installed"))
    {
        return Err("Aucun fichier Collection téléchargé n’est prêt à analyser.".into());
    }
    plan.profile_state = "Installing".into();
    plan.automatic_execution = false;
    plan.updated_at = unix_timestamp();
    write_collection_install_plan(&plan_path, &plan)?;
    let _ = app.emit("collection-install-changed", plan.clone());

    let registry = state.inner().clone();
    let task_id = format!("collection-stage-{install_id}");
    let cancel = register_background_task(
        &app,
        &registry,
        task_id.clone(),
        "collection-install",
        &format!("Installation de {}", plan.collection_name),
        plan.entries
            .iter()
            .filter(|entry| entry.status == "Downloaded")
            .count() as u64,
    )?;
    let worker_app = app.clone();
    let worker_registry = registry.clone();
    let worker_task_id = task_id.clone();
    let worker_game_id = game_id.clone();
    let worker_install_id = install_id.clone();
    let result = match tauri::async_runtime::spawn_blocking(move || {
        install_collection_downloads_inner(
            &worker_app,
            &worker_registry,
            &worker_task_id,
            &worker_game_id,
            &worker_install_id,
            &game_name,
            &cancel,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(_) => Err("Le moteur d’installation Collection s’est arrêté.".to_string()),
    };
    if let Err(error) = &result {
        if let Ok(mut failed_plan) = read_collection_install_plan(&plan_path) {
            failed_plan.profile_state = if error == "TASK_CANCELLED" {
                "Paused".into()
            } else {
                "NeedsAttention".into()
            };
            failed_plan.automatic_execution = false;
            failed_plan.updated_at = unix_timestamp();
            failed_plan
                .warnings
                .push(format!("Installation locale interrompue : {error}"));
            let _ = write_collection_install_plan(&plan_path, &failed_plan);
            let _ = app.emit("collection-install-changed", failed_plan);
        }
    }
    match &result {
        Ok(staging) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            if staging.plan.profile_state == "Ready" {
                "completed"
            } else {
                "completed_with_warnings"
            },
            format!(
                "{} paquet(s) Collection ajouté(s) au profil.",
                staging.installed_paths.len()
            ),
            None,
        ),
        Err(error) if error == "TASK_CANCELLED" => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "cancelled",
            "Installation Collection annulée.".into(),
            None,
        ),
        Err(error) => finish_background_task(
            &app,
            &registry,
            None,
            &task_id,
            "failed",
            "Installation Collection interrompue.".into(),
            Some(error.clone()),
        ),
    }
    result
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

/// Résultat de création d'un raccourci : chemin réel + mode effectif
/// (`zailon` = via ZAILON, chaîne de lancement conservée ; `direct` = cible
/// l'exécutable du jeu) + vérification post-création.
#[derive(serde::Serialize)]
struct ShortcutCreationResult {
    path: String,
    mode: String,
    verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Vérifie qu'un raccourci a réellement été écrit (fichier non vide).
fn verify_shortcut_file(path: &Path) -> Result<(), String> {
    let meta =
        fs::metadata(path).map_err(|_| "Le raccourci n'a pas pu être vérifié.".to_string())?;
    if !meta.is_file() || meta.len() == 0 {
        return Err("Le raccourci créé est vide ou invalide.".into());
    }
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn create_desktop_shortcut(
    app: AppHandle,
    game_id: String,
    profile_id: String,
    game_name: String,
    mode: String,
    icon_path: Option<String>,
    exec_path: Option<String>,
    launch_args: Option<String>,
) -> Result<ShortcutCreationResult, String> {
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
        // Cible directe : l'exécutable RÉEL du jeu, existant sur disque. Un
        // jeu à chaîne de lancement (Frosty/FiveM/NTE/Steam) ou sans exécutable
        // vérifiable retombe automatiquement sur ZAILON — la chaîne est conservée.
        let requested_direct = mode == "direct";
        let direct_target = exec_path
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| path.is_file())
            .filter(|path| path.extension().is_some());
        let effective_mode = if requested_direct && direct_target.is_some() {
            "direct"
        } else {
            "zailon"
        };
        let mut message = None;
        if requested_direct && effective_mode == "zailon" {
            message = Some(
                "Lancement direct indisponible (exécutable introuvable ou chaîne de lancement requise) — raccourci via ZAILON créé, la chaîne Frosty/FiveM/NTE est conservée."
                    .to_string(),
            );
        }
        let icon =
            resolve_shortcut_icon(&app, &game_id, icon_path.as_deref(), exec_path.as_deref())?;
        let (target, arguments, working_dir) = if effective_mode == "direct" {
            let target = direct_target.unwrap();
            let working = target
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| desktop.clone());
            (target, launch_args.unwrap_or_default(), working)
        } else {
            let working = executable
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| desktop.clone());
            (executable.clone(), uri.clone(), working)
        };
        let mut shortcut = desktop.join(format!("ZAILON - {safe_name}.lnk"));
        let mut suffix = 2;
        while shortcut.exists() {
            shortcut = desktop.join(format!("ZAILON - {safe_name} ({suffix}).lnk"));
            suffix += 1;
        }
        let description = if effective_mode == "direct" {
            format!("{safe_name} — lance le jeu directement (profil ZAILON : {profile_id})")
        } else {
            format!(
                "ZAILON - {safe_name} — lance le jeu via ZAILON (profil, mods, clavier, visuel)"
            )
        };
        write_windows_shortcut_lnk(
            &shortcut,
            &target,
            &arguments,
            &working_dir,
            &icon,
            &description,
        )?;
        // Vérification post-création (spec raccourci §26-31) : fichier réel,
        // cible résolvable, icône présente.
        verify_shortcut_file(&shortcut)?;
        if !target.exists() {
            return Err(format!(
                "La cible du raccourci est introuvable : {}",
                target.display()
            ));
        }
        if !icon.exists() {
            return Err(format!(
                "L'icône du raccourci est introuvable : {}",
                icon.display()
            ));
        }
        return Ok(ShortcutCreationResult {
            path: shortcut.to_string_lossy().to_string(),
            mode: effective_mode.to_string(),
            verified: true,
            message,
        });
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
        // Icône : chemin local absolu (PNG accepté par les environnements de
        // bureau) ; sinon entrée vide → icône générique de l'application.
        let icon =
            resolve_shortcut_icon(&app, &game_id, icon_path.as_deref(), exec_path.as_deref())?;
        let content = format!(
            "[Desktop Entry]\nType=Application\nName=ZAILON - {safe_name}\nExec=\"{}\" \"{uri}\"\nIcon={}\nTerminal=false\nCategories=Game;\n",
            executable.display(),
            icon.display()
        );
        fs::write(&shortcut, content).map_err(to_error)?;
        fs::set_permissions(&shortcut, fs::Permissions::from_mode(0o755)).map_err(to_error)?;
        verify_shortcut_file(&shortcut)?;
        if !icon.exists() {
            return Err(format!(
                "L'icône du raccourci est introuvable : {}",
                icon.display()
            ));
        }
        return Ok(ShortcutCreationResult {
            path: shortcut.to_string_lossy().to_string(),
            mode: "zailon".to_string(),
            verified: true,
            message: None,
        });
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
        verify_shortcut_file(&shortcut)?;
        return Ok(ShortcutCreationResult {
            path: shortcut.to_string_lossy().to_string(),
            mode: "zailon".to_string(),
            verified: true,
            message: None,
        });
    }
    #[allow(unreachable_code)]
    Err("Desktop shortcuts are not supported on this platform.".into())
}

/// Résout l'icône d'un raccourci dans l'ordre (spec raccourci §20) :
/// 1. icône personnalisée / Apparence (ico, exe, dll → direct ; png → enveloppée
///    dans un conteneur .ico Vista+ pour Windows, utilisée telle quelle sur Linux) ;
/// 2. icône native extraite par Windows de l'exécutable du jeu (exe) ;
/// 3. icône générique ZAILON en dernier recours — jamais de raccourci sans
///    Icône valide (critère bloquant §57).
fn resolve_shortcut_icon(
    app: &AppHandle,
    game_id: &str,
    icon_path: Option<&str>,
    exec_path: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(candidate) = icon_path.map(PathBuf::from).filter(|path| path.is_file()) {
        let extension = candidate
            .extension()
            .map(|value| value.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        match extension.as_str() {
            "exe" | "ico" | "dll" => return Ok(candidate),
            "png" => {
                #[cfg(target_os = "windows")]
                {
                    // ICO conteneur PNG (Windows Vista+) : l'icône 256×256 est
                    // lue directement — aucune conversion de décodage nécessaire.
                    let directory = game_resource_directory(app, game_id)?;
                    let ico = directory.join("shortcut.ico");
                    write_png_ico_container(&candidate, &ico)?;
                    return Ok(ico);
                }
                #[cfg(not(target_os = "windows"))]
                return Ok(candidate);
            }
            // JPG/WebP/AVIF/GIF/SVG : pas de conversion sans décodeur → on
            // tente l'exécutable du jeu, puis ZAILON.
            _ => {}
        }
    }
    if let Some(candidate) = exec_path.map(PathBuf::from).filter(|path| path.is_file()) {
        #[cfg(target_os = "windows")]
        {
            // Windows extrait nativement l'icône de l'exécutable (IconLocation).
            return Ok(candidate);
        }
        #[cfg(not(target_os = "windows"))]
        return Ok(candidate);
    }
    std::env::current_exe().map_err(to_error)
}

/// Enveloppe un PNG dans un conteneur .ico (une image 256×256, format PNG
/// accepté par Windows Vista+) : pas de décodeur, pas de redimensionnement.
fn write_png_ico_container(png: &Path, ico: &Path) -> Result<(), String> {
    let bytes = fs::read(png).map_err(to_error)?;
    if bytes.is_empty() || bytes.len() > 0x7fff_ffff {
        return Err("The shortcut icon PNG is invalid or too large.".into());
    }
    let mut output = Vec::with_capacity(22 + bytes.len());
    output.extend_from_slice(&0u16.to_le_bytes()); // réservé
    output.extend_from_slice(&1u16.to_le_bytes()); // type : icône
    output.extend_from_slice(&1u16.to_le_bytes()); // nombre d'images
    output.extend_from_slice(&[0, 0]); // largeur 256 (0 = 256)
    output.extend_from_slice(&[0, 0]); // hauteur 256
    output.extend_from_slice(&[0]); // palette : aucune
    output.extend_from_slice(&[0]); // réservé
    output.extend_from_slice(&1u16.to_le_bytes()); // plans
    output.extend_from_slice(&32u16.to_le_bytes()); // bits/pixel
    output.extend_from_slice(&(bytes.len() as u32).to_le_bytes()); // taille PNG
    output.extend_from_slice(&22u32.to_le_bytes()); // offset de l'image
    output.extend_from_slice(&bytes);
    fs::write(ico, output).map_err(to_error)
}

/// Écrit un raccourci Windows `.lnk` au format binaire MS-OSH (sans COM, sans
/// dépendance) : en-tête ShellLink + LinkInfo (VolumeID + chemin local) +
/// StringData Unicode (nom, répertoire, arguments, emplacement d'icône).
/// `target` = ZAILON, `arguments` = URI zailon:// — le lancement conserve
/// profil, mods, session, clavier et visuel.
#[cfg(target_os = "windows")]
fn write_windows_shortcut_lnk(
    path: &Path,
    target: &Path,
    arguments: &str,
    working_dir: &Path,
    icon_location: &Path,
    description: &str,
) -> Result<(), String> {
    // LinkInfo : VolumeID (disque fixe) + LocalBasePath (ANSI).
    let target_ansi: Vec<u8> = target
        .to_string_lossy()
        .chars()
        .map(|character| character as u8)
        .collect();
    let volume_id_size: u32 = 16 + 1; // en-tête VolumeID + étiquette vide (1 octet nul)
    let local_base_offset: u32 = 28 + volume_id_size; // 28 = en-tête LinkInfo
    let common_suffix_offset: u32 = local_base_offset + target_ansi.len() as u32 + 1;
    let link_info_size: u32 = common_suffix_offset; // suffixe commun vide

    let mut header = Vec::with_capacity(76);
    header.extend_from_slice(&0x4Cu32.to_le_bytes()); // HeaderSize
    header.extend_from_slice(&[
        0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x46,
    ]); // LinkCLSID {00021401-…}
    let flags: u32 = 0x2 | 0x4 | 0x10 | 0x20 | 0x40 | 0x80; // LinkInfo|Name|WorkingDir|Arguments|IconLocation|Unicode
    header.extend_from_slice(&flags.to_le_bytes());
    header.extend_from_slice(&0x20u32.to_le_bytes()); // FILE_ATTRIBUTE_ARCHIVE
    header.extend_from_slice(&0u64.to_le_bytes()); // CreationTime
    header.extend_from_slice(&0u64.to_le_bytes()); // AccessTime
    header.extend_from_slice(&0u64.to_le_bytes()); // WriteTime
    header.extend_from_slice(&0u32.to_le_bytes()); // FileSize
    header.extend_from_slice(&0u32.to_le_bytes()); // IconIndex (0 → icône par défaut)
    header.extend_from_slice(&1u32.to_le_bytes()); // ShowCommand : SW_SHOWNORMAL
    header.extend_from_slice(&0u16.to_le_bytes()); // HotKey
    header.extend_from_slice(&0u16.to_le_bytes()); // Reserved1
    header.extend_from_slice(&0u32.to_le_bytes()); // Reserved2
    header.extend_from_slice(&0u32.to_le_bytes()); // Reserved3
    debug_assert_eq!(header.len(), 76);

    let mut link_info = Vec::new();
    link_info.extend_from_slice(&link_info_size.to_le_bytes());
    link_info.extend_from_slice(&0x1Cu32.to_le_bytes()); // LinkInfoHeaderSize
    link_info.extend_from_slice(&0u32.to_le_bytes()); // Flags : VolumeIDAndLocalBasePath
    link_info.extend_from_slice(&28u32.to_le_bytes()); // VolumeIDOffset
    link_info.extend_from_slice(&local_base_offset.to_le_bytes());
    link_info.extend_from_slice(&0u32.to_le_bytes()); // CommonNetworkRelativeLinkOffset
    link_info.extend_from_slice(&common_suffix_offset.to_le_bytes());
    link_info.extend_from_slice(&volume_id_size.to_le_bytes());
    link_info.extend_from_slice(&3u32.to_le_bytes()); // DriveType : DRIVE_FIXED
    link_info.extend_from_slice(&0u32.to_le_bytes()); // DriveSerialNumber
    link_info.extend_from_slice(&16u32.to_le_bytes()); // VolumeLabelOffset
    link_info.push(0); // étiquette de volume vide
    link_info.extend_from_slice(&target_ansi); // LocalBasePath
    link_info.push(0);
    debug_assert_eq!(link_info.len(), link_info_size as usize);

    let mut data = Vec::new();
    let mut push_string = |value: &str, output: &mut Vec<u8>| {
        let utf16: Vec<u16> = value.encode_utf16().collect();
        output.extend_from_slice(&((utf16.len() + 1) as u16).to_le_bytes());
        for unit in utf16 {
            output.extend_from_slice(&unit.to_le_bytes());
        }
        output.extend_from_slice(&0u16.to_le_bytes());
    };
    push_string(description, &mut data);
    push_string(&working_dir.to_string_lossy(), &mut data);
    push_string(arguments, &mut data);
    push_string(&icon_location.to_string_lossy(), &mut data);

    let mut bytes = Vec::with_capacity(header.len() + link_info.len() + data.len());
    bytes.extend_from_slice(&header);
    bytes.extend_from_slice(&link_info);
    bytes.extend_from_slice(&data);
    fs::write(path, bytes).map_err(to_error)
}

#[cfg(all(test, target_os = "windows"))]
mod shortcut_lnk_tests {
    use super::*;

    #[test]
    fn windows_shortcut_lnk_structure_is_valid() {
        let root = std::env::temp_dir().join(format!(
            "zailon-lnk-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("lnk directory");
        let target = root.join("ZAILON.exe");
        let icon = root.join("game.ico");
        fs::write(&target, b"pe").expect("target fixture");
        fs::write(&icon, b"ico").expect("icon fixture");
        let lnk = root.join("shortcut.lnk");
        write_windows_shortcut_lnk(
            &lnk,
            &target,
            "zailon://launch/game/g-1?profile=p-1",
            &root,
            &icon,
            "ZAILON - Test",
        )
        .expect("write lnk");
        let bytes = fs::read(&lnk).expect("read lnk");

        // En-tête ShellLink : 76 octets, CLSID standard.
        assert!(bytes.len() > 76);
        assert_eq!(
            &bytes[4..20],
            &[
                0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x46
            ]
        );
        let flags = u32::from_le_bytes(bytes[20..24].try_into().unwrap());
        assert_ne!(flags & 0x80, 0, "IsUnicode");
        assert_ne!(flags & 0x20, 0, "HasArguments");
        assert_ne!(flags & 0x40, 0, "HasIconLocation");
        assert_ne!(flags & 0x2, 0, "HasLinkInfo");

        // LinkInfo démarre à 76 ; LocalBasePath pointe vers ZAILON.exe.
        let link_info_size = u32::from_le_bytes(bytes[76..80].try_into().unwrap()) as usize;
        assert!(link_info_size > 28);
        let base_offset = u32::from_le_bytes(bytes[92..96].try_into().unwrap()) as usize;
        let base_start = 76 + base_offset;
        let base_end = base_start
            + bytes[base_start..]
                .iter()
                .position(|&byte| byte == 0)
                .unwrap();
        assert!(String::from_utf8_lossy(&bytes[base_start..base_end]).ends_with("ZAILON.exe"));

        // StringData (UTF-16, première chaîne = nom) présent juste après LinkInfo.
        let data_start = 76 + link_info_size;
        assert!(bytes.len() > data_start + 4);
        let first_string_count =
            u16::from_le_bytes(bytes[data_start..data_start + 2].try_into().unwrap());
        assert!(
            first_string_count > 8,
            "le nom du raccourci est encodé en UTF-16"
        );

        fs::remove_dir_all(&root).expect("cleanup lnk test");
    }
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

fn persisted_state_counts(snapshot: &str) -> Result<UpdateStateCounts, String> {
    let payload: serde_json::Value = serde_json::from_str(snapshot)
        .map_err(|_| "La sauvegarde de configuration contient un JSON invalide.".to_string())?;
    let state = payload.get("state").unwrap_or(&payload);
    let games = state
        .get("games")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(UpdateStateCounts {
        games: games.len() as u64,
        profiles: games
            .iter()
            .map(|game| {
                game.get("profiles")
                    .and_then(|value| value.as_array())
                    .map(|items| items.len() as u64)
                    .unwrap_or(0)
            })
            .sum(),
        mods: games
            .iter()
            .map(|game| {
                game.get("installedMods")
                    .and_then(|value| value.as_array())
                    .map(|items| items.len() as u64)
                    .unwrap_or(0)
            })
            .sum(),
    })
}

#[tauri::command]
fn verify_update_state(
    app: AppHandle,
    snapshot: String,
    current_version: String,
) -> Result<UpdateIntegrityReport, String> {
    const MAX_SNAPSHOT_BYTES: usize = 25 * 1024 * 1024;
    if snapshot.len() > MAX_SNAPSHOT_BYTES {
        return Err("La configuration active dépasse la limite de vérification.".into());
    }
    let root = update_data_root(&app)?;
    let backups = root.join("update-backups");
    let mut candidates = fs::read_dir(&backups)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let metadata = fs::read(entry.path().join("metadata.json"))
                .ok()
                .and_then(|payload| serde_json::from_slice::<serde_json::Value>(&payload).ok())?;
            (metadata
                .get("targetVersion")
                .and_then(|value| value.as_str())
                == Some(current_version.as_str()))
            .then_some(entry.path())
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    let backup = candidates
        .into_iter()
        .next()
        .ok_or_else(|| "Aucune sauvegarde correspondant à cette mise à jour.".to_string())?;
    let before_payload = fs::read_to_string(backup.join("zailon-store.json")).map_err(to_error)?;
    let before = persisted_state_counts(&before_payload)?;
    let current = persisted_state_counts(&snapshot)?;
    let mut issues = Vec::new();
    if current.games != before.games {
        issues.push(format!(
            "Jeux : {} avant, {} après.",
            before.games, current.games
        ));
    }
    if current.profiles != before.profiles {
        issues.push(format!(
            "Profils : {} avant, {} après.",
            before.profiles, current.profiles
        ));
    }
    if current.mods != before.mods {
        issues.push(format!(
            "Mods : {} avant, {} après.",
            before.mods, current.mods
        ));
    }
    let report = UpdateIntegrityReport {
        ok: issues.is_empty(),
        backup_path: backup.to_string_lossy().to_string(),
        before,
        current,
        issues,
    };
    append_update_log(
        &root,
        serde_json::json!({
            "at": unix_timestamp(),
            "event": "post-update-integrity-check",
            "version": current_version,
            "result": if report.ok { "ok" } else { "mismatch" },
            "before": report.before.clone(),
            "current": report.current.clone(),
            "issues": report.issues.clone(),
        }),
    )?;
    Ok(report)
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

/// Récupère le corps (notes) d'une release GitHub précise, sans clé API.
/// Utilisé par la fenêtre « Nouveautés » au démarrage après une mise à jour
/// installée hors de l'updater interne (installeur téléchargé).
///
/// Retourne `None` (jamais une erreur bloquante) si : hors-ligne, release
/// absente, rate-limit GitHub, corps vide. L'UI affiche alors un repli
/// « Voir sur GitHub ».
#[cfg(desktop)]
#[tauri::command]
async fn fetch_release_notes(version: String) -> Result<Option<String>, String> {
    let version = version.trim().trim_start_matches('v');
    if version.is_empty() {
        return Ok(None);
    }
    let url = format!("https://api.github.com/repos/N7T0-OF/ZAILON/releases/tags/v{version}");
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(format!("ZAILON/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Unable to initialize the release notes fetch.".to_string())?
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(_) => return Ok(None), // hors-ligne / timeout → repli silencieux
    };
    if !response.status().is_success() {
        return Ok(None); // 404 / 403 rate-limit → repli silencieux
    }
    let release: serde_json::Value = match response.json().await {
        Ok(release) => release,
        Err(_) => return Ok(None),
    };
    let body = release
        .get("body")
        .and_then(|body| body.as_str())
        .map(str::to_string)
        .filter(|body| !body.trim().is_empty());
    Ok(body)
}

// ─────────────────── Add-ons : pipeline d'installation (spec §14-15, §65) ──

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
enum AddonInstallEvent {
    Started { total: u64 },
    Progress { received: u64 },
    Finished,
}

/// Vrai si l'octet de tête est une signature ZIP valide (spec « Pipeline » §1) :
/// `PK\x03\x04` (archive normale), `PK\x05\x06` (archive vide) ou `PK\x07\x08`
/// (archive spanned). Le format `.zailon-addon` est LOGIQUE : le contenu doit
/// être un ZIP — l'extension du fichier n'est jamais une preuve.
fn is_zip_archive(bytes: &[u8]) -> bool {
    bytes.len() >= 4
        && ((bytes[0] == b'P' && bytes[1] == b'K' && bytes[2] == 0x03 && bytes[3] == 0x04)
            || (bytes[0] == b'P' && bytes[1] == b'K' && bytes[2] == 0x05 && bytes[3] == 0x06)
            || (bytes[0] == b'P' && bytes[1] == b'K' && bytes[2] == 0x07 && bytes[3] == 0x08))
}

/// Télécharge un add-on depuis une URL HTTPS uniquement (spec §9, §14).
/// Jamais de mirror : la validation d'URL est renforcée côté UI (source
/// officielle ou URL choisie par l'utilisateur pour un add-on communautaire).
///
/// Le fichier téléchargé est validé AVANT écriture : status HTTP, type de
/// contenu (jamais une page d'erreur HTML/JSON) et magic bytes ZIP.
#[tauri::command]
async fn addon_download(
    url: String,
    dest_path: String,
    on_event: Channel<AddonInstallEvent>,
) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Add-on URL must use HTTPS.".into());
    }
    let response = reqwest::get(&url).await.map_err(to_error)?;
    if !response.status().is_success() {
        return Err(format!("Add-on download failed: {}", response.status()));
    }
    // Une page d'erreur GitHub (404 servie en HTML/JSON avec status 200 sur
    // certains CDN) n'est PAS un package : refus immédiat, jamais d'extraction.
    if let Some(content_type) = response.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(value) = content_type.to_str() {
            if value.to_ascii_lowercase().contains("text/html")
                || value.to_ascii_lowercase().contains("application/json")
            {
                return Err(
                    "Add-on download returned an error page (HTML/JSON) instead of the package — archive invalide."
                        .into(),
                );
            }
        }
    }
    let total = response.content_length().unwrap_or(0);
    let bytes = response.bytes().await.map_err(to_error)?;
    if bytes.len() > 1024 * 1024 * 1024 {
        return Err("Add-on archive exceeds 1 GiB.".into());
    }
    // L'extension `.zailon-addon` est un format LOGIQUE : le contenu doit être
    // un vrai ZIP. Refus propre d'un HTML/JSON d'erreur ou d'un fichier corrompu.
    if !is_zip_archive(&bytes) {
        return Err(
            "Add-on archive is invalid — the downloaded file is not a ZIP archive (error page or corrupt download)."
                .into(),
        );
    }
    let destination = std::path::Path::new(&dest_path);
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(to_error)?;
    }
    std::fs::write(destination, &bytes).map_err(to_error)?;
    let _ = on_event.send(AddonInstallEvent::Started { total });
    let _ = on_event.send(AddonInstallEvent::Progress {
        received: bytes.len() as u64,
    });
    let _ = on_event.send(AddonInstallEvent::Finished);
    Ok(())
}

/// Vérifie le SHA-256 d'un fichier téléchargé (spec §14). Refuse l'installation
/// si le hash ne correspond pas.
#[tauri::command]
fn addon_verify_sha256(path: String, expected: String) -> Result<bool, String> {
    let bytes = std::fs::read(&path).map_err(to_error)?;
    let actual = Sha256::digest(&bytes);
    let actual_hex = format!("{:x}", actual);
    Ok(actual_hex.eq_ignore_ascii_case(&expected))
}

/// Installe un add-on .zailon-addon (ZIP) : extraction en staging → swap
/// atomique → rollback (spec §15, §65). Jamais d'écrasement direct : l'ancien
/// répertoire est déplacé en backup, le staging prend sa place, le backup est
/// supprimé seulement après succès (restauré en cas d'échec).
#[tauri::command]
fn addon_install_staged(archive_path: String, install_dir: String) -> Result<(), String> {
    let archive = std::path::Path::new(&archive_path);
    let install = std::path::Path::new(&install_dir);
    // Le fichier `.zailon-addon` n'a PAS l'extension `.zip` : la validation se
    // fait sur le CONTENU (magic bytes ZIP), jamais sur l'extension (spec §1).
    let bytes = std::fs::read(archive).map_err(to_error)?;
    if !is_zip_archive(&bytes) {
        return Err(
            "Add-on archive is invalid — not a ZIP archive (error page or corrupt download)."
                .into(),
        );
    }
    let file = std::fs::File::open(archive).map_err(to_error)?;
    let mut zip = zip::ZipArchive::new(file).map_err(to_error)?;
    if zip.len() > 100_000 {
        return Err("Add-on archive contains too many entries.".into());
    }
    let parent = install
        .parent()
        .ok_or_else(|| "Invalid add-on install directory.".to_string())?;
    let token = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let staging = parent.join(format!(".zailon-addon-staging-{}", token));
    let backup = parent.join(format!(".zailon-addon-backup-{}", token));
    std::fs::create_dir_all(&staging).map_err(to_error)?;

    let mut manifest_found = false;
    {
        const MAX_ADDON_EXTRACTED_BYTES: u64 = 512 * 1024 * 1024;
        let mut total = 0u64;
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(to_error)?;
            if archive_is_symlink(entry.unix_mode()) {
                let _ = std::fs::remove_dir_all(&staging);
                return Err("Add-on archive contains a symbolic link.".into());
            }
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| "Add-on archive contains an unsafe path.".to_string())?;
            validate_archive_relative(&relative)?;
            total = total.saturating_add(entry.size());
            if total > MAX_ADDON_EXTRACTED_BYTES {
                let _ = std::fs::remove_dir_all(&staging);
                return Err("Add-on archive exceeds the extraction limit.".into());
            }
            let output = staging.join(&relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&output).map_err(to_error)?;
            } else {
                if let Some(parent_dir) = output.parent() {
                    std::fs::create_dir_all(parent_dir).map_err(to_error)?;
                }
                let mut reader = std::io::BufReader::new(entry);
                let mut writer = std::fs::File::create(&output).map_err(to_error)?;
                std::io::copy(&mut reader, &mut writer).map_err(to_error)?;
                if relative == std::path::Path::new("manifest.json") {
                    manifest_found = true;
                }
            }
        }
    }
    if !manifest_found {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("Add-on archive is missing manifest.json.".into());
    }

    if install.exists() {
        std::fs::rename(install, &backup).map_err(to_error)?;
    }
    match std::fs::rename(&staging, install) {
        Ok(()) => {
            if backup.exists() {
                let _ = std::fs::remove_dir_all(&backup);
            }
            Ok(())
        }
        Err(error) => {
            // Rollback : restaure l'ancienne version si le swap a échoué.
            if backup.exists() {
                let _ = std::fs::rename(&backup, install);
            }
            Err(to_error(error))
        }
    }
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
            framework_providers: HashSet::new(),
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
    fn sha256_hex_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn find_cached_resource_reuses_existing_file_by_prefix() {
        let root = std::env::temp_dir().join(format!("zailon-art-cache-{}", unix_timestamp()));
        fs::create_dir_all(&root).unwrap();
        let existing = root.join("cover-deadbeef.webp");
        fs::write(&existing, b"RIFF____WEBP").unwrap();
        assert_eq!(
            find_cached_resource(&root, "cover-deadbeef"),
            Some(existing)
        );
        assert_eq!(find_cached_resource(&root, "cover-otherhash"), None);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn cleanup_orphaned_resources_deletes_only_unreferenced_artwork() {
        let root = std::env::temp_dir().join(format!("zailon-cleanup-{}", unix_timestamp()));
        let resources = root.join("game-a").join("resources");
        fs::create_dir_all(&resources).unwrap();
        let referenced_file = resources.join("cover-aaaa.webp");
        let orphan_file = resources.join("cover-remote-1699999999.jpg");
        let unknown_file = resources.join("notes.txt");
        fs::write(&referenced_file, b"RIFF____WEBP").unwrap();
        fs::write(&orphan_file, b"jpg").unwrap();
        fs::write(&unknown_file, b"keep").unwrap();
        // « Vieillir » les fichiers : `now` est dans le futur de > 1 h, donc la
        // garde « modifié depuis < 1 h » est franchie sans toucher aux mtimes.
        let referenced: HashSet<String> = [resource_cleanup_fingerprint(&referenced_file)].into();
        let result = cleanup_orphaned_resources_in(&root, &referenced, unix_timestamp() + 7200);
        assert_eq!(result.removed, 1);
        assert_eq!(result.freed_bytes, 3);
        assert!(!orphan_file.exists());
        assert!(referenced_file.exists());
        assert!(unknown_file.exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn cleanup_orphaned_resources_never_touches_recent_files() {
        let root = std::env::temp_dir().join(format!("zailon-cleanup-recent-{}", unix_timestamp()));
        let resources = root.join("game-a").join("resources");
        fs::create_dir_all(&resources).unwrap();
        let fresh_orphan = resources.join("banner-remote-1700000000.png");
        fs::write(&fresh_orphan, b"png").unwrap(); // mtime = maintenant
        let result = cleanup_orphaned_resources_in(&root, &HashSet::new(), unix_timestamp());
        assert_eq!(result.removed, 0);
        assert!(fresh_orphan.exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn citizenfx_iv_path_reads_game_path_without_modifying() {
        let ini = "[Game]\nIVPath=G:\\Games\\GTAV\nUpdateChannel=beta\nSavedBuildNumber=3570\n\n[Addons]\n";
        assert_eq!(citizenfx_iv_path(ini), Some("G:\\Games\\GTAV".to_string()));
        assert_eq!(
            citizenfx_iv_path("[game]\nivpath=\"C:\\GTA V\"\n"),
            Some("C:\\GTA V".to_string())
        );
        assert_eq!(citizenfx_iv_path("[Addons]\nReShade5=ID:abc\n"), None);
    }

    #[test]
    fn zip_magic_detects_real_zips_and_rejects_error_pages() {
        // ZIP normal (PK\x03\x04), vide (PK\x05\x06), spanned (PK\x07\x08).
        assert!(is_zip_archive(&[b'P', b'K', 0x03, 0x04, 0x00, 0x00]));
        assert!(is_zip_archive(&[b'P', b'K', 0x05, 0x06, 0x00, 0x00]));
        assert!(is_zip_archive(&[b'P', b'K', 0x07, 0x08, 0x00, 0x00]));
        // Page d'erreur GitHub (HTML), JSON d'erreur, fichier corrompu, court.
        assert!(!is_zip_archive(
            b"<!DOCTYPE html><html><body>404</body></html>"
        ));
        assert!(!is_zip_archive(b"{\"error\":\"Not Found\"}"));
        assert!(!is_zip_archive(b"PK"));
        assert!(!is_zip_archive(&[]));
        assert!(!is_zip_archive(&[b'P', b'K', 0x03, 0x00]));
    }

    #[test]
    fn mods_folder_fingerprint_changes_on_rename_add_and_missing() {
        let dir = TempPackDir::new("fingerprint");
        let root = dir.path();
        fs::create_dir_all(root.join("Mod A")).unwrap();
        fs::create_dir_all(root.join("Mod B")).unwrap();
        let before = mods_folder_fingerprint(root.to_string_lossy().to_string()).unwrap();
        assert!(!before.is_empty());

        // Renommage (toggle DISABLED_*) → empreinte différente.
        fs::rename(root.join("Mod A"), root.join("DISABLED_Mod A")).unwrap();
        let after_rename = mods_folder_fingerprint(root.to_string_lossy().to_string()).unwrap();
        assert_ne!(before, after_rename);

        // Ajout d'un mod → empreinte différente.
        fs::create_dir_all(root.join("Mod C")).unwrap();
        let after_add = mods_folder_fingerprint(root.to_string_lossy().to_string()).unwrap();
        assert_ne!(after_rename, after_add);

        // Dossier inexistant → vide (jamais de scan).
        assert_eq!(
            mods_folder_fingerprint(root.join("missing").to_string_lossy().to_string()).unwrap(),
            ""
        );
    }

    struct TempPackDir(PathBuf);

    impl TempPackDir {
        fn new(label: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("zailon-pack-test-{label}-{}", unix_timestamp()));
            fs::create_dir_all(&dir).unwrap();
            TempPackDir(dir)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempPackDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_test_pack_zip(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        for (name, content) in [
            ("mods/vehicles.meta", "META"),
            ("plugins/dxgi.dll", "NEWDLL"),
            ("presets/natural.ini", "PRESET"),
        ] {
            writer.start_file(name, zip_options()).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn fivem_pack_scan_lists_real_zip_entries() {
        let dir = TempPackDir::new("scan");
        let zip_path = dir.path().join("pack.zip");
        write_test_pack_zip(&zip_path);
        let scanned = fivem_pack_scan(zip_path.to_string_lossy().to_string()).unwrap();
        assert!(scanned.is_archive);
        assert_eq!(scanned.files.len(), 3);
        assert!(scanned.files.contains(&"plugins/dxgi.dll".to_string()));
        assert!(scanned.files.contains(&"mods/vehicles.meta".to_string()));
    }

    #[test]
    fn fivem_pack_apply_installs_backs_up_and_removes_with_rollback() {
        let dir = TempPackDir::new("apply");
        let zip_path = dir.path().join("pack.zip");
        write_test_pack_zip(&zip_path);
        let target = dir.path().join("FiveM.app");
        fs::create_dir_all(target.join("plugins")).unwrap();
        fs::write(target.join("plugins/dxgi.dll"), "OLD").unwrap();
        let manifest = serde_json::json!({
            "schemaVersion": 1,
            "kind": "FiveMGraphicPack",
            "name": "Test Pack",
            "installedAt": null,
            "sensitive": [],
            "files": [
                { "target": "mods/vehicles.meta", "source": "mods/vehicles.meta", "kind": "mods" },
                { "target": "plugins/dxgi.dll", "source": "plugins/dxgi.dll", "kind": "plugins" },
                { "target": "presets/natural.ini", "source": "presets/natural.ini", "kind": "reshade-config" },
            ],
        })
        .to_string();

        let applied = fivem_pack_apply(
            zip_path.to_string_lossy().to_string(),
            target.to_string_lossy().to_string(),
            manifest,
        )
        .unwrap();
        assert_eq!(applied.installed, 3);
        assert_eq!(applied.backups, 1);
        assert_eq!(
            fs::read_to_string(target.join("plugins/dxgi.dll")).unwrap(),
            "NEWDLL"
        );
        assert_eq!(
            fs::read_to_string(target.join("mods/vehicles.meta")).unwrap(),
            "META"
        );
        let backup_exists = fs::read_dir(target.join("plugins"))
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains("zailon-pack-backup")
            });
        assert!(backup_exists, "un backup du fichier existant doit exister");

        let read = fivem_pack_manifest(target.to_string_lossy().to_string()).unwrap();
        assert!(read.exists);
        assert_eq!(read.file_count, 3);
        assert_eq!(read.name.as_deref(), Some("Test Pack"));

        // Rollback : le fichier pré-existant est RESTAURÉ, les nouveaux supprimés.
        let removed = fivem_pack_remove(target.to_string_lossy().to_string()).unwrap();
        assert_eq!(removed.restored, 1);
        assert_eq!(removed.removed, 2);
        assert_eq!(
            fs::read_to_string(target.join("plugins/dxgi.dll")).unwrap(),
            "OLD"
        );
        assert!(!target.join("mods/vehicles.meta").exists());
        assert!(!target.join("presets/natural.ini").exists());
        assert!(!target.join("zailon-manifest.json").exists());
        assert!(fivem_pack_remove(target.to_string_lossy().to_string()).is_err());
    }

    #[test]
    fn converts_mo2_reverse_modlist_order_and_preserves_separators() {
        let root = std::env::temp_dir().join(format!(
            "zailon-mo2-modlist-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("fixture root");
        let path = root.join("modlist.txt");
        fs::write(
            &path,
            "# This file was automatically generated by Mod Organizer.\n+Winning Mod\n+Visuals_separator\n-Disabled Mod\n+Lowest Mod\n",
        )
        .expect("modlist fixture");
        let entries = parse_mo2_modlist(&path).expect("parse MO2 modlist");
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].name, "Winning Mod");
        assert_eq!(entries[0].priority, 3);
        assert!(entries[0].enabled);
        assert!(entries[1].separator);
        assert_eq!(entries[2].priority, 1);
        assert!(!entries[2].enabled);
        assert_eq!(entries[3].priority, 0);
        fs::remove_dir_all(root).expect("remove MO2 modlist fixture");
    }

    #[test]
    fn mo2_ini_reader_counts_sensitive_keys_without_exposing_values() {
        let root = std::env::temp_dir().join(format!(
            "zailon-mo2-ini-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("fixture root");
        let path = root.join("ModOrganizer.ini");
        fs::write(
            &path,
            "[General]\nversion=2.5.2\ngameName=Cyberpunk 2077\nnexusApiKey=never-return-this\nselected_profile=Default\n",
        )
        .expect("ini fixture");
        let document = read_ini_document(&path).expect("parse MO2 ini");
        assert_eq!(ini_value(&document, &["version"]).as_deref(), Some("2.5.2"));
        assert_eq!(mo2_secret_key_count(&document), 1);
        let serialized = serde_json::to_string(&Mo2ImportPreview {
            root: "fixture".into(),
            version: ini_value(&document, &["version"]),
            install_type: "Portable".into(),
            game_name: ini_value(&document, &["gamename"]),
            selected_profile: ini_value(&document, &["selected_profile"]),
            profiles: Vec::new(),
            executables: Vec::new(),
            installed_mods: 0,
            downloads: 0,
            overwrite_files: 0,
            overwrite_bytes: 0,
            plugin_files: 0,
            hidden_files: 0,
            secret_keys_detected: mo2_secret_key_count(&document),
            required_bytes: 0,
            warnings: Vec::new(),
        })
        .expect("serialize preview");
        assert!(!serialized.contains("never-return-this"));
        fs::remove_dir_all(root).expect("remove MO2 ini fixture");
    }

    #[test]
    fn mo2_hidden_files_become_profile_rules() {
        let root = std::env::temp_dir().join(format!(
            "zailon-mo2-hidden-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(root.join("archive/pc/mod")).expect("fixture tree");
        fs::write(
            root.join("archive/pc/mod/disabled.archive.mohidden"),
            b"hidden",
        )
        .expect("hidden fixture");
        fs::write(root.join("archive/pc/mod/visible.archive"), b"visible")
            .expect("visible fixture");
        let rules = mo2_hidden_rules(&root, "stage-1").expect("hidden rules");
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0]["modId"], "stage-1");
        assert_eq!(rules[0]["path"], "archive/pc/mod/disabled.archive");
        fs::remove_dir_all(root).expect("remove MO2 hidden fixture");
    }

    #[test]
    fn mo2_download_metadata_is_sanitized_before_copy() {
        let root = std::env::temp_dir().join(format!(
            "zailon-mo2-download-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).expect("download fixture root");
        fs::write(source.join("mod.zip"), b"archive").expect("download archive");
        fs::write(
            source.join("mod.zip.meta"),
            "[General]\nmodName=Example\nmodID=42\nurl=https://example.invalid/?token=private-token\nuserData=private-user-data\n",
        )
        .expect("download metadata");
        assert_eq!(
            copy_mo2_downloads(&source, &destination).expect("sanitized download copy"),
            2
        );
        let metadata = fs::read_to_string(destination.join("mod.zip.meta.sanitized.json"))
            .expect("sanitized metadata");
        assert!(metadata.contains("Example"));
        assert!(metadata.contains("\"modid\": \"42\""));
        assert!(!metadata.contains("private-token"));
        assert!(!metadata.contains("private-user-data"));
        assert!(!destination.join("mod.zip.meta").exists());
        fs::remove_dir_all(root).expect("remove MO2 download fixture");
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
    fn nexus_gallery_parser_keeps_only_full_images_for_the_requested_mod() {
        let html = r#"
          <a class="mod-image featured" href="https://staticdelivery.nexusmods.com/mods/3333/images/107/107-1.png"></a>
          <a href="https://staticdelivery.nexusmods.com/mods/3333/images/107/107-2.jpeg" class="mod-image"></a>
          <a class="mod-image" href="https://staticdelivery.nexusmods.com/mods/3333/images/thumbnails/107/107-3.png"></a>
          <a class="mod-image" href="https://staticdelivery.nexusmods.com/mods/3333/images/108/108-1.png"></a>
          <a class="mod-image" href="https://evil.example/mods/3333/images/107/107-4.png"></a>
          <a class="mod-image" href="https://staticdelivery.nexusmods.com/mods/3333/images/107/107-1.png"></a>
        "#;
        assert_eq!(
            nexus_gallery_images_from_html(html, 107),
            vec![
                "https://staticdelivery.nexusmods.com/mods/3333/images/107/107-1.png",
                "https://staticdelivery.nexusmods.com/mods/3333/images/107/107-2.jpeg",
            ]
        );
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
    fn cyberpunk_root_wrapper_wins_over_top_level_license_directories() {
        let root = std::env::temp_dir().join(format!(
            "zailon-cyberpunk-wrapper-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let package = root.join("RED4ext");
        fs::create_dir_all(package.join("red4ext")).expect("license directory");
        fs::create_dir_all(package.join("root/red4ext")).expect("runtime directory");
        fs::create_dir_all(package.join("root/bin/x64")).expect("loader directory");
        fs::write(package.join("red4ext/LICENSE.txt"), b"license").expect("license");
        fs::write(package.join("root/red4ext/RED4ext.dll"), b"MZruntime").expect("runtime");
        fs::write(package.join("root/bin/x64/winmm.dll"), b"MZloader").expect("loader");

        assert_eq!(cyberpunk_package_root(&package), package.join("root"));
        let providers = detect_cyberpunk_framework_providers(&cyberpunk_package_root(&package));
        assert!(providers.contains("red4ext"));
        fs::remove_dir_all(root).expect("remove wrapper fixture");
    }

    #[test]
    fn complete_redscript_signatures_admit_only_its_expected_runtime() {
        let root = std::env::temp_dir().join(format!(
            "zailon-redscript-provider-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let package = root.join("redscript");
        fs::create_dir_all(package.join("engine/tools")).expect("tools");
        fs::create_dir_all(package.join("engine/config/base")).expect("config");
        fs::create_dir_all(package.join("r6/config/cybercmd")).expect("cybercmd");
        fs::write(package.join("engine/tools/scc.exe"), b"MZcompiler").expect("compiler");
        fs::write(package.join("engine/tools/scc_lib.dll"), b"MZlibrary").expect("library");
        fs::write(package.join("engine/config/base/scripts.ini"), b"[Scripts]")
            .expect("scripts config");
        fs::write(package.join("r6/config/cybercmd/scc.toml"), b"enabled=true")
            .expect("cybercmd config");
        let content = root.join("content");
        fs::create_dir_all(&content).expect("content");
        let cancel = AtomicBool::new(false);
        let mut security = test_security_context(&root, &content, "Cyberpunk 2077", "quarantine");

        stage_content(&package, &content, "Cyberpunk 2077", &cancel, &mut security)
            .expect("stage complete provider");
        assert!(content.join("engine/tools/scc.exe").is_file());
        assert!(content.join("engine/tools/scc_lib.dll").is_file());
        assert!(!root.join("quarantine/files/engine/tools/scc.exe").exists());
        assert!(security
            .assessments
            .iter()
            .all(|assessment| assessment.may_deploy));
        fs::remove_dir_all(root).expect("remove provider fixture");
    }

    #[test]
    fn reused_redscript_package_is_repaired_from_the_selected_source() {
        let root = std::env::temp_dir().join(format!(
            "zailon-redscript-reuse-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let source = root.join("source");
        let stage = root.join("stage-1");
        fs::create_dir_all(source.join("engine/tools")).expect("source tools");
        fs::create_dir_all(source.join("engine/config/base")).expect("source config");
        fs::create_dir_all(source.join("r6/config/cybercmd")).expect("source cybercmd");
        fs::write(source.join("engine/tools/scc.exe"), b"MZcompiler").expect("compiler");
        fs::write(source.join("engine/tools/scc_lib.dll"), b"MZlibrary").expect("library");
        fs::write(source.join("engine/config/base/scripts.ini"), b"[Scripts]")
            .expect("scripts config");
        fs::write(source.join("r6/config/cybercmd/scc.toml"), b"enabled=true")
            .expect("cybercmd config");
        fs::create_dir_all(stage.join("content/engine/config/base")).expect("stage config");
        fs::create_dir_all(stage.join("content/r6/config/cybercmd")).expect("stage cybercmd");
        fs::write(
            stage.join("content/engine/config/base/scripts.ini"),
            b"[Scripts]",
        )
        .expect("staged config");
        fs::write(
            stage.join("content/r6/config/cybercmd/scc.toml"),
            b"enabled=true",
        )
        .expect("staged cybercmd");
        fs::write(
            stage.join("manifest.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "diagnostics": [],
                "sensitiveFiles": []
            }))
            .expect("manifest json"),
        )
        .expect("manifest");

        let recovered =
            repair_reused_framework_package_from_source(&stage, &source, "Cyberpunk 2077")
                .expect("repair reused provider");
        assert_eq!(recovered.len(), 2);
        assert!(stage.join("content/engine/tools/scc.exe").is_file());
        assert!(stage.join("content/engine/tools/scc_lib.dll").is_file());
        fs::remove_dir_all(root).expect("remove reuse fixture");
    }

    #[test]
    fn broken_redscript_package_recovers_only_verified_quarantine_files() {
        let root = std::env::temp_dir().join(format!(
            "zailon-redscript-quarantine-recovery-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let stage = root.join("stage-1");
        let quarantine = root.join("quarantine");
        fs::create_dir_all(stage.join("content/engine/config/base")).expect("stage config");
        fs::create_dir_all(stage.join("content/r6/config/cybercmd")).expect("stage cybercmd");
        fs::create_dir_all(quarantine.join("task/files/engine/tools")).expect("quarantine tools");
        fs::write(
            stage.join("content/engine/config/base/scripts.ini"),
            b"[Scripts]",
        )
        .expect("staged config");
        fs::write(
            stage.join("content/r6/config/cybercmd/scc.toml"),
            b"enabled=true",
        )
        .expect("staged cybercmd");
        let compiler = quarantine.join("task/files/engine/tools/scc.exe");
        let library = quarantine.join("task/files/engine/tools/scc_lib.dll");
        fs::write(&compiler, b"MZcompiler").expect("quarantined compiler");
        fs::write(&library, b"MZlibrary").expect("quarantined library");
        let assessment = |relative: &str, source: &Path| SensitiveFileAssessment {
            relative_path: relative.into(),
            detected_type: "Executable".into(),
            extension: source
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .into(),
            magic_type: "PE/COFF".into(),
            size: source.metadata().expect("metadata").len(),
            hash: file_sha256(source).expect("hash"),
            signature_status: "Unknown".into(),
            publisher: None,
            source_provider: None,
            source_mod_id: None,
            expected_by_manifest: false,
            expected_by_game_adapter: false,
            execution_required: false,
            install_destination: relative.into(),
            risk_level: "Caution".into(),
            reasons: Vec::new(),
            recommended_action: "quarantine".into(),
            decision: Some("quarantined".into()),
            may_deploy: false,
        };
        fs::write(
            stage.join("manifest.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "diagnostics": [],
                "sensitiveFiles": [
                    assessment("engine/tools/scc.exe", &compiler),
                    assessment("engine/tools/scc_lib.dll", &library)
                ],
                "quarantinePaths": [
                    compiler.to_string_lossy(),
                    library.to_string_lossy()
                ]
            }))
            .expect("manifest json"),
        )
        .expect("manifest");

        let recovered = recover_framework_runtimes_from_quarantine(&stage, &quarantine)
            .expect("recover quarantined provider");
        assert_eq!(recovered.len(), 2);
        assert!(stage.join("content/engine/tools/scc.exe").is_file());
        assert!(stage.join("content/engine/tools/scc_lib.dll").is_file());
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(stage.join("manifest.json")).expect("manifest read"))
                .expect("manifest parse");
        assert!(manifest["sensitiveFiles"]
            .as_array()
            .expect("assessments")
            .iter()
            .all(|item| item["decision"] == "restored-from-verified-quarantine"));
        fs::remove_dir_all(root).expect("remove quarantine recovery fixture");
    }

    #[test]
    fn red4ext_plugin_is_not_mistaken_for_the_red4ext_provider() {
        let root = std::env::temp_dir().join(format!(
            "zailon-red4ext-provider-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(root.join("red4ext/plugins/Example")).expect("plugin");
        fs::write(
            root.join("red4ext/plugins/Example/Example.dll"),
            b"MZplugin",
        )
        .expect("plugin file");
        assert!(!detect_cyberpunk_framework_providers(&root).contains("red4ext"));
        fs::create_dir_all(root.join("bin/x64")).expect("loader");
        fs::write(root.join("red4ext/RED4ext.dll"), b"MZruntime").expect("runtime");
        fs::write(root.join("bin/x64/winmm.dll"), b"MZloader").expect("loader file");
        assert!(detect_cyberpunk_framework_providers(&root).contains("red4ext"));
        fs::remove_dir_all(root).expect("remove RED4ext fixture");
    }

    #[test]
    fn package_manifest_normalizes_legacy_storage_prefixes() {
        let root = std::env::temp_dir().join(format!(
            "zailon-package-manifest-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let stage = root.join("package-1");
        fs::create_dir_all(stage.join("content/root/r6/scripts/Example")).expect("content");
        fs::write(
            stage.join("content/root/r6/scripts/Example/main.reds"),
            b"script",
        )
        .expect("script");
        fs::write(stage.join("manifest.json"), b"{}").expect("manifest");
        let (entries, _) =
            package_manifest_entries(&stage, "game-1", true).expect("package manifest");
        assert_eq!(entries.len(), 1);
        assert_eq!(
            entries[0].package_relative_path,
            "root/r6/scripts/Example/main.reds"
        );
        assert_eq!(
            entries[0].game_relative_path,
            "r6/scripts/Example/main.reds"
        );
        assert!(stage.join("package-manifest.json").is_file());
        let manifest =
            fs::read_to_string(stage.join("package-manifest.json")).expect("read package manifest");
        assert!(manifest.contains("\"sourcePhysicalPath\""));
        assert!(manifest.contains("\"gameRelativePath\""));
        fs::remove_dir_all(root).expect("remove manifest fixture");
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
    fn interrupted_deployment_journal_restores_originals_and_removes_deployed_files() {
        let root = std::env::temp_dir().join(format!(
            "zailon-interrupted-deployment-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let game_root = root.join("game");
        let session_root = root.join("session");
        let overwrite_root = root.join("overwrite");
        let original_relative = PathBuf::from("bin/x64/original.dll");
        let added_relative = PathBuf::from("red4ext/plugins/example.dll");
        let original_destination = game_root.join(&original_relative);
        let added_destination = game_root.join(&added_relative);
        let original_backup = session_root.join("backup").join(&original_relative);
        fs::create_dir_all(original_destination.parent().expect("original parent"))
            .expect("original tree");
        fs::create_dir_all(added_destination.parent().expect("added parent")).expect("added tree");
        fs::create_dir_all(original_backup.parent().expect("backup parent")).expect("backup tree");
        fs::write(&original_backup, b"original-runtime").expect("original backup");
        fs::write(&original_destination, b"deployed-runtime").expect("deployed replacement");
        fs::write(&added_destination, b"new-mod-file").expect("new deployed file");
        let session = DeploymentSession {
            game_root: fs::canonicalize(&game_root).expect("canonical game root"),
            session_root: session_root.clone(),
            overwrite_root,
            entries: Vec::new(),
        };
        update_deployment_session_state(&session, "preparing", None).expect("session state");
        append_deployment_journal(
            &session,
            &DeploymentEntry {
                relative: original_relative.clone(),
                had_original: true,
                deployed_signature: file_signature(&original_destination)
                    .expect("replacement signature"),
            },
        )
        .expect("replacement journal");
        append_deployment_journal(
            &session,
            &DeploymentEntry {
                relative: added_relative.clone(),
                had_original: false,
                deployed_signature: file_signature(&added_destination).expect("added signature"),
            },
        )
        .expect("added journal");

        assert_eq!(
            recover_deployment_session(&session_root, &session.game_root)
                .expect("recover interrupted deployment"),
            2
        );
        assert_eq!(
            fs::read(original_destination).expect("restored original"),
            b"original-runtime"
        );
        assert!(!added_destination.exists());
        let state: serde_json::Value = serde_json::from_slice(
            &fs::read(session_root.join("session.json")).expect("recovered state"),
        )
        .expect("valid recovered state");
        assert_eq!(state["status"], "recovered");
        assert_eq!(state["recoveredEntries"], 2);
        fs::remove_dir_all(root).expect("remove interrupted deployment test");
    }

    #[test]
    fn failed_cleanup_preserves_backup_and_marks_session_for_recovery() {
        let root = std::env::temp_dir().join(format!(
            "zailon-failed-cleanup-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let game_root = root.join("game");
        let session_root = root.join("session");
        let relative = PathBuf::from("archive/pc/mod/original.archive");
        let destination = game_root.join(&relative);
        fs::create_dir_all(destination.parent().expect("destination parent"))
            .expect("destination tree");
        fs::create_dir_all(&session_root).expect("session tree");
        fs::write(&destination, b"deployed").expect("deployed file");
        let result = finish_temporary_copy(
            DeploymentSession {
                game_root,
                session_root: session_root.clone(),
                overwrite_root: root.join("overwrite"),
                entries: vec![DeploymentEntry {
                    relative,
                    had_original: true,
                    deployed_signature: file_signature(&destination).expect("deployed signature"),
                }],
            },
            false,
        );
        assert!(result.is_err());
        assert!(session_root.exists());
        let state: serde_json::Value = serde_json::from_slice(
            &fs::read(session_root.join("session.json")).expect("recovery state"),
        )
        .expect("valid recovery state");
        assert_eq!(state["status"], "recovery-required");
        fs::remove_dir_all(root).expect("remove failed cleanup test");
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
    fn addon_gate_filters_enabled_ids() {
        let gate = AddonGate(Arc::new(Mutex::new(
            ["official.zailon.frosty".to_string()].into_iter().collect(),
        )));
        let enabled = gate.0.lock().unwrap();
        assert!(enabled.contains("official.zailon.frosty"));
        assert!(!enabled.contains("official.zailon.provider.nexus"));
    }

    #[test]
    fn find_frosty_runtime_prefers_modmanager() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-detect-{}", unix_timestamp()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("FrostyModManager.exe"), b"mm").unwrap();
        std::fs::write(dir.join("FrostyEditor.exe"), b"ed").unwrap();
        let found = find_frosty_runtime_in(&[dir.clone()]);
        assert!(found.is_some());
        let (path, name, size) = found.unwrap();
        assert_eq!(name, "FrostyModManager.exe");
        assert_eq!(size, 2);
        assert!(path.to_string_lossy().ends_with("FrostyModManager.exe"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_frosty_runtime_returns_none_when_absent() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-none-{}", unix_timestamp()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(find_frosty_runtime_in(&[dir.clone()]).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn frosty_read_cat_file_rejects_outside_root() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-cat-{}", unix_timestamp()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("cat.bin"), b"NyanNyanNyanNyan").unwrap();
        // Lecture valide sous la racine.
        let bytes =
            frosty_read_cat_file(dir.to_string_lossy().to_string(), "cat.bin".to_string()).unwrap();
        assert_eq!(bytes, b"NyanNyanNyanNyan");
        // Chemin relatif qui sort de la racine → refusé.
        assert!(frosty_read_cat_file(
            dir.to_string_lossy().to_string(),
            "../outside.bin".to_string()
        )
        .is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn frosty_scan_game_data_lists_real_files() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-scan-{}", unix_timestamp()));
        std::fs::create_dir_all(dir.join("Data").join("Win32")).unwrap();
        std::fs::write(
            dir.join("Data").join("Win32").join("cas_01.cas"),
            vec![0u8; 64],
        )
        .unwrap();
        std::fs::write(dir.join("Data").join("cat.bin"), b"catalogue").unwrap();
        let files = frosty_scan_game_data(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files
            .iter()
            .any(|f| f.path.ends_with("cas_01.cas") && f.size == 64));
        assert!(files
            .iter()
            .any(|f| f.path.ends_with("cat.bin") && f.size == 9));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_fbmods_in_lists_only_top_level_fbmod() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-import-{}", unix_timestamp()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("NightVisuals.fbmod"), vec![0u8; 12]).unwrap();
        std::fs::write(dir.join("HEAT.FBMOD"), b"heat").unwrap();
        std::fs::write(dir.join("readme.txt"), b"pas un mod").unwrap();
        // .fbmod dans un sous-dossier : pas de récursion (entrées de premier niveau).
        std::fs::write(dir.join("sub").join("nested.fbmod"), b"nested").unwrap();
        let mods = list_fbmods_in(&dir);
        assert_eq!(mods.len(), 2);
        assert!(mods.iter().any(|m| m.name == "HEAT.FBMOD" && m.size == 4));
        assert!(mods
            .iter()
            .any(|m| m.name == "NightVisuals.fbmod" && m.size == 12));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn frosty_detect_installation_finds_fbmods_in_extra_path() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-install-{}", unix_timestamp()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("CoolMod.fbmod"), vec![0u8; 32]).unwrap();
        std::fs::write(dir.join("OtherMod.fbmod"), b"other").unwrap();
        let installation =
            frosty_detect_installation(vec![dir.to_string_lossy().to_string()]).unwrap();
        assert!(installation.exists);
        assert_eq!(installation.file_count, 2);
        assert_eq!(installation.total_bytes, 37);
        assert!(installation.mods_dir.is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn frosty_detect_installation_returns_not_exists_when_no_fbmod() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-empty-{}", unix_timestamp()));
        std::fs::create_dir_all(&dir).unwrap();
        let installation =
            frosty_detect_installation(vec![dir.to_string_lossy().to_string()]).unwrap();
        assert!(!installation.exists);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn process_is_running_for_current_pid() {
        assert!(process_is_running(std::process::id()));
    }

    #[test]
    fn save_project_archive_writes_atomically() {
        let dir = std::env::temp_dir().join(format!("zailon-frosty-test-{}", unix_timestamp()));
        let target = dir.join("projet.zailon-frosty-project");
        save_project_archive(
            target.to_string_lossy().to_string(),
            b"contenu de l'archive".to_vec(),
        )
        .expect("écriture");
        let bytes = std::fs::read(&target).expect("lecture");
        assert_eq!(bytes, b"contenu de l'archive");
        // Réécriture (remplacement) : toujours atomique.
        save_project_archive(target.to_string_lossy().to_string(), b"v2".to_vec())
            .expect("réécriture");
        assert_eq!(std::fs::read(&target).unwrap(), b"v2");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verifies_ed25519_addon_signature_and_rejects_tampering() {
        use base64::Engine;
        use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
        use sha2::{Digest, Sha256};

        let seed = [7u8; 32];
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key: VerifyingKey = signing_key.verifying_key();

        let payload: Vec<u8> = b"zailon-addon-content".to_vec();
        let digest = Sha256::digest(&payload);
        let signature = signing_key.sign(&digest);
        let signature_b64 = base64::engine::general_purpose::STANDARD.encode(signature.to_bytes());
        let key_b64 = base64::engine::general_purpose::STANDARD.encode(verifying_key.to_bytes());

        let path = std::env::temp_dir().join(format!(
            "zailon-addon-sig-test-{}-{}.bin",
            unix_timestamp(),
            std::process::id()
        ));
        std::fs::write(&path, &payload).unwrap();

        // Vérification positive — mêmes étapes que la commande native.
        let bytes = std::fs::read(&path).unwrap();
        let file_digest = Sha256::digest(&bytes);
        let key_bytes: [u8; 32] = base64::engine::general_purpose::STANDARD
            .decode(key_b64.as_bytes())
            .unwrap()
            .try_into()
            .unwrap();
        let verifying = VerifyingKey::from_bytes(&key_bytes).unwrap();
        let sig_bytes = base64::engine::general_purpose::STANDARD
            .decode(signature_b64.as_bytes())
            .unwrap();
        let parsed_sig = ed25519_dalek::Signature::from_slice(&sig_bytes).unwrap();
        assert!(verifying.verify_strict(&file_digest, &parsed_sig).is_ok());

        // Altération du fichier → la signature ne passe plus.
        std::fs::write(&path, b"tampered-content").unwrap();
        let tampered_digest = Sha256::digest(std::fs::read(&path).unwrap());
        assert!(verifying
            .verify_strict(&tampered_digest, &parsed_sig)
            .is_err());

        // Rejets runtime de la clé publique : base64 invalide, mauvaise taille.
        let short_key_b64 = base64::engine::general_purpose::STANDARD.encode([0u8; 31]);
        assert!(parse_verifying_key(&short_key_b64).is_err());
        assert!(parse_verifying_key("### pas du base64 ###").is_err());

        // Signature de mauvaise taille (63 octets au lieu de 64) → rejetée.
        assert!(ed25519_dalek::Signature::from_slice(&[0u8; 63]).is_err());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn validates_remote_image_signatures_and_nexus_domains() {
        assert!(valid_image_bytes(b"\x89PNG\r\n\x1a\nrest", "png"));
        assert!(!valid_image_bytes(b"MZ executable", "png"));
        assert!(valid_nexus_domain("skyrimspecialedition"));
        assert!(!valid_nexus_domain("../outside"));
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
    fn package_fingerprint_is_content_strict_and_ignores_the_root_folder_name() {
        let root = std::env::temp_dir().join(format!(
            "zailon-package-identity-test-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let renamed_a = root.join("Friendly Mod Name");
        let renamed_b = root.join("Renamed Copy");
        fs::create_dir_all(renamed_a.join("r6/scripts")).expect("first content tree");
        fs::create_dir_all(renamed_b.join("r6/scripts")).expect("second content tree");
        fs::write(renamed_a.join("r6/scripts/main.reds"), b"version-one").expect("first content");
        fs::write(renamed_b.join("r6/scripts/main.reds"), b"version-one")
            .expect("same renamed content");
        assert_eq!(fingerprint_path(&renamed_a), fingerprint_path(&renamed_b));

        fs::write(renamed_b.join("r6/scripts/main.reds"), b"version-two")
            .expect("same-size changed content");
        assert_ne!(fingerprint_path(&renamed_a), fingerprint_path(&renamed_b));
        fs::remove_dir_all(root).expect("remove package identity test");
    }

    #[test]
    fn post_update_counts_games_profiles_and_packages_without_private_fields() {
        let snapshot = serde_json::json!({
            "state": {
                "games": [
                    { "profiles": [{ "id": "a" }, { "id": "b" }], "installedMods": [{ "id": "m1" }] },
                    { "profiles": [{ "id": "c" }], "installedMods": [{ "id": "m2" }, { "id": "m3" }] }
                ],
                "nexusApiKey": "must-not-be-read"
            }
        })
        .to_string();
        assert_eq!(
            persisted_state_counts(&snapshot).expect("valid persisted state"),
            UpdateStateCounts {
                games: 2,
                profiles: 3,
                mods: 3,
            }
        );
    }

    #[test]
    fn duplicate_verification_hashes_the_complete_content_tree() {
        let root =
            std::env::temp_dir().join(format!("zailon-dedup-hash-test-{}", unix_timestamp()));
        let first = root.join("first");
        let second = root.join("second");
        fs::create_dir_all(first.join("nested")).expect("first tree");
        fs::create_dir_all(second.join("nested")).expect("second tree");
        fs::write(first.join("nested/mod.archive"), b"same-content").expect("first file");
        fs::write(second.join("nested/mod.archive"), b"same-content").expect("second file");
        assert_eq!(
            content_tree_sha256(&first).expect("first digest"),
            content_tree_sha256(&second).expect("second digest")
        );
        fs::write(second.join("nested/mod.archive"), b"changed-content").expect("changed file");
        assert_ne!(
            content_tree_sha256(&first).expect("first digest"),
            content_tree_sha256(&second).expect("changed digest")
        );
        fs::remove_dir_all(root).expect("remove dedup hash test");
    }

    #[test]
    fn duplicate_profile_states_keep_enabled_and_highest_precedence_data() {
        let mut states = serde_json::json!({
            "canonical": { "enabled": false, "priority": 20 },
            "duplicate": { "enabled": true, "priority": 4, "note": "keep me" }
        })
        .as_object()
        .expect("states object")
        .clone();
        assert!(merge_profile_mod_state(
            &mut states,
            "canonical",
            "duplicate"
        ));
        assert!(states.get("duplicate").is_none());
        assert_eq!(states["canonical"]["enabled"], true);
        assert_eq!(states["canonical"]["priority"], 4);
        assert_eq!(states["canonical"]["note"], "keep me");
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

    #[cfg(desktop)]
    #[test]
    fn parses_steam_localconfig_playtime_forever_minutes() {
        let vdf = r#"
"UserLocalConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "apps"
                {
                    "730"
                    {
                        "LastPlayed"		"1700000000"
                        "PlaytimeForever"	"12345"
                        "Playtime2Weeks"	"120"
                    }
                    "292030"
                    {
                        "PlaytimeForever"	"0"
                    }
                    "not-a-number"
                    {
                        "PlaytimeForever"	"99"
                    }
                }
            }
        }
    }
}
"#;
        let playtime = parse_steam_localconfig_playtime(vdf);
        // PlaytimeForever est en MINUTES, pas en heures.
        assert_eq!(playtime.get(&730), Some(&12345));
        assert_eq!(playtime.get(&292030), Some(&0));
        // AppID non numérique : ignoré, jamais un mauvais résultat.
        assert!(!playtime.contains_key(&0));
    }

    #[cfg(desktop)]
    #[test]
    fn steam_localconfig_playtime_tolerates_missing_sections() {
        assert!(parse_steam_localconfig_playtime("").is_empty());
        assert!(parse_steam_localconfig_playtime("\"UserLocalConfigStore\" {}").is_empty());
        assert!(parse_steam_localconfig_playtime("not vdf at all").is_empty());
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

    // Spec « Import Cyberpunk façon MO2 » §23-27 — mapping par fichier.
    fn map_path(relative: &str) -> Option<String> {
        cyberpunk_map_file(Path::new(relative))
            .map(|path| path.to_string_lossy().replace('\\', "/"))
    }

    #[test]
    fn cyberpunk_map_file_keeps_known_roots() {
        assert_eq!(
            map_path("r6/tweaks/x.yaml").as_deref(),
            Some("r6/tweaks/x.yaml")
        );
        assert_eq!(
            map_path("red4ext/plugins/TweakXL/y.lua").as_deref(),
            Some("red4ext/plugins/TweakXL/y.lua")
        );
        assert_eq!(
            map_path("archive/pc/mod/z.archive").as_deref(),
            Some("archive/pc/mod/z.archive")
        );
        assert_eq!(
            map_path("bin/x64/plugins/cyber_engine_tweaks.asi").as_deref(),
            Some("bin/x64/plugins/cyber_engine_tweaks.asi")
        );
    }

    #[test]
    fn cyberpunk_map_file_strips_useless_containers() {
        // TweakXL fournit r6/tweaks ET red4ext/plugins sous le même dossier :
        // le nom du paquet n'est JAMAIS une partie du chemin jeu (spec §27).
        assert_eq!(
            map_path("TweakXL/r6/tweaks/x.yaml").as_deref(),
            Some("r6/tweaks/x.yaml")
        );
        assert_eq!(
            map_path("TweakXL/red4ext/plugins/init.lua").as_deref(),
            Some("red4ext/plugins/init.lua")
        );
        assert_eq!(
            map_path("ArchiveXL/red4ext/plugins/ArchiveXL/ArchiveXL.xl").as_deref(),
            Some("red4ext/plugins/ArchiveXL/ArchiveXL.xl")
        );
        assert_eq!(
            map_path("Cyberpunk 2077/r6/scripts/x.reds").as_deref(),
            Some("r6/scripts/x.reds")
        );
        assert_eq!(
            map_path("SomeFolder/red4ext/plugins/ArchiveXL/ArchiveXL.xl").as_deref(),
            Some("red4ext/plugins/ArchiveXL/ArchiveXL.xl")
        );
    }

    #[test]
    fn cyberpunk_map_file_plugins_go_to_red4ext() {
        assert_eq!(
            map_path("plugins/TweakXL/init.lua").as_deref(),
            Some("red4ext/plugins/TweakXL/init.lua")
        );
        assert_eq!(
            map_path("core_01/plugins/ArchiveXL/ArchiveXL.xl").as_deref(),
            Some("red4ext/plugins/ArchiveXL/ArchiveXL.xl")
        );
    }

    #[test]
    fn cyberpunk_map_file_unknown_files_return_none() {
        assert_eq!(map_path("README.txt"), None);
        assert_eq!(map_path("TweakXL/docs/readme.md"), None);
    }

    fn provider_entry(game_relative_path: &str) -> PackageFileEntry {
        PackageFileEntry {
            source_physical_path: game_relative_path.to_string(),
            package_relative_path: game_relative_path.to_string(),
            game_relative_path: game_relative_path.to_string(),
            hash: "deadbeef".to_string(),
            size: 1,
            deployable: true,
        }
    }

    fn provider_ids(entries: &[PackageFileEntry]) -> Vec<String> {
        framework_providers_from_entries("pkg", entries, true, false)
            .iter()
            .map(|provider| provider.framework_id.clone())
            .collect()
    }

    #[test]
    fn framework_providers_detect_tweakxl_archivexl_codeware_by_folder() {
        // spec §28 : dossier canonique → capability, même si le paquet porte un
        // autre nom (le nom du dossier n'est jamais une partie du chemin jeu).
        let entries = vec![
            provider_entry("red4ext/plugins/TweakXL/init.lua"),
            provider_entry("red4ext/plugins/ArchiveXL/ArchiveXL.xl"),
            provider_entry("red4ext/plugins/Codeware/Codeware.dll"),
        ];
        let ids = provider_ids(&entries);
        assert!(ids.contains(&"TweakXL".to_string()), "{ids:?}");
        assert!(ids.contains(&"ArchiveXL".to_string()), "{ids:?}");
        assert!(ids.contains(&"Codeware".to_string()), "{ids:?}");
    }

    #[test]
    fn framework_providers_detect_by_file_signature_only() {
        // spec §31 : ne pas dépendre du nom du dossier — un `tweakxl.dll` mal
        // placé (dossier « core_01 ») fournit quand même cyberpunk.tweakxl.
        let entries = vec![provider_entry("red4ext/plugins/core_01/tweakxl.dll")];
        assert!(provider_ids(&entries).contains(&"TweakXL".to_string()));
        let archive = vec![provider_entry("archivexl.dll")];
        assert!(provider_ids(&archive).contains(&"ArchiveXL".to_string()));
    }

    #[test]
    fn framework_providers_no_false_positive_for_plain_plugins() {
        // Un plugin ordinaire sous red4ext/plugins/ n'est PAS un framework.
        let entries = vec![provider_entry("red4ext/plugins/SomeMod/main.js")];
        assert_eq!(provider_ids(&entries), Vec::<String>::new());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Lancé avec `--background` (spec §37-41) : ZAILON démarre sans ouvrir la
/// fenêtre principale — le process watcher / session tracker tourne, l'UI
/// reste cachée jusqu'à ce que l'utilisateur rouvre l'application.
static BACKGROUND_MODE: AtomicBool = AtomicBool::new(false);

/// Icône de zone de notification (spec §42, §119) : gardée en état géré pour
/// que le tooltip puisse afficher la session en cours (`set_tray_session`).
#[cfg(desktop)]
struct TraySession(Mutex<Option<TrayIcon>>);

/// Tooltip de la zone de notification (spec §119) : « ZAILON — <jeu> »
/// pendant une session suivie, « ZAILON » sinon. Appelé par la WebView dès
/// que la session prioritaire change — idempotent et sans coût.
#[cfg(desktop)]
#[tauri::command]
fn set_tray_session(app: AppHandle, label: String) -> Result<(), String> {
    let state = app.state::<TraySession>();
    let guard = state.0.lock().map_err(|_| "verrou du tray indisponible")?;
    if let Some(tray) = guard.as_ref() {
        tray.set_tooltip(Some(&label))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// L'instance courante a-t-elle été lancée avec `--background` ?
#[tauri::command]
fn background_mode() -> bool {
    BACKGROUND_MODE.load(Ordering::SeqCst)
}

/// Active/désactive le démarrage avec le système (spec §37-42, §116).
/// `discreet` = lancer avec `--background` (fenêtre cachée, tracking silencieux).
#[tauri::command]
fn set_autostart(enabled: bool, discreet: bool) -> Result<bool, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("exécutable introuvable : {error}"))?;
    let value = if discreet {
        format!("\"{}\" --background", executable.display())
    } else {
        format!("\"{}\"", executable.display())
    };
    #[cfg(target_os = "windows")]
    {
        let root = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = root
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|error| error.to_string())?;
        if enabled {
            key.set_value("ZAILON", &value)
                .map_err(|error| error.to_string())?;
        } else {
            let _ = key.delete_value("ZAILON");
        }
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        let dir = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or("HOME introuvable")?
            .join("Library/LaunchAgents");
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let plist = dir.join("io.github.n7t0of.zailon.plist");
        if enabled {
            let mut args = vec![executable.display().to_string()];
            if discreet {
                args.push("--background".to_string());
            }
            let content = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n  <key>Label</key><string>io.github.n7t0of.zailon</string>\n  <key>ProgramArguments</key><array>{}</array>\n  <key>RunAtLoad</key><true/>\n  <key>ProcessType</key><string>Interactive</string>\n</dict></plist>\n",
                args.iter()
                    .map(|argument| format!("<string>{argument}</string>"))
                    .collect::<String>()
            );
            fs::write(&plist, content).map_err(|error| error.to_string())?;
        } else {
            let _ = fs::remove_file(&plist);
        }
        Ok(true)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or("HOME introuvable")?
            .join(".config/autostart");
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let file = dir.join("zailon.desktop");
        if enabled {
            let content = format!(
                "[Desktop Entry]\nType=Application\nName=ZAILON\nExec={}\nX-GNOME-Autostart-enabled=true\n",
                value
            );
            fs::write(&file, content).map_err(|error| error.to_string())?;
        } else {
            let _ = fs::remove_file(&file);
        }
        Ok(true)
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        all(unix, not(target_os = "macos"))
    )))]
    {
        let _ = (enabled, discreet, value);
        Err("démarrage automatique non supporté sur cette plateforme".to_string())
    }
}

/// Notification système « ✓ Suivi par ZAILON » (spec §120) : en mode discret
/// la fenêtre est cachée donc le toast in-app est invisible — une vraie bulle
/// OS annonce qu'une session est suivie. Aucune dépendance : PowerShell
/// (Windows, NotifyIcon), osascript (macOS) ou notify-send (Linux).
#[tauri::command]
fn notify_session_started(game_name: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let safe = game_name.replace('\'', "''");
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = 'ZAILON'; $n.BalloonTipText = 'Suivi par ZAILON - {safe}'; $n.Visible = $true; $n.ShowBalloonTip(4000); Start-Sleep -Seconds 5; $n.Dispose()"
        );
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &script,
            ])
            .spawn();
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let safe = game_name.replace('"', "\\\"");
        let script =
            format!("display notification \"Suivi par ZAILON - {safe}\" with title \"ZAILON\"");
        let _ = Command::new("osascript").args(["-e", &script]).spawn();
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("notify-send")
            .args(["ZAILON", &format!("Suivi par ZAILON - {game_name}")])
            .spawn();
        Ok(())
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        all(unix, not(target_os = "macos"))
    )))]
    {
        let _ = (game_name,);
        Err("notifications non supportées sur cette plateforme".to_string())
    }
}

pub fn run() {
    BACKGROUND_MODE.store(
        std::env::args().any(|argument| argument == "--background"),
        Ordering::SeqCst,
    );
    let builder = tauri::Builder::default()
        .manage(ProviderConnectionCache(Mutex::new(HashMap::new())))
        .manage(BackgroundTaskRegistry(Arc::new(Mutex::new(HashMap::new()))))
        .manage(AddonGate::default())
        .manage(visual_profiles::VisualRuntime::default());
    #[cfg(desktop)]
    let builder = builder
        .manage(PendingExternalInstalls(Mutex::new(Vec::new())))
        .manage(PendingShortcutLaunches(Mutex::new(Vec::new())))
        .plugin(tauri_plugin_single_instance::init(
            |app, args, _working_directory| {
                for argument in &args {
                    if argument.starts_with("nxm://") {
                        enqueue_nxm(app, argument);
                    } else if argument.starts_with("zailon://") {
                        enqueue_shortcut_launch(app, argument);
                    }
                }
                // Double-clic sur l'icône / lancement normal pendant qu'une
                // instance `--background` tourne → ramène la fenêtre au premier
                // plan (spec §42 : « prévoir une façon simple de rouvrir ZAILON »).
                if !args.iter().any(|argument| argument == "--background") {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            },
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            restore_background_tasks(app.handle(), app.state::<BackgroundTaskRegistry>().inner());
            visual_profiles::recover_on_startup(
                app.handle(),
                app.state::<visual_profiles::VisualRuntime>().inner(),
            );
            // `--background` (spec §37-41) : l'UI principale reste cachée — le
            // watcher/session tracker continue de tourner dans la WebView.
            if BACKGROUND_MODE.load(Ordering::SeqCst) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.manage(PendingUpdate(Mutex::new(None)));
                // Zone de notification (spec §42, §119) : icône toujours
                // présente (même en `--background`), clic gauche = ramène la
                // fenêtre, menu « Ouvrir ZAILON » / « Quitter », tooltip piloté
                // par la session en cours (set_tray_session).
                let show_item =
                    MenuItem::with_id(app, "zailon-show", "Ouvrir ZAILON", true, None::<&str>)?;
                let quit_item =
                    MenuItem::with_id(app, "zailon-quit", "Quitter", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
                let mut tray_builder = TrayIconBuilder::new()
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .tooltip("ZAILON")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "zailon-show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "zailon-quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    });
                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }
                app.manage(TraySession(Mutex::new(Some(tray_builder.build(app)?))));
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
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                visual_profiles::restore_for_shutdown(
                    window.app_handle(),
                    window.state::<visual_profiles::VisualRuntime>().inner(),
                );
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_mods,
            mods_folder_fingerprint,
            list_staged_mods,
            scan_mod_import,
            scan_mod_import_background,
            toggle_mod,
            delete_mod,
            delete_staged_mod,
            preview_staged_duplicates,
            deduplicate_staged_mods,
            preview_cyberpunk_structure_repair,
            apply_cyberpunk_structure_repair,
            rollback_cyberpunk_structure_repair,
            preview_mo2_import,
            import_mo2_instance,
            detect_vortex_instance,
            frosty_detect_installation,
            set_game_process_priority,
            audit_profile_deployment,
            repair_mo2_profile_deployment,
            repair_staged_imports,
            sync_profile_state,
            apply_profile_transaction,
            profile_integrity,
            trash_profile_state,
            initialize_fivem_base,
            read_citizenfx,
            write_citizenfx,
            detect_fivem_environment,
            fivem_pack_scan,
            fivem_pack_apply,
            fivem_pack_remove,
            fivem_pack_manifest,
            ensure_dir,
            scan_game_presence,
            scan_game_windows,
            exclusive_fullscreen_active,
            steam_running_state,
            quick_panel::open_quick_panel,
            quick_panel::close_quick_panel,
            quick_panel::toggle_quick_panel,
            quick_panel::quick_panel_status,
            launch_game,
            restore_deployment_session,
            set_enabled_addons,
            addon_verify_signature,
            guess_mods_path,
            install_mod,
            import_mod_candidates,
            import_mod_candidates_background,
            addon_download,
            addon_verify_sha256,
            addon_install_staged,
            addon_install_dir,
            save_project_archive,
            frosty_detect_runtime,
            frosty_read_cat_file,
            frosty_scan_game_data,
            frosty_worker_start,
            frosty_worker_status,
            frosty_worker_stop,
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
            nexus_mod_gallery,
            nexus_catalog_collections,
            nexus_collection_detail,
            prepare_nexus_collection_install,
            list_collection_install_plans,
            update_collection_install,
            install_collection_downloads,
            #[cfg(desktop)]
            start_collection_install,
            set_nxm_association,
            nxm_association_status,
            store_game_resource,
            cache_remote_game_resource,
            resolve_youtube_video,
            list_cached_background_media,
            remove_cached_background_media,
            clear_cached_background_media,
            search_game_artwork,
            test_artwork_provider,
            remove_game_resource,
            cleanup_orphaned_game_resources,
            open_path,
            open_external_url,
            background_tasks,
            cancel_background_task,
            prepare_update_backup,
            verify_update_state,
            record_update_event,
            open_update_log,
            visual_profiles::visual_backend_report,
            visual_profiles::list_visual_profiles,
            visual_profiles::save_visual_profile,
            visual_profiles::delete_visual_profile,
            visual_profiles::visual_profile_history,
            visual_profiles::restore_visual_profile_version,
            visual_profiles::read_visual_profile_version,
            visual_profiles::delete_visual_profile_version,
            visual_profiles::export_visual_profile,
            visual_profiles::import_visual_profile,
            visual_profiles::apply_visual_profile,
            visual_profiles::preview_visual_profile,
            visual_profiles::confirm_visual_profile,
            visual_profiles::restore_visual_state,
            visual_profiles::set_visual_profile_association,
            visual_profiles::visual_profile_association,
            visual_profiles::visual_shortcut_action,
            visual_profiles::visual_safety_report,
            visual_profiles::open_visual_windows_settings,
            #[cfg(desktop)]
            scan_steam_games,
            #[cfg(desktop)]
            steam_playtime,
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
            fetch_release_notes,
            #[cfg(desktop)]
            install_update,
            set_autostart,
            background_mode,
            notify_session_started,
            #[cfg(desktop)]
            set_tray_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZAILON");
}
