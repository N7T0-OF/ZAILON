/**
 * Gating réel des fonctionnalités par add-on (spec Add-ons §10-33, §74).
 *
 * Règle absolue : si l'add-on d'une capacité n'est pas installé (et activé),
 * la fonctionnalité ne doit ni apparaître, ni être chargée, ni tourner.
 *
 * Logique pure — aucun accès DOM : testable sous node --test.
 */

import type { InstalledAddon } from './addons'

/** Capacités exposées au Core par les add-ons (spec §33). */
export type ZailonCapability =
  | 'discord.presence'
  | 'frosty.backend'
  | 'reshade.manager'
  | 'provider.nexus'
  | 'provider.gamebanana'
  | 'provider.curseforge'
  | 'cyberpunk.frameworks'
  | 'nte.modloader'
  | 'fivem.profiles'
  | 'importer.mo2'
  | 'importer.vortex'
  | 'importer.frosty'
  | 'steam.advanced'
  | 'artwork.plus'
  | 'themes.packs'
  | 'performance.plus'
  | 'ue.modding'

/** Mapping unique capacité → id d'add-on (spec §33 : jamais d'ID hardcodé dans les composants). */
export const CAPABILITY_ADDON: Record<ZailonCapability, string> = {
  'discord.presence': 'official.zailon.discord',
  'frosty.backend': 'official.zailon.frosty',
  'reshade.manager': 'official.zailon.reshade',
  'provider.nexus': 'official.zailon.provider.nexus',
  'provider.gamebanana': 'official.zailon.provider.gamebanana',
  'provider.curseforge': 'official.zailon.provider.curseforge',
  'cyberpunk.frameworks': 'official.zailon.game.cyberpunk',
  'nte.modloader': 'official.zailon.game.nte',
  'fivem.profiles': 'official.zailon.game.fivem',
  'importer.mo2': 'official.zailon.importer.mo2',
  'importer.vortex': 'official.zailon.importer.vortex',
  'importer.frosty': 'official.zailon.importer.frosty',
  'steam.advanced': 'official.zailon.steam-advanced',
  'artwork.plus': 'official.zailon.artwork',
  'themes.packs': 'official.zailon.themes',
  'performance.plus': 'official.zailon.performance',
  'ue.modding': 'official.zailon.ue',
}

/** Providers Explorer → add-on (spec §21-24, §46). */
export const PROVIDER_ADDON: Record<string, ZailonCapability> = {
  nexus: 'provider.nexus',
  gamebanana: 'provider.gamebanana',
  curseforge: 'provider.curseforge',
}

/**
 * Capacités actives dérivées des add-ons installés ET activés.
 * Un add-on désinstallé ou désactivé ne fournit aucune capacité (§10, §18).
 */
export function addonCapabilities(addons: InstalledAddon[]): Set<ZailonCapability> {
  const installed = new Set(addons.filter(item => item.enabled !== false).map(item => item.manifest.id))
  const capabilities = new Set<ZailonCapability>()
  for (const entry of Object.entries(CAPABILITY_ADDON) as Array<[ZailonCapability, string]>) {
    if (installed.has(entry[1])) capabilities.add(entry[0])
  }
  return capabilities
}

/** Vrai si la capacité est fournie par un add-on installé et activé. */
export function hasCapability(capabilities: Set<ZailonCapability> | readonly ZailonCapability[], capability: ZailonCapability): boolean {
  return capabilities instanceof Set ? capabilities.has(capability) : capabilities.includes(capability)
}

/** Id d'add-on requis pour une capacité — utile pour l'UI « Support disponible ». */
export function addonIdForCapability(capability: ZailonCapability): string {
  return CAPABILITY_ADDON[capability]
}

/** Vrai si l'add-on de la capacité manque (non installé ou désactivé). */
export function isCapabilityMissing(capabilities: Set<ZailonCapability>, capability: ZailonCapability): boolean {
  return !hasCapability(capabilities, capability)
}

/** Capacités manquantes parmi une liste demandée. */
export function missingCapabilities(capabilities: Set<ZailonCapability>, requested: ZailonCapability[]): ZailonCapability[] {
  return requested.filter(capability => isCapabilityMissing(capabilities, capability))
}

/** Toutes les capacités connues, pour l'inspection/diagnostic. */
export const ALL_ZAILON_CAPABILITIES: ZailonCapability[] = Object.keys(CAPABILITY_ADDON) as ZailonCapability[]
