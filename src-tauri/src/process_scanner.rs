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

/// Demande de détection pour un jeu, envoyée par le frontend pendant la fenêtre
/// de rattachement d'une session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePresenceRequest {
    pub game_id: String,
    /// Racine d'installation : tout processus sous ce chemin est un candidat fort.
    pub install_root: Option<String>,
    /// Nom du launcher officiel (ex. NTELauncher.exe).
    pub launcher_executable: Option<String>,
    /// Noms des exécutables du jeu final (ex. HT-Win64-Shipping.exe).
    pub game_executable_candidates: Vec<String>,
    /// Vrai quand le scan se fait pendant la fenêtre de rattachement d'une session
    /// (relation launcher connue + fenêtre temporelle) → +20 au score.
    pub reattach_context: bool,
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

/// Score 0-100 d'un processus candidat pour une demande de jeu.
pub fn score_process(candidate: &ProcessCandidate, request: &GamePresenceRequest) -> u8 {
    let mut score: u32 = 0;
    let name = candidate.executable_name.to_lowercase();
    let mut matched: Option<String> = None;

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
        matched = Some(candidate.executable_name.clone());
    }

    // +15 : le nom correspond au launcher officiel (présent, mais pas le jeu final).
    if let Some(launcher) = &request.launcher_executable {
        if !launcher.is_empty() && name == launcher.to_lowercase() {
            score += 15;
        }
    }

    // +20 : contexte de rattachement (le launcher vient de céder la main pendant
    // la fenêtre de rattachement — relation connue + fenêtre temporelle).
    if request.reattach_context {
        score += 20;
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
        let mut best: Option<(u8, &ProcessCandidate, Option<String>)> = None;
        for candidate in candidates {
            let score = score_process(candidate, request);
            if score >= 50 {
                let better = match best {
                    None => true,
                    Some((current_score, _, _)) => score > current_score,
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
                    ));
                }
            }
        }
        if let Some((score, candidate, matched)) = best {
            results.push(GamePresence {
                game_id: request.game_id.clone(),
                pid: candidate.pid,
                process_name: candidate.executable_name.clone(),
                process_path: candidate.executable_path.clone(),
                score,
                matched_executable: matched,
            });
        }
    }
    results
}

/// Énumère les processus en cours. Windows : snapshot Toolhelp + chemin complet.
/// Ailleurs : liste vide (aucune détection native).
#[cfg(target_os = "windows")]
pub fn enumerate_processes() -> Vec<ProcessCandidate> {
    use windows_sys::core::PWSTR;
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
            if handle != 0 {
                let mut size: u32 = 32_768;
                let mut buffer = vec![0u16; size as usize];
                let ok =
                    QueryFullProcessImageNameW(handle, 0, PWSTR(buffer.as_mut_ptr()), &mut size);
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
            game_executable_candidates: vec![
                "HT-Win64-Shipping.exe".to_string(),
                "NTE-Win64-Shipping.exe".to_string(),
            ],
            reattach_context,
        }
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
    fn unrelated_process_scores_zero() {
        let process = candidate(
            "Discord.exe",
            "C:\\Users\\kai\\AppData\\Local\\Discord\\Discord.exe",
        );
        let score = score_process(&process, &nte_request(true));
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
        let score = score_process(&process, &nte_request(true));
        assert_eq!(score, 20); // uniquement le contexte de rattachement
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
