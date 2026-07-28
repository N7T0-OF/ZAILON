use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const PROFILE_FORMAT_VERSION: u32 = 1;
const SAFETY_CONFIRMATION_SECONDS: u64 = 15;
const GAMMA_BACKEND: &str = "windows-gamma-ramp";
const PREVIEW_BACKEND: &str = "preview-only";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualSettings {
    pub saturation: f64,
    pub vibrance: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub gamma: f64,
    pub temperature: u32,
    pub red: f64,
    pub green: f64,
    pub blue: f64,
    pub shadows: f64,
    pub highlights: f64,
    pub sharpness: f64,
}

impl Default for VisualSettings {
    fn default() -> Self {
        Self {
            saturation: 1.0,
            vibrance: 0.0,
            brightness: 0.0,
            contrast: 1.0,
            gamma: 1.0,
            temperature: 6500,
            red: 1.0,
            green: 1.0,
            blue: 1.0,
            shadows: 0.0,
            highlights: 0.0,
            sharpness: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualGameAssociation {
    pub game_id: String,
    pub profile_id: Option<String>,
    pub executable: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualProfile {
    pub format_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub backend_id: String,
    #[serde(default)]
    pub monitor_id: Option<String>,
    pub settings: VisualSettings,
    #[serde(default = "default_hdr_mode")]
    pub hdr_mode: String,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub game_associations: Vec<VisualGameAssociation>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub hotkey: Option<String>,
    #[serde(default)]
    pub safe_fallback_profile_id: Option<String>,
}

fn default_hdr_mode() -> String {
    "system".into()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualDisplayTarget {
    pub id: String,
    pub name: String,
    pub device_name: String,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
    pub hdr_supported: Option<bool>,
    pub hdr_enabled: Option<bool>,
    pub icc_profile: Option<String>,
    pub gamma_ramp_supported: bool,
    pub ddc_ci_status: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualBackendCapabilities {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub available: bool,
    pub experimental: bool,
    pub supports_live_preview: bool,
    pub supports_per_monitor: bool,
    pub supports_hdr: bool,
    pub supports_automatic_restore: bool,
    pub supported_settings: Vec<String>,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualBackendReport {
    pub active_backend_id: String,
    pub displays: Vec<VisualDisplayTarget>,
    pub backends: Vec<VisualBackendCapabilities>,
    pub active_profile_id: Option<String>,
    pub active_monitor_id: Option<String>,
    pub emergency_state_present: bool,
    pub last_restoration: Option<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualApplyResult {
    pub applied: bool,
    pub backend_id: String,
    pub monitor_id: String,
    pub profile_id: String,
    pub confirmation_required: bool,
    pub confirmation_token: Option<String>,
    pub confirmation_seconds: u64,
    pub applied_settings: Vec<String>,
    pub preview_only_settings: Vec<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualRestoreResult {
    pub restored: usize,
    pub remaining: usize,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualSafetyReport {
    pub game_id: String,
    pub backend_id: String,
    pub changes_game_files: bool,
    pub injects_code: bool,
    pub hooks_graphics_api: bool,
    pub reads_game_memory: bool,
    pub writes_game_memory: bool,
    pub uses_kernel_driver: bool,
    pub uses_overlay: bool,
    pub changes_system_display: bool,
    pub changes_monitor_hardware: bool,
    pub compatible_with_game_policy: bool,
    pub rust_policy: bool,
    pub detected_components: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualProfileHistoryItem {
    pub file_name: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedDisplayState {
    monitor_id: String,
    device_name: String,
    original_ramp: Vec<u16>,
    profile_id: String,
    applied_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedEmergencyState {
    schema_version: u32,
    active: bool,
    confirmed: bool,
    updated_at: u64,
    states: Vec<SavedDisplayState>,
}

#[derive(Default)]
struct VisualRuntimeState {
    originals: HashMap<String, SavedDisplayState>,
    pending_tokens: HashMap<String, String>,
    active_profile_id: Option<String>,
    active_monitor_id: Option<String>,
    last_restoration: Option<String>,
}

#[derive(Clone, Default)]
pub struct VisualRuntime(Arc<Mutex<VisualRuntimeState>>);

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn unique_token(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{prefix}-{}-{nanos}", std::process::id())
}

fn visual_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("visual-profiles");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn profiles_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = visual_root(app)?.join("profiles");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn emergency_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(visual_root(app)?.join("last-known-safe-display-state.json"))
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(visual_root(app)?.join("visual-changes.jsonl"))
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension(format!("tmp-{}", unique_token("visual")));
    let payload = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(&temporary, payload).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn append_log(app: &AppHandle, event: serde_json::Value) {
    use std::io::Write;
    let Ok(path) = log_path(app) else {
        return;
    };
    let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let payload = serde_json::json!({
        "at": timestamp(),
        "event": event
    });
    let _ = writeln!(file, "{}", payload);
    let _ = file.sync_data();
}

fn safe_identifier(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Identifiant Visual Profiles invalide.".into());
    }
    Ok(value)
}

fn finite_in_range(value: f64, min: f64, max: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() || value < min || value > max {
        return Err(format!("{label} doit rester entre {min} et {max}."));
    }
    Ok(())
}

fn validate_settings(settings: &VisualSettings) -> Result<(), String> {
    finite_in_range(settings.saturation, 0.0, 2.0, "Saturation")?;
    finite_in_range(settings.vibrance, -1.0, 1.0, "Vibrance")?;
    finite_in_range(settings.brightness, -0.5, 0.5, "Luminosité")?;
    finite_in_range(settings.contrast, 0.5, 1.5, "Contraste")?;
    finite_in_range(settings.gamma, 0.5, 2.5, "Gamma")?;
    if !(2500..=10_000).contains(&settings.temperature) {
        return Err("Température doit rester entre 2500 K et 10000 K.".into());
    }
    finite_in_range(settings.red, 0.5, 1.5, "Rouge")?;
    finite_in_range(settings.green, 0.5, 1.5, "Vert")?;
    finite_in_range(settings.blue, 0.5, 1.5, "Bleu")?;
    finite_in_range(settings.shadows, -1.0, 1.0, "Ombres")?;
    finite_in_range(settings.highlights, -1.0, 1.0, "Hautes lumières")?;
    finite_in_range(settings.sharpness, 0.0, 1.0, "Netteté")?;
    Ok(())
}

fn validate_profile(profile: &VisualProfile) -> Result<(), String> {
    if profile.format_version != PROFILE_FORMAT_VERSION {
        return Err(format!(
            "Version de profil non prise en charge : {}.",
            profile.format_version
        ));
    }
    safe_identifier(&profile.id)?;
    if profile.name.trim().is_empty() || profile.name.chars().count() > 80 {
        return Err("Le nom du profil doit contenir entre 1 et 80 caractères.".into());
    }
    if profile.description.chars().count() > 500 {
        return Err("La description du profil est limitée à 500 caractères.".into());
    }
    if !matches!(profile.backend_id.as_str(), GAMMA_BACKEND | PREVIEW_BACKEND) {
        return Err("Backend visuel inconnu ou non redistribuable.".into());
    }
    if profile.game_associations.len() > 256 {
        return Err("Le profil contient trop d’associations de jeux.".into());
    }
    for association in &profile.game_associations {
        safe_identifier(&association.game_id)?;
        if let Some(profile_id) = association.profile_id.as_deref() {
            safe_identifier(profile_id)?;
        }
    }
    validate_settings(&profile.settings)
}

fn profile_path(app: &AppHandle, profile_id: &str) -> Result<PathBuf, String> {
    Ok(profiles_root(app)?.join(format!("{}.json", safe_identifier(profile_id)?)))
}

fn load_profile(app: &AppHandle, profile_id: &str) -> Result<VisualProfile, String> {
    let path = profile_path(app, profile_id)?;
    let payload =
        fs::read(&path).map_err(|_| format!("Le profil visuel {profile_id} est introuvable."))?;
    let profile: VisualProfile =
        serde_json::from_slice(&payload).map_err(|error| error.to_string())?;
    validate_profile(&profile)?;
    Ok(profile)
}

fn list_profiles_inner(app: &AppHandle) -> Result<Vec<VisualProfile>, String> {
    let mut profiles = Vec::new();
    for entry in fs::read_dir(profiles_root(app)?)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(payload) = fs::read(path) else {
            continue;
        };
        let Ok(profile) = serde_json::from_slice::<VisualProfile>(&payload) else {
            continue;
        };
        if validate_profile(&profile).is_ok() {
            profiles.push(profile);
        }
    }
    profiles.sort_by(|left, right| {
        right
            .favorite
            .cmp(&left.favorite)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(profiles)
}

fn association_key(game_id: &str, zailon_profile_id: Option<&str>) -> Result<String, String> {
    safe_identifier(game_id)?;
    if let Some(profile_id) = zailon_profile_id {
        safe_identifier(profile_id)?;
    }
    Ok(format!("{}::{}", game_id, zailon_profile_id.unwrap_or("*")))
}

fn associations_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(visual_root(app)?.join("associations.json"))
}

fn load_associations(app: &AppHandle) -> HashMap<String, String> {
    associations_path(app)
        .ok()
        .and_then(|path| fs::read(path).ok())
        .and_then(|payload| serde_json::from_slice(&payload).ok())
        .unwrap_or_default()
}

fn persist_emergency_state(app: &AppHandle, runtime: &VisualRuntime) -> Result<(), String> {
    let state = runtime
        .0
        .lock()
        .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
    let saved = SavedEmergencyState {
        schema_version: 1,
        active: !state.originals.is_empty(),
        confirmed: state.pending_tokens.is_empty(),
        updated_at: timestamp(),
        states: state.originals.values().cloned().collect(),
    };
    write_json_atomic(&emergency_path(app)?, &saved)
}

fn settings_are_extreme(settings: &VisualSettings) -> bool {
    settings.brightness.abs() > 0.15
        || !(0.85..=1.15).contains(&settings.contrast)
        || !(0.8..=1.3).contains(&settings.gamma)
        || !(4200..=8000).contains(&settings.temperature)
        || !(0.85..=1.15).contains(&settings.red)
        || !(0.85..=1.15).contains(&settings.green)
        || !(0.85..=1.15).contains(&settings.blue)
}

fn actual_settings(settings: &VisualSettings) -> VisualSettings {
    VisualSettings {
        saturation: 1.0,
        vibrance: 0.0,
        brightness: settings.brightness.clamp(-0.2, 0.2),
        contrast: settings.contrast.clamp(0.75, 1.25),
        gamma: settings.gamma.clamp(0.75, 1.5),
        temperature: settings.temperature.clamp(3500, 8500),
        red: settings.red.clamp(0.8, 1.2),
        green: settings.green.clamp(0.8, 1.2),
        blue: settings.blue.clamp(0.8, 1.2),
        shadows: 0.0,
        highlights: 0.0,
        sharpness: 0.0,
    }
}

fn temperature_scales(temperature: u32) -> [f64; 3] {
    let offset = (temperature as f64 - 6500.0) / 3500.0;
    if offset < 0.0 {
        [1.0, 1.0 + offset * 0.08, 1.0 + offset * 0.25]
    } else {
        [1.0 - offset * 0.18, 1.0 - offset * 0.04, 1.0]
    }
}

fn transform_gamma_ramp(original: &[u16], settings: &VisualSettings) -> Vec<u16> {
    let settings = actual_settings(settings);
    let temperature = temperature_scales(settings.temperature);
    let channel_scales = [
        settings.red * temperature[0],
        settings.green * temperature[1],
        settings.blue * temperature[2],
    ];
    let mut transformed = vec![0_u16; 768];
    for channel in 0..3 {
        let mut previous = 0_u16;
        for index in 0..256 {
            let source = original
                .get(channel * 256 + index)
                .copied()
                .unwrap_or((index as u16) * 257) as f64
                / 65535.0;
            let gamma = source.powf(1.0 / settings.gamma);
            let contrasted = (gamma - 0.5) * settings.contrast + 0.5;
            let adjusted =
                ((contrasted + settings.brightness) * channel_scales[channel]).clamp(0.0, 1.0);
            let value = ((adjusted * 65535.0).round() as u16).max(previous);
            transformed[channel * 256 + index] = value;
            previous = value;
        }
    }
    transformed
}

#[cfg(target_os = "windows")]
mod windows_backend {
    use super::VisualDisplayTarget;
    use std::{ffi::c_void, mem::size_of, ptr};
    use windows_sys::Win32::{
        Devices::Display::{
            DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig,
            DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
            DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO,
            DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
            QDC_ONLY_ACTIVE_PATHS,
        },
        Graphics::Gdi::{
            CreateDCW, DeleteDC, EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
            MONITORINFOEXW,
        },
        UI::{
            ColorSystem::{GetDeviceGammaRamp, GetICMProfileW, SetDeviceGammaRamp},
            WindowsAndMessaging::MONITORINFOF_PRIMARY,
        },
    };

    #[derive(Debug, Clone)]
    struct RawMonitor {
        device_name: String,
        width: i32,
        height: i32,
        primary: bool,
    }

    unsafe extern "system" fn enumerate_monitor(
        monitor: HMONITOR,
        _dc: HDC,
        _rect: *mut windows_sys::Win32::Foundation::RECT,
        data: isize,
    ) -> i32 {
        let monitors = unsafe { &mut *(data as *mut Vec<RawMonitor>) };
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
        if unsafe {
            GetMonitorInfoW(
                monitor,
                &mut info as *mut MONITORINFOEXW as *mut MONITORINFO,
            )
        } == 0
        {
            return 1;
        }
        let length = info
            .szDevice
            .iter()
            .position(|character| *character == 0)
            .unwrap_or(info.szDevice.len());
        let device_name = String::from_utf16_lossy(&info.szDevice[..length]);
        monitors.push(RawMonitor {
            device_name,
            width: info.monitorInfo.rcMonitor.right - info.monitorInfo.rcMonitor.left,
            height: info.monitorInfo.rcMonitor.bottom - info.monitorInfo.rcMonitor.top,
            primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
        });
        1
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn with_display_dc<T>(
        device_name: &str,
        operation: impl FnOnce(HDC) -> Result<T, String>,
    ) -> Result<T, String> {
        let device = wide(device_name);
        let dc = unsafe { CreateDCW(ptr::null(), device.as_ptr(), ptr::null(), ptr::null()) };
        if dc.is_null() {
            return Err(format!(
                "Windows n’a pas fourni de contexte d’affichage pour {device_name}."
            ));
        }
        let result = operation(dc);
        unsafe {
            DeleteDC(dc);
        }
        result
    }

    pub fn read_gamma(device_name: &str) -> Result<Vec<u16>, String> {
        with_display_dc(device_name, |dc| {
            let mut ramp = vec![0_u16; 768];
            if unsafe { GetDeviceGammaRamp(dc, ramp.as_mut_ptr().cast::<c_void>()) } == 0 {
                return Err("Le pilote ne fournit pas de rampe gamma téléchargeable.".into());
            }
            Ok(ramp)
        })
    }

    pub fn write_gamma(device_name: &str, ramp: &[u16]) -> Result<(), String> {
        if ramp.len() != 768 {
            return Err("Rampe gamma interne invalide.".into());
        }
        with_display_dc(device_name, |dc| {
            if unsafe { SetDeviceGammaRamp(dc, ramp.as_ptr().cast::<c_void>()) } == 0 {
                return Err("Le pilote a refusé le réglage Gamma Ramp.".into());
            }
            Ok(())
        })
    }

    fn icc_profile(device_name: &str) -> Option<String> {
        with_display_dc(device_name, |dc| {
            let mut size = 512_u32;
            let mut buffer = vec![0_u16; size as usize];
            if unsafe { GetICMProfileW(dc, &mut size, buffer.as_mut_ptr()) } == 0 {
                if size == 0 || size > 32_768 {
                    return Err("Profil ICC non disponible.".into());
                }
                buffer.resize(size as usize, 0);
                if unsafe { GetICMProfileW(dc, &mut size, buffer.as_mut_ptr()) } == 0 {
                    return Err("Profil ICC non disponible.".into());
                }
            }
            let length = buffer
                .iter()
                .position(|character| *character == 0)
                .unwrap_or(buffer.len());
            Ok(String::from_utf16_lossy(&buffer[..length]))
        })
        .ok()
        .filter(|profile| !profile.is_empty())
    }

    fn hdr_status(device_name: &str) -> (Option<bool>, Option<bool>) {
        let mut path_count = 0_u32;
        let mut mode_count = 0_u32;
        if unsafe {
            GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
        } != 0
            || path_count == 0
        {
            return (None, None);
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        if unsafe {
            QueryDisplayConfig(
                QDC_ONLY_ACTIVE_PATHS,
                &mut path_count,
                paths.as_mut_ptr(),
                &mut mode_count,
                modes.as_mut_ptr(),
                ptr::null_mut(),
            )
        } != 0
        {
            return (None, None);
        }
        for path in paths.iter().take(path_count as usize) {
            let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
            source.header.size = size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
            source.header.adapterId = path.sourceInfo.adapterId;
            source.header.id = path.sourceInfo.id;
            if unsafe { DisplayConfigGetDeviceInfo(&mut source.header) } != 0 {
                continue;
            }
            let source_length = source
                .viewGdiDeviceName
                .iter()
                .position(|character| *character == 0)
                .unwrap_or(source.viewGdiDeviceName.len());
            let source_name = String::from_utf16_lossy(&source.viewGdiDeviceName[..source_length]);
            if !source_name.eq_ignore_ascii_case(device_name) {
                continue;
            }
            let mut color = DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO::default();
            color.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
            color.header.size = size_of::<DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO>() as u32;
            color.header.adapterId = path.targetInfo.adapterId;
            color.header.id = path.targetInfo.id;
            if unsafe { DisplayConfigGetDeviceInfo(&mut color.header) } != 0 {
                return (None, None);
            }
            let flags = unsafe { color.Anonymous.value };
            return (Some(flags & 1 != 0), Some(flags & 2 != 0));
        }
        (None, None)
    }

    pub fn detect_displays() -> Vec<VisualDisplayTarget> {
        let mut monitors = Vec::<RawMonitor>::new();
        unsafe {
            EnumDisplayMonitors(
                ptr::null_mut(),
                ptr::null(),
                Some(enumerate_monitor),
                &mut monitors as *mut Vec<RawMonitor> as isize,
            );
        }
        monitors
            .into_iter()
            .enumerate()
            .map(|(index, monitor)| {
                let (hdr_supported, hdr_enabled) = hdr_status(&monitor.device_name);
                let gamma_ramp_supported =
                    hdr_enabled != Some(true) && read_gamma(&monitor.device_name).is_ok();
                let mut warnings = Vec::new();
                if hdr_enabled == Some(true) {
                    warnings.push(
                        "HDR actif : Gamma Ramp est désactivé car son comportement est indéfini dans ce mode."
                            .into(),
                    );
                }
                if hdr_enabled.is_none() {
                    warnings.push(
                        "Windows n’a pas confirmé l’état HDR ; l’application réelle est bloquée."
                            .into(),
                    );
                }
                if !gamma_ramp_supported && hdr_enabled != Some(true) {
                    warnings.push("Le pilote ne confirme pas le support Gamma Ramp.".into());
                }
                VisualDisplayTarget {
                    id: format!("windows-display:{}", monitor.device_name),
                    name: format!(
                        "Écran {}{}",
                        index + 1,
                        if monitor.primary { " · principal" } else { "" }
                    ),
                    device_name: monitor.device_name.clone(),
                    width: monitor.width,
                    height: monitor.height,
                    primary: monitor.primary,
                    hdr_supported,
                    hdr_enabled,
                    icc_profile: icc_profile(&monitor.device_name),
                    gamma_ramp_supported,
                    ddc_ci_status: "Non activé — autorisation matérielle requise".into(),
                    warnings,
                }
            })
            .collect()
    }
}

#[cfg(not(target_os = "windows"))]
mod windows_backend {
    use super::VisualDisplayTarget;

    pub fn detect_displays() -> Vec<VisualDisplayTarget> {
        vec![VisualDisplayTarget {
            id: "preview-display".into(),
            name: "Aperçu local".into(),
            device_name: "preview".into(),
            width: 0,
            height: 0,
            primary: true,
            hdr_supported: None,
            hdr_enabled: None,
            icc_profile: None,
            gamma_ramp_supported: false,
            ddc_ci_status: "Indisponible sur ce backend".into(),
            warnings: vec!["Aucun backend système natif n’est activé sur cette plateforme.".into()],
        }]
    }

    pub fn read_gamma(_device_name: &str) -> Result<Vec<u16>, String> {
        Err("Gamma Ramp Windows est indisponible sur cette plateforme.".into())
    }

    pub fn write_gamma(_device_name: &str, _ramp: &[u16]) -> Result<(), String> {
        Err("Gamma Ramp Windows est indisponible sur cette plateforme.".into())
    }
}

fn display_by_id(display_id: Option<&str>) -> Result<VisualDisplayTarget, String> {
    let displays = windows_backend::detect_displays();
    match display_id {
        Some(display_id) => displays
            .into_iter()
            .find(|display| display.id == display_id)
            .ok_or_else(|| "L’écran ciblé n’est plus connecté.".to_string()),
        None => displays
            .into_iter()
            .find(|display| display.primary)
            .ok_or_else(|| "Aucun écran principal n’a été détecté.".to_string()),
    }
}

fn restore_states(
    app: &AppHandle,
    runtime: &VisualRuntime,
    monitor_id: Option<&str>,
) -> Result<VisualRestoreResult, String> {
    let disk_state = emergency_path(app)
        .ok()
        .and_then(|path| fs::read(path).ok())
        .and_then(|payload| serde_json::from_slice::<SavedEmergencyState>(&payload).ok());
    let candidates = {
        let state = runtime
            .0
            .lock()
            .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
        if state.originals.is_empty() {
            disk_state
                .filter(|saved| saved.active)
                .map(|saved| saved.states)
                .unwrap_or_default()
        } else {
            state.originals.values().cloned().collect()
        }
    };
    let mut restored_ids = Vec::new();
    let mut diagnostics = Vec::new();
    for original in candidates {
        if monitor_id.is_some_and(|target| target != original.monitor_id) {
            continue;
        }
        match windows_backend::write_gamma(&original.device_name, &original.original_ramp) {
            Ok(()) => {
                restored_ids.push(original.monitor_id.clone());
                diagnostics.push(format!(
                    "{} restauré depuis le dernier état sûr.",
                    original.device_name
                ));
            }
            Err(error) => diagnostics.push(format!(
                "Restauration de {} non confirmée : {error}",
                original.device_name
            )),
        }
    }
    let (remaining, last_restoration) = {
        let mut state = runtime
            .0
            .lock()
            .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
        for monitor in &restored_ids {
            state.originals.remove(monitor);
            state.pending_tokens.remove(monitor);
        }
        if state.originals.is_empty() {
            state.active_profile_id = None;
            state.active_monitor_id = None;
        }
        let summary = if restored_ids.is_empty() {
            "Aucune restauration confirmée.".to_string()
        } else {
            format!("{} écran(s) restauré(s).", restored_ids.len())
        };
        state.last_restoration = Some(summary.clone());
        (state.originals.len(), summary)
    };
    persist_emergency_state(app, runtime)?;
    append_log(
        app,
        serde_json::json!({
            "kind": "restore",
            "restored": restored_ids.len(),
            "remaining": remaining,
            "diagnostics": diagnostics
        }),
    );
    diagnostics.push(last_restoration);
    Ok(VisualRestoreResult {
        restored: restored_ids.len(),
        remaining,
        diagnostics,
    })
}

fn apply_profile_inner(
    app: &AppHandle,
    runtime: &VisualRuntime,
    profile: &VisualProfile,
    monitor_id: Option<&str>,
    automatic: bool,
) -> Result<VisualApplyResult, String> {
    validate_profile(profile)?;
    let display = display_by_id(monitor_id.or(profile.monitor_id.as_deref()))?;
    if profile.backend_id == PREVIEW_BACKEND {
        return Ok(VisualApplyResult {
            applied: false,
            backend_id: PREVIEW_BACKEND.into(),
            monitor_id: display.id,
            profile_id: profile.id.clone(),
            confirmation_required: false,
            confirmation_token: None,
            confirmation_seconds: 0,
            applied_settings: Vec::new(),
            preview_only_settings: vec![
                "saturation".into(),
                "vibrance".into(),
                "brightness".into(),
                "contrast".into(),
                "gamma".into(),
                "temperature".into(),
                "red".into(),
                "green".into(),
                "blue".into(),
                "shadows".into(),
                "highlights".into(),
                "sharpness".into(),
            ],
            diagnostics: vec!["PreviewOnly ne modifie ni Windows, ni le pilote, ni le jeu.".into()],
        });
    }
    if !cfg!(target_os = "windows") {
        return Err("Le backend Gamma Ramp est uniquement disponible sous Windows.".into());
    }
    if display.hdr_enabled == Some(true) {
        return Err(
            "Gamma Ramp est désactivé : Windows indique que HDR est actif sur cet écran.".into(),
        );
    }
    if display.hdr_enabled.is_none() {
        return Err(
            "Gamma Ramp est bloqué car Windows n’a pas confirmé que HDR est désactivé.".into(),
        );
    }
    if !display.gamma_ramp_supported {
        return Err("Le pilote ne confirme pas le support Gamma Ramp pour cet écran.".into());
    }
    if automatic && settings_are_extreme(&profile.settings) {
        return Err(
            "Ce profil contient des valeurs fortes et doit être appliqué manuellement avec le compte à rebours de sécurité."
                .into(),
        );
    }
    let existing_original = runtime
        .0
        .lock()
        .ok()
        .and_then(|state| state.originals.get(&display.id).cloned());
    let original_ramp = match existing_original.as_ref() {
        Some(original) => original.original_ramp.clone(),
        None => windows_backend::read_gamma(&display.device_name)?,
    };
    let transformed = transform_gamma_ramp(&original_ramp, &profile.settings);
    if transformed == original_ramp {
        return Err(
            "Ce profil ne contient aucun réglage applicable par le backend Gamma Ramp.".into(),
        );
    }
    let original_state = existing_original.unwrap_or_else(|| SavedDisplayState {
        monitor_id: display.id.clone(),
        device_name: display.device_name.clone(),
        original_ramp: original_ramp.clone(),
        profile_id: profile.id.clone(),
        applied_at: timestamp(),
    });
    {
        let mut state = runtime
            .0
            .lock()
            .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
        state.originals.insert(display.id.clone(), original_state);
        state.active_profile_id = Some(profile.id.clone());
        state.active_monitor_id = Some(display.id.clone());
    }
    persist_emergency_state(app, runtime)?;
    if let Err(error) = windows_backend::write_gamma(&display.device_name, &transformed) {
        let _ = restore_states(app, runtime, Some(&display.id));
        return Err(error);
    }
    let verified = windows_backend::read_gamma(&display.device_name)?;
    let desired_delta = transformed
        .iter()
        .zip(&verified)
        .map(|(expected, actual)| expected.abs_diff(*actual) as u64)
        .sum::<u64>()
        / transformed.len() as u64;
    let original_delta = original_ramp
        .iter()
        .zip(&verified)
        .map(|(before, actual)| before.abs_diff(*actual) as u64)
        .sum::<u64>()
        / original_ramp.len() as u64;
    if desired_delta > 4096 || original_delta == 0 {
        let _ = restore_states(app, runtime, Some(&display.id));
        return Err(
            "Le pilote semble avoir ignoré la rampe. Les valeurs précédentes ont été restaurées."
                .into(),
        );
    }
    let confirmation_required = !automatic && settings_are_extreme(&profile.settings);
    let confirmation_token = confirmation_required.then(|| unique_token("confirm"));
    if let Some(token) = confirmation_token.as_ref() {
        {
            let mut state = runtime
                .0
                .lock()
                .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
            state
                .pending_tokens
                .insert(display.id.clone(), token.clone());
        }
        persist_emergency_state(app, runtime)?;
        let watchdog_app = app.clone();
        let watchdog_runtime = runtime.clone();
        let watchdog_monitor = display.id.clone();
        let watchdog_token = token.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(SAFETY_CONFIRMATION_SECONDS));
            let still_pending = watchdog_runtime
                .0
                .lock()
                .ok()
                .and_then(|state| state.pending_tokens.get(&watchdog_monitor).cloned())
                .is_some_and(|current| current == watchdog_token);
            if still_pending {
                let _ = restore_states(&watchdog_app, &watchdog_runtime, Some(&watchdog_monitor));
            }
        });
    }
    let applied_settings = vec![
        "brightness".into(),
        "contrast".into(),
        "gamma".into(),
        "temperature".into(),
        "red".into(),
        "green".into(),
        "blue".into(),
    ];
    let preview_only_settings = vec![
        "saturation".into(),
        "vibrance".into(),
        "shadows".into(),
        "highlights".into(),
        "sharpness".into(),
    ];
    let diagnostics = vec![
        "Gamma Ramp appliqué puis relu depuis le pilote.".into(),
        "Saturation, vibrance, ombres, hautes lumières et netteté restent en aperçu : une LUT 1D ne peut pas les produire honnêtement.".into(),
        "Aucun fichier de jeu, processus de jeu ou API graphique n’a été ouvert.".into(),
    ];
    append_log(
        app,
        serde_json::json!({
            "kind": "apply",
            "profileId": profile.id,
            "monitorId": display.id,
            "backendId": profile.backend_id,
            "automatic": automatic,
            "confirmationRequired": confirmation_required,
            "settings": actual_settings(&profile.settings)
        }),
    );
    Ok(VisualApplyResult {
        applied: true,
        backend_id: GAMMA_BACKEND.into(),
        monitor_id: display.id,
        profile_id: profile.id.clone(),
        confirmation_required,
        confirmation_token,
        confirmation_seconds: SAFETY_CONFIRMATION_SECONDS,
        applied_settings,
        preview_only_settings,
        diagnostics,
    })
}

#[tauri::command]
pub fn visual_backend_report(
    app: AppHandle,
    runtime: State<'_, VisualRuntime>,
) -> Result<VisualBackendReport, String> {
    let displays = windows_backend::detect_displays();
    let gamma_available = displays
        .iter()
        .any(|display| display.gamma_ramp_supported && display.hdr_enabled == Some(false));
    let state = runtime
        .0
        .lock()
        .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
    Ok(VisualBackendReport {
        active_backend_id: if cfg!(target_os = "windows") {
            GAMMA_BACKEND.into()
        } else {
            PREVIEW_BACKEND.into()
        },
        displays,
        backends: vec![
            VisualBackendCapabilities {
                id: GAMMA_BACKEND.into(),
                name: "Windows Gamma Ramp expérimental".into(),
                platform: "windows".into(),
                available: cfg!(target_os = "windows") && gamma_available,
                experimental: true,
                supports_live_preview: true,
                supports_per_monitor: false,
                supports_hdr: false,
                supports_automatic_restore: true,
                supported_settings: vec![
                    "brightness".into(),
                    "contrast".into(),
                    "gamma".into(),
                    "temperature".into(),
                    "red".into(),
                    "green".into(),
                    "blue".into(),
                ],
                limitations: vec![
                    "Microsoft déconseille cette API pour la calibration générale.".into(),
                    "Le pilote ou Windows peut remplacer la rampe à tout moment.".into(),
                    "Application interdite lorsque HDR est actif ou inconnu.".into(),
                    "Le contrôle réellement distinct par écran n’est pas garanti par le pilote."
                        .into(),
                ],
            },
            VisualBackendCapabilities {
                id: PREVIEW_BACKEND.into(),
                name: "Aperçu déclaratif".into(),
                platform: "all".into(),
                available: true,
                experimental: false,
                supports_live_preview: false,
                supports_per_monitor: false,
                supports_hdr: true,
                supports_automatic_restore: true,
                supported_settings: vec![
                    "saturation".into(),
                    "vibrance".into(),
                    "brightness".into(),
                    "contrast".into(),
                    "gamma".into(),
                    "temperature".into(),
                    "red".into(),
                    "green".into(),
                    "blue".into(),
                    "shadows".into(),
                    "highlights".into(),
                    "sharpness".into(),
                ],
                limitations: vec![
                    "L’aperçu ne modifie pas l’écran réel et ne traite aucune image de jeu.".into(),
                ],
            },
        ],
        active_profile_id: state.active_profile_id.clone(),
        active_monitor_id: state.active_monitor_id.clone(),
        emergency_state_present: emergency_path(&app)
            .map(|path| path.is_file())
            .unwrap_or(false),
        last_restoration: state.last_restoration.clone(),
        diagnostics: vec![
            "Mode affichage système : aucune DLL injectée et aucun fichier de jeu modifié.".into(),
            "ICC est détecté en lecture seule. HDR renvoie vers l’outil officiel Windows.".into(),
            "DDC/CI reste désactivé tant qu’un flux d’autorisation matérielle dédié n’est pas validé."
                .into(),
        ],
    })
}

#[tauri::command]
pub fn list_visual_profiles(app: AppHandle) -> Result<Vec<VisualProfile>, String> {
    list_profiles_inner(&app)
}

#[tauri::command]
pub fn save_visual_profile(app: AppHandle, mut profile: VisualProfile) -> Result<String, String> {
    validate_profile(&profile)?;
    let path = profile_path(&app, &profile.id)?;
    if path.is_file() {
        let history_root = visual_root(&app)?
            .join("history")
            .join(safe_identifier(&profile.id)?);
        fs::create_dir_all(&history_root).map_err(|error| error.to_string())?;
        let history = history_root.join(format!("{}.json", unique_token("version")));
        fs::copy(&path, history).map_err(|error| error.to_string())?;
    }
    profile.updated_at = timestamp();
    write_json_atomic(&path, &profile)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_visual_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let path = profile_path(&app, &profile_id)?;
    if path.is_file() {
        let trash = visual_root(&app)?.join("trash");
        fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
        fs::rename(
            path,
            trash.join(format!("{}-{}.json", profile_id, unique_token("deleted"))),
        )
        .map_err(|error| error.to_string())?;
    }
    let mut associations = load_associations(&app);
    associations.retain(|_, value| value != &profile_id);
    write_json_atomic(&associations_path(&app)?, &associations)
}

#[tauri::command]
pub fn visual_profile_history(
    app: AppHandle,
    profile_id: String,
) -> Result<Vec<VisualProfileHistoryItem>, String> {
    let root = visual_root(&app)?
        .join("history")
        .join(safe_identifier(&profile_id)?);
    let mut history = Vec::new();
    for entry in fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
    {
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        history.push(VisualProfileHistoryItem {
            file_name: entry.file_name().to_string_lossy().into_owned(),
            updated_at: entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or_default(),
        });
    }
    history.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(history)
}

#[tauri::command]
pub fn restore_visual_profile_version(
    app: AppHandle,
    profile_id: String,
    file_name: String,
) -> Result<VisualProfile, String> {
    safe_identifier(&profile_id)?;
    if file_name.contains('/') || file_name.contains('\\') || !file_name.ends_with(".json") {
        return Err("Version de profil invalide.".into());
    }
    let path = visual_root(&app)?
        .join("history")
        .join(&profile_id)
        .join(file_name);
    let payload = fs::read(path).map_err(|error| error.to_string())?;
    let mut profile: VisualProfile =
        serde_json::from_slice(&payload).map_err(|error| error.to_string())?;
    validate_profile(&profile)?;
    profile.updated_at = timestamp();
    write_json_atomic(&profile_path(&app, &profile_id)?, &profile)?;
    Ok(profile)
}

#[tauri::command]
pub fn export_visual_profile(
    app: AppHandle,
    profile_id: String,
    destination: String,
) -> Result<String, String> {
    let profile = load_profile(&app, &profile_id)?;
    let mut destination = PathBuf::from(destination);
    if destination.extension().and_then(|value| value.to_str()) != Some("zailon-visual-profile") {
        destination.set_extension("zailon-visual-profile");
    }
    write_json_atomic(&destination, &profile)?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn import_visual_profile(app: AppHandle, source: String) -> Result<VisualProfile, String> {
    let source = PathBuf::from(source);
    if source.extension().and_then(|value| value.to_str()) != Some("zailon-visual-profile") {
        return Err("Seuls les fichiers .zailon-visual-profile sont acceptés.".into());
    }
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    if metadata.len() > 1_048_576 {
        return Err("Le profil déclaratif dépasse la limite de 1 Mio.".into());
    }
    let payload = fs::read(source).map_err(|error| error.to_string())?;
    let mut profile: VisualProfile =
        serde_json::from_slice(&payload).map_err(|error| error.to_string())?;
    validate_profile(&profile)?;
    if profile_path(&app, &profile.id)?.exists() {
        profile.id = unique_token("visual-import");
        profile.name = format!("{} — importé", profile.name);
    }
    let now = timestamp();
    profile.created_at = now;
    profile.updated_at = now;
    write_json_atomic(&profile_path(&app, &profile.id)?, &profile)?;
    Ok(profile)
}

#[tauri::command]
pub fn apply_visual_profile(
    app: AppHandle,
    runtime: State<'_, VisualRuntime>,
    profile_id: String,
    monitor_id: Option<String>,
) -> Result<VisualApplyResult, String> {
    let profile = load_profile(&app, &profile_id)?;
    apply_profile_inner(
        &app,
        runtime.inner(),
        &profile,
        monitor_id.as_deref(),
        false,
    )
}

#[tauri::command]
pub fn preview_visual_profile(
    app: AppHandle,
    runtime: State<'_, VisualRuntime>,
    profile: VisualProfile,
    monitor_id: Option<String>,
) -> Result<VisualApplyResult, String> {
    apply_profile_inner(&app, runtime.inner(), &profile, monitor_id.as_deref(), true)
}

#[tauri::command]
pub fn confirm_visual_profile(
    app: AppHandle,
    runtime: State<'_, VisualRuntime>,
    confirmation_token: String,
) -> Result<(), String> {
    let removed = {
        let mut state = runtime
            .0
            .lock()
            .map_err(|_| "État Visual Profiles indisponible.".to_string())?;
        let monitor = state
            .pending_tokens
            .iter()
            .find(|(_, token)| *token == &confirmation_token)
            .map(|(monitor, _)| monitor.clone());
        monitor
            .as_ref()
            .and_then(|monitor| state.pending_tokens.remove(monitor))
            .is_some()
    };
    if !removed {
        return Err("Cette confirmation a expiré ou a déjà été utilisée.".into());
    }
    persist_emergency_state(&app, runtime.inner())?;
    append_log(
        &app,
        serde_json::json!({ "kind": "confirm", "token": "redacted" }),
    );
    Ok(())
}

#[tauri::command]
pub fn restore_visual_state(
    app: AppHandle,
    runtime: State<'_, VisualRuntime>,
    monitor_id: Option<String>,
) -> Result<VisualRestoreResult, String> {
    restore_states(&app, runtime.inner(), monitor_id.as_deref())
}

#[tauri::command]
pub fn set_visual_profile_association(
    app: AppHandle,
    game_id: String,
    zailon_profile_id: Option<String>,
    visual_profile_id: Option<String>,
) -> Result<(), String> {
    let key = association_key(&game_id, zailon_profile_id.as_deref())?;
    let mut associations = load_associations(&app);
    if let Some(visual_profile_id) = visual_profile_id {
        load_profile(&app, &visual_profile_id)?;
        associations.insert(key, visual_profile_id);
    } else {
        associations.remove(&key);
    }
    write_json_atomic(&associations_path(&app)?, &associations)
}

#[tauri::command]
pub fn visual_profile_association(
    app: AppHandle,
    game_id: String,
    zailon_profile_id: Option<String>,
) -> Result<Option<String>, String> {
    let exact = association_key(&game_id, zailon_profile_id.as_deref())?;
    let fallback = association_key(&game_id, None)?;
    let associations = load_associations(&app);
    Ok(associations
        .get(&exact)
        .or_else(|| associations.get(&fallback))
        .cloned())
}

#[tauri::command]
pub fn visual_shortcut_action(
    app: AppHandle,
    runtime: State<'_, VisualRuntime>,
    action: String,
) -> Result<String, String> {
    if action == "restore" {
        let result = restore_states(&app, runtime.inner(), None)?;
        return Ok(format!("{} écran(s) restauré(s).", result.restored));
    }
    let profiles = list_profiles_inner(&app)?;
    if profiles.is_empty() {
        return Err("Créez d’abord un profil visuel.".into());
    }
    let current = runtime
        .0
        .lock()
        .ok()
        .and_then(|state| state.active_profile_id.clone());
    if action == "toggle" && current.is_some() {
        let result = restore_states(&app, runtime.inner(), None)?;
        return Ok(format!(
            "Profil visuel désactivé · {} restauration(s).",
            result.restored
        ));
    }
    let current_index = current
        .as_ref()
        .and_then(|id| profiles.iter().position(|profile| &profile.id == id))
        .unwrap_or(0);
    let index = match action.as_str() {
        "previous" => current_index.checked_sub(1).unwrap_or(profiles.len() - 1),
        "next" => (current_index + 1) % profiles.len(),
        "toggle" => current_index,
        _ => return Err("Action de raccourci visuel inconnue.".into()),
    };
    let result = apply_profile_inner(&app, runtime.inner(), &profiles[index], None, true)?;
    Ok(if result.applied {
        format!("Profil {} appliqué.", profiles[index].name)
    } else {
        format!(
            "{} est disponible uniquement en aperçu.",
            profiles[index].name
        )
    })
}

#[tauri::command]
pub fn visual_safety_report(
    game_id: String,
    game_name: String,
    game_root: Option<String>,
    backend_id: String,
) -> Result<VisualSafetyReport, String> {
    safe_identifier(&game_id)?;
    let rust_policy = game_name.trim().eq_ignore_ascii_case("rust")
        || game_name.to_ascii_lowercase().contains("rust");
    let mut detected_components = Vec::new();
    if rust_policy {
        if let Some(root) = game_root {
            let root = PathBuf::from(root);
            for relative in [
                "dxgi.dll",
                "d3d11.dll",
                "ReShade.ini",
                "ReShadePreset.ini",
                "reshade-shaders",
            ] {
                if root.join(relative).exists() {
                    detected_components.push(relative.into());
                }
            }
        }
    }
    let compatible = matches!(backend_id.as_str(), GAMMA_BACKEND | PREVIEW_BACKEND);
    let mut warnings = vec![
        "La compatibilité avec la politique d’un jeu ou de son anti-triche peut évoluer.".into(),
    ];
    if rust_policy {
        warnings.push(
            "Rust interdit les outils d’injection graphique comme ReShade. Visual Profiles n’utilise aucune méthode de ce type."
                .into(),
        );
        if !detected_components.is_empty() {
            warnings.push(
                "Composant graphique incompatible détecté dans le dossier Rust. Aucun fichier n’a été supprimé."
                    .into(),
            );
        }
    }
    Ok(VisualSafetyReport {
        game_id,
        backend_id,
        changes_game_files: false,
        injects_code: false,
        hooks_graphics_api: false,
        reads_game_memory: false,
        writes_game_memory: false,
        uses_kernel_driver: false,
        uses_overlay: false,
        changes_system_display: compatible && backend_id == GAMMA_BACKEND,
        changes_monitor_hardware: false,
        compatible_with_game_policy: compatible && detected_components.is_empty(),
        rust_policy,
        detected_components,
        warnings,
    })
}

#[tauri::command]
pub fn open_visual_windows_settings(kind: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let uri = match kind.as_str() {
            "display" => "ms-settings:display",
            "hdr" => "ms-settings:display-advancedcolor",
            "night-light" => "ms-settings:nightlight",
            "accessibility" => "ms-settings:easeofaccess-colorfilter",
            "color-management" => "colorcpl.exe",
            _ => return Err("Page de paramètres Windows inconnue.".into()),
        };
        if kind == "color-management" {
            std::process::Command::new(uri)
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            std::process::Command::new("explorer.exe")
                .arg(uri)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = kind;
        Err("Ces paramètres sont uniquement disponibles sous Windows.".into())
    }
}

pub fn apply_associated_profile(
    app: &AppHandle,
    runtime: &VisualRuntime,
    game_id: &str,
    zailon_profile_id: &str,
) -> Result<Option<VisualApplyResult>, String> {
    let exact = association_key(game_id, Some(zailon_profile_id))?;
    let fallback = association_key(game_id, None)?;
    let associations = load_associations(app);
    let Some(profile_id) = associations
        .get(&exact)
        .or_else(|| associations.get(&fallback))
    else {
        return Ok(None);
    };
    let profile = load_profile(app, profile_id)?;
    apply_profile_inner(app, runtime, &profile, None, true).map(Some)
}

pub fn restore_for_shutdown(app: &AppHandle, runtime: &VisualRuntime) {
    let _ = restore_states(app, runtime, None);
}

pub fn recover_on_startup(app: &AppHandle, runtime: &VisualRuntime) {
    let Ok(path) = emergency_path(app) else {
        return;
    };
    let Ok(payload) = fs::read(&path) else {
        return;
    };
    let Ok(saved) = serde_json::from_slice::<SavedEmergencyState>(&payload) else {
        return;
    };
    if !saved.active || saved.states.is_empty() {
        return;
    }
    if let Ok(mut state) = runtime.0.lock() {
        for original in saved.states {
            state
                .originals
                .insert(original.monitor_id.clone(), original);
        }
    }
    let _ = restore_states(app, runtime, None);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(settings: VisualSettings) -> VisualProfile {
        VisualProfile {
            format_version: 1,
            id: "test-profile".into(),
            name: "Test".into(),
            description: String::new(),
            backend_id: PREVIEW_BACKEND.into(),
            monitor_id: None,
            settings,
            hdr_mode: "system".into(),
            created_at: 1,
            updated_at: 1,
            game_associations: Vec::new(),
            favorite: false,
            hotkey: None,
            safe_fallback_profile_id: None,
        }
    }

    #[test]
    fn neutral_gamma_transform_preserves_the_original_ramp() {
        let original = (0..3)
            .flat_map(|_| (0..256).map(|index| index as u16 * 257))
            .collect::<Vec<_>>();
        assert_eq!(
            transform_gamma_ramp(&original, &VisualSettings::default()),
            original
        );
    }

    #[test]
    fn transformed_gamma_ramp_stays_monotonic_and_bounded() {
        let original = (0..3)
            .flat_map(|_| (0..256).map(|index| index as u16 * 257))
            .collect::<Vec<_>>();
        let mut settings = VisualSettings::default();
        settings.gamma = 2.5;
        settings.contrast = 1.5;
        settings.brightness = 0.5;
        settings.temperature = 10_000;
        let ramp = transform_gamma_ramp(&original, &settings);
        assert_eq!(ramp.len(), 768);
        for channel in 0..3 {
            assert!(ramp[channel * 256..(channel + 1) * 256]
                .windows(2)
                .all(|values| values[0] <= values[1]));
        }
    }

    #[test]
    fn profile_validation_rejects_code_like_unknown_backends_and_extreme_values() {
        let mut invalid_backend = profile(VisualSettings::default());
        invalid_backend.backend_id = "custom-script".into();
        assert!(validate_profile(&invalid_backend).is_err());
        let mut invalid_settings = VisualSettings::default();
        invalid_settings.gamma = 10.0;
        assert!(validate_profile(&profile(invalid_settings)).is_err());
    }

    #[test]
    fn rust_safety_contract_contains_no_process_or_game_mutation() {
        let report = VisualSafetyReport {
            game_id: "rust".into(),
            backend_id: GAMMA_BACKEND.into(),
            changes_game_files: false,
            injects_code: false,
            hooks_graphics_api: false,
            reads_game_memory: false,
            writes_game_memory: false,
            uses_kernel_driver: false,
            uses_overlay: false,
            changes_system_display: true,
            changes_monitor_hardware: false,
            compatible_with_game_policy: true,
            rust_policy: true,
            detected_components: Vec::new(),
            warnings: Vec::new(),
        };
        assert!(!report.changes_game_files);
        assert!(!report.injects_code);
        assert!(!report.hooks_graphics_api);
        assert!(!report.reads_game_memory);
        assert!(!report.writes_game_memory);
        assert!(!report.uses_kernel_driver);
        assert!(!report.uses_overlay);
    }
}
