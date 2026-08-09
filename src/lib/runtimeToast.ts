import type { Game, GameSession } from '../types'

/**
 * Runtime Toast — « preuve de connexion » (spec Quick Panel §1-7, §42, §63).
 *
 * Le toast « En cours via ZAILON » ne doit apparaître que quand la session est
 * RÉELLEMENT reliée : le vrai processus final détecté + fonctionnalités runtime
 * initialisées (spec §4). Jamais au clic Jouer, à l'ouverture de Steam, au
 * launcher ou à l'UAC.
 *
 * Contenu contextuel (spec §2, §5) : badges alimentés par l'état RÉEL de la
 * session (RuntimeFeatureState, spec §19) — une fonction configurée mais non
 * active n'affiche jamais ✓. Si une partie des fonctions a échoué → warning
 * « connexion partielle », jamais un gros popup d'erreur.
 *
 * Rappel du raccourci (spec §42, §63) : affiché seulement les 3 premières
 * sessions, puis plus jamais.
 */

export interface RuntimeToastBadge {
  label: string
  ok: boolean
}

export interface RuntimeToastContent {
  gameName: string
  badges: RuntimeToastBadge[]
  /** true = connexion partielle (au moins une fonction active, au moins une
   * absente) — la bulle reste discrète, aucun popup d'erreur (spec §5). */
  warning: boolean
  /** Rappel « Ctrl+Alt+Z · Panneau rapide » — les 3 premières sessions. */
  shortcutHint?: string
}

/** Badges contextuels depuis l'état RÉEL de la session (spec §19) : une
 * fonction est affichée seulement si elle est vraiment active. */
export function runtimeBadges(session: Pick<GameSession, 'inputProfileActive' | 'visualProfileActive' | 'runtimeToolsActive' | 'deploymentActive'>): RuntimeToastBadge[] {
  const badges: RuntimeToastBadge[] = []
  if (session.inputProfileActive) badges.push({ label: 'QWERTY', ok: true })
  if (session.visualProfileActive) badges.push({ label: 'Visuel', ok: true })
  if (session.runtimeToolsActive) badges.push({ label: 'Mods', ok: true })
  if (session.deploymentActive) badges.push({ label: 'Déploiement', ok: true })
  return badges
}

/** Warning « connexion partielle » (spec §5) : au moins une fonction active et
 * au moins une attendue absente — l'utilisateur voit immédiatement qu'une
 * partie de la chaîne runtime n'est pas montée, sans popup d'erreur. */
export function isPartialConnection(session: Pick<GameSession, 'inputProfileActive' | 'visualProfileActive' | 'runtimeToolsActive' | 'deploymentActive'>, isGame: boolean): boolean {
  if (!isGame) return false
  const active = [session.inputProfileActive, session.visualProfileActive, session.runtimeToolsActive].filter(Boolean).length
  const total = 3
  return active > 0 && active < total
}

/** Contenu complet du toast de connexion (spec §2, §5, §42). */
export function buildRuntimeToastContent(
  session: Pick<GameSession, 'inputProfileActive' | 'visualProfileActive' | 'runtimeToolsActive' | 'deploymentActive'>,
  game: Pick<Game, 'name' | 'itemKind'> | undefined,
  shortcutHintCount: number,
  shortcutLabel: string,
): RuntimeToastContent {
  const isGame = !game || game.itemKind !== 'software'
  const badges = runtimeBadges(session)
  const warning = isPartialConnection(session, isGame)
  const shortcutHint = shortcutHintCount < 3 ? `${shortcutLabel} · Panneau rapide` : undefined
  return {
    gameName: game?.name || 'Jeu',
    badges,
    warning,
    shortcutHint,
  }
}

/** Nombre de sessions avant suppression du rappel du raccourci (spec §42). */
export const SHORTCUT_HINT_LIMIT = 3
