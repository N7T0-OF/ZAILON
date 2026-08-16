//! Quick Game Panel — fenêtre native ZAILON pendant le jeu (Phase 6).
//!
//! Ce n'est **pas** une injection dans le jeu : c'est une fenêtre Tauri
//! indépendante, compacte (~340 px), sans barre de titre, toujours au-dessus,
//! qui se masque automatiquement quand elle perd le focus (le joueur reclique
//! dans le jeu).
//!
//! Cycle de vie (spec Quick Panel §3, §5-6, §9, §14) :
//! - la fenêtre est créée **cachée** — elle n'est jamais visible avant que le
//!   WebView soit prêt (`on_page_load` : HTML + CSS chargés, puis signal
//!   frontend `quick-panel-ready` une fois React monté) → plus jamais de
//!   fenêtre blanche ;
//! - la fermeture (×, perte de focus, fin de session) **masque** la fenêtre,
//!   elle n'est jamais détruite → le réaffichage est instantané, aucune
//!   recréation WebView, aucun clignotement ;
//! - position : coin supérieur droit de la zone de travail de l'écran actif,
//!   marge 20 px, recalculée à chaque ouverture ;
//! - le panneau est isolé : si son WebView plante, la fenêtre principale et le
//!   jeu continuent.

use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Listener, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "quick-panel";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 460.0;
const MARGIN: i32 = 20;

/// État partagé du cycle de vie. `show_requested` mémorise la demande du
/// raccourci si elle arrive AVANT que le WebView soit prêt : la fenêtre
/// apparaît dès que l'initialisation est terminée, jamais avant (spec §3).
#[derive(Default)]
struct PanelFlags {
    ready: bool,
    show_requested: bool,
}

fn flags() -> &'static Mutex<PanelFlags> {
    static FLAGS: OnceLock<Mutex<PanelFlags>> = OnceLock::new();
    FLAGS.get_or_init(|| Mutex::new(PanelFlags::default()))
}

/// Coin supérieur droit de la zone de travail (hors barre des tâches), marge
/// de 20 px (spec §9). Pur et testable — `area = (x, y, largeur, hauteur)`.
fn top_right_position(area: (i32, i32, u32, u32)) -> (i32, i32) {
    (
        (area.0 + area.2 as i32).saturating_sub(WIDTH as i32 + MARGIN),
        area.1 + MARGIN,
    )
}

fn reposition(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = monitor.work_area();
        let (x, y) = top_right_position((
            area.position.x,
            area.position.y,
            area.size.width,
            area.size.height,
        ));
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

/// Montre le panneau SI le WebView est prêt ; sinon la demande reste mémorisée
/// (`show_requested`) et l'affichage aura lieu dès `quick-panel-ready`.
fn reveal_if_ready(window: &tauri::WebviewWindow) {
    let show = {
        let mut state = flags()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.show_requested = true;
        if state.ready {
            state.show_requested = false;
            true
        } else {
            false
        }
    };
    if show {
        reposition(window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Masque le panneau (jamais détruit, spec §5) et annule toute demande en
/// attente d'affichage.
fn hide_panel(app: &AppHandle) {
    {
        let mut state = flags()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.show_requested = false;
    }
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

/// Ouvre (ou ramène au premier plan) le panneau rapide.
#[tauri::command]
pub fn open_quick_panel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        reveal_if_ready(&window);
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
        // Spec §3 : jamais visible avant que le WebView soit prêt — la fenêtre
        // est créée cachée et montrée par `on_page_load` / `quick-panel-ready`.
        .visible(false)
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let show = {
                let mut state = flags()
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                state.ready = true;
                if state.show_requested {
                    state.show_requested = false;
                    true
                } else {
                    false
                }
            };
            if show {
                reposition(&window);
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .build()
        .map_err(|err| err.to_string())?;

    // Fermeture automatique à la perte de focus (le joueur reclique dans le
    // jeu) : on MASQUE, on ne détruit jamais (spec §5). Le garde `ever_focused`
    // évite une fermeture immédiate à l'ouverture à cause de la course de
    // focus initiale.
    let close_handle = window.clone();
    let ever_focused = std::cell::Cell::new(false);
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Focused(true) => ever_focused.set(true),
        tauri::WindowEvent::Focused(false) => {
            if ever_focused.get() {
                {
                    let mut state = flags()
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    state.show_requested = false;
                }
                let _ = close_handle.hide();
            }
        }
        _ => {}
    });

    // Signal « prêt » du frontend (React monté, listeners enregistrés) :
    // garantie supplémentaire contre tout affichage avant initialisation.
    // Enregistré une seule fois pour toute la vie du processus.
    let ready_app = app.clone();
    let _ = READY_LISTENER.get_or_init(|| {
        app.listen_any("quick-panel-ready", move |_event| {
            let show = {
                let mut state = flags()
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                state.ready = true;
                if state.show_requested {
                    state.show_requested = false;
                    true
                } else {
                    false
                }
            };
            if show {
                if let Some(window) = ready_app.get_webview_window(LABEL) {
                    reposition(&window);
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
    });
    Ok(())
}

static READY_LISTENER: OnceLock<u32> = OnceLock::new();

/// Masque le panneau (fin de session, bouton × du panneau) — jamais détruit.
#[tauri::command]
pub fn close_quick_panel(app: AppHandle) -> Result<(), String> {
    hide_panel(&app);
    Ok(())
}

/// Masque le panneau — commande explicite utilisée par le bouton × du panneau.
#[tauri::command]
pub fn hide_quick_panel(app: AppHandle) -> Result<(), String> {
    hide_panel(&app);
    Ok(())
}

/// Bascule le panneau : visible → masqué ; masqué → visible (si prêt).
#[tauri::command]
pub fn toggle_quick_panel(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        if window.is_visible().unwrap_or(false) {
            hide_panel(&app);
            Ok(false)
        } else {
            reveal_if_ready(&window);
            Ok(true)
        }
    } else {
        open_quick_panel(app)?;
        // La fenêtre apparaîtra dès que le WebView sera prêt.
        Ok(false)
    }
}

/// État réel de la fenêtre du panneau rapide (spec Quick Panel §22, §50) :
/// affiché dans État & Diagnostic > Lancement (mode avancé) — jamais de fausse
/// activation : chaque ligne reflète l'état natif interrogé à l'instant.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPanelStatus {
    pub created: bool,
    pub ready: bool,
    pub visible: bool,
    pub focused: bool,
    pub always_on_top: bool,
    pub width: u32,
    pub height: u32,
    pub position: Option<(i32, i32)>,
}

#[tauri::command]
pub fn quick_panel_status(app: AppHandle) -> QuickPanelStatus {
    let ready = flags()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .ready;
    match app.get_webview_window(LABEL) {
        Some(window) => {
            let size = window.outer_size().unwrap_or_default();
            let position = window.outer_position().ok().map(|point| (point.x, point.y));
            QuickPanelStatus {
                created: true,
                ready,
                visible: window.is_visible().unwrap_or(false),
                focused: window.is_focused().unwrap_or(false),
                always_on_top: window.is_always_on_top().unwrap_or(false),
                width: size.width,
                height: size.height,
                position,
            }
        }
        None => QuickPanelStatus {
            created: false,
            ready,
            visible: false,
            focused: false,
            always_on_top: false,
            width: 0,
            height: 0,
            position: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_right_position_spec_9() {
        // 1920×1080, zone de travail hors barre des tâches : coin supérieur
        // droit, marge 20 px.
        let (x, y) = top_right_position((0, 0, 1920, 1040));
        assert_eq!(x, 1920 - 340 - 20);
        assert_eq!(y, 20);
    }

    #[test]
    fn top_right_position_accounts_for_work_area_offset() {
        // Moniteur secondaire à droite du principal (multi-écrans) : la zone
        // de travail commence à x = 1920, le panneau doit rester dans cet
        // écran, pas revenir sur le premier.
        let (x, y) = top_right_position((1920, 0, 1920, 1040));
        assert_eq!(x, 1920 + 1920 - 340 - 20);
        assert_eq!(y, 20);
    }

    #[test]
    fn top_right_position_never_negative() {
        // Écran plus petit que le panneau : saturation, jamais de position
        // négative (panneau inatteignable).
        let (x, y) = top_right_position((0, 0, 200, 100));
        assert_eq!(x, 0);
        assert_eq!(y, 20);
    }
}
