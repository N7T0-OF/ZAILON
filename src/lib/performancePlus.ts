/**
 * Performance+ — logique pure (add-on `official.zailon.performance`).
 *
 * La priorité du processus du jeu est déjà modélisée dans
 * `performanceProfiles.ts` (GameProcessPriority via le preset de mode) mais
 * n'était JAMAIS appliquée à l'OS. Cet add-on la rend réelle : au lancement,
 * la priorité du mode du jeu (normal / above-normal / high) est appliquée au
 * PID du jeu. `auto` → rien (le système garde la main). Jamais `realtime`.
 */

import { gameProcessPriorityForMode, type GameProcessPriority, type PerformanceMode } from './performanceProfiles.ts'

/** Priorité effective à appliquer au processus du jeu pour un mode donné. */
export function launchProcessPriority(mode: PerformanceMode): GameProcessPriority {
  return gameProcessPriorityForMode(mode)
}

/** Vrai si une priorité doit réellement être appliquée (auto = ne pas toucher). */
export function shouldApplyProcessPriority(priority: GameProcessPriority): boolean {
  return priority === 'normal' || priority === 'above-normal' || priority === 'high'
}
