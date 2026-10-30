/**
 * Multi-sessions actives — priorité et arbitrage (spec « X de session +
 * multi-apps actives + priorité d’activité »).
 *
 * ZAILON supporte plusieurs GameSession simultanées (Cyberpunk, NTE…).
 * Parmi elles, UNE seule est « prioritaire » :
 * - pour le résumé Accueil, le Quick Panel et les badges ;
 * - pour l’arbitrage des mappings clavier (un seul mapping de fenêtre actif à la
 *   fois) et des Visual Profiles (un seul écran appliqué au premier plan).
 *
 * Logique pure et testable : aucun accès au store.
 */

export const SESSION_TERMINAL_STATES = ['Ended', 'Failed', 'GameLost'] as const

export interface PriorityCandidate {
  id: string
  gameId: string
  state: string
  startedAt: number
  lastSeenAt?: number
}

/** Session prioritaire effective :
 * 1. la session épinglée si elle est encore active (priorité manuelle) ;
 * 2. sinon la session dont la fenêtre est au premier plan (Alt+Tab réel,
 *    alimenté par le watcher de fenêtres natif) ;
 * 3. sinon la session GameRunning la plus récente ;
 * 4. sinon la session active (non terminale) la plus récente ;
 * 5. sinon aucune.
 * Retourne le gameId (jamais un PID — la session appartient au jeu). */
export function pickPrioritySession(
  sessions: PriorityCandidate[],
  pinnedGameId?: string,
  foregroundGameId?: string,
): string | undefined {
  const active = sessions.filter(session => !SESSION_TERMINAL_STATES.includes(session.state as never))
  if (!active.length) return undefined
  if (pinnedGameId && active.some(session => session.gameId === pinnedGameId)) return pinnedGameId
  if (foregroundGameId && active.some(session => session.gameId === foregroundGameId)) return foregroundGameId
  const running = active.filter(session => session.state === 'GameRunning')
  const pool = running.length ? running : active
  return [...pool].sort((left, right) => (right.lastSeenAt ?? right.startedAt) - (left.lastSeenAt ?? left.startedAt))[0].gameId
}

/** Arbitrage des mappings clavier (spec « maximum un mapping de fenêtre actif
 * à la fois ») : seule la session prioritaire en GameRunning garde son entrée
 * active ; toutes les autres sont désactivées. */
export function arbitrateInputProfiles(
  sessions: PriorityCandidate[],
  priorityGameId?: string,
): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const session of sessions) {
    result[session.gameId] = session.state === 'GameRunning' && session.gameId === priorityGameId
  }
  return result
}

/** Sessions « actives » (en préparation, lancement, recherche, en cours…). */
export function activeSessions(sessions: PriorityCandidate[]): PriorityCandidate[] {
  return sessions.filter(session => !SESSION_TERMINAL_STATES.includes(session.state as never))
}

/** Vrai si la session est encore en phase de recherche (pas encore de jeu). */
export function isSearchingSession(state: string): boolean {
  return state === 'WaitingForGame' || state === 'WaitingForElevation' || state === 'LauncherStarted' || state === 'Preparing'
}

/** Toast de session (spec « Correctif NTE » §21-24) : un jeu détecté hors ZAILON
 * est « récupéré » (recovered) si ZAILON vient de redémarrer (fenêtre de grâce),
 * sinon simplement « détecté ». `started` reste réservé aux sessions lancées par
 * ZAILON. Fonction pure : le boot de l'app est le moment où le store est créé. */
export function recoveryKind(
  bootedAt: number,
  now: number,
  graceMs = 20_000,
): 'recovered' | 'detected' {
  return now - bootedAt < graceMs ? 'recovered' : 'detected'
}
