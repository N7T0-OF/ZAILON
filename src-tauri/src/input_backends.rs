//! GameInputBackend — backends d'application du remapping clavier par jeu.
//!
//! Couche purement décisionnelle et en lecture seule (Phase 6). L'application
//! réelle (bindings du jeu, HKL, interception scancodes limitée à la fenêtre)
//! est fournie par des adaptateurs séparés, à tester sur un vrai jeu.
//! Pour Neverness to Everness (Anti-Cheat Expert) : aucun hook, injection,
//! driver, écriture processus ni modification des fichiers du jeu.
//!
//! Ce module doit rester synchronisé avec `src/lib/inputBackends.ts`.

use serde::{Deserialize, Serialize};

/// Identifiants des backends, dans l'ordre de préférence :
/// 1. bindings natifs du jeu ; 2. layout reconnu par le jeu ;
/// 3. remapping ZAILON limité à la fenêtre ; 4. Steam Input ;
/// 5. aucune méthode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputBackendId {
    NativeBinding,
    WindowLayout,
    ScopedRemap,
    SteamInput,
    Unsupported,
}

impl InputBackendId {
    pub const PRIORITY: [InputBackendId; 5] = [
        InputBackendId::NativeBinding,
        InputBackendId::WindowLayout,
        InputBackendId::ScopedRemap,
        InputBackendId::SteamInput,
        InputBackendId::Unsupported,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::NativeBinding => "Bindings natifs du jeu",
            Self::WindowLayout => "Layout reconnu par le jeu",
            Self::ScopedRemap => "Remapping ZAILON limité à la fenêtre",
            Self::SteamInput => "Steam Input",
            Self::Unsupported => "Aucune méthode",
        }
    }

    pub fn short_label(self) -> &'static str {
        match self {
            Self::NativeBinding => "Bindings natifs",
            Self::WindowLayout => "Layout Windows",
            Self::ScopedRemap => "Remap fenêtre",
            Self::SteamInput => "Steam Input",
            Self::Unsupported => "Aucune",
        }
    }
}

/// Portée d'application d'un backend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackendScope {
    GameConfig,
    WindowsHkl,
    WindowOnly,
    Controller,
    None,
}

/// Métadonnées de sécurité et de portée d'un backend.
#[derive(Debug, Clone, Copy)]
pub struct InputBackendMeta {
    pub id: InputBackendId,
    pub scope: BackendScope,
    pub priority: u8,
    pub safe_with_anti_cheat: bool,
    pub requires_injection: bool,
    pub requires_driver: bool,
    pub requires_process_write: bool,
    pub touches_desktop: bool,
    pub windows_language_change: bool,
}

pub fn backend_meta(id: InputBackendId) -> InputBackendMeta {
    match id {
        InputBackendId::NativeBinding => InputBackendMeta {
            id,
            scope: BackendScope::GameConfig,
            priority: 1,
            safe_with_anti_cheat: false,
            requires_injection: false,
            requires_driver: false,
            requires_process_write: false,
            touches_desktop: false,
            windows_language_change: false,
        },
        InputBackendId::WindowLayout => InputBackendMeta {
            id,
            scope: BackendScope::WindowsHkl,
            priority: 2,
            safe_with_anti_cheat: true,
            requires_injection: false,
            requires_driver: false,
            requires_process_write: false,
            touches_desktop: true,
            windows_language_change: true,
        },
        InputBackendId::ScopedRemap => InputBackendMeta {
            id,
            scope: BackendScope::WindowOnly,
            priority: 3,
            safe_with_anti_cheat: true,
            requires_injection: false,
            requires_driver: false,
            requires_process_write: false,
            touches_desktop: false,
            windows_language_change: false,
        },
        InputBackendId::SteamInput => InputBackendMeta {
            id,
            scope: BackendScope::Controller,
            priority: 4,
            safe_with_anti_cheat: true,
            requires_injection: false,
            requires_driver: false,
            requires_process_write: false,
            touches_desktop: false,
            windows_language_change: false,
        },
        InputBackendId::Unsupported => InputBackendMeta {
            id,
            scope: BackendScope::None,
            priority: 5,
            safe_with_anti_cheat: true,
            requires_injection: false,
            requires_driver: false,
            requires_process_write: false,
            touches_desktop: false,
            windows_language_change: false,
        },
    }
}

pub fn is_nte(game_name: &str) -> bool {
    game_name.to_lowercase().contains("neverness")
}

/// Anti-Cheat détecté (lecture seule, par nom de jeu connu).
pub fn detect_anti_cheat(game_name: &str) -> Option<&'static str> {
    if is_nte(game_name) {
        Some("Anti-Cheat Expert")
    } else {
        None
    }
}

/// Disponibilité d'un backend pour un jeu donné, avec la raison.
#[derive(Debug, Clone)]
pub struct BackendAvailability {
    pub backend: InputBackendId,
    pub available: bool,
    pub reason: String,
}

/// Plan d'application : backend choisi + chaîne de repli + contraintes.
#[derive(Debug, Clone)]
pub struct InputBackendPlan {
    pub chosen: InputBackendId,
    pub chain: Vec<BackendAvailability>,
    pub anti_cheat: Option<&'static str>,
    pub constraints: Vec<String>,
}

/// Planifie la méthode d'application pour un jeu. Ne modifie rien.
pub fn plan_input_backend(game_name: &str, has_mapping: bool) -> InputBackendPlan {
    let anti_cheat = detect_anti_cheat(game_name);
    let nte = is_nte(game_name);
    let mut constraints = Vec::new();

    if let Some(name) = anti_cheat {
        constraints.push(format!(
            "{name} détecté : aucun hook, injection, driver ni manipulation du processus."
        ));
    }
    if nte {
        constraints.push(
            "Neverness to Everness : les retours joueurs montrent qu'un simple changement de \
             layout logique ne suffit pas (touches physiques/scancodes)."
                .to_string(),
        );
        constraints.push(
            "L'adaptateur NTE doit tester la méthode réellement fonctionnelle via la sonde de \
             compatibilité avant application."
                .to_string(),
        );
    }
    if !has_mapping {
        constraints
            .push("Aucune traduction active : la disposition s'applique telle quelle.".to_string());
    }

    let chain: Vec<BackendAvailability> = InputBackendId::PRIORITY
        .iter()
        .copied()
        .map(|id| {
            let mut available = true;
            let mut reason = String::new();

            match id {
                InputBackendId::NativeBinding => {
                    if nte {
                        available = false;
                        reason = "Interdit pour NTE : la modification des fichiers du jeu est \
                                  exclue avec Anti-Cheat Expert."
                            .to_string();
                    }
                }
                InputBackendId::WindowLayout => {
                    if nte {
                        available = false;
                        reason = "Inefficace constaté pour NTE (touches physiques) — la sonde la \
                                  teste néanmoins avant de conclure."
                            .to_string();
                    }
                }
                InputBackendId::ScopedRemap => {
                    // Toujours disponible : externe au jeu, sûr avec Anti-Cheat.
                }
                InputBackendId::SteamInput => {
                    if nte {
                        available = false;
                        reason = "Non pertinent pour NTE en clavier/souris ; réservé aux manettes \
                                  et uniquement si réellement compatible."
                            .to_string();
                    }
                }
                InputBackendId::Unsupported => {}
            }
            if !has_mapping && id != InputBackendId::Unsupported {
                available = false;
                reason = "Aucune traduction active à appliquer.".to_string();
            }
            if reason.is_empty() {
                reason = match id {
                    InputBackendId::NativeBinding => "Écrit la configuration d'entrée du jeu. À éviter sur les jeux protégés par Anti-Cheat sans confirmation.",
                    InputBackendId::WindowLayout => "Change temporairement le layout logique Windows. Inefficace pour les jeux qui lisent les touches physiques.",
                    InputBackendId::ScopedRemap => "Traduit les touches uniquement lorsque la fenêtre du jeu est au premier plan. Aucun hook, aucun fichier modifié, aucun driver.",
                    InputBackendId::SteamInput => "Pensé pour les manettes, pas pour clavier/souris. Ne jamais modifier une configuration Steam Input existante sans confirmation.",
                    InputBackendId::Unsupported => "Aucune application automatique : la disposition reste un choix manuel dans le jeu.",
                }
                .to_string();
            }
            BackendAvailability { backend: id, available, reason }
        })
        .collect();

    let chosen = chain
        .iter()
        .find(|item| item.available)
        .map(|item| item.backend)
        .unwrap_or(InputBackendId::Unsupported);

    InputBackendPlan {
        chosen,
        chain,
        anti_cheat,
        constraints,
    }
}

/// Sonde de compatibilité NTE (lecture seule).
///
/// Les champs de détection (processus, fenêtre au premier plan, layout Windows)
/// seront branchés sur `windows-sys` dans un second temps ; tant qu'ils ne le
/// sont pas, la sonde ne fait que refléter la configuration et n'applique rien.
#[derive(Debug, Clone)]
pub struct NteCompatibilityProbe {
    pub process_detected: bool,
    pub window_foreground: bool,
    pub windows_layout: String,
    pub anti_cheat: bool,
}

impl NteCompatibilityProbe {
    /// Décision de la sonde : ne jamais choisir un backend interdit par l'Anti-Cheat.
    pub fn plan(&self, game_name: &str, has_mapping: bool) -> InputBackendPlan {
        let mut plan = plan_input_backend(game_name, has_mapping);
        if self.anti_cheat {
            plan.constraints.push(
                "Anti-Cheat actif : la sonde reste en lecture seule, aucun test d'application."
                    .to_string(),
            );
        }
        plan
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_order_is_stable() {
        assert_eq!(
            InputBackendId::PRIORITY,
            [
                InputBackendId::NativeBinding,
                InputBackendId::WindowLayout,
                InputBackendId::ScopedRemap,
                InputBackendId::SteamInput,
                InputBackendId::Unsupported,
            ]
        );
    }

    #[test]
    fn generic_game_prefers_native_bindings() {
        let plan = plan_input_backend("Cyberpunk 2077", true);
        assert_eq!(plan.chosen, InputBackendId::NativeBinding);
        assert!(plan.anti_cheat.is_none());
        assert!(plan.chain.iter().all(|item| item.available));
    }

    #[test]
    fn nte_with_mapping_chooses_scoped_remap() {
        let plan = plan_input_backend("Neverness to Everness", true);
        assert_eq!(plan.anti_cheat, Some("Anti-Cheat Expert"));
        assert_eq!(plan.chosen, InputBackendId::ScopedRemap);
        let native = plan
            .chain
            .iter()
            .find(|item| item.backend == InputBackendId::NativeBinding)
            .unwrap();
        assert!(!native.available);
        let window = plan
            .chain
            .iter()
            .find(|item| item.backend == InputBackendId::WindowLayout)
            .unwrap();
        assert!(!window.available);
        let steam = plan
            .chain
            .iter()
            .find(|item| item.backend == InputBackendId::SteamInput)
            .unwrap();
        assert!(!steam.available);
    }

    #[test]
    fn no_mapping_falls_back_to_unsupported() {
        let plan = plan_input_backend("Neverness to Everness", false);
        assert_eq!(plan.chosen, InputBackendId::Unsupported);
    }

    #[test]
    fn ace_probe_stays_read_only() {
        let probe = NteCompatibilityProbe {
            process_detected: true,
            window_foreground: true,
            windows_layout: "AZERTY".to_string(),
            anti_cheat: true,
        };
        let plan = probe.plan("Neverness to Everness", true);
        assert_eq!(plan.chosen, InputBackendId::ScopedRemap);
        assert!(plan
            .constraints
            .iter()
            .any(|item| item.contains("lecture seule")));
    }
}
