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
  | 'frosty.editor'
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
  | 'visual.profiles'
  | 'ue.modding'

/** Mapping unique capacité → id d'add-on (spec §33 : jamais d'ID hardcodé dans les composants). */
export const CAPABILITY_ADDON: Record<ZailonCapability, string> = {
  'discord.presence': 'official.zailon.discord',
  'frosty.backend': 'official.zailon.frosty',
  'frosty.editor': 'official.zailon.frosty-editor',
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
  'visual.profiles': 'official.zailon.visual-profiles',
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

/**
 * Gate de présence Discord (spec « Finalisation des add-ons » §57, feature
 * removal) : le Core ne publie JAMAIS sur l'IPC Discord sans l'add-on
 * installé ET activé (capacité `discord.presence`), même si le réglage
 * utilisateur est resté activé. Pur et testé (test-discord-feature-removal.ts).
 */
export function discordPresenceAllowed(capabilities: Set<ZailonCapability>, discordEnabled: boolean): boolean {
  return hasCapability(capabilities, 'discord.presence') && discordEnabled
}

/** Capacités manquantes parmi une liste demandée. */
export function missingCapabilities(capabilities: Set<ZailonCapability>, requested: ZailonCapability[]): ZailonCapability[] {
  return requested.filter(capability => isCapabilityMissing(capabilities, capability))
}

/**
 * Gate de la détection Steam avancée (spec « Finalisation des add-ons » §37,
 * feature removal §57) : la détection/import des jeux Steam (dialogue de
 * détection, scan) n'existe qu'avec l'add-on installé + activé (capacité
 * `steam.advanced`). Pur et testé (test-steam-advanced-addon.ts).
 */
export function steamAdvancedAllowed(capabilities: Set<ZailonCapability> | readonly ZailonCapability[]): boolean {
  return hasCapability(capabilities, 'steam.advanced')
}

/**
 * Gate des profils FiveM (spec « Finalisation des add-ons » §33, feature
 * removal §57) : le traitement FiveM client (bannière adaptateur, base
 * initialisée à l'import) n'existe qu'avec l'add-on installé + activé
 * (capacité `fivem.profiles`). L'adaptateur de lancement reste dans le Core.
 * Pur et testé (test-fivem-addon.ts).
 */
export function fiveMProfilesAllowed(capabilities: Set<ZailonCapability> | readonly ZailonCapability[]): boolean {
  return hasCapability(capabilities, 'fivem.profiles')
}

/**
 * Gate de l'import Mod Organizer 2 (spec « Finalisation des add-ons » §34,
 * feature removal §57) : le dialogue d'import MO2 et son action store
 * n'existent qu'avec l'add-on installé + activé (capacité `importer.mo2`).
 * Pur et testé (test-mo2-importer-addon.ts).
 */
export function mo2ImportAllowed(capabilities: Set<ZailonCapability> | readonly ZailonCapability[]): boolean {
  return hasCapability(capabilities, 'importer.mo2')
}

/**
 * Gate des packs de thèmes (spec « Finalisation des add-ons » §39, feature
 * removal §57) : la section « Packs de thèmes » des Paramètres (presets
 * accent + densité + taille de texte) n'existe qu'avec l'add-on installé +
 * activé (capacité `themes.packs`). Pur et testé (test-themes-addon.ts).
 */
export function themePacksAllowed(capabilities: Set<ZailonCapability> | readonly ZailonCapability[]): boolean {
  return hasCapability(capabilities, 'themes.packs')
}

/**
 * Gate du backend PAK NTE (spec « Finalisation des add-ons » §32, feature
 * removal §57) : la détection NTE PAK (.pak/.utoc/.ucas) de Neverness to
 * Everness n'existe qu'avec l'add-on installé + activé (capacité
 * `nte.modloader`). Pur et testé (test-nte-addon.ts).
 */
export function nteModsAllowed(capabilities: Set<ZailonCapability> | readonly ZailonCapability[]): boolean {
  return hasCapability(capabilities, 'nte.modloader')
}

/**
 * Gate des outils avancés Cyberpunk (spec « Finalisation des add-ons » §31,
 * feature removal §57) : les boutons de réparation (structure, MO2, RED4ext)
 * n'existent que pour un jeu Cyberpunk ET avec l'add-on installé + activé
 * (capacité `cyberpunk.frameworks`). Pur et testé
 * (test-cyberpunk-addon.ts).
 */
export function cyberpunkToolsAllowed(capabilities: Set<ZailonCapability> | readonly ZailonCapability[], isCyberpunkGame: boolean): boolean {
  return isCyberpunkGame && hasCapability(capabilities, 'cyberpunk.frameworks')
}

/** Toutes les capacités connues, pour l'inspection/diagnostic. */
export const ALL_ZAILON_CAPABILITIES: ZailonCapability[] = Object.keys(CAPABILITY_ADDON) as ZailonCapability[]
