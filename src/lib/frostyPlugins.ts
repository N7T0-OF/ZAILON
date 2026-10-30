/**
 * Frosty Editor — Plugin Manager interne (spec §40-43, §82-83).
 *
 * Distinction stricte :
 * - ZAILON Add-on  = extension du launcher (page Add-ons) ;
 * - Frosty Plugin  = extension du moteur/éditeur Frosty (cette page interne).
 *
 * Les plugins Frosty sont gérés ICI, jamais dans la page Add-ons (§42), et
 * chargés à la demande par type d'asset (§43) : TexturePlugin seulement quand
 * un asset texture est ouvert. Tous tournent dans le Worker isolé (§82).
 */

import { FROSTY_PLUGIN_INVENTORY, type FrostyPluginInfo } from './frostyEditor.ts'
import type { FrostyAssetType } from './frostyAssets.ts'

/** Types d'assets → plugins requis (spec §43). */
export const PLUGINS_BY_ASSET_TYPE: Record<FrostyAssetType, string[]> = {
  texture: ['TexturePlugin', 'AtlasTexturePlugin'],
  mesh: ['MeshSetPlugin', 'RefreshMeshVariationsPlugin', 'ObjectVariationPlugin'],
  audio: ['SoundEditorPlugin'],
  ebx: ['EbxToXmlPlugin', 'DuplicationPlugin', 'ReferencesPlugin', 'RootInstanceEntriesPlugin', 'TypeExplorerPlugin'],
  res: ['ChunkResExplorerPlugin', 'ChunkResEditorPlugin'],
  chunk: ['ChunkResExplorerPlugin', 'ChunkResEditorPlugin'],
}

/** État d'un plugin au sein de l'éditeur. */
export type FrostyPluginState = 'dormant' | 'loaded' | 'crashed' | 'disabled'

export interface FrostyPluginRuntime {
  name: string
  state: FrostyPluginState
  crashCount: number
  /** Dernier type d'asset qui a déclenché son chargement. */
  loadedFor?: FrostyAssetType
}

/** Registre complet avec l'inventaire de l'audit. */
export function frostyPluginRegistry(): FrostyPluginRuntime[] {
  return FROSTY_PLUGIN_INVENTORY
    .filter(plugin => plugin.category !== 'legacy')
    .map(plugin => ({ name: plugin.name, state: 'dormant' as const, crashCount: 0 }))
}

/** Plugins nécessaires à l'ouverture d'un asset de ce type (§43). */
export function pluginsForAssetType(type: FrostyAssetType, registry: FrostyPluginRuntime[]): string[] {
  const required = PLUGINS_BY_ASSET_TYPE[type]
  const available = new Set(registry.filter(p => p.state !== 'disabled').map(p => p.name))
  return required.filter(name => available.has(name))
}

/** Charge à la demande : marque les plugins du type comme `loaded`. */
export function loadPluginsForType(registry: FrostyPluginRuntime[], type: FrostyAssetType): FrostyPluginRuntime[] {
  const needed = PLUGINS_BY_ASSET_TYPE[type]
  return registry.map(plugin =>
    needed.includes(plugin.name) && plugin.state !== 'disabled'
      ? { ...plugin, state: 'loaded' as const, loadedFor: type }
      : plugin)
}

/** Un plugin a planté dans le Worker (spec §83) : 2 crashs → désactivé. */
export function pluginCrashed(registry: FrostyPluginRuntime[], name: string): FrostyPluginRuntime[] {
  return registry.map(plugin => {
    if (plugin.name !== name || plugin.state === 'disabled') return plugin
    const crashCount = plugin.crashCount + 1
    if (crashCount >= 2) return { ...plugin, state: 'disabled' as const, crashCount }
    return { ...plugin, state: 'crashed' as const, crashCount }
  })
}

/** Ferme un asset : libère les plugins qui n'étaient chargés que pour lui. */
export function releasePluginsForType(registry: FrostyPluginRuntime[], type: FrostyAssetType): FrostyPluginRuntime[] {
  const needed = new Set(PLUGINS_BY_ASSET_TYPE[type])
  return registry.map(plugin =>
    needed.has(plugin.name) && plugin.state === 'loaded' && plugin.loadedFor === type
      ? { ...plugin, state: 'dormant' as const, loadedFor: undefined }
      : plugin)
}

/** Réactive un plugin désactivé (spec §83 : « Réactiver »). */
export function enablePlugin(registry: FrostyPluginRuntime[], name: string): FrostyPluginRuntime[] {
  return registry.map(plugin =>
    plugin.name === name ? { ...plugin, state: 'dormant' as const, crashCount: 0 } : plugin)
}

/** Compteurs pour le diagnostic (§74). */
export function pluginStats(registry: FrostyPluginRuntime[]): { loaded: number; dormant: number; disabled: number; crashed: number } {
  const stats = { loaded: 0, dormant: 0, disabled: 0, crashed: 0 }
  for (const plugin of registry) stats[plugin.state] += 1
  return stats
}

/** Catégorise les plugins par rôle (utile pour l'UI §42). */
export function pluginCategory(name: string): FrostyPluginInfo['category'] {
  return FROSTY_PLUGIN_INVENTORY.find(p => p.name === name)?.category ?? 'utility'
}
