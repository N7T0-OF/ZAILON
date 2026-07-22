import type { ExplodMod } from '../types'
import type { NexusCatalogMod } from './native'

export interface ProviderExplorerAdapter<T> {
  id: 'gamebanana' | 'nexus'
  label: string
  toResult: (item: T, fallbackGame?: string) => ExplodMod
}

export const GameBananaExplorerAdapter: ProviderExplorerAdapter<ExplodMod> = {
  id: 'gamebanana',
  label: 'GameBanana',
  toResult: item => item,
}

export const NexusExplorerAdapter: ProviderExplorerAdapter<NexusCatalogMod> = {
  id: 'nexus',
  label: 'Nexus Mods',
  toResult: (item, fallbackGame) => ({
    id: item.id,
    modId: item.modId,
    name: item.name,
    author: item.author || 'Auteur Nexus',
    game: item.game || fallbackGame || item.gameDomain,
    thumbnail: item.thumbnail,
    downloads: item.downloads,
    rating: item.endorsements,
    tags: item.version ? [`v${item.version}`] : ['Nexus Mods'],
    nsfw: item.nsfw,
    platform: 'nexus',
    url: item.url,
    description: item.description,
    updatedAt: item.updatedAt,
  }),
}
