/**
 * Mode veille (spec « ZAILON Lite / Core » §15) — décision PURE, testable.
 *
 * Quand ZAILON n'a reçu aucune interaction depuis un délai, qu'aucun jeu ne
 * tourne, qu'aucune session n'attend son processus final et qu'aucune tâche
 * active (téléchargement/scan/déploiement) n'est en cours, le launcher entre
 * en veille : les scrutateurs périodiques (preuve Steam, scan de présence,
 * fenêtres) sont suspendus. CPU ~ nul, GPU ~ nul, réseau ~ nul.
 *
 * Dès qu'un signal d'activité revient (souris, clavier, session, tâche), le
 * réveil est immédiat — jamais un timer long à attendre.
 */

export interface IdleContext {
  /** Dernière interaction utilisateur (ms). */ 
  lastActivityAt: number
  /** Maintenant (ms) — injectable pour les tests. */
  now: number
  /** Vrai si au moins une session est en cours (Running / Waiting / Launcher…). */
  sessionActive: boolean
  /** Vrai si une tâche de fond est en cours (download / scan / déploiement). */
  backgroundActive: boolean
  /** Vrai si le suivi des apps lancées hors ZAILON est activé (requiert le scrutateur). */
  trackExternalApps: boolean
}

/** Délai d'inactivité par défaut avant mise en veille (ms). */
export const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 1000

/** Délai minimal de sécurité : jamais de veille avant 60 s (évite les à-coups). */
export const MIN_IDLE_TIMEOUT_MS = 60 * 1000

/** Une session qui doit rester surveillée empêche-t-elle la veille ? Oui : tant
 * qu'un jeu (ou un launcher en attente) existe, le scrutateur doit tourner. */
export function isSessionActive(sessionActive: boolean, backgroundActive: boolean): boolean {
  return sessionActive || backgroundActive
}

/**
 * ZAILON doit-il entrer en veille (suspendre les scrutateurs périodiques) ?
 * La veille n'est possible que si AUCUNE session ni tâche de fond n'est active,
 * et que l'utilisateur n'a pas interagi depuis `timeoutMs`.
 *
 * Le suivi des apps externes (`trackExternalApps`) garde le scrutateur éveillé :
 * sans lui, un jeu lancé hors ZAILON ne serait plus jamais détecté.
 */
export function shouldIdle(context: IdleContext, timeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS): boolean {
  const timeout = Math.max(MIN_IDLE_TIMEOUT_MS, timeoutMs)
  if (isSessionActive(context.sessionActive, context.backgroundActive)) return false
  if (context.trackExternalApps) return false
  return context.now - context.lastActivityAt >= timeout
}

/**
 * Cadence du scrutateur périodique (ms) selon l'état.
 * - éveillé : 1 s (réactivité des rattachements) ;
 * - veille : 30 s (simple battement de cœur, quasi zéro CPU).
 */
export function idleScanIntervalMs(idle: boolean): number {
  return idle ? 30_000 : 1_000
}

/**
 * Repli du délai de veille : borne les valeurs utilisateur invalides.
 * Retourne toujours un délai ≥ 60 s (jamais de veille agressive accidentelle).
 */
export function normalizeIdleTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_IDLE_TIMEOUT_MS
  return Math.max(MIN_IDLE_TIMEOUT_MS, value)
}
