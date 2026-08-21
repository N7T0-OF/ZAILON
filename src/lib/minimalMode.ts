/**
 * Mode Minimal (spec §42) — ZAILON doit pouvoir rester ouvert sans être
 * perceptible : aucun automatisme optionnel, aucune vidéo, aucune animation
 * décorative, aucun rafraîchissement réseau non sollicité.
 *
 * Décisions PURES et testables : les composants consultent ces garde-fous au
 * lieu de dupliquer `minimalMode ? false : configured`.
 */

export interface MinimalModeEffects {
  /** Fond vidéo / animation de l'Accueil interdit. */
  videoDisabled: boolean
  /** Rafraîchissements automatiques coupés (artwork, vérification de mises à\n * jour, recherche automatique). */
  autoActivityDisabled: boolean
  /** Animations décoratives / parallaxe désactivées. */
  animationsDisabled: boolean
}

/** Effets du mode minimal (spec §42) — un seul endroit décide ce qui est coupé. */
export function resolveMinimalMode(enabled: boolean): MinimalModeEffects {
  return {
    videoDisabled: enabled,
    autoActivityDisabled: enabled,
    animationsDisabled: enabled,
  }
}

/** Le fond vidéo/animation est-il autorisé ? (configuré ET hors mode minimal). */
export function minimalBackgroundAllowed(configured: boolean, minimalMode: boolean): boolean {
  return configured && !minimalMode
}

/** Un automatisme optionnel (artwork/update/recherche) doit-il tourner ? */
export function minimalAutoActivityAllowed(configured: boolean, minimalMode: boolean): boolean {
  return configured && !minimalMode
}

/** Attribut `data-minimal-mode` du document — désactive les effets CSS lourds. */
export function minimalModeDataset(minimalMode: boolean): { minimalMode: 'true' | '' } {
  return { minimalMode: minimalMode ? 'true' : '' }
}
