import { DISCORD_FALLBACK_ASSET } from './discordPresence.ts'

/**
 * Mapping static des jeux vers leurs assets Discord (spec §19) : ces clés
 * correspondent aux assets uploadés dans le Discord Developer Portal
 * (Rich Presence > Art Assets) pour l'application ZAILON.
 *
 * Les jeux absents du mapping retombent sur la clé globale configurée par
 * l'utilisateur, puis sur le logo ZAILON — la présence ne rate jamais à cause
 * d'une image (spec §50).
 */
export const DISCORD_ASSETS: Record<string, string> = {
  cyberpunk2077: 'cyberpunk2077',
  'cyberpunk-2077': 'cyberpunk2077',
  'neverness-to-everness': 'nte',
  nte: 'nte',
  photoshop: 'photoshop',
  blender: 'blender',
}

/** Clé d'asset générique par type (spec §17.3). */
export function genericAssetFor(gameKind: 'game' | 'software' | undefined): string {
  return gameKind === 'software' ? 'generic-app' : 'generic-game'
}

/**
 * Chaîne de résolution (spec §17, §49-50) :
 * 1. asset Discord spécifique au jeu (mapping static, spec §19) ;
 * 2. clé globale configurée par l'utilisateur (`discordLargeImageKey`) ;
 * 3. asset générique du type jeu/application ;
 * 4. logo ZAILON (fallback absolu — la présence ne rate jamais à cause d'une
 *    image).
 *
 * Jamais d'upload automatique d'images locales vers Discord (spec §18) : les
 * clés ne sont que des identifiants d'assets déjà présents dans le Developer
 * Portal de l'application ZAILON.
 */
export function resolveDiscordAsset(
  gameId: string,
  globalKey: string | undefined,
  gameKind: 'game' | 'software' | undefined,
): string {
  const mapped = DISCORD_ASSETS[gameId]
  if (mapped) return mapped
  if (globalKey?.trim()) return globalKey.trim()
  return genericAssetFor(gameKind)
}

export { DISCORD_FALLBACK_ASSET }
