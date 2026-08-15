/**
 * Groupes de jeux — logique pure (spec « Groupes de jeux » §1-4, §7, §10).
 *
 * Un groupe est purement organisationnel : il ne fusionne ni les profils, ni
 * les fichiers, ni les statistiques par profil. Il sert uniquement à présenter
 * plusieurs environnements d'une même « famille de jeu » sous une identité
 * commune (FiveM, Cyberpunk…).
 */

import type { Game, GameGroup } from '../types'

export interface GroupSuggestion {
  name: string
  gameIds: string[]
  /** Raison de la proposition (affichée dans le dialogue « Créer un groupe ? »). */
  reason: string
}

function executableBasename(game: Game): string | undefined {
  const path = (game.execPath || '').split(/[\\/]/).pop()
  return path && path.trim() ? path.toLocaleLowerCase() : undefined
}

/**
 * Propose des groupes quand plusieurs jeux partagent le MÊME exécutable
 * (ex. `FiveM.exe` dans plusieurs entrées). Jamais de regroupement automatique :
 * la proposition reste manuelle et modifiable (spec §3).
 */
export function proposeGameGroups(games: Game[]): GroupSuggestion[] {
  const byExecutable = new Map<string, Game[]>()
  for (const game of games) {
    const exe = executableBasename(game)
    if (exe) {
      const list = byExecutable.get(exe) || []
      list.push(game)
      byExecutable.set(exe, list)
    }
  }
  const suggestions: GroupSuggestion[] = []
  for (const [exe, members] of byExecutable) {
    if (members.length < 2) continue
    const ungrouped = members.filter(game => !game.groupId)
    if (ungrouped.length < 2) continue
    // Nom affiché depuis le chemin d'origine (casse préservée : « FiveM.exe » →
    // « FiveM »), jamais depuis la version normalisée en minuscules.
    const rawName = (ungrouped[0].execPath || '').split(/[\\/]/).pop() || exe
    const name = rawName.replace(/\.exe$/i, '') || exe.replace(/\.exe$/i, '')
    suggestions.push({
      name,
      gameIds: ungrouped.map(game => game.id),
      reason: `${exe} a été trouvé dans ${ungrouped.length} installations distinctes.`,
    })
  }
  return suggestions
}

/** Temps total d'un groupe (somme des jeux membres — affiché séparément des profils). */
export function groupTotalPlaytime(games: Game[], group: GameGroup): number {
  const members = new Set(group.memberGameIds)
  return games.filter(game => members.has(game.id)).reduce((sum, game) => sum + (game.totalPlaytime || 0), 0)
}

/** Jeux membres d'un groupe, dans l'ordre déclaré. */
export function groupMembers(games: Game[], group: GameGroup): Game[] {
  const byId = new Map(games.map(game => [game.id, game]))
  return group.memberGameIds.map(id => byId.get(id)).filter((game): game is Game => Boolean(game))
}

/** Nombre total de profils d'un groupe (somme des membres, jamais fusionné). */
export function groupProfileCount(games: Game[], group: GameGroup): number {
  return groupMembers(games, group).reduce((sum, game) => sum + (game.profiles?.length ?? 0), 0)
}

/** Nombre total de mods d'un groupe (somme des membres). */
export function groupModCount(games: Game[], group: GameGroup): number {
  return groupMembers(games, group).reduce((sum, game) => sum + (game.installedMods?.length ?? 0), 0)
}

/** Dernier lancement d'un groupe (le plus récent des membres), ou `undefined`. */
export function groupLastPlayed(games: Game[], group: GameGroup): number | undefined {
  const dates = groupMembers(games, group).map(game => game.lastPlayed).filter((date): date is number => typeof date === 'number')
  return dates.length ? Math.max(...dates) : undefined
}

/** Réordonnancement pur : décale un élément d'une case (haut/bas). Sans effet
 * si la cible sort des bornes — l'ordre n'est jamais perdu (spec §12). */
export function reorderArray<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

/**
 * Normalisation idempotente de la liste de groupes (migration v7) :
 * - membres filtrés sur les jeux réellement existants ;
 * - groupes sans aucun membre valide supprimés ;
 * - `groupId` d'un jeu pointant vers un groupe absent → retiré.
 */
export function normalizeGameGroups(groups: GameGroup[] | undefined, games: Game[]): GameGroup[] {
  const gameIds = new Set(games.map(game => game.id))
  const valid = (groups || []).filter(group => group.id && group.name && Array.isArray(group.memberGameIds))
  const kept = valid
    .map(group => ({ ...group, memberGameIds: group.memberGameIds.filter(id => gameIds.has(id)) }))
    .filter(group => group.memberGameIds.length > 0)
  const knownGroupIds = new Set(kept.map(group => group.id))
  for (const game of games) {
    if (game.groupId && !knownGroupIds.has(game.groupId)) {
      // Muté sur l'objet : la migration v7 recopie ensuite le jeu nettoyé.
      game.groupId = undefined
    }
  }
  return kept
}
