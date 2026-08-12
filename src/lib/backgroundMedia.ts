/**
 * Réglages et résolution des fonds multimédia de l'Accueil
 * (spec Accueil multimédia §1, §9-11, §31-32).
 *
 * Logique pure — aucun accès DOM : testable sous node --test.
 */

import type { GameBackgroundMedia, BackgroundMediaType } from '../types'

/** Réglages globaux (Paramètres > Apparence > Fonds multimédia, spec §10). */
export interface BackgroundMediaSettings {
  /** Fond vidéo autorisé globalement (spec §10). */
  bgVideoEnabled: boolean
  /** Audio des fonds autorisé (spec §10). */
  bgAudioEnabled: boolean
  /** Toujours démarrer les vidéos muettes (spec §9, §44). */
  bgAlwaysMuted: boolean
  /** Volume ambiant par défaut — très faible (spec §7 : 5-10 %, ici 7 %). */
  bgVolume: number
  /** Pause quand ZAILON n'est pas au premier plan (spec §16). */
  bgPauseOnBlur: boolean
  /** Afficher une image quand ZAILON est inactif (spec §88). */
  bgImageWhenInactive: boolean
}

export const DEFAULT_BACKGROUND_MEDIA_SETTINGS: BackgroundMediaSettings = {
  bgVideoEnabled: true,
  bgAudioEnabled: true,
  bgAlwaysMuted: true,
  bgVolume: 0.07,
  bgPauseOnBlur: true,
  bgImageWhenInactive: true,
}

/** Volume borné : 0 → 1, défaut 7 %. */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BACKGROUND_MEDIA_SETTINGS.bgVolume
  return Math.min(1, Math.max(0, value))
}

/** Résolution audio finale (spécifique au jeu si fournie, sinon global). */
export function resolveAudioSettings(media: GameBackgroundMedia | undefined, global: BackgroundMediaSettings): { muted: boolean; volume: number } {
  const muted = media?.mutedOverride ?? global.bgAlwaysMuted
  const volume = clampVolume(media?.volumeOverride ?? global.bgVolume)
  // Règle §9 : on ne se fait jamais surprendre par du son au lancement.
  return { muted: muted || !global.bgAudioEnabled, volume }
}

/** Quel type de média doit être rendu, selon la config du jeu + global (spec §32). */
export function resolveMediaType(media: GameBackgroundMedia | undefined, global: BackgroundMediaSettings, hasLocalVideo: boolean): BackgroundMediaType | 'none' {
  if (!global.bgVideoEnabled) return 'none'
  if (!media) return 'none'
  switch (media.type) {
    case 'youtube':
      return media.youtubeVideoId ? 'youtube' : 'none'
    case 'video':
      return media.localPath || hasLocalVideo ? 'video' : 'none'
    case 'image':
      return 'none' // image gérée par le Hero existant
    case 'auto':
      return media.youtubeVideoId ? 'youtube' : media.localPath || hasLocalVideo ? 'video' : 'none'
  }
}

/** Descriptif compact pour l'UI de configuration (spec §46, §78). */
export function describeBackgroundMedia(media: GameBackgroundMedia | undefined, hasLocalVideo: boolean): string {
  if (!media) return 'Automatique'
  switch (media.type) {
    case 'image':
      return 'Image fixe'
    case 'video':
      return media.localPath ? 'Vidéo locale' : hasLocalVideo ? 'Vidéo locale' : 'Vidéo (aucun fichier)'
    case 'youtube':
      return media.youtubeVideoId ? 'YouTube' : 'YouTube (lien manquant)'
    case 'auto':
      if (media.youtubeVideoId) return 'YouTube'
      if (media.localPath || hasLocalVideo) return 'Vidéo locale'
      return 'Automatique'
  }
}

/** Clé d'accès à la config vidéo par jeu, pour les tests et l'UI. */
export function normalizeBackgroundMedia(media: GameBackgroundMedia | undefined): GameBackgroundMedia {
  return media ?? { type: 'auto' }
}

// ─────────────────────────────── Machine à états média ──────────────────────
// Spec ZAILON correctifs §15, §9-14 : un seul modèle d'état au lieu de
// combinaisons de booléens incohérentes, et séparation stricte entre
// l'intention utilisateur (persistée) et les suspensions temporaires.

/** États possibles du fond média (spec §15). */
export type BackgroundMediaState =
  | 'Inactive'
  | 'Loading'
  | 'PlayingMuted'
  | 'PlayingAudible'
  | 'SuspendedUnfocused'
  | 'SuspendedGameRunning'
  | 'Error'

/**
 * Session audio du fond (spec §9-12) : l'intention utilisateur (userMuted /
 * userVolume) n'est JAMAIS écrasée par les suspensions temporaires (§10).
 */
export interface BackgroundAudioSession {
  /** Intention persistée de l'utilisateur — jamais modifiée par focus/jeu. */
  userMuted: boolean
  /** Volume utilisateur persisté (0-1). */
  userVolume: number
  /** Pause manuelle temporaire (bouton pause). */
  temporarilySuspended: boolean
  /** Suspendu parce que ZAILON n'est pas au premier plan (Alt+Tab). */
  suspendedBecauseUnfocused: boolean
  /** Suspendu parce qu'un jeu tourne (politique Performance §14, §53). */
  suspendedBecauseGameRunning: boolean
}

export function createAudioSession(userMuted = true, userVolume = 0.07): BackgroundAudioSession {
  return {
    userMuted,
    userVolume: clampVolume(userVolume),
    temporarilySuspended: false,
    suspendedBecauseUnfocused: false,
    suspendedBecauseGameRunning: false,
  }
}

/**
 * Volume effectif (spec §12) : 0 dès qu'une suspension s'applique, sinon le
 * volume utilisateur. Ne modifie jamais la session.
 */
export function effectiveVolume(session: BackgroundAudioSession): number {
  const suspended = session.userMuted || session.temporarilySuspended || session.suspendedBecauseUnfocused || session.suspendedBecauseGameRunning
  return suspended ? 0 : session.userVolume
}

/** Contextes qui pilotent la machine (événement-driven, spec §40-41). */
export interface BackgroundMediaContext {
  /** Une source (youtube/video locale) est configurée et autorisée. */
  sourceActive: boolean
  /** Le player est prêt à recevoir des commandes. */
  playerReady: boolean
  /** ZAILON au premier plan. */
  focused: boolean
  /** Un jeu tourne (session prioritaire). */
  gameRunning: boolean
  /** Le media a été suspendu par l'arbitre (autre player/preview). */
  arbiterSuspended: boolean
  /** Une erreur de lecture (vidéo non embeddable / indisponible). */
  error?: boolean
}

/** Calcule l'état média depuis la session + le contexte (pur, testable). */
export function computeMediaState(session: BackgroundAudioSession, context: BackgroundMediaContext): BackgroundMediaState {
  if (context.error) return 'Error'
  if (!context.sourceActive) return 'Inactive'
  if (session.suspendedBecauseUnfocused || !context.focused) return 'SuspendedUnfocused'
  if (session.suspendedBecauseGameRunning || context.gameRunning) return 'SuspendedGameRunning'
  if (session.temporarilySuspended || context.arbiterSuspended) {
    // Pause volontaire : état visible pour l'UI (reste « Playing… » ? non —
    // on garde la distinction simple : Inactive n'est pas bon non plus.
    return session.userMuted ? 'PlayingMuted' : 'PlayingAudible'
  }
  if (!context.playerReady) return 'Loading'
  return session.userMuted ? 'PlayingMuted' : 'PlayingAudible'
}

/**
 * Perte de focus (Alt+Tab, §9-11) : la suspension est temporaire, l'intention
 * utilisateur reste intacte — jamais userMuted = true ici.
 */
export function onFocusLost(session: BackgroundAudioSession): BackgroundAudioSession {
  return { ...session, suspendedBecauseUnfocused: true }
}

/**
 * Retour au premier plan (§13) : reprendre seulement si le média est actif,
 * qu'aucun jeu ne tourne et que l'utilisateur n'a pas coupé le son.
 */
export function onFocusRestored(session: BackgroundAudioSession, opts: { sourceActive: boolean; gameRunning: boolean }): BackgroundAudioSession {
  // Politique §13 : ne pas reprendre si le média est inactif, si un jeu tourne
  // ou si l'utilisateur a coupé le son. Une pause manuelle (§16) survit au focus.
  const keepSuspended = !opts.sourceActive || opts.gameRunning || session.userMuted
  return {
    ...session,
    suspendedBecauseUnfocused: false,
    temporarilySuspended: keepSuspended || session.temporarilySuspended,
    suspendedBecauseGameRunning: session.suspendedBecauseGameRunning || opts.gameRunning,
  }
}

/** Démarrage d'un jeu (§14) : suspension séparée de la perte de focus. */
export function onGameStarted(session: BackgroundAudioSession, opts: { performanceMode: 'balanced' | 'performance' | 'max' }): BackgroundAudioSession {
  if (opts.performanceMode === 'performance' || opts.performanceMode === 'max') {
    // Performance : le player peut être détruit — suspension totale (§53).
    return { ...session, suspendedBecauseGameRunning: true, temporarilySuspended: true }
  }
  return { ...session, suspendedBecauseGameRunning: true }
}

/** Fin d'un jeu : levée de la suspension jeu (§14). */
export function onGameStopped(session: BackgroundAudioSession): BackgroundAudioSession {
  return { ...session, suspendedBecauseGameRunning: false, temporarilySuspended: false }
}

/** Pause manuelle (§16 : « vidéo en pause manuelle reste en pause »). */
export function onManualPause(session: BackgroundAudioSession): BackgroundAudioSession {
  return { ...session, temporarilySuspended: true }
}

export function onManualResume(session: BackgroundAudioSession): BackgroundAudioSession {
  return { ...session, temporarilySuspended: false }
}

/** Mute/unmute utilisateur : SEUL endroit où l'intention est modifiée (§10). */
export function setUserMuted(session: BackgroundAudioSession, muted: boolean): BackgroundAudioSession {
  return { ...session, userMuted: muted }
}

export function setUserVolume(session: BackgroundAudioSession, volume: number): BackgroundAudioSession {
  return { ...session, userVolume: clampVolume(volume) }
}

/**
 * Politique du fond vidéo pendant un jeu (spec §53) : Équilibré → pause
 * (player conservé, reprise instantanée) ; Performance/Max → dispose
 * (player démonté, RAM/GPU libérés, remonté à la fin du jeu).
 */
export function mediaDisposePolicy(performanceMode: string | undefined): 'dispose' | 'pause' {
  return performanceMode === 'performance' || performanceMode === 'max' ? 'dispose' : 'pause'
}

export type { GameBackgroundMedia, BackgroundMediaType }
