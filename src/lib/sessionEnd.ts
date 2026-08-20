/**
 * Détection de fin de session (spec RuntimeSessionV3 §1-5).
 *
 * Une session « En cours » ne se termine que sur la disparition réelle du jeu
 * final : après une période de grâce (PossibleExit), pendant laquelle un
 * relaunch / nouveau PID / changement de processus annule la fin. Un launcher
 * encore ouvert ou Steam encore « Running » ne suffisent jamais à maintenir
 * indéfiniment la session (spec §2, §4).
 */

/** Durée de la période de grâce après disparition du jeu final (ms). */
export const EXIT_GRACE_MS = 5_000

export interface SessionEndState {
  /** Le jeu est visiblement présent : la session reste GameRunning. */
  present: boolean
  /** Début de la période PossibleExit (ms epoch) — à enregistrer sur la session. */
  possibleExitSince?: number
  /** La session doit être terminée maintenant. */
  shouldEnd: boolean
  /** Raison à inscrire dans la timeline. */
  reason: string
}

export interface SessionEndInput {
  /** La session est-elle encore en GameRunning ? */
  running: boolean
  /** Evidence de présence du PROCESSUS FINAL (jamais le launcher) ? */
  present: boolean
  /** Epoch de début de PossibleExit si déjà enregistré (undefined sinon). */
  possibleExitSince?: number
  /** Horloge actuelle (ms epoch). */
  now: number
}

/**
 * Évalue l'état de fin pour un tick de présence.
 *
 * - présent → pas de fin, on efface toute période PossibleExit en cours ;
 * - absent sans PossibleExit → ouvre la période de grâce (present=false,
 *   possibleExitSince=now) ;
 * - absent après la grâce → shouldEnd=true.
 */
export function evaluateSessionEnd(input: SessionEndInput): SessionEndState {
  if (!input.running) return { present: input.present, shouldEnd: false, reason: 'Session déjà terminée' }
  if (input.present) return { present: true, shouldEnd: false, reason: '' }
  const since = input.possibleExitSince
  if (since === undefined) {
    return { present: false, possibleExitSince: input.now, shouldEnd: false, reason: '' }
  }
  if (input.now - since >= EXIT_GRACE_MS) {
    return {
      present: false,
      possibleExitSince: since,
      shouldEnd: true,
      reason: 'Le jeu a été fermé (aucun processus final ni fenêtre actif après la période de vérification)',
    }
  }
  return { present: false, possibleExitSince: since, shouldEnd: false, reason: '' }
}
