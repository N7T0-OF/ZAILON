/**
 * Configuration par jeu en 3 niveaux (spec « Configuration par jeu » §4-5).
 *
 *   🌐 ZAILON  (global)  : fonds multimédia, préférences générales
 *   🎮 Jeu      (par jeu) : profil actif, touches, media, performance
 *   👤 Profil  (par profil) : ReShade, args de lancement, runtime
 *
 * Logique pure — aucun accès disque/processus/store : testable sous node --test.
 *
 * Garantie centrale (§4) : la résolution d'un jeu ne lit JAMAIS les données
 * d'un autre jeu. Le profil actif est toujours validé comme appartenant au jeu
 * (`profileBelongsToGame`), et le profil restauré est celui du jeu lui-même
 * (`lastUsedProfileId`), jamais un profil global partagé.
 */

import type { Game, Profile } from '../types'
import type { PerformanceMode } from './performanceProfiles'
import { resolveAudioSettings, type BackgroundMediaSettings } from './backgroundMedia.ts'

/** Le profil actif d'un jeu : le dernier utilisé (spéc §12 « dernier jeu/profil
 * chargé »), sinon le profil par défaut, sinon le premier. JAMAIS un profil
 * d'un autre jeu — la fonction ne reçoit que les profils de CE jeu. */
export function lastUsedProfileId(profiles: Profile[]): string | undefined {
  if (!profiles.length) return undefined
  const byLastUsed = [...profiles].sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
  if (byLastUsed[0].lastUsed) return byLastUsed[0].id
  const def = profiles.find(profile => profile.isDefault)
  return (def ?? profiles[0]).id
}

/** Vrai si `profileId` appartient bien à `game` (garde anti-fuite inter-jeu). */
export function profileBelongsToGame(game: Game, profileId: string | undefined): boolean {
  if (!profileId) return false
  return game.profiles.some(profile => profile.id === profileId)
}

/** Résout le profil actif d'un jeu pour une sélection donnée : la sélection si
 * elle appartient au jeu, sinon le dernier profil utilisé du jeu (§4). */
export function resolveActiveProfile(game: Game, selectedProfileId: string | undefined): Profile | undefined {
  if (selectedProfileId) {
    const explicit = game.profiles.find(profile => profile.id === selectedProfileId)
    if (explicit) return explicit
  }
  const id = lastUsedProfileId(game.profiles)
  return game.profiles.find(profile => profile.id === id)
}

export interface PerGameGlobalSettings {
  backgroundMedia: BackgroundMediaSettings
  performanceModes: Record<string, PerformanceMode>
}

/** Configuration effective consolidée d'une session de jeu (spec §5). */
export interface GameSessionConfig {
  gameId: string
  gameName: string
  /** 👤 profil actif (jamais celui d'un autre jeu). */
  profileId: string
  profileName: string
  /** 👤 ReShade du profil. */
  reshadeEnabled: boolean
  /** 👤 arguments de lancement. */
  launchArgs: string
  /** 👤 runtime (launcher intermédiaire éventuel). */
  runtime: string
  /** 🎮 touches du jeu. */
  keyboardLayout: Game['keyboardLayout']
  /** 🎮 mode performance du jeu (défaut 'auto'). */
  performanceMode: PerformanceMode
  /** 🎮 fond multimédia — surcharge par jeu sinon défaut global. */
  backgroundMuted: boolean
  backgroundVolume: number
}

/**
 * Consolide la configuration effective d'un jeu en croisant les 3 niveaux.
 * Rejette toute sélection de profil qui n'appartient pas au jeu (spec §4).
 */
export function resolveGameSessionConfig(
  game: Game,
  selectedProfileId: string | undefined,
  global: PerGameGlobalSettings,
): GameSessionConfig {
  const profile = resolveActiveProfile(game, selectedProfileId)
  const audio = resolveAudioSettings(game.backgroundMedia, global.backgroundMedia)
  return {
    gameId: game.id,
    gameName: game.name,
    profileId: profile?.id ?? '',
    profileName: profile?.name ?? '',
    reshadeEnabled: profile?.reshade?.enabled ?? false,
    launchArgs: profile?.launchArgs ?? '',
    runtime: profile?.runtime ?? '',
    keyboardLayout: game.keyboardLayout,
    performanceMode: global.performanceModes[game.id] ?? 'auto',
    backgroundMuted: audio.muted,
    backgroundVolume: audio.volume,
  }
}
