import type { Game } from '../types'

/**
 * §10 « Nettoyage automatique » : le cache d'artwork `games/<id>/resources/`
 * accumule des fichiers orphelins quand une URL d'illustration change. Ce
 * module (PUR) construit l'ensemble des chemins RÉFÉRENCÉS par le store — le
 * natif supprime tout le reste (sous gardes de sécurité). Voir
 * `cleanup_orphaned_game_resources` côté Rust.
 */

const RESOURCE_PATH_KEYS = [
  'coverPath',
  'logoPath',
  'iconPath',
  'backgroundPath',
  'bannerPath',
  'heroPath',
  'videoPath',
] as const

/** Chemins d'artwork locaux effectivement référencés (dédupliqués). */
export function referencedResourcePaths(games: Game[]): string[] {
  const seen = new Set<string>()
  for (const game of games) {
    const resources = game.resources
    if (!resources) continue
    for (const key of RESOURCE_PATH_KEYS) {
      const value = resources[key]
      if (typeof value === 'string' && value.trim()) seen.add(value.trim())
    }
  }
  return [...seen]
}

export interface ResourceCleanupOutcome {
  removed: number
  freedBytes: number
}

/** Format lisible du volume libéré (ex. « 3,4 Mo »). */
export function formatFreedBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = Math.round(value * 10) / 10
  const number = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
  return `${number} ${units[unit]}`
}

/** Message utilisateur final après un nettoyage (§10). */
export function cleanupSummaryMessage(outcome: ResourceCleanupOutcome): string {
  if (outcome.removed === 0) {
    return 'Aucune ressource orpheline — le cache d’illustrations est propre.'
  }
  const files = outcome.removed === 1 ? '1 fichier orphelin' : `${outcome.removed} fichiers orphelins`
  return `${files} supprimé${outcome.removed === 1 ? '' : 's'} · ${formatFreedBytes(outcome.freedBytes)} libérés.`
}
