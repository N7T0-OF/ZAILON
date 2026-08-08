//! GameWindowWatcher — détection de la fenêtre principale d'un jeu (Phase 6).
//!
//! Une fenêtre de jeu est une preuve de présence **indépendante de l'arbre des
//! processus** : elle survit aux launchers intermédiaires, aux élévations UAC
//! et aux relances internes. Dès que la fenêtre du jeu est visible (et au
//! premier plan), la session peut passer en `GameRunning` sans dépendre du PID
//! lancé par ZAILON.
//!
//! Deux parties :
//! - le **score** (`score_window`) est pur et cross-platform (chemin
//!   d'installation, exécutable, visibilité, premier plan, motif de titre,
//!   contexte de rattachement) — testable partout ;
//! - l'**énumération des fenêtres** (`enumerate_windows`) est Windows-only
//!   (EnumWindows + titre/classe + processus associé), no-op ailleurs.
//!
//! Contrat : fenêtre détectée quand le score ≥ 80 (auto-attachement). Le titre
//! de la fenêtre NTE exact n'est pas deviné : les motifs sont appris lors des
//! tests réels et ajoutés à l'adaptateur (`windowTitlePatterns`).

use serde::{Deserialize, Serialize};

/// Demande de détection de fenêtre pour un jeu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameWindowRequest {
    pub game_id: String,
    /// Racine d'installation : une fenêtre dont le processus vit sous ce chemin
    /// est un candidat fort.
    pub install_root: Option<String>,
    /// Exécutables du jeu final (ex. HT-Win64-Shipping.exe).
    pub game_executable_candidates: Vec<String>,
    /// Motifs de titre (sous-chaîne, insensible à la casse) appris lors des
    /// tests réels — optionnel, renforce le score. Jamais devinés.
    pub title_patterns: Vec<String>,
    /// Vrai pendant la fenêtre de rattachement d'une session → +20.
    pub reattach_context: bool,
}

/// Fenêtre candidate observée sur le système.
#[derive(Debug, Clone)]
pub struct WindowCandidate {
    pub pid: u32,
    pub title: String,
    pub class_name: String,
    pub visible: bool,
    pub foreground: bool,
    pub executable_name: String,
    pub executable_path: String,
}

/// Fenêtre de jeu détectée.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameWindowMatch {
    pub game_id: String,
    pub pid: u32,
    pub title: String,
    pub class_name: String,
    pub score: u8,
    pub matched_title_pattern: Option<String>,
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

/// Score 0-100 d'une fenêtre candidate pour une demande de jeu, plus le motif
/// de titre éventuellement matché.
pub fn score_window(
    candidate: &WindowCandidate,
    request: &GameWindowRequest,
) -> (u8, Option<String>) {
    let mut score: u32 = 0;
    let name = candidate.executable_name.to_lowercase();

    // +40 : le processus de la fenêtre vit sous l'installation configurée.
    if let Some(root) = &request.install_root {
        if !root.is_empty() && path_under(root, &candidate.executable_path) {
            score += 40;
        }
    }

    // +25 : l'exécutable correspond à un exécutable final connu.
    if request
        .game_executable_candidates
        .iter()
        .any(|candidate_name| name == candidate_name.to_lowercase())
    {
        score += 25;
    }

    // +10 : fenêtre visible (pas un processus en arrière-plan ou une icône tray).
    if candidate.visible {
        score += 10;
    }

    // +5 : fenêtre au premier plan (le joueur est dedans).
    if candidate.foreground {
        score += 5;
    }

    // +10 : titre correspondant à un motif appris (sous-chaîne insensible à la casse).
    let mut matched_pattern: Option<String> = None;
    for pattern in &request.title_patterns {
        if !pattern.is_empty()
            && candidate
                .title
                .to_lowercase()
                .contains(&pattern.to_lowercase())
        {
            score += 10;
            matched_pattern = Some(pattern.clone());
            break;
        }
    }

    // +20 : contexte de rattachement (session en attente, launcher vient de céder la main).
    if request.reattach_context {
        score += 20;
    }

    ((score.min(100)) as u8, matched_pattern)
}

/// Détecte les fenêtres de jeu parmi les candidates. Score ≥ 80 → détection.
pub fn detect_windows(
    candidates: &[WindowCandidate],
    requests: &[GameWindowRequest],
) -> Vec<GameWindowMatch> {
    let mut results = Vec::new();
    for request in requests {
        let mut best: Option<(u8, &WindowCandidate, Option<String>)> = None;
        for candidate in candidates {
            let (score, matched) = score_window(candidate, request);
            if score >= 50 {
                let better = match best {
                    None => true,
                    Some((current_score, _, _)) => score > current_score,
                };
                if better {
                    best = Some((score, candidate, matched));
                }
            }
        }
        if let Some((score, candidate, matched)) = best {
            results.push(GameWindowMatch {
                game_id: request.game_id.clone(),
                pid: candidate.pid,
                title: candidate.title.clone(),
                class_name: candidate.class_name.clone(),
                score,
                matched_title_pattern: matched,
            });
        }
    }
    results
}

#[cfg(target_os = "windows")]
pub fn enumerate_windows() -> Vec<WindowCandidate> {
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible,
    };

    struct Collector {
        handles: Vec<HWND>,
    }
    // SAFETY : rappel Win32 ; le pointeur Collector est transmis via LPARAM.
    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> i32 {
        let collector = &mut *(lparam as *mut Collector);
        collector.handles.push(hwnd);
        1
    }

    let mut collector = Collector {
        handles: Vec::new(),
    };
    // SAFETY : EnumWindows avec un rappel statique et un collecteur valide.
    unsafe {
        EnumWindows(
            Some(enum_callback),
            &mut collector as *mut Collector as isize as LPARAM,
        );
    }

    let foreground = unsafe { GetForegroundWindow() };
    let mut candidates = Vec::new();
    for hwnd in collector.handles {
        // SAFETY : GetWindowThreadProcessId remplit pid.
        let mut pid: u32 = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }
        if pid == 0 {
            continue;
        }

        // Titre de la fenêtre (256 chars suffisent pour un titre de jeu).
        let mut title_buf = [0u16; 256];
        let title_len = unsafe { GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 256) };
        let title = String::from_utf16_lossy(&title_buf[..title_len.max(0) as usize]);

        // Classe de la fenêtre.
        let mut class_buf = [0u16; 128];
        let class_len = unsafe { GetClassNameW(hwnd, class_buf.as_mut_ptr(), 128) };
        let class_name = String::from_utf16_lossy(&class_buf[..class_len.max(0) as usize]);

        let visible = unsafe { IsWindowVisible(hwnd) } != 0;
        let is_foreground = hwnd == foreground;

        // Processus associé : chemin complet (accès limité, échoue proprement).
        let mut executable_name = String::new();
        let mut executable_path = String::new();
        // SAFETY : OpenProcess/QueryFullProcessImageNameW avec buffer borné.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !handle.is_null() {
                let mut size: u32 = 32_768;
                let mut buffer = vec![0u16; size as usize];
                // PWSTR est un alias de `*mut u16` dans windows-sys 0.61.
                let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size);
                if ok != 0 {
                    let path = String::from_utf16_lossy(&buffer[..size as usize]);
                    executable_path = path.clone();
                    if let Some(name) = path.rsplit(['\\', '/']).next() {
                        executable_name = name.to_string();
                    }
                }
                CloseHandle(handle);
            }
        }

        candidates.push(WindowCandidate {
            pid,
            title,
            class_name,
            visible,
            foreground: is_foreground,
            executable_name,
            executable_path,
        });
    }
    candidates
}

#[cfg(not(target_os = "windows"))]
pub fn enumerate_windows() -> Vec<WindowCandidate> {
    Vec::new()
}

/// Scan complet : énumère les fenêtres puis matche les demandes.
pub fn scan_requests(requests: &[GameWindowRequest]) -> Vec<GameWindowMatch> {
    if requests.is_empty() {
        return Vec::new();
    }
    let candidates = enumerate_windows();
    if candidates.is_empty() {
        return Vec::new();
    }
    detect_windows(&candidates, requests)
}

/// Vrai si le mode d'affichage courant d'un écran a quitté la résolution du
/// bureau (plein écran exclusif). Heuristique documentée : en plein écran
/// exclusif, la résolution active change (EnumDisplaySettings / ENUM_CURRENT),
/// tandis qu'en borderless/fenêtré elle reste identique au bureau.
///
/// Limite honnête : un jeu exclusif lancé à la résolution exacte du bureau
/// n'est pas distinguable par cette méthode — c'est documenté dans la spec.
pub fn is_mode_switch(
    mode_width: u32,
    mode_height: u32,
    desktop_width: u32,
    desktop_height: u32,
) -> bool {
    mode_width != desktop_width || mode_height != desktop_height
}

/// Détecte si la fenêtre au premier plan est en plein écran exclusif.
/// Windows-only (lecture de la résolution active) ; retourne `false` ailleurs
/// (Linux/Wayland n'expose pas ce mode de façon fiable).
#[cfg(target_os = "windows")]
pub fn exclusive_fullscreen_active() -> bool {
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplaySettingsW, GetMonitorInfoW, MonitorFromWindow, DEVMODEW, ENUM_CURRENT_SETTINGS,
        MONITORINFOEXW, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    // SAFETY : GetForegroundWindow renvoie un handle ; 0 = aucune fenêtre.
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return false;
    }
    // SAFETY : MonitorFromWindow avec MONITOR_DEFAULTTONEAREST retourne un
    // handle d'écran toujours valide pour un HWND existant.
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_null() {
        return false;
    }

    // SAFETY : GetMonitorInfoW remplit la structure ; MONITORINFOEXW commence
    // par MONITORINFO (layout compatible) — on lit rcMonitor (taille du bureau
    // pour cet écran) et szDevice (nom du périphérique pour EnumDisplaySettingsW).
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    let ok = unsafe { GetMonitorInfoW(monitor, &mut info.monitorInfo) };
    if ok == 0 {
        return false;
    }
    let desktop_width = (info.monitorInfo.rcMonitor.right - info.monitorInfo.rcMonitor.left) as u32;
    let desktop_height =
        (info.monitorInfo.rcMonitor.bottom - info.monitorInfo.rcMonitor.top) as u32;

    // SAFETY : EnumDisplaySettingsW(ENUM_CURRENT_SETTINGS) remplit DEVMODEW ;
    // en plein écran exclusif la résolution active diffère de celle du bureau.
    let mut mode: DEVMODEW = unsafe { std::mem::zeroed() };
    mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
    let ok =
        unsafe { EnumDisplaySettingsW(info.szDevice.as_ptr(), ENUM_CURRENT_SETTINGS, &mut mode) };
    if ok == 0 {
        return false;
    }
    is_mode_switch(
        mode.dmPelsWidth,
        mode.dmPelsHeight,
        desktop_width,
        desktop_height,
    )
}

#[cfg(not(target_os = "windows"))]
pub fn exclusive_fullscreen_active() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(
        name: &str,
        path: &str,
        title: &str,
        visible: bool,
        foreground: bool,
    ) -> WindowCandidate {
        WindowCandidate {
            pid: 42,
            title: title.to_string(),
            class_name: "class".to_string(),
            visible,
            foreground,
            executable_name: name.to_string(),
            executable_path: path.to_string(),
        }
    }

    fn nte_request(reattach_context: bool, title_patterns: &[&str]) -> GameWindowRequest {
        GameWindowRequest {
            game_id: "nte".to_string(),
            install_root: Some("X:\\Games\\Neverness To Everness\\".to_string()),
            game_executable_candidates: vec![
                "HT-Win64-Shipping.exe".to_string(),
                "NTE-Win64-Shipping.exe".to_string(),
            ],
            title_patterns: title_patterns.iter().map(|item| item.to_string()).collect(),
            reattach_context,
        }
    }

    #[test]
    fn game_window_under_install_is_detected() {
        let candidate = window(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
            "Neverness to Everness",
            true,
            true,
        );
        let (score, _) = score_window(&candidate, &nte_request(true, &[]));
        // 40 (installation) + 25 (exécutable) + 10 (visible) + 5 (premier plan) + 20 (contexte) = 100
        assert_eq!(score, 100);
    }

    #[test]
    fn background_window_scores_lower() {
        let candidate = window(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
            "Neverness to Everness",
            false,
            false,
        );
        let (score, _) = score_window(&candidate, &nte_request(true, &[]));
        // 40 + 25 + 20 = 85 → encore détectable (visible dès qu'il repasse au premier plan).
        assert_eq!(score, 85);
    }

    #[test]
    fn title_pattern_boosts_but_is_never_required() {
        let candidate = window(
            "HT-Win64-Shipping.exe",
            "X:\\Games\\Neverness To Everness\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\HT-Win64-Shipping.exe",
            "NTE - Hethereau",
            true,
            false,
        );
        let (score, matched) = score_window(&candidate, &nte_request(false, &["neverness", "nte"]));
        // 40 + 25 + 10 + 10 (titre « nte ») = 85 → détecté même sans contexte de rattachement.
        assert_eq!(score, 85);
        assert_eq!(matched.as_deref(), Some("nte"));
    }

    #[test]
    fn unrelated_window_never_reaches_detection() {
        let candidate = window(
            "Discord.exe",
            "C:\\Users\\kai\\AppData\\Local\\Discord\\Discord.exe",
            "Discord",
            true,
            true,
        );
        let (score, _) = score_window(&candidate, &nte_request(true, &[]));
        // 10 (visible) + 5 (premier plan) + 20 (contexte) = 35 → ignoré.
        assert_eq!(score, 35);
        assert!(detect_windows(&[candidate], &[nte_request(true, &[])]).is_empty());
    }

    #[test]
    fn launcher_window_is_not_the_game_without_install_match() {
        let candidate = window(
            "NTELauncher.exe",
            "C:\\Launchers\\NTELauncher.exe",
            "NTE Launcher",
            true,
            true,
        );
        let (score, _) = score_window(&candidate, &nte_request(true, &[]));
        // 10 + 5 + 20 = 35 → pas le jeu (hors installation, hors candidats finaux).
        assert_eq!(score, 35);
    }

    #[test]
    fn mode_switch_detects_exclusive_fullscreen() {
        // Résolution active 1280×720 alors que le bureau est en 1920×1080 →
        // le mode d'affichage a été commuté (plein écran exclusif).
        assert!(is_mode_switch(1280, 720, 1920, 1080));
        // Borderless / fenêtré : la résolution active reste celle du bureau.
        assert!(!is_mode_switch(1920, 1080, 1920, 1080));
        // Limite documentée : exclusif à la résolution du bureau n'est pas
        // distinguable par cette seule preuve.
        assert!(!is_mode_switch(1920, 1080, 1920, 1080));
    }
}
