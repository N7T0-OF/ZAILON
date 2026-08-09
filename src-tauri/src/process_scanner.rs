//! GamePresenceScanner — détection des processus de jeu (Phase 6).
//!
//! Deux parties :
//! - le **score de correspondance** (`score_process`) est pur et cross-platform,
//!   testable partout (chemin, installation, candidats, contexte de rattachement) ;
//! - l'**énumération des processus** (`enumerate_processes`) est Windows-only
//!   (snapshot Toolhelp + chemin complet), no-op ailleurs.
//!
//! Contrat : un processus est considéré « jeu détecté » quand son score ≥ 80
//! (auto-attachement) ; entre 50 et 79, il reste candidat à confirmer par
//! l'utilisateur ; en dessous, ignoré. Le nom du processus seul ne suffit jamais.
//! Voir `docs/multi-stage-launch-system.md` (ProcessMatchScore).

use serde::{Deserialize, Serialize};

/// Signature de processus apprise (spec NTE §7 / « Signatures apprises ») :
/// enregistrée quand le processus final d'un jeu est détecté avec forte
/// confiance, réutilisée au lancement suivant pour une détection instantanée.
/// Format versionné (`schemaVersion` côté frontend) — ne jamais rescanner tout
/// le système pour la ré-apprendre.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnedProcessSignature {
    /// Nom de l'exécutable final (ex. HT-Win64-Shipping.exe).
    pub filename: String,
    /// Chemin relatif sous l'installation (ex. Client/WindowsNoEditor/…).
    pub relative_path: Option<String>,
    /// Éditeur / signature du processus, si disponible.
    pub publisher: Option<String>,
}

/// Demande de détection pour un jeu, envoyée par le frontend pendant la fenêtre
/// de rattachement d'une session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePresenceRequest {
    pub game_id: String,
    /// Racine d'installation : tout processus sous ce chemin est un candidat fort.
    pub install_root: Option<String>,
    /// Nom du launcher officiel principal (ex. NTELauncher.exe) — conservé pour
    /// compatibilité, la liste ci-dessous est la source complète.
    pub launcher_executable: Option<String>,
    /// Launchers intermédiaires connus (ex. `ntegloballauncher.exe` pour NTE) :
    /// un stage launcher est un candidat valide (+15) mais JAMAIS le jeu final —
    /// la détection continue vers le vrai processus.
    pub launcher_executable_candidates: Vec<String>,
    /// Noms des exécutables du jeu final (ex. HT-Win64-Shipping.exe).
    pub game_executable_candidates: Vec<String>,
    /// Vrai quand le scan se fait pendant la fenêtre de rattachement d'une session
    /// (relation launcher connue + fenêtre temporelle) → +20 au score.
    pub reattach_context: bool,
    /// Signatures apprises lors des lancements précédents (spec §7 / #36) : le
    /// nom appris (+ chemin relatif) donne un score fort au processus final,
    /// même après une mise à jour qui change l'exécutable.
    pub learned_signatures: Vec<LearnedProcessSignature>,
    /// Steam indique que l'AppID du jeu est « En cours » (registre RunningAppID,
    /// spec UAC §5-6) → +20 au score. Preuve indépendante du chemin : fonctionne
    /// même quand un processus élevé refuse de révéler son chemin.
    #[serde(default)]
    pub steam_running: bool,
    /// Emplacements profonds connus du processus final sous l'installation (ex.
    /// `Client/WindowsNoEditor/HT/Binaries/Win64` pour NTE) → +50 : le nom de
    /// l'exécutable n'est plus requis (spec UAC §6).
    #[serde(default)]
    pub game_path_patterns: Vec<String>,
}

/// Processus candidat observé sur le système.
#[derive(Debug, Clone)]
pub struct ProcessCandidate {
    pub pid: u32,
    pub executable_name: String,
    pub executable_path: String,
}

/// Résultat de détection pour un jeu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePresence {
    pub game_id: String,
    pub pid: u32,
    pub process_name: String,
    pub process_path: String,
    pub score: u8,
    pub matched_executable: Option<String>,
    /// Vrai si le processus correspond à un launcher intermédiaire connu (jamais
    /// le jeu final). Utilisé pour la fin de session : un launcher encore ouvert
    /// ne doit pas maintenir « En cours » (spec RuntimeSessionV3 §2).
    pub is_launcher_process: bool,
}

/// Normalise un chemin pour la comparaison (minuscules, séparateurs uniformes).
fn normalize(path: &str) -> String {
    path.replace('\\', "/")
        .to_lowercase()
        .trim_end_matches('/')
        .to_string()
}

fn path_under(root: &str, candidate: &str) -> bool {
    let root = normalize(root);
    let candidate = normalize(candidate);
    candidate == root || candidate.starts_with(&format!("{root}/"))
}

/// Vrai si le nom correspond à un launcher intermédiaire connu ET pas à un
/// exécutable final (candidat jeu ou signature apprise) — un processus peut
/// théoriquement correspondre aux deux ; le jeu l'emporte alors.
pub fn is_launcher_process(candidate: &ProcessCandidate, request: &GamePresenceRequest) -> bool {
    let name = candidate.executable_name.to_lowercase();
    let game_name = request
        .game_executable_candidates
        .iter()
        .any(|candidate| candidate.to_lowercase() == name)
        || request
            .learned_signatures
            .iter()
            .any(|signature| signature.filename.to_lowercase() == name);
    if game_name {
        return false;
    }
    request
        .launcher_executable_candidates
        .iter()
        .chain(request.launcher_executable.iter())
        .filter(|candidate| !candidate.is_empty())
        .any(|launcher| name == launcher.to_lowercase())
}

/// Score 0-100 d'un processus candidat pour une demande de jeu.
pub fn score_process(candidate: &ProcessCandidate, request: &GamePresenceRequest) -> u8 {
    let mut score: u32 = 0;
    let name = candidate.executable_name.to_lowercase();

    // +40 : le chemin appartient à l'installation configurée.
    if let Some(root) = &request.install_root {
        if !root.is_empty() && path_under(root, &candidate.executable_path) {
            score += 40;
        }
    }

    // +25 : le nom correspond à un exécutable final connu.
    if request
        .game_executable_candidates
        .iter()
        .any(|candidate_name| name == candidate_name.to_lowercase())
    {
        score += 25;
    }

    // +15 : le nom correspond à un launcher intermédiaire connu (présent, mais
    // pas le jeu final — la recherche du processus final continue toujours).
    let launcher_names: Vec<String> = request
        .launcher_executable_candidates
        .iter()
        .chain(request.launcher_executable.iter())
        .filter(|candidate| !candidate.is_empty())
        .cloned()
        .collect();
    if launcher_names
        .iter()
        .any(|launcher| name == launcher.to_lowercase())
    {
        score += 15;
    }

    // +20 : contexte de rattachement (le launcher vient de céder la main pendant
    // la fenêtre de rattachement — relation connue + fenêtre temporelle).
    if request.reattach_context {
        score += 20;
    }

    // Signatures apprises (§7 / #36) : le nom du processus correspond à un
    // processus final confirmé lors d'un lancement précédent → +25, et +15
    // supplémentaires si le chemin relatif sous l'installation correspond aussi.
    if request
        .learned_signatures
        .iter()
        .any(|signature| name == signature.filename.to_lowercase())
    {
        score += 25;
        if let Some(relative) = request
            .learned_signatures
            .iter()
            .find(|signature| name == signature.filename.to_lowercase())
            .and_then(|signature| signature.relative_path.as_deref())
        {
            if let Some(root) = &request.install_root {
                let root = normalize(root);
                let expected = normalize(relative);
                if !root.is_empty()
                    && normalize(&candidate.executable_path).ends_with(&format!("/{expected}"))
                {
                    score += 15;
                }
            }
        }
    }

    // +20 : Steam confirme que l'AppID du jeu est « En cours » (spec UAC §5-6).
    // Preuve indépendante du chemin : un processus élevé peut refuser de révéler
    // son chemin — Steam, le contexte et le nom suffisent alors (65 ≥ 60, seuil
    // Steam-backé côté frontend).
    if request.steam_running {
        score += 20;
    }

    // +50 : le chemin relatif (sous l'installation) tombe dans un emplacement
    // profond connu du processus final (ex. NTE Client\WindowsNoEditor\HT\
    // Binaries\Win64). Le nom de l'exécutable n'est plus obligatoire (spec §6).
    if !request.game_path_patterns.is_empty() {
        if let Some(root) = &request.install_root {
            let root = normalize(root);
            if !root.is_empty() {
                let normalized_path = normalize(&candidate.executable_path);
                if let Some(relative) = normalized_path.strip_prefix(&format!("{root}/")) {
                    if request.game_path_patterns.iter().any(|pattern| {
                        let pattern = pattern
                            .replace('\\', "/")
                            .to_lowercase()
                            .trim_end_matches('/')
                            .to_string();
                        relative.starts_with(&pattern)
                    }) {
                        score += 50;
                    }
                }
            }
        }
    }

    // -50 : le processus est HORS installation ET son chemin est accessible.
    // Si le chemin n'est pas accessible (processus élevé), on ne conclut rien —
    // les autres preuves (Steam, contexte, fenêtre) restent valables (spec §8).
    if let Some(root) = &request.install_root {
        if !root.is_empty()
            && !candidate.executable_path.is_empty()
            && !path_under(root, &candidate.executable_path)
        {
            score = score.saturating_sub(50);
        }
    }

    (score.min(100)) as u8
}

/// Détecte les jeux parmi les candidats. Un score ≥ 80 → détection automatique.
pub fn detect_games(
    candidates: &[ProcessCandidate],
    requests: &[GamePresenceRequest],
) -> Vec<GamePresence> {
    let mut results = Vec::new();
    for request in requests {
        let mut best: Option<(u8, &ProcessCandidate, Option<String>, bool)> = None;
        for candidate in candidates {
            let score = score_process(candidate, request);
            if score >= 50 {
                let launcher = is_launcher_process(candidate, request);
                let better = match best {
                    None => true,
                    Some((current_score, _, _, _)) => score > current_score,
                };
                if better {
                    best = Some((
                        score,
                        candidate,
                        if score >= 25 {
                            Some(candidate.executable_name.clone())
                        } else {
                            None
                        },
                        launcher,
                    ));
                }
            }
        }
        if let Some((score, candidate, matched, launcher)) = best {
            results.push(GamePresence {
                game_id: request.game_id.clone(),
                pid: candidate.pid,
                process_name: candidate.executable_name.clone(),
                process_path: candidate.executable_path.clone(),
                score,
                matched_executable: matched,
                is_launcher_process: launcher,
            });
        }
    }
    results
}

/// Énumère les processus en cours. Windows : snapshot Toolhelp + chemin complet.
/// Ailleurs : liste vide (aucune détection native).
#[cfg(target_os = "windows")]
pub fn enumerate_processes() -> Vec<ProcessCandidate> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut candidates = Vec::new();
    // SAFETY : appel Win32 standard ; le snapshot est fermé quoi qu'il arrive.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return candidates;
    }
    // SAFETY : PROCESSENTRY32W est initialisé par Process32FirstW/NextW.
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut has_next = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while has_next {
        let pid = entry.th32ProcessID;
        let exe_name = String::from_utf16_lossy(&entry.szExeFile)
            .trim_end_matches('\0')
            .to_string();
        let mut path = String::new();
        // Chemin complet : accès limité, échoue proprement pour les processus élevés.
        // SAFETY : OpenProcess/QueryFullProcessImageNameW avec un buffer de taille bornée.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !handle.is_null() {
                let mut size: u32 = 32_768;
                let mut buffer = vec![0u16; size as usize];
                // PWSTR est un alias de `*mut u16` dans windows-sys 0.61.
                let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size);
                if ok != 0 {
                    path = String::from_utf16_lossy(&buffer[..size as usize]);
                }
                CloseHandle(handle);
            }
        }
        candidates.push(ProcessCandidate {
            pid,
            executable_name: exe_name,
            executable_path: path,
        });
        has_next = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    // SAFETY : fermeture du snapshot.
    unsafe { CloseHandle(snapshot) };
    candidates
}

/// Version non-Windows : aucune énumération native.
#[cfg(not(target_os = "windows"))]
pub fn enumerate_processes() -> Vec<ProcessCandidate> {
    Vec::new()
}

/// Scan complet : énumère puis matche. À appeler pendant la fenêtre de rattachement.
pub fn scan_requests(requests: &[GamePresenceRequest]) -> Vec<GamePresence> {
    if requests.is_empty() {
        return Vec::new();
    }
    let candidates = enumerate_processes();
    if candidates.is_empty() {
        return Vec::new();
    }
    detect_games(&candidates, requests)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(name: &str, path: &str) -> ProcessCandidate {
        ProcessCandidate {
            pid: 42,
            executable_name: name.to_string(),
            executable_path: path.to_string(),
        }
    }

    fn nte_request(reattach_context: bool) -> GamePresenceRequest {
        GamePresenceRequest {
            game_id: "nte".to_string(),
            install_root: Some("X:\\Games\\Neverness To Everness\\".to_string()),
            launcher_executable: Some("NTELauncher.exe".to_string()),
            launcher_executable_candidates: vec![
                "NTELauncher.exe".to_string(),
                "ntegloballauncher.exe".to_string(),
            ],
            game_executable_candidates: vec![
                "HT-Win64-Shipping.exe".to_string(),
                "NTE-Win64-Shipping.exe".to_string(),
            ],
            reattach_context,
            learned_signatures: Vec::new(),
            steam_running: false,
            game_path_patterns: vec![],
        }
    }

    fn nte_request_with(reattach_context: bool, steam_running: bool) -> GamePresenceRequest {
        let mut request = nte_request(reattach_context);
        request.steam_running = steam_running;
        request.game_path_patterns = vec!["Client/WindowsNoEditor/HT/Binaries/Win64".to_string()];
        request
    }

    #[test]
    fn final_game_under_install_in_reattach_context_is_detected() {
        let process = candidate(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
        );
        let score = score_process(&process, &nte_request(true));
        // 40 (installation) + 25 (candidat) + 20 (contexte) = 85 ≥ 80.
        assert_eq!(score, 85);
        let results = detect_games(&[process], &[nte_request(true)]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].score, 85);
        assert_eq!(
            results[0].matched_executable.as_deref(),
            Some("HT-Win64-Shipping.exe")
        );
    }

    #[test]
    fn unrelated_process_never_reaches_detection() {
        let process = candidate(
            "Discord.exe",
            "C:\\Users\\kai\\AppData\\Local\\Discord\\Discord.exe",
        );
        let score = score_process(&process, &nte_request(true));
        // Hors installation avec chemin accessible → -50 : 20 (contexte) - 50 = 0.
        assert_eq!(score, 0);
        assert!(detect_games(&[process], &[nte_request(true)]).is_empty());
    }

    #[test]
    fn launcher_alone_is_not_the_game() {
        let process = candidate(
            "NTELauncher.exe",
            "X:\\Games\\Neverness To Everness\\NTELauncher.exe",
        );
        let score = score_process(&process, &nte_request(true));
        // 40 (installation) + 15 (launcher) + 20 (contexte) = 75 < 80 : candidat, pas auto.
        assert_eq!(score, 75);
    }

    #[test]
    fn nte_global_launcher_is_a_valid_stage_but_not_the_game() {
        // ntegloballauncher.exe est un stage intermédiaire VALIDE (launcher +15),
        // jamais le processus final — la détection continue vers le vrai jeu.
        let process = candidate(
            "ntegloballauncher.exe",
            "X:\\Games\\Neverness To Everness\\NTEGlobal\\ntegloballauncher.exe",
        );
        let score = score_process(&process, &nte_request(true));
        // 40 (installation) + 15 (launcher candidat) + 20 (contexte) = 75 < 80 :
        // stage valide — candidat (>= 50), jamais auto-attaché comme « jeu »
        // (le seuil d'auto-attachement 80 est appliqué côté frontend).
        assert_eq!(score, 75);
        let results = detect_games(&[process], &[nte_request(true)]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].score, 75);
        // Spec RuntimeSessionV3 §2 : un launcher ne maintient JAMAIS « En cours ».
        assert!(results[0].is_launcher_process);
    }

    #[test]
    fn final_process_is_not_a_launcher_even_inside_install() {
        let process = candidate(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
        );
        let results = detect_games(&[process], &[nte_request(false)]);
        assert_eq!(results.len(), 1);
        assert!(!results[0].is_launcher_process);
    }

    #[test]
    fn game_name_wins_over_launcher_name_match() {
        // Un exécutable listé à la fois comme candidat jeu et launcher est un
        // processus final (le jeu l'emporte — spec §2).
        let mut request = nte_request(false);
        request
            .game_executable_candidates
            .push("ntegloballauncher.exe".to_string());
        let process = candidate(
            "ntegloballauncher.exe",
            "X:\\Games\\Neverness To Everness\\NTEGlobal\\ntegloballauncher.exe",
        );
        let results = detect_games(&[process], &[request]);
        assert_eq!(results.len(), 1);
        assert!(!results[0].is_launcher_process);
    }

    #[test]
    fn no_reattach_context_requires_more_evidence() {
        let process = candidate(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
        );
        // Sans contexte : 40 + 25 = 65 < 80 → pas d'auto-attachement.
        let score = score_process(&process, &nte_request(false));
        assert_eq!(score, 65);
    }

    #[test]
    fn name_alone_never_matches() {
        let process = candidate("nte-helper.exe", "C:\\Temp\\nte-helper.exe");
        // Hors installation → -50 : 20 (contexte) - 50 = 0.
        let score = score_process(&process, &nte_request(true));
        assert_eq!(score, 0);
    }

    #[test]
    fn steam_backed_reattach_detects_final_process_without_accessible_path() {
        // Spec UAC §5-6, §8 : le processus final est ÉLEVÉ et refuse de révéler
        // son chemin (chemin vide). Steam confirme l'AppID « En cours ».
        let process = candidate("HT-Win64-Shipping.exe", "");
        let score = score_process(&process, &nte_request_with(true, true));
        // 25 (candidat) + 20 (contexte) + 20 (Steam) = 65 ≥ 60 (seuil Steam-backé
        // côté frontend) → la session sort de l'élévation et passe En cours.
        assert_eq!(score, 65);
        let results = detect_games(&[process], &[nte_request_with(true, true)]);
        // Le seuil natif d'auto-attachement reste 80 ; c'est le frontend qui
        // applique le seuil Steam-backé (60) — le score est renvoyé tel quel.
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].score, 65);
    }

    #[test]
    fn deep_path_pattern_detects_final_process_without_name_match() {
        // Spec UAC §6 : le nom de l'exécutable n'est plus obligatoire. Un
        // processus sous Client\WindowsNoEditor\HT\Binaries\Win64\ reçoit
        // +50 même s'il n'est dans aucun candidat connu.
        let process = candidate(
            "NTE-Game-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\NTE-Game-Win64-Shipping.exe",
        );
        let request = nte_request_with(true, true);
        let score = score_process(&process, &request);
        // 40 (installation) + 50 (motif profond) + 20 (contexte) + 20 (Steam)
        // = 130 → plafonné à 100 ≥ 80 : auto-attaché SANS connaître le nom.
        assert_eq!(score, 100);
        let results = detect_games(&[process], &[request]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].score, 100);
    }

    #[test]
    fn learned_signature_boosts_the_final_process() {
        // Après une mise à jour, l'exécutable final est NOUVEAU (pas dans les
        // candidats) mais sa signature a été apprise au lancement précédent.
        let mut request = nte_request(false);
        request.learned_signatures = vec![LearnedProcessSignature {
            filename: "HT-Win64-Shipping-2.exe".to_string(),
            relative_path: Some(
                "Client/WindowsNoEditor/HT/Binaries/Win64/HT-Win64-Shipping-2.exe".to_string(),
            ),
            publisher: None,
        }];
        let process = candidate(
            "HT-Win64-Shipping-2.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping-2.exe",
        );
        // 40 (installation) + 25 (signature apprise) + 15 (chemin relatif appris) = 80 ≥ 80
        // → détection automatique SANS connaître le nom à l'avance (spec §6-7).
        let score = score_process(&process, &request);
        assert_eq!(score, 80);
        let results = detect_games(&[process], &[request]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].score, 80);
    }

    #[test]
    fn best_candidate_wins_per_game() {
        let launcher = candidate(
            "NTELauncher.exe",
            "X:\\Games\\Neverness To Everness\\NTELauncher.exe",
        );
        let game = candidate(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
        );
        let results = detect_games(&[launcher, game], &[nte_request(true)]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].process_name, "HT-Win64-Shipping.exe");
    }
}
