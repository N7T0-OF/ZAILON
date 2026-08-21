import { pickPrioritySession } from './sessionPriority.ts'
import type { PerformanceMode } from './performanceProfiles'
import type { Game, GameSession } from '../types'

/**
 * QuickPanelState — contenu contextuel du panneau rapide (spec Quick Panel
 * §16-18, §24-25, §64-69). Logique pure, testable : l'état Performance
 * effectif (mode + politiques de pause réelles) et la préparation des mods
 * (spec §69 : un jeu détecté après lancement externe n'a pas eu de préparation
 * de profil — le panneau doit le dire honnêtement, jamais un faux ✓).
 */

export interface QuickPanelPerformanceState {
  /** Mode du jeu : explicite par jeu, sinon le mode global (spec §24). */
  mode: PerformanceMode
  /** Politiques réelles dérivées des sessions (spec §24 : affichage simple,
   * pas d'exposition de tous les réglages). */
  downloadsPaused: boolean
  scansPaused: boolean
}

export function quickPanelPerformanceState(
  performanceModes: Record<string, PerformanceMode>,
  globalPerformanceMode: PerformanceMode,
  runtimeActivity: { downloads: string; scans: string },
  gameId: string,
): QuickPanelPerformanceState {
  return {
    mode: performanceModes[gameId] || globalPerformanceMode,
    downloadsPaused: runtimeActivity.downloads === 'paused',
    scansPaused: runtimeActivity.scans !== 'normal',
  }
}

/**
 * Spec §69 : les mods sont « préparés » seulement si la session a été lancée
 * PAR ZAILON avec le déploiement actif. Un jeu détecté après coup (Steam,
 * launcher externe, UAC) n'a pas eu la préparation de profil — le panneau
 * affiche « Mods ⚠ Non préparés » avec la bulle explicative.
 */
export function modsPreparedFor(session: Pick<GameSession, 'source' | 'deploymentActive'>): boolean {
  return session.source === 'zailon' && session.deploymentActive === true
}

/** Une entrée de session pour le sélecteur du panneau (spec §14, §48). */
export interface QuickPanelSessionEntry {
  gameId: string
  gameName: string
  profileName: string
  /** Session épinglée (spec §50) — le raccourci continue d'ouvrir celle-ci. */
  pinned: boolean
  /** Session prioritaire effective (pin > foreground > plus récente). */
  isPriority: boolean
}

/** Sessions actives pour le sélecteur multi-session du panneau (spec §14,
 * §48) : uniquement les sessions non terminales, triées priorité d'abord. */
export function activeSessionsForQuickPanel(
  sessions: GameSession[],
  games: Pick<Game, 'id' | 'name'>[],
  pinnedGameId: string | undefined,
  foregroundGameId: string | undefined,
): QuickPanelSessionEntry[] {
  const terminal = new Set(['Ended', 'Failed', 'Aborted'])
  const active = sessions.filter(session => !terminal.has(session.state))
  const priorityId = pickPrioritySession(active, pinnedGameId, foregroundGameId)
  return active
    .map(session => ({
      gameId: session.gameId,
      gameName: games.find(game => game.id === session.gameId)?.name || session.gameId,
      profileName: session.profileId,
      pinned: session.gameId === pinnedGameId,
      isPriority: session.gameId === priorityId,
    }))
    .sort((left, right) => Number(right.isPriority) - Number(left.isPriority))
}

/**
 * Spec §47, §84 : quand la session ciblée par le panneau se termine, le panneau
 * bascule vers la session suivante (la prioritaire parmi celles restantes, en
 * excluant la cible disparue) — ou retourne `undefined` s'il ne reste rien, au
 *quel cas le panneau se ferme. La cible épinglée disparue ne bloque pas : la
 *priorité est recalculée sur les sessions vivantes.
 */
export function nextSessionAfterCurrent(
  sessions: GameSession[],
  games: Pick<Game, 'id' | 'name'>[],
  currentGameId: string | undefined,
  pinnedGameId: string | undefined,
  foregroundGameId: string | undefined,
): string | undefined {
  const terminal = new Set(['Ended', 'Failed', 'Aborted'])
  const active = sessions.filter(session => session.gameId !== currentGameId && !terminal.has(session.state))
  return pickPrioritySession(active, pinnedGameId, foregroundGameId)
}

