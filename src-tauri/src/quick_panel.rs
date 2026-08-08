//! Quick Game Panel — fenêtre native ZAILON pendant le jeu (Phase 6).
//!
//! Ce n'est **pas** une injection dans le jeu : c'est une fenêtre Tauri
//! indépendante, compacte (~340 px), sans barre de titre, toujours au-dessus,
//! fermée automatiquement quand elle perd le focus (le joueur reclique dans le
//! jeu — comportement par défaut « Fermer lorsque le focus est perdu »).
//!
//! Le panneau pilote les réglages via les commandes natives existantes
//! (profils visuels, clavier) et communique avec la fenêtre principale par
//! événements (`quick-panel-action`).

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "quick-panel";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 460.0;
const MARGIN: i32 = 24;

/// Ouvre (ou ramène au premier plan) le panneau rapide.
#[tauri::command]
pub fn open_quick_panel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
        .title("ZAILON — Panneau rapide")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|err| err.to_string())?;

    // Position : coin inférieur droit de l'écran du jeu.
    if let Ok(Some(monitor)) = window.current_monitor() {
        let size = monitor.size();
        let _ = window.set_position(PhysicalPosition::new(
            (size.width as i32).saturating_sub(WIDTH as i32 + MARGIN),
            (size.height as i32).saturating_sub(HEIGHT as i32 + MARGIN),
        ));
    }

    // Fermeture automatique à la perte de focus — mais pas avant que la fenêtre
    // n'ait reçu le focus une première fois (évite une fermeture immédiate à
    // l'ouverture à cause de la course de focus initiale).
    // NB : on_window_event prend une closure `Fn` — on utilise donc Cell<bool>.
    let close_handle = window.clone();
    let ever_focused = std::cell::Cell::new(false);
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Focused(true) => ever_focused.set(true),
        tauri::WindowEvent::Focused(false) => {
            if ever_focused.get() {
                let _ = close_handle.close();
            }
        }
        _ => {}
    });

    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

/// Ferme le panneau rapide s'il est ouvert (ex. fin de session).
#[tauri::command]
pub fn close_quick_panel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
    Ok(())
}

/// Bascule le panneau : ouvert → fermé, fermé → ouvert.
#[tauri::command]
pub fn toggle_quick_panel(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.close();
            Ok(false)
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            Ok(true)
        }
    } else {
        open_quick_panel(app)?;
        Ok(true)
    }
}
