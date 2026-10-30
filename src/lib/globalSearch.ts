/** Recherche globale — logique pure (spec « Recherche globale »). Trouve jeux,
 * applications, profils, mods, groupes et add-ons à partir d'une seule requête,
 * avec un score simple (préfixe > mot > sous-chaîne). Aucune dépendance
 * React/store : testable isolément. */

import type { Game, GameGroup } from '../types'
import type { InstalledAddon } from './addons'

export type GlobalSearchKind = 'game' | 'profile' | 'mod' | 'addon' | 'group'

export interface GlobalSearchResult {
  kind: GlobalSearchKind
  /** Clé unique stable (pour la sélection au clavier). */
  key: string
  title: string
  subtitle: string
  /** Présent pour les résultats liés à un jeu / profil. */
  gameId?: string
  profileId?: string
}

export interface GlobalSearchInput {
  query: string
  games: Game[]
  gameGroups: GameGroup[]
  addons: InstalledAddon[]
}

/** 2 = le titre commence par la requête, 1 = un mot commence par la requête,
 * 0 = simple sous-chaîne. Retourne -1 si aucun match. */
function score(title: string, query: string): number {
  const hay = title.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase()
  if (!needle) return -1
  if (!hay.includes(needle)) return -1
  if (hay.startsWith(needle)) return 2
  // Frontière de mot (après espace, tiret, etc.).
  const words = hay.split(/[\s\-_/]+/)
  if (words.some(word => word.startsWith(needle))) return 1
  return 0
}

/** Recherche multi-catégorie. Le résultat est trié par score décroissant puis
 * par titre (ordre stable). `limit` borne le total (jamais des centaines de
 * lignes — spec « Recherche globale »). */
export function globalSearch({ query, games, gameGroups, addons }: GlobalSearchInput, limit = 60): GlobalSearchResult[] {
  const results: Array<GlobalSearchResult & { score: number }> = []
  const push = (result: GlobalSearchResult, s: number) => {
    if (s >= 0) results.push({ ...result, score: s })
  }

  for (const game of games) {
    const haystack = `${game.name} ${game.shortName ?? ''} ${game.publisher ?? ''} ${game.provider ?? ''}`
    const s = score(haystack, query)
    const isApp = game.itemKind === 'software'
    if (s >= 0) {
      push({
        kind: 'game',
        key: `game:${game.id}`,
        title: game.name,
        subtitle: isApp ? 'Application' : `Jeu${game.provider ? ` · ${game.provider}` : ''}`,
        gameId: game.id,
      }, s)
    }
    for (const profile of game.profiles) {
      const ps = score(profile.name, query)
      if (ps >= 0) push({ kind: 'profile', key: `profile:${game.id}:${profile.id}`, title: profile.name, subtitle: `Profil · ${game.name}`, gameId: game.id, profileId: profile.id }, ps)
    }
    for (const mod of game.installedMods) {
      const ms = score(mod.name, query)
      if (ms >= 0) push({ kind: 'mod', key: `mod:${game.id}:${mod.id}`, title: mod.name, subtitle: `Mod · ${game.name}`, gameId: game.id, profileId: undefined }, ms)
    }
  }

  for (const group of gameGroups) {
    const s = score(group.name, query)
    if (s >= 0) push({ kind: 'group', key: `group:${group.id}`, title: group.name, subtitle: `Groupe · ${group.memberGameIds.length} jeu(x)` }, s)
  }

  for (const addon of addons) {
    const s = score(`${addon.manifest.name} ${addon.manifest.id}`, query)
    if (s >= 0) push({ kind: 'addon', key: `addon:${addon.manifest.id}`, title: addon.manifest.name, subtitle: 'Add-on' }, s)
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ key, kind, title, subtitle, gameId, profileId }) => ({ key, kind, title, subtitle, gameId, profileId }))
}
