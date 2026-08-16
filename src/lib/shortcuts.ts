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

/** Périmètre de création : profil actuel / par défaut / tous les profils. */
export type ShortcutScope = 'current' | 'default' | 'all'

export interface ShortcutPlanEntry {
  profileId: string
  profileName: string
  /** Nom du fichier raccourci : « Jeu — Profil » dès qu'il y a plusieurs
   * profils (sinon « Jeu »), pour distinguer Modded vs Vanilla. */
  displayName: string
}

/**
 * Plan des raccourcis à créer pour un périmètre. « Tous les profils » produit
 * un raccourci PAR PROFIL (spec « Fix création de raccourci » — un .lnk par
 * profil, jamais fusionnés).
 */
export function shortcutPlanFor(game: Game, scope: ShortcutScope, currentProfileId?: string): ShortcutPlanEntry[] {
  const suffix = (profileName: string) => game.profiles.length > 1 ? `${game.name} — ${profileName}` : game.name
  if (scope === 'all') {
    return game.profiles.map(profile => ({
      profileId: profile.id,
      profileName: profile.name,
      displayName: suffix(profile.name),
    }))
  }
  const id = shortcutProfileId(game, scope === 'current' ? currentProfileId : undefined)
  if (!id) return []
  const profile = game.profiles.find(item => item.id === id)
  const profileName = profile?.name ?? 'Default'
  return [{ profileId: id, profileName, displayName: suffix(profileName) }]
}
