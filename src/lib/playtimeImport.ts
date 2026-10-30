/**
 * Import du temps de jeu Steam/Epic (spec « Mise à niveau » §3).
 *
 * Règle inviolable : le temps importé n'est JAMAIS fusionné avec le suivi
 * ZAILON. `totalPlaytime` reste le temps suivi par ZAILON lui-même ;
 * `importedPlaytimeMin` est l'historique fourni par Steam (minutes, lu depuis
 * localconfig.vdf). L'affichage les sépare : « Temps total : X · Suivi ZAILON :
 * Y · Steam : Z ».
 *
 * Tout est PUR et testable — aucune I/O, aucun appel natif.
 */
import type { Game } from '../types'

/** Temps total affichable d'un jeu : suivi ZAILON + historique importé. */
export function combinedPlaytimeMin(game: Pick<Game, 'totalPlaytime' | 'importedPlaytimeMin'>): number {
  return (game.totalPlaytime || 0) + (game.importedPlaytimeMin || 0)
}

/** Applique le temps Steam (minutes par AppID) aux jeux Steam correspondants.
 * Ne touche JAMAIS `totalPlaytime` (suivi ZAILON) — seul `importedPlaytimeMin`
 * et `externalPlaytimeSource` sont renseignés. Un jeu sans AppID connu est
 * ignoré. */
export function applySteamPlaytime(
  games: readonly Game[],
  minutesByAppId: Readonly<Record<string, number>>,
): Game[] {
  return games.map(game => {
    if (game.platform !== 'steam' && game.provider !== 'Steam') return game
    const appId = game.providerGameId
    if (!appId || !(appId in minutesByAppId)) return game
    const minutes = minutesByAppId[appId]
    if (!Number.isFinite(minutes) || minutes < 0) return game
    return { ...game, importedPlaytimeMin: minutes, externalPlaytimeSource: 'steam' as const }
  })
}

/** Totaux agrégés du temps importé (tous jeux) : minutes, nombre de jeux, et
 * répartition par source. */
export function importedTotals(games: readonly Game[]): { minutes: number; count: number; bySource: Record<string, number> } {
  const bySource: Record<string, number> = {}
  let minutes = 0
  let count = 0
  for (const game of games) {
    const imported = game.importedPlaytimeMin
    if (!imported || imported <= 0) continue
    minutes += imported
    count += 1
    const source = game.externalPlaytimeSource || 'inconnu'
    bySource[source] = (bySource[source] || 0) + imported
  }
  return { minutes, count, bySource }
}
