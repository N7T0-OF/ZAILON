export type ViewType = 'home' | 'games' | 'explore' | 'news' | 'settings'
export type Platform = 'gamebanana' | 'nexus' | 'curseforge' | 'ayakamods'
export type UpdateChannel = 'stable' | 'beta'
export type LoaderType = 'GIMI' | 'ZZMI' | 'SRMI' | 'WWMI' | 'EFMI' | 'UE5' | 'BepInEx' | 'ASI' | 'CLEO' | 'REF' | 'MelonLoader' | 'DLL' | 'Archive' | 'Folder' | 'Manual'

export interface Mod {
  id: string
  name: string
  enabled: boolean
  loader: LoaderType
  version?: string
  author?: string
  source?: Platform | 'local'
  sourceUrl?: string
  autoUpdate: boolean
  thumbnail?: string
  nsfw?: boolean
  description?: string
  size?: string
  sizeBytes?: number
  path?: string
  installedAt?: number
  files?: string[]
  priority?: number
  note?: string
  conflict?: 'none' | 'overwrites' | 'overwritten' | 'mixed'
  conflictCount?: number
}

export interface Profile {
  id: string
  gameId: string
  name: string
  mods: Mod[]
  playtime: number
  lastPlayed?: number
  bypass?: string
}

export interface GameResources {
  coverPath?: string
  logoPath?: string
  iconPath?: string
  backgroundPath?: string
  bannerPath?: string
  videoPath?: string
  coverPositionX?: number
  coverPositionY?: number
  coverZoom?: number
  backgroundPositionX?: number
  backgroundPositionY?: number
  backgroundZoom?: number
}

export interface Game {
  id: string
  name: string
  shortName?: string
  icon?: string
  backgroundArt?: string
  execPath?: string
  modsPath?: string
  profiles: Profile[]
  totalPlaytime: number
  lastPlayed?: number
  platform?: 'steam' | 'epic' | 'gog' | 'standalone'
  detected?: boolean
  provider?: string
  providerGameId?: string
  installDirectory?: string
  steamLibrary?: string
  buildId?: string
  sizeBytes?: number
  lastProviderUpdate?: number
  needsExecutable?: boolean
  resources?: GameResources
  favorite?: boolean
  hidden?: boolean
  categories?: string[]
}

export interface ExplodMod {
  id: string
  name: string
  author: string
  game: string
  thumbnail: string
  downloads: number
  rating: number
  tags: string[]
  nsfw: boolean
  platform: Platform
  url: string
  description: string
  downloadUrl?: string
  fileName?: string
  modId?: number
}

export interface NewsItem {
  version: string
  date: string
  items: { type: 'add' | 'fix' | 'improve' | 'remove'; text: string }[]
}
