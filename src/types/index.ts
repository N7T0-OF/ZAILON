export type ViewType = 'home' | 'games' | 'explore' | 'downloads' | 'tools' | 'news' | 'settings'
export type Platform = 'gamebanana' | 'nexus' | 'curseforge' | 'ayakamods'
export type UpdateChannel = 'stable' | 'beta'
export type TextSize = 'small' | 'normal' | 'large' | 'very-large'
export type UiDensity = 'compact' | 'comfortable'
export type GameTab = 'overview' | 'mods' | 'profiles' | 'downloads' | 'conflicts' | 'tools' | 'backups' | 'appearance' | 'settings'
export type LoaderType = 'GIMI' | 'ZZMI' | 'SRMI' | 'WWMI' | 'EFMI' | 'UE5' | 'BepInEx' | 'ASI' | 'CLEO' | 'REF' | 'MelonLoader' | 'DLL' | 'Archive' | 'Folder' | 'Manual'

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'unknown'
export type ModUpdateStatus = 'unknown' | 'checking' | 'up-to-date' | 'available' | 'downloaded' | 'manual' | 'error'

export interface ExternalModReference {
  provider: Exclude<Platform, 'ayakamods'>
  gameDomain?: string
  modId: string
  fileId?: string
  installedVersion?: string
  sourceUrl: string
  confidence: MatchConfidence
  confirmedByUser: boolean
  matchedFrom?: 'manifest' | 'readme' | 'metadata' | 'fingerprint' | 'manual'
}

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
  fingerprint?: string
  framework?: string
  manifests?: string[]
  externalReferences?: ExternalModReference[]
  updateStatus?: ModUpdateStatus
  availableVersion?: string
  updateError?: string
}

export interface ProfileModState {
  enabled: boolean
  priority: number
  note?: string
  versionId?: string
}

export interface Profile {
  id: string
  gameId: string
  name: string
  /** Legacy v1 data. Removed automatically by the v3 migration. */
  mods?: Mod[]
  modStates: Record<string, ProfileModState>
  playtime: number
  lastPlayed?: number
  bypass?: string
  createdAt: number
  lastUsed?: number
  description?: string
  color?: string
  locked?: boolean
  isDefault?: boolean
  launchArgs?: string
  runtime?: string
  conflictRules?: Array<{ path: string; winnerModId: string }>
  installOptions?: Record<string, string | boolean | number>
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
  coverFit?: 'cover' | 'contain'
  backgroundPositionX?: number
  backgroundPositionY?: number
  backgroundZoom?: number
  backgroundFit?: 'cover' | 'contain'
  bannerPositionX?: number
  bannerPositionY?: number
  bannerZoom?: number
  bannerFit?: 'cover' | 'contain'
}

export interface Game {
  id: string
  name: string
  shortName?: string
  icon?: string
  backgroundArt?: string
  execPath?: string
  modsPath?: string
  installedMods: Mod[]
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
  itemKind?: 'game' | 'software'
  confidence?: 'high' | 'medium' | 'low'
  version?: string
  publisher?: string
  detectionSource?: string
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
  screenshots?: string[]
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
  updatedAt?: number
  category?: string
  gameId?: number
}

export interface GamebananaGame {
  id: number
  name: string
  image?: string
  itemCount?: number
  category?: string
  platform?: string
}

export type ExploreSort = 'recent' | 'updated' | 'popular' | 'downloaded'

export interface ModImportCandidate {
  id: string
  name: string
  path: string
  enabled: boolean
  modType: string
  sizeBytes: number
  files: string[]
  fingerprint: string
  framework: string
  manifests: string[]
  sourceUrl?: string
  version?: string
  confidence: MatchConfidence
  warnings: string[]
}

export interface ProfileArchiveManifest {
  schemaVersion: 1
  exportedAt: string
  app: 'ZAILON'
  appVersion: string
  exportMode: 'light' | 'complete'
  game: { name: string; provider?: string; providerGameId?: string }
  profile: Omit<Profile, 'mods'>
  mods: Array<Omit<Mod, 'path' | 'files'> & { files?: string[] }>
}

export interface NewsItem {
  version: string
  date: string
  items: { type: 'add' | 'fix' | 'improve' | 'remove'; text: string }[]
}
