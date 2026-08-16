/**
 * Décisions de raccourci bureau — logique PURE (spec « Fix création de
 * raccourci »). Aucun accès disque/processus.
 *
 * Deux modes :
 * - `zailon`  : le .lnk cible ZAILON avec une URI `zailon://launch/game/<id>?profile=<pid>`
 *   → le lancement conserve profil, mods, session, clavier, visuel ET la chaîne
 *   de lancement (Frosty → plugin → jeu, FiveM → CitizenFX → GTA, NTE → UAC…).
 * - `direct`  : le .lnk cible l'EXÉCUTABLE réel du jeu (double-clic direct).
 *   N'est viable que pour un processus direct (pas de launcher/chaîne).
 */

import type { Game } from '../types'
import { adapterFor } from './launchAdapters.ts'

export type ShortcutMode = 'zailon' | 'direct'

/** Vrai si un jeu peut être lancé en direct (processus direct + exécutable). */
export function directShortcutViable(game: Game): boolean {
  return adapterFor(game).launchBehavior === 'DirectProcess' && Boolean(game.execPath)
}

/**
 * Mode effectif pour un raccourci : `direct` n'est accepté que s'il est
 * viable ; sinon repli automatique sur `zailon` (la chaîne est conservée).
 */
export function shortcutModeFor(game: Game, requested: ShortcutMode = 'zailon'): ShortcutMode {
  if (requested === 'direct' && directShortcutViable(game)) return 'direct'
  return 'zailon'
}

/** Libellé lisible d'un mode (affiché dans la micro-fenêtre). */
export function shortcutModeLabel(mode: ShortcutMode): string {
  return mode === 'direct'
    ? 'Lancer directement le jeu'
    : 'Lancer via ZAILON (conserve mods, profil et la chaîne de lancement)'
}

/** Profil cible : celui fourni, sinon le profil par défaut, sinon le premier. */
export function shortcutProfileId(game: Game, preferredProfileId?: string): string | undefined {
  if (preferredProfileId && game.profiles.some(profile => profile.id === preferredProfileId)) {
    return preferredProfileId
  }
  const fallback = game.profiles.find(profile => profile.isDefault) || game.profiles[0]
  return fallback?.id
}
