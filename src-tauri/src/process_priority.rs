//! Priorité de processus du jeu (add-on Performance+ — spec « Performance »).
//!
//! Applique la priorité OS choisie (normale / supérieure / haute) au processus
//! du jeu après lancement. Toujours borné et sans surprise :
//!   - `auto` → rien n'est appliqué (le système garde la main) ;
//!   - pas de `realtime` (réservé, jamais proposé) ;
//!   - échec silencieux toléré par l'appelant (priorité non critique).

/// Priorité appliquable (idem `GameProcessPriority` du Core, sans `auto`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessPriority {
    Normal,
    AboveNormal,
    High,
}

/// Mappe une priorité texte du Core vers la priorité appliquable.
/// `auto` / inconnu → `None` (ne pas toucher au processus).
pub fn parse_process_priority(value: &str) -> Option<ProcessPriority> {
    match value {
        "normal" => Some(ProcessPriority::Normal),
        "above-normal" => Some(ProcessPriority::AboveNormal),
        "high" => Some(ProcessPriority::High),
        _ => None,
    }
}

/// Applique la priorité au PID donné (non bloquant, jamais critique).
pub fn set_process_priority(pid: u32, priority: ProcessPriority) -> Result<(), String> {
    #[cfg(windows)]
    {
        set_process_priority_windows(pid, priority)
    }
    #[cfg(not(windows))]
    {
        set_process_priority_unix(pid, priority)
    }
}

#[cfg(windows)]
fn set_process_priority_windows(pid: u32, priority: ProcessPriority) -> Result<(), String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, SetPriorityClass, ABOVE_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS,
        NORMAL_PRIORITY_CLASS, PROCESS_SET_INFORMATION,
    };
    // SAFETY : appel Win32 standard, aucune donnée partagée avec Rust.
    unsafe {
        let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
        if handle.is_null() {
            return Err("Unable to open the game process for priority change.".into());
        }
        let class = match priority {
            ProcessPriority::Normal => NORMAL_PRIORITY_CLASS,
            ProcessPriority::AboveNormal => ABOVE_NORMAL_PRIORITY_CLASS,
            ProcessPriority::High => HIGH_PRIORITY_CLASS,
        };
        let applied = SetPriorityClass(handle, class);
        CloseHandle(handle);
        if applied == 0 {
            return Err("SetPriorityClass failed for the game process.".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn set_process_priority_unix(pid: u32, priority: ProcessPriority) -> Result<(), String> {
    // Valeurs nice : normale = 0, supérieure = -5, haute = -10 (borné [-20, 19]).
    let nice = match priority {
        ProcessPriority::Normal => 0,
        ProcessPriority::AboveNormal => -5,
        ProcessPriority::High => -10,
    };
    // SAFETY : appel POSIX standard, PID entier simple.
    let result = unsafe { libc::setpriority(libc::PRIO_PROCESS, pid as i32, nice) };
    if result != 0 {
        return Err(format!(
            "setpriority failed for the game process (errno {})",
            std::io::Error::last_os_error().raw_os_error().unwrap_or(-1)
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_process_priority_maps_only_supported_values() {
        assert_eq!(
            parse_process_priority("normal"),
            Some(ProcessPriority::Normal)
        );
        assert_eq!(
            parse_process_priority("above-normal"),
            Some(ProcessPriority::AboveNormal)
        );
        assert_eq!(parse_process_priority("high"), Some(ProcessPriority::High));
        assert_eq!(parse_process_priority("auto"), None);
        assert_eq!(parse_process_priority("realtime"), None);
        assert_eq!(parse_process_priority(""), None);
    }
}
