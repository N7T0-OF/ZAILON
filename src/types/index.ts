export type ViewType = 'home' | 'games' | 'explore' | 'downloads' | 'tools' | 'visuals' | 'news' | 'settings'
export type Platform = 'gamebanana' | 'nexus' | 'curseforge' | 'ayakamods'
export type UpdateChannel = 'stable' | 'beta'
export type DownloadRetention = 'startup' | '1d' | '7d' | 'never'
export type ModRuntimePathType = 'loader' | 'bypass' | 'plugins' | 'scripts' | 'custom'

export interface GameRuntimePath {
  name: string
  path: string
  type: ModRuntimePathType
}
export type TextSize = 'small' | 'normal' | 'large' | 'very-large'
export type UiDensity = 'compact' | 'comfortable'
export type ExploreColumns = '2' | '3'
export type ModCategorySource = 'detected' | 'metadata' | 'user'
export type ModCategoryConfidence = 'high' | 'medium' | 'low'

export interface ModCategoryTag {
  id: string
  label: string
  source: ModCategorySource
  confidence: ModCategoryConfidence
  userLocked?: boolean
}

export type GameTab = 'overview' | 'mods' | 'profiles' | 'downloads' | 'files' | 'conflicts' | 'tools' | 'visuals' | 'backups' | 'appearance' | 'settings' | 'commands' | 'configuration' | 'diagnostic'
export type GameKeyboardLayout = 'qwerty' | 'azerty' | 'qwertz' | 'custom'
export type GameInputActivation = 'while-playing' | 'on-launch'

export interface GameKeyMapping {
  /** Touche physique pressée (ex. 'Z'). */
  physical: string
  /** Touche envoyée au jeu (ex. 'W'). */
  gameKey: string
}

export interface GameInputProfile {
  id: string
  gameId: string
  /** Profil de mods cible ; absent = jeu entier. Priorité : profil mods > jeu > défaut. */
  profileId?: string
  name: string
  layout: GameKeyboardLayout
  mapping: GameKeyMapping[]
  enabled: boolean
  activationMode: GameInputActivation
  /** Restaurer les touches du bureau à la fermeture du jeu. */
  restoreOnExit: boolean
  createdAt: number
  updatedAt: number
}
export type LoaderType = 'GIMI' | 'ZZMI' | 'SRMI' | 'WWMI' | 'EFMI' | 'UE5' | 'BepInEx' | 'ASI' | 'CLEO' | 'REF' | 'MelonLoader' | 'DLL' | 'Archive' | 'Folder' | 'Manual'

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'unknown'
export type ModUpdateStatus = 'unknown' | 'checking' | 'up-to-date' | 'available' | 'downloaded' | 'manual' | 'error'
export type ModDeploymentStatus = 'downloaded' | 'imported' | 'stored' | 'validated' | 'enabled' | 'deployment-pending' | 'deployed' | 'runtime-visible' | 'loaded-by-game' | 'warning' | 'failed' | 'unknown'

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
  storage?: 'staged' | 'game-folder'
  stageId?: string
  profileIds?: string[]
  deploymentStatus?: ModDeploymentStatus
  diagnostics?: string[]
  quarantinePath?: string
  categoryTags?: ModCategoryTag[]
  /** Independent logical clone. Content stays immutable until a profile overlay is written. */
  basePackageId?: string
}

export interface ProfileModState {
  enabled: boolean
  priority: number
  note?: string
  /** Immutable package directory selected by this profile. */
  packageId?: string
  /** Provider or content-derived version identifier selected by this profile. */
  versionId?: string
  providerFileId?: string
  contentHash?: string
  sourceProvider?: string
}

export interface ModSeparator {
  name: string
  priority: number
}

export interface HiddenFileRule {
  modId: string
  path: string
  sourceConvention?: string
}

export interface ManagedExecutable {
  id: string
  name: string
  path: string
  source: string
  enabled: boolean
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
  stableSince?: number
  lastSuccessfulLaunch?: number
  isDefault?: boolean
  launchArgs?: string
  runtime?: string
  conflictRules?: Array<{ path: string; winnerModId: string }>
  installOptions?: Record<string, string | boolean | number>
  modSeparators?: ModSeparator[]
  hiddenFileRules?: HiddenFileRule[]
  clonedFromProfileId?: string
  templateId?: string
  temporary?: boolean
  directory?: string
  manifestPath?: string
  loadOrderPath?: string
  settingsPath?: string
  overwritePath?: string
  generatedPath?: string
  deploymentPath?: string
  installHistory?: Array<{ name: string; action: 'added' | 'updated'; at: number }>
  collectionState?: 'Preparing' | 'Downloading' | 'Installing' | 'NeedsAttention' | 'Ready' | 'Incomplete' | 'Failed' | 'Cancelled' | 'Paused'
  collectionMetadata?: {
    installId: string
    collectionId: number
    slug: string
    installedRevisionId?: number
    latestKnownRevisionId: number
    sourceGameDomain: string
    selections: string[]
    localOverrides: string[]
  }
}

export type BulkOperationKind = 'copy' | 'move' | 'delete' | 'enable' | 'disable' | 'tag'

export interface BulkOperation {
  id: string
  kind: BulkOperationKind
  gameId: string
  profileIds: string[]
  modIds: string[]
  createdAt: number
  label: string
  beforeProfiles: Profile[]
  afterProfiles: Profile[]
  beforeMods?: Mod[]
  afterMods?: Mod[]
  undoable: boolean
}

export interface ProfileIntegrity {
  ok: boolean
  root: string
  issues: string[]
  files: string[]
}

export interface UiNotification {
  id: string
  key: string
  message: string
  kind: 'success' | 'warning' | 'error' | 'info' | 'action'
  createdAt: number
  durationMs?: number
  dismissed?: boolean
  completed: boolean
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
  bypassPath?: string
  runtimePaths?: GameRuntimePath[]
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
  managedExecutables?: ManagedExecutable[]
  /** Disposition virtuelle du jeu (clavier), jamais appliquée à Windows. */
  keyboardLayout?: GameKeyboardLayout
  /** Profils d'entrée par jeu / profil de mods. */
  keyboardProfiles?: GameInputProfile[]
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
  sourcePath: string
  detectedRoot: string
  detectedFramework: string
  relativeGamePaths: string[]
  strippedSegments: string[]
  rootConfidence: MatchConfidence
  rootReason: string
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
  sensitiveFiles: SensitiveFileAssessment[]
  recognizedDestinations: string[]
}

export type SensitiveRiskLevel = 'Informational' | 'Caution' | 'HighRisk' | 'Blocked'
export type SensitiveImportAction = 'exclude' | 'quarantine' | 'inactive'

export interface SensitiveFileAssessment {
  relativePath: string
  detectedType: string
  extension: string
  magicType: string
  size: number
  hash: string
  signatureStatus: 'SignedValid' | 'SignedInvalid' | 'Unsigned' | 'Unknown'
  publisher?: string
  sourceProvider?: string
  sourceModId?: string
  expectedByManifest: boolean
  expectedByGameAdapter: boolean
  executionRequired: boolean
  installDestination: string
  riskLevel: SensitiveRiskLevel
  reasons: string[]
  recommendedAction: string
  decision?: string
  mayDeploy: boolean
}

export interface SecureImportResult {
  installedPaths: string[]
  status: 'Completed' | 'CompletedWithWarnings'
  warnings: string[]
  sensitiveFiles: SensitiveFileAssessment[]
  quarantinePaths: string[]
}

export interface DownloadedModResult {
  path: string
  status: 'Completed' | 'CompletedWithWarnings'
  warnings: string[]
  sensitiveFiles: SensitiveFileAssessment[]
  quarantinePath?: string
}

export interface RestorePoint {
  id: string
  gameId: string
  label: string
  source: 'manual' | 'auto'
  createdAt: number
  profiles: Array<Pick<Profile, 'id' | 'gameId' | 'name' | 'modStates' | 'playtime' | 'lastPlayed' | 'bypass' | 'createdAt' | 'lastUsed' | 'description' | 'color' | 'locked' | 'stableSince' | 'lastSuccessfulLaunch' | 'isDefault' | 'launchArgs' | 'runtime' | 'conflictRules' | 'installOptions' | 'modSeparators' | 'hiddenFileRules' | 'clonedFromProfileId' | 'templateId' | 'temporary' | 'collectionState' | 'collectionMetadata'>>
  keyboardProfiles?: GameInputProfile[]
  keyboardLayout?: GameKeyboardLayout
  selectedProfileId?: string
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
