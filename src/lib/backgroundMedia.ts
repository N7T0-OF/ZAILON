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

export type { GameBackgroundMedia, BackgroundMediaType }
