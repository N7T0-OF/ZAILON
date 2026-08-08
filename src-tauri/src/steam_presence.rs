//! Présence Steam — source de preuve supplémentaire du GamePresenceEngine.
//!
//! Steam n'est jamais la source unique de vérité, mais quand il indique qu'un
//! AppID est encore actif alors que ZAILON vient de perdre son processus, cela
//! déclenche la recherche du processus final au lieu de terminer la session.
//!
//! Méthode sans SDK : Steam maintient `HKCU\Software\Valve\Steam\RunningAppID`
//! (DWORD, AppID du jeu en cours) et `HKCU\Software\Valve\Steam\Apps\<appid>\Running`
//! (DWORD 1 si ce jeu tourne). Lecture seule, aucun accès au processus Steam.

/// État de présence Steam demandé par le frontend.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct SteamRunningState {
    /// true si Steam indique au moins un jeu actif.
    pub steam_running: bool,
    /// AppID(s) que Steam considère en cours (parmi ceux interrogés + global).
    pub running_app_ids: Vec<u32>,
}

/// Interprète 4 octets DWORD little-endian.
fn dword_from_bytes(bytes: &[u8]) -> Option<u32> {
    if bytes.len() < 4 {
        return None;
    }
    Some(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

/// Combine la valeur globale `RunningAppID` et les drapeaux par-app en une
/// liste d'AppID en cours (pure, testable sur toutes les plateformes).
fn collect_running(global: Option<u32>, per_app: &[(u32, bool)]) -> (bool, Vec<u32>) {
    let mut ids: Vec<u32> = Vec::new();
    if let Some(id) = global {
        if id != 0 && !ids.contains(&id) {
            ids.push(id);
        }
    }
    for (app_id, running) in per_app {
        if *running && !ids.contains(app_id) {
            ids.push(*app_id);
        }
    }
    let steam_running =
        global.is_some_and(|id| id != 0) || per_app.iter().any(|(_, running)| *running);
    (steam_running, ids)
}

#[cfg(target_os = "windows")]
fn read_dword(hkey: windows_sys::Win32::System::Registry::HKEY, name: &str) -> Option<u32> {
    use windows_sys::Win32::System::Registry::*;
    let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let mut buf = [0u8; 4];
    let mut size = buf.len() as u32;
    // Safety : buf est valide pour 4 octets, size est mis à jour par l'API.
    let rc =
        unsafe { RegQueryValueExW(hkey, wide.as_ptr(), None, None, buf.as_mut_ptr(), &mut size) };
    if rc == 0 {
        dword_from_bytes(&buf)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn steam_running_state_impl(app_ids: &[u32]) -> SteamRunningState {
    use windows_sys::Win32::System::Registry::*;
    let mut steam_key: HKEY = std::ptr::null_mut();
    // Safety : clé ouverte en lecture seule (KEY_QUERY_VALUE), fermée après usage.
    let rc = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            w!("Software\\Valve\\Steam"),
            0,
            KEY_QUERY_VALUE,
            &mut steam_key,
        )
    };
    if rc != 0 {
        return SteamRunningState::default();
    }
    let global = read_dword(steam_key, "RunningAppID");
    let mut per_app: Vec<(u32, bool)> = Vec::with_capacity(app_ids.len());
    for app_id in app_ids {
        let mut app_key: HKEY = std::ptr::null_mut();
        let subkey = format!("Apps\\{}", app_id);
        let wide: Vec<u16> = subkey.encode_utf16().chain(Some(0)).collect();
        // Safety : sous-clé ouverte en lecture seule sous la clé Steam.
        let arc =
            unsafe { RegOpenKeyExW(steam_key, wide.as_ptr(), 0, KEY_QUERY_VALUE, &mut app_key) };
        if arc == 0 {
            let running = read_dword(app_key, "Running").unwrap_or(0) == 1;
            // Safety : fermeture de la sous-clé ouverte.
            unsafe { RegCloseKey(app_key) };
            per_app.push((*app_id, running));
        } else {
            per_app.push((*app_id, false));
        }
    }
    // Safety : fermeture de la clé Steam ouverte.
    unsafe { RegCloseKey(steam_key) };
    let (steam_running, running_app_ids) = collect_running(global, &per_app);
    SteamRunningState {
        steam_running,
        running_app_ids,
    }
}

#[cfg(not(target_os = "windows"))]
fn steam_running_state_impl(_app_ids: &[u32]) -> SteamRunningState {
    SteamRunningState::default()
}

/// Point d'entrée du module : état de présence pour les AppID demandés.
pub fn steam_running_state(app_ids: &[u32]) -> SteamRunningState {
    steam_running_state_impl(app_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dword_parsing() {
        assert_eq!(dword_from_bytes(&[0x84, 0xDC, 0x44, 0x00]), Some(4508340));
        assert_eq!(dword_from_bytes(&[0, 0, 0, 0]), Some(0));
        assert_eq!(dword_from_bytes(&[1, 2]), None);
    }

    #[test]
    fn collect_global_only() {
        let (running, ids) = collect_running(Some(4508340), &[]);
        assert!(running);
        assert_eq!(ids, vec![4508340]);
    }

    #[test]
    fn collect_zero_global_is_not_running() {
        let (running, ids) = collect_running(Some(0), &[]);
        assert!(!running);
        assert!(ids.is_empty());
    }

    #[test]
    fn collect_per_app_flags() {
        let (running, ids) = collect_running(Some(0), &[(4508340, true), (1091500, false)]);
        assert!(running);
        assert_eq!(ids, vec![4508340]);
    }

    #[test]
    fn collect_deduplicates() {
        let (running, ids) = collect_running(Some(4508340), &[(4508340, true)]);
        assert!(running);
        assert_eq!(ids, vec![4508340]);
    }
}
