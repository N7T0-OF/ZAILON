use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

const OPEN77_EXECUTABLE: &str = "Open77Launcher.exe";
const OPEN77_DOCS_URL: &str = "https://open2077.net/docs/launcher";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Open77ProjectionEntry {
    path: String,
    layer: String,
    exists: bool,
    conflicts_with_zailon: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Open77Report {
    supported: bool,
    launcher_path: Option<String>,
    launcher_sha256: Option<String>,
    game_root: String,
    game_executable_path: Option<String>,
    game_executable_sha256: Option<String>,
    state_path: Option<String>,
    log_path: Option<String>,
    projection_entries: Vec<Open77ProjectionEntry>,
    stack_files: usize,
    world_files: usize,
    other_files: usize,
    present_files: usize,
    missing_files: usize,
    conflict_count: usize,
    blockers: Vec<String>,
    warnings: Vec<String>,
    diagnostics: Vec<String>,
    docs_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Open77LaunchResult {
    mode: String,
    launcher_path: String,
    process_id: Option<u32>,
    exit_code: Option<i32>,
    output: String,
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn is_open77_launcher(path: &Path) -> bool {
    if !path.is_file()
        || !path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(OPEN77_EXECUTABLE))
    {
        return false;
    }
    let mut magic = [0_u8; 2];
    fs::File::open(path)
        .and_then(|mut file| file.read_exact(&mut magic))
        .is_ok()
        && magic == *b"MZ"
}

fn launcher_candidates(configured: Option<&str>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = configured.filter(|path| !path.trim().is_empty()) {
        candidates.push(PathBuf::from(path));
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&local).join("Open77").join(OPEN77_EXECUTABLE));
            candidates.push(
                PathBuf::from(&local)
                    .join("Programs")
                    .join("Open77")
                    .join(OPEN77_EXECUTABLE),
            );
        }
        for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
            if let Some(root) = std::env::var_os(variable) {
                candidates.push(PathBuf::from(root).join("Open77").join(OPEN77_EXECUTABLE));
            }
        }
        if let Some(home) = std::env::var_os("USERPROFILE") {
            let home = PathBuf::from(home);
            candidates.push(home.join("Downloads").join(OPEN77_EXECUTABLE));
            candidates.push(home.join("Desktop").join(OPEN77_EXECUTABLE));
        }
    }
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.to_string_lossy().to_ascii_lowercase()))
        .collect()
}

fn open77_local_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|root| root.join("Open77"));
    }
    #[cfg(not(target_os = "windows"))]
    None
}

fn normalize_projected_path(raw: &str, game_root: &Path) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return None;
    }
    // Le journal est produit sous Windows, mais ses tests tournent aussi sur
    // Linux. Normaliser les deux séparateurs avant toute comparaison évite de
    // traiter `red4ext\red4ext.dll` comme un seul nom de fichier sur Unix.
    let normalized_input = trimmed.replace('\\', "/");
    let normalized_root = game_root
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase();
    let input_lower = normalized_input.to_ascii_lowercase();
    let relative = if input_lower == normalized_root {
        String::new()
    } else if input_lower.starts_with(&format!("{normalized_root}/")) {
        input_lower[normalized_root.len() + 1..].to_string()
    } else if input_lower.starts_with('/')
        || input_lower.starts_with("//")
        || input_lower.as_bytes().get(1) == Some(&b':')
    {
        return None;
    } else {
        normalized_input
    };
    let mut parts = Vec::new();
    for part in relative.split('/') {
        match part {
            "" | "." => {}
            ".." => return None,
            _ => parts.push(part.to_ascii_lowercase()),
        }
    }
    let normalized = parts.join("/");
    (!normalized.is_empty()).then_some(normalized)
}

fn object_path(value: &serde_json::Map<String, Value>) -> Option<&str> {
    [
        "path",
        "relativePath",
        "relative_path",
        "destination",
        "target",
        "gamePath",
        "game_path",
    ]
    .into_iter()
    .find_map(|key| value.get(key).and_then(Value::as_str))
}

fn object_layer<'a>(value: &'a serde_json::Map<String, Value>, inherited: &'a str) -> &'a str {
    value
        .get("layer")
        .or_else(|| value.get("owner"))
        .or_else(|| value.get("scope"))
        .and_then(Value::as_str)
        .unwrap_or(inherited)
}

fn collect_projection_entries(
    value: &Value,
    inherited_layer: &str,
    game_root: &Path,
    entries: &mut BTreeMap<String, String>,
) {
    match value {
        Value::Array(values) => {
            for item in values {
                collect_projection_entries(item, inherited_layer, game_root, entries);
            }
        }
        Value::Object(object) => {
            let layer = object_layer(object, inherited_layer);
            if let Some(path) =
                object_path(object).and_then(|path| normalize_projected_path(path, game_root))
            {
                entries.insert(path, layer.to_ascii_lowercase());
            }
            for (key, child) in object {
                let child_layer = if matches!(key.as_str(), "stack" | "world" | "own" | "solo") {
                    key.as_str()
                } else {
                    layer
                };
                collect_projection_entries(child, child_layer, game_root, entries);
            }
        }
        _ => {}
    }
}

fn projection_entries(
    state_path: &Path,
    game_root: &Path,
    zailon_paths: &[String],
) -> Result<Vec<Open77ProjectionEntry>, String> {
    let bytes = fs::read(state_path).map_err(|error| error.to_string())?;
    let json: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Journal OPEN//77 illisible : {error}"))?;
    let mut parsed = BTreeMap::new();
    collect_projection_entries(&json, "unknown", game_root, &mut parsed);
    let zailon = zailon_paths
        .iter()
        .filter_map(|path| normalize_projected_path(path, game_root))
        .collect::<HashSet<_>>();
    Ok(parsed
        .into_iter()
        .map(|(path, layer)| {
            let physical_path = path
                .split('/')
                .fold(game_root.to_path_buf(), |current, part| current.join(part));
            let exists = physical_path.is_file();
            let conflicts_with_zailon = zailon.contains(&path);
            Open77ProjectionEntry {
                path,
                layer,
                exists,
                conflicts_with_zailon,
            }
        })
        .collect())
}

fn resolve_game_root(game_root: &str) -> Result<PathBuf, String> {
    let supplied = PathBuf::from(game_root);
    let root = if supplied
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("Cyberpunk2077.exe"))
    {
        supplied
            .ancestors()
            .nth(3)
            .map(Path::to_path_buf)
            .ok_or_else(|| "Le chemin Cyberpunk est incomplet.".to_string())?
    } else if supplied.ends_with(Path::new("bin/x64")) || supplied.ends_with(Path::new("bin\\x64"))
    {
        supplied
            .ancestors()
            .nth(2)
            .map(Path::to_path_buf)
            .ok_or_else(|| "Le chemin Cyberpunk est incomplet.".to_string())?
    } else {
        supplied
    };
    fs::canonicalize(root).map_err(|_| "Le dossier Cyberpunk 2077 est introuvable.".to_string())
}

#[tauri::command]
pub fn open77_inspect(
    launcher_path: Option<String>,
    game_root: String,
    zailon_paths: Vec<String>,
) -> Result<Open77Report, String> {
    let supported = cfg!(target_os = "windows");
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    let mut diagnostics = Vec::new();
    if !supported {
        blockers
            .push("Le client OPEN//77 est actuellement disponible uniquement sous Windows.".into());
    }

    let resolved_root = resolve_game_root(&game_root)?;
    let game_executable = resolved_root
        .join("bin")
        .join("x64")
        .join("Cyberpunk2077.exe");
    let game_executable_path = game_executable
        .is_file()
        .then(|| game_executable.to_string_lossy().to_string());
    let game_executable_sha256 = game_executable_path
        .as_ref()
        .and_then(|_| sha256_file(&game_executable).ok());
    if game_executable_path.is_none() {
        blockers.push(
            "Cyberpunk2077.exe est absent de bin/x64 : corrigez l’installation sélectionnée."
                .into(),
        );
    } else {
        diagnostics
            .push("Exécutable Cyberpunk détecté et empreinte SHA-256 calculée localement.".into());
    }

    let configured = launcher_path.as_deref();
    let launcher = launcher_candidates(configured)
        .into_iter()
        .find(|candidate| is_open77_launcher(candidate));
    if configured.is_some() && launcher.is_none() {
        warnings.push(
            "Le chemin OPEN//77 mémorisé n’est pas un Open77Launcher.exe Windows valide.".into(),
        );
    }
    if launcher.is_none() {
        blockers.push("Open77Launcher.exe n’a pas été détecté. Choisissez le fichier téléchargé depuis le site officiel.".into());
    }
    let launcher_path = launcher
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    let launcher_sha256 = launcher.as_ref().and_then(|path| sha256_file(path).ok());

    let local_root = open77_local_root();
    let state_path = local_root
        .as_ref()
        .map(|root| root.join("modstore").join("state").join("projection.json"));
    let log_path = local_root.as_ref().map(|root| root.join("launcher.log"));
    let mut projection = Vec::new();
    if let Some(path) = state_path.as_ref().filter(|path| path.is_file()) {
        match projection_entries(path, &resolved_root, &zailon_paths) {
            Ok(entries) => {
                diagnostics.push(format!(
                    "Journal de projection OPEN//77 lu : {} chemin(s) attribué(s).",
                    entries.len()
                ));
                projection = entries;
            }
            Err(error) => warnings.push(error),
        }
    } else {
        diagnostics.push("Aucun journal de projection OPEN//77 : le mod stack n’a peut-être pas encore été appliqué.".into());
    }

    let stack_files = projection
        .iter()
        .filter(|entry| entry.layer == "stack")
        .count();
    let world_files = projection
        .iter()
        .filter(|entry| entry.layer == "world")
        .count();
    let other_files = projection.len().saturating_sub(stack_files + world_files);
    let present_files = projection.iter().filter(|entry| entry.exists).count();
    let missing_files = projection.len().saturating_sub(present_files);
    let conflict_count = projection
        .iter()
        .filter(|entry| entry.conflicts_with_zailon)
        .count();
    if conflict_count > 0 {
        blockers.push(format!(
            "{conflict_count} fichier(s) sont revendiqués à la fois par OPEN//77 et le profil ZAILON actif. Laissez un seul gestionnaire posséder ces chemins."
        ));
    }
    if missing_files > 0 {
        warnings.push(format!(
            "{missing_files} fichier(s) du journal OPEN//77 ne sont plus présents dans le jeu ; relancez son contrôle avant de rejoindre un monde."
        ));
    }

    Ok(Open77Report {
        supported,
        launcher_path,
        launcher_sha256,
        game_root: resolved_root.to_string_lossy().to_string(),
        game_executable_path,
        game_executable_sha256,
        state_path: state_path
            .filter(|path| path.is_file())
            .map(|path| path.to_string_lossy().to_string()),
        log_path: log_path
            .filter(|path| path.is_file())
            .map(|path| path.to_string_lossy().to_string()),
        projection_entries: projection,
        stack_files,
        world_files,
        other_files,
        present_files,
        missing_files,
        conflict_count,
        blockers,
        warnings,
        diagnostics,
        docs_url: OPEN77_DOCS_URL.into(),
    })
}

fn validated_launcher_and_root(
    launcher_path: &str,
    game_root: &str,
) -> Result<(PathBuf, PathBuf), String> {
    if !cfg!(target_os = "windows") {
        return Err(
            "Le client OPEN//77 est actuellement disponible uniquement sous Windows.".into(),
        );
    }
    let launcher = fs::canonicalize(launcher_path)
        .map_err(|_| "Open77Launcher.exe est introuvable.".to_string())?;
    if !is_open77_launcher(&launcher) {
        return Err(
            "Le fichier sélectionné n’est pas un Open77Launcher.exe Windows valide.".into(),
        );
    }
    let root = resolve_game_root(game_root)?;
    if !root
        .join("bin")
        .join("x64")
        .join("Cyberpunk2077.exe")
        .is_file()
    {
        return Err("Cyberpunk2077.exe est absent de bin/x64.".into());
    }
    Ok((launcher, root))
}

#[tauri::command]
pub async fn open77_launch(
    launcher_path: String,
    game_root: String,
    mode: String,
) -> Result<Open77LaunchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (launcher, root) = validated_launcher_and_root(&launcher_path, &game_root)?;
        let mut command = Command::new(&launcher);
        command.arg("--game-dir").arg(&root);
        match mode.as_str() {
            "home" => {}
            "mods" => {
                command.arg("--mods");
            }
            "detect" => {
                command.arg("--detect-only");
                command.stdout(Stdio::piped()).stderr(Stdio::piped());
                let output = command.output().map_err(|error| error.to_string())?;
                let mut text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stderr.is_empty() {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(&stderr);
                }
                return Ok(Open77LaunchResult {
                    mode,
                    launcher_path: launcher.to_string_lossy().to_string(),
                    process_id: None,
                    exit_code: output.status.code(),
                    output: text,
                });
            }
            _ => return Err("Mode OPEN//77 inconnu.".into()),
        }
        let child = command.spawn().map_err(|error| error.to_string())?;
        Ok(Open77LaunchResult {
            mode,
            launcher_path: launcher.to_string_lossy().to_string(),
            process_id: Some(child.id()),
            exit_code: None,
            output: "OPEN//77 a été ouvert avec le dossier Cyberpunk sélectionné.".into(),
        })
    })
    .await
    .map_err(|_| "Le lancement OPEN//77 s’est interrompu.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projection_parser_reads_layers_and_normalizes_paths() {
        let root = PathBuf::from("C:/Games/Cyberpunk 2077");
        let value = serde_json::json!({
            "files": [
                { "path": "red4ext\\red4ext.dll", "layer": "stack" },
                { "destination": "archive/pc/mod/world.archive", "layer": "world" }
            ]
        });
        let mut entries = BTreeMap::new();
        collect_projection_entries(&value, "unknown", &root, &mut entries);
        assert_eq!(
            entries.get("red4ext/red4ext.dll").map(String::as_str),
            Some("stack")
        );
        assert_eq!(
            entries
                .get("archive/pc/mod/world.archive")
                .map(String::as_str),
            Some("world")
        );
    }

    #[test]
    fn projection_parser_deduplicates_paths_deterministically() {
        let root = PathBuf::from("C:/Games/Cyberpunk 2077");
        let value = serde_json::json!({
            "stack": [{ "path": "r6/scripts/bridge.reds" }],
            "world": [{ "path": "R6\\SCRIPTS\\BRIDGE.REDS" }]
        });
        let mut entries = BTreeMap::new();
        collect_projection_entries(&value, "unknown", &root, &mut entries);
        assert_eq!(entries.len(), 1);
        assert_eq!(
            entries.get("r6/scripts/bridge.reds").map(String::as_str),
            Some("world")
        );
    }

    #[test]
    fn launcher_validation_rejects_renamed_non_pe_file() {
        let root = std::env::temp_dir().join(format!("zailon-open77-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let launcher = root.join(OPEN77_EXECUTABLE);
        fs::write(&launcher, b"not a PE executable").unwrap();
        assert!(!is_open77_launcher(&launcher));
        fs::remove_dir_all(root).unwrap();
    }
}
