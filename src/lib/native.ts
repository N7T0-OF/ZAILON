import { Channel, convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { UpdateChannel } from '../types'
import type { DownloadedModResult, ModImportCandidate, Profile, ProfileArchiveManifest, ProfileIntegrity, SecureImportResult, SensitiveImportAction } from '../types'

export interface ProfilePaths {
  directory: string
  manifestPath: string
  loadOrderPath: string
  settingsPath: string
  overwritePath: string
  generatedPath: string
  deploymentPath: string
}

export interface ProfileTransactionResult {
  operationId: string
  profilesWritten: number
  historyPath: string
}

export interface BaseSnapshotResult {
  path: string
  files: number
  changedFiles: number
  created: boolean
}

export interface NativeMod {
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
  storage: 'staged' | 'game-folder'
  stageId?: string
  profileIds: string[]
  deploymentStatus: 'imported' | 'stored' | 'validated' | 'enabled' | 'deployed' | 'runtime-visible' | 'loaded-by-game' | 'failed' | 'unknown'
  diagnostics: string[]
  quarantinePath?: string
}

export interface CyberpunkRepairMove {
  from: string
  to: string
}

export interface CyberpunkRepairItem {
  stageId: string
  name: string
  detectedFramework: string
  moves: CyberpunkRepairMove[]
  conflicts: string[]
  confidence: 'high' | 'medium' | 'low' | string
}

export interface CyberpunkRepairPreview {
  gameId: string
  packagesScanned: number
  filesAffected: number
  items: CyberpunkRepairItem[]
  warnings: string[]
}

export interface CyberpunkRepairResult {
  repairId: string
  snapshotPath: string
  packagesRepaired: number
  filesMoved: number
  diagnostics: string[]
}

export interface DetectedGame {
  name: string
  execPath: string
  modsPath: string
  platform: 'steam' | 'epic' | 'gog' | 'standalone'
  provider: string
  providerGameId?: string
  installDirectory: string
  steamLibrary?: string
  executableCandidates: DetectedExecutable[]
  sizeBytes?: number
  lastUpdated?: number
  buildId?: string
  needsExecutable: boolean
  itemKind: 'game' | 'software'
  confidence: 'high' | 'medium' | 'low'
  version?: string
  publisher?: string
  detectionSource: string
}

export interface DiscoveryProviderDiagnostic {
  provider: string
  status: 'ok' | 'warning' | 'unavailable'
  found: number
  detail: string
}

export interface DiscoveryScan {
  games: DetectedGame[]
  diagnostics: DiscoveryProviderDiagnostic[]
}

export type DiscoveryScanEvent =
  | { event: 'Stage'; data: { provider: string; detail: string } }
  | { event: 'Progress'; data: { current: number; total: number } }

export interface DetectedExecutable {
  path: string
  name: string
  sizeBytes: number
}

export interface SteamScanDiagnostics {
  steamPath: string
  libraries: string[]
  manifestsFound: number
  manifestErrors: number
  skippedNonGames: number
}

export interface SteamScan {
  games: DetectedGame[]
  diagnostics: SteamScanDiagnostics
}

export type SteamScanEvent =
  | { event: 'Stage'; data: { stage: string; detail: string } }
  | { event: 'Progress'; data: { current: number; total: number } }

export type GameResourceKind = 'cover' | 'logo' | 'icon' | 'background' | 'banner' | 'video'

export interface UpdateMetadata {
  version: string
  currentVersion: string
  date?: string
  notes?: string
}

export interface ProfileImportPreview {
  manifest: ProfileArchiveManifest
  archivePath: string
  embeddedFiles: number
  missingModNames: string[]
  warnings: string[]
}

export interface NxmRequest {
  requestId: string
  gameDomain: string
  modId: number
  fileId: number
  expires?: number
  userId?: number
}

export interface ShortcutLaunchRequest {
  rawUrl: string
  gameId: string
  profileId: string
}

export interface ProviderConnectionStatus {
  provider: 'nexus' | 'curseforge'
  configured: boolean
  connected: boolean
  maskedSecret?: string
  accountName?: string
  lastCheckedAt?: number
  hourlyRemaining?: number
  hourlyLimit?: number
  dailyRemaining?: number
  dailyLimit?: number
  message: string
}

export interface NexusCatalogGame {
  name: string
  domain: string
  modCount: number
  downloadCount: number
}

export interface NexusCatalogMod {
  id: string
  modId: number
  name: string
  author: string
  game: string
  gameDomain: string
  thumbnail: string
  downloads: number
  endorsements: number
  description: string
  version?: string
  updatedAt?: number
  nsfw: boolean
  url: string
}

export interface NexusPaginationMetadata {
  page: number
  pageSize: number
  totalResults: number
  totalPages: number
  loadedResultCount: number
  providerGameTotalMods?: number
  providerGameTotalCollections?: number
  hasPrevious: boolean
  hasNext: boolean
  totalIsExact: boolean
}

export interface NexusCatalogPage {
  results: NexusCatalogMod[]
  pagination: NexusPaginationMetadata
  source: 'nexus-graphql-v2' | string
  fetchedAt: number
}

export interface NexusAccountCapabilities {
  authenticated: boolean
  membershipTier: 'premium' | 'free' | 'unknown' | string
  supportsDirectDownloads?: boolean
  supportsAutomaticCollectionDownloads?: boolean
  downloadRateLimit?: string
  apiHourlyRemaining?: number
  apiHourlyLimit?: number
  apiDailyRemaining?: number
  apiDailyLimit?: number
  requiresManualDownloadConfirmation?: boolean
}

export interface NexusCollectionSummary {
  id: number
  slug: string
  name: string
  summary: string
  description: string
  author: string
  game: string
  gameDomain: string
  tileImage: string
  headerImage: string
  endorsements: number
  totalDownloads: number
  uniqueDownloads: number
  updatedAt?: number
  adult: boolean
  collectionSchemaId?: number
  recommendedManager: string
  compatibility: 'partial' | 'unsupported' | 'unknown' | string
  latestRevisionId?: number
  latestRevisionNumber?: number
  modCount: number
  totalSize: number
  gameVersions: string[]
  providerGameCollectionCount?: number
  url: string
}

export interface NexusCollectionPage {
  results: NexusCollectionSummary[]
  pagination: NexusPaginationMetadata
  source: 'nexus-graphql-v2-collections' | string
  fetchedAt: number
}

export interface NexusCollectionEntry {
  collectionEntryId: string
  nexusGameDomain: string
  modId: number
  fileId: number
  expectedVersion: string
  displayName: string
  fileName: string
  author: string
  required: boolean
  installOrder: number
  priority: number
  updatePolicy: string
  expectedSize?: number
  virusScanStatus: string
  sourceUrl: string
  status: 'Ready' | 'Queued' | 'WaitingForUser' | 'NxmReceived' | 'Downloaded' | 'Installed' | 'Unavailable' | string
  localPath?: string
}

export interface NexusExternalRequirement {
  id: number
  name: string
  author: string
  required: boolean
  resourceType: string
  resourceUrl?: string
  fileExpression: string
}

export interface NexusCollectionDetail {
  collection: NexusCollectionSummary
  revisionId: number
  revisionNumber: number
  revisionStatus: string
  collectionSchemaVersion: string
  modCount: number
  totalSize: number
  assetsSizeBytes: number
  temporaryBytes: number
  installationInfo: string
  adult: boolean
  gameVersions: string[]
  entries: NexusCollectionEntry[]
  externalRequirements: NexusExternalRequirement[]
  unsupportedInstructions: string[]
  warnings: string[]
}

export interface CollectionInstallPlan {
  schemaVersion: number
  installId: string
  collectionId: number
  collectionSlug: string
  collectionName: string
  revisionId: number
  revisionNumber: number
  gameId: string
  gameDomain: string
  profileId: string
  profileName: string
  profileState: string
  entries: NexusCollectionEntry[]
  externalRequirements: NexusExternalRequirement[]
  downloadBytes: number
  temporaryBytes: number
  finalAdditionalBytes: number
  accountCapabilities: NexusAccountCapabilities
  warnings: string[]
  createdAt: number
  updatedAt: number
  openNextRequiredPage: boolean
  automaticExecution: boolean
}

export interface PreparedCollectionInstall {
  plan: CollectionInstallPlan
  profile: Profile
  profilePaths: ProfilePaths
  planPath: string
}

export interface ArtworkCandidate {
  id: string
  provider: 'steam'
  sourceLabel: string
  gameName: string
  kind: GameResourceKind
  url: string
  width?: number
  height?: number
  attribution: string
}

export interface BackgroundTaskSnapshot {
  id: string
  kind: 'mod-scan' | 'mod-import' | string
  title: string
  status: 'running' | 'completed' | 'completed_with_warnings' | 'awaiting_user_decision' | 'failed' | 'cancelled' | 'interrupted'
  processed: number
  total: number
  message: string
  startedAt: number
  updatedAt: number
  error?: string
}

export type BackgroundTaskEvent = { event: 'Progress'; data: { task: BackgroundTaskSnapshot } }

export interface DiscordPresenceConfig {
  enabled: boolean
  clientId: string
  largeImageKey?: string
  showProfile: boolean
  showModCount: boolean
  showElapsed: boolean
}

export interface DiscordConnectionStatus {
  connected: boolean
  message: string
}

export interface LaunchGameResult {
  pid: number
  discordConnected: boolean
  discordMessage: string
  deploymentBackend: string
  deployedFiles: number
  conflictsResolved: number
  deploymentStatus: string
  diagnostics: string[]
}

export interface GameProcessEvent {
  pid: number
  gameId: string
  gameName: string
  profileId: string
  exitCode?: number
  cleanupError?: string
}

export type UpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

const desktopOnly = <T>(command: string, args?: Record<string, unknown>) => {
  if (!isTauri()) {
    return Promise.reject(new Error(`${command} is only available in the ZAILON desktop app.`)) as Promise<T>
  }
  return invoke<T>(command, args)
}

export const native = {
  isDesktop: () => isTauri(),
  scanMods: (modsPath: string) => desktopOnly<NativeMod[]>('scan_mods', { modsPath }),
  listStagedMods: (gameId: string) => desktopOnly<NativeMod[]>('list_staged_mods', { gameId }),
  scanModImport: (paths: string[], gameName: string) => desktopOnly<ModImportCandidate[]>('scan_mod_import', { paths, gameName }),
  scanModImportBackground: (taskId: string, paths: string[], gameName: string, onProgress: (task: BackgroundTaskSnapshot) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Background mod analysis is only available in the ZAILON desktop app.'))
    const channel = new Channel<BackgroundTaskEvent>()
    channel.onmessage = event => onProgress(event.data.task)
    return invoke<ModImportCandidate[]>('scan_mod_import_background', { taskId, paths, gameName, onEvent: channel })
  },
  toggleMod: (modPath: string, modsRoot: string, enable: boolean) => desktopOnly<string>('toggle_mod', { modPath, modsRoot, enable }),
  deleteMod: (modPath: string, modsRoot: string) => desktopOnly<void>('delete_mod', { modPath, modsRoot }),
  deleteStagedMod: (gameId: string, stageId: string) => desktopOnly<void>('delete_staged_mod', { gameId, stageId }),
  previewCyberpunkStructureRepair: (gameId: string) =>
    desktopOnly<CyberpunkRepairPreview>('preview_cyberpunk_structure_repair', { gameId }),
  applyCyberpunkStructureRepair: (gameId: string, stageIds: string[]) =>
    desktopOnly<CyberpunkRepairResult>('apply_cyberpunk_structure_repair', { gameId, stageIds }),
  rollbackCyberpunkStructureRepair: (gameId: string, repairId: string) =>
    desktopOnly<CyberpunkRepairResult>('rollback_cyberpunk_structure_repair', { gameId, repairId }),
  syncProfileState: (gameId: string, profile: Profile) => desktopOnly<ProfilePaths>('sync_profile_state', { gameId, profileId: profile.id, profile }),
  applyProfileTransaction: (gameId: string, operationId: string, beforeProfiles: Profile[], afterProfiles: Profile[]) =>
    desktopOnly<ProfileTransactionResult>('apply_profile_transaction', { gameId, operationId, beforeProfiles, afterProfiles }),
  profileIntegrity: (gameId: string, profileId: string) => desktopOnly<ProfileIntegrity>('profile_integrity', { gameId, profileId }),
  trashProfileState: (gameId: string, profileId: string) => desktopOnly<string>('trash_profile_state', { gameId, profileId }),
  initializeFiveMBase: (gameId: string, installDirectory: string) => desktopOnly<BaseSnapshotResult>('initialize_fivem_base', { gameId, installDirectory }),
  launchGame: (execPath: string, gameId: string, gameName: string, gameRoot: string, profileId: string, profileName: string, activeMods: number, enabledModIds: string[], conflictRules: Array<{ path: string; winnerModId: string }>, discord?: DiscordPresenceConfig) =>
    desktopOnly<LaunchGameResult>('launch_game', { execPath, gameId, gameName, gameRoot, profileId, profileName, activeMods, enabledModIds, conflictRules, discord }),
  testDiscordConnection: (clientId: string) => desktopOnly<DiscordConnectionStatus>('test_discord_connection', { clientId }),
  guessModsPath: (execPath: string) => desktopOnly<string>('guess_mods_path', { execPath }),
  scanSteamGames: (steamPath: string | undefined, onEvent: (event: SteamScanEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Steam detection is only available in the ZAILON desktop app.'))
    const channel = new Channel<SteamScanEvent>()
    channel.onmessage = onEvent
    return invoke<SteamScan>('scan_steam_games', { steamPath, onEvent: channel })
  },
  scanLibrary: (mode: 'quick' | 'full', onEvent: (event: DiscoveryScanEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('La détection locale est uniquement disponible dans l’application ZAILON.'))
    const channel = new Channel<DiscoveryScanEvent>()
    channel.onmessage = onEvent
    return invoke<DiscoveryScan>('scan_library', { mode, onEvent: channel })
  },
  installMod: (url: string, fileName: string, gameName: string, sensitiveAction: SensitiveImportAction = 'quarantine') =>
    desktopOnly<DownloadedModResult>('install_mod', { url, fileName, gameName, sensitiveAction }),
  exportProfile: (destination: string, manifest: ProfileArchiveManifest, complete: boolean, sources: Array<{ id: string; name: string; path: string }>) =>
    desktopOnly<string>('export_profile', { destination, manifest, complete, sources }),
  previewProfileImport: (archivePath: string) =>
    desktopOnly<ProfileImportPreview>('preview_profile_import', { archivePath }),
  extractProfileArchive: (archivePath: string, destination: string) =>
    desktopOnly<string[]>('extract_profile_archive', { archivePath, destination }),
  importModCandidates: (paths: string[], destination: string) =>
    desktopOnly<string[]>('import_mod_candidates', { paths, destination }),
  importModCandidatesBackground: (taskId: string, gameId: string, profileIds: string[], paths: string[], gameName: string, destination: string, deployNow: boolean, sensitiveAction: SensitiveImportAction, onProgress: (task: BackgroundTaskSnapshot) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Background mod import is only available in the ZAILON desktop app.'))
    const channel = new Channel<BackgroundTaskEvent>()
    channel.onmessage = event => onProgress(event.data.task)
    return invoke<SecureImportResult>('import_mod_candidates_background', { taskId, gameId, profileIds, paths, gameName, destination, deployNow, sensitiveAction, onEvent: channel })
  },
  backgroundTasks: () => desktopOnly<BackgroundTaskSnapshot[]>('background_tasks'),
  cancelBackgroundTask: (taskId: string) => desktopOnly<void>('cancel_background_task', { taskId }),
  setProviderSecret: (provider: 'nexus' | 'curseforge', secret: string) =>
    desktopOnly<ProviderConnectionStatus>('set_provider_secret', { provider, secret }),
  deleteProviderSecret: (provider: 'nexus' | 'curseforge') =>
    desktopOnly<ProviderConnectionStatus>('delete_provider_secret', { provider }),
  providerConnectionStatuses: () => desktopOnly<Record<string, ProviderConnectionStatus>>('provider_connection_statuses'),
  testProviderConnection: (provider: 'nexus' | 'curseforge') =>
    desktopOnly<ProviderConnectionStatus>('test_provider_connection', { provider }),
  nexusCatalogGames: () => desktopOnly<NexusCatalogGame[]>('nexus_catalog_games'),
  nexusAccountCapabilities: () => desktopOnly<NexusAccountCapabilities>('nexus_account_capabilities'),
  nexusCatalogMods: (gameDomain: string, query: string, sort: 'recent' | 'updated' | 'popular' | 'downloaded', page: number, pageSize: number, includeAdult: boolean) =>
    desktopOnly<NexusCatalogPage>('nexus_catalog_mods', { gameDomain, query, sort, page, pageSize, includeAdult }),
  nexusCatalogCollections: (gameDomain: string, query: string, sort: 'recent' | 'updated' | 'popular' | 'downloaded', page: number, pageSize: number, includeAdult: boolean) =>
    desktopOnly<NexusCollectionPage>('nexus_catalog_collections', { gameDomain, query, sort, page, pageSize, includeAdult }),
  nexusCollectionDetail: (gameDomain: string, slug: string, revision: number | undefined, includeAdult: boolean) =>
    desktopOnly<NexusCollectionDetail>('nexus_collection_detail', { gameDomain, slug, revision, includeAdult }),
  prepareNexusCollectionInstall: (gameId: string, installId: string, profile: Profile, gameDomain: string, slug: string, revision: number | undefined, includeAdult: boolean) =>
    desktopOnly<PreparedCollectionInstall>('prepare_nexus_collection_install', { gameId, installId, profile, gameDomain, slug, revision, includeAdult }),
  listCollectionInstallPlans: (gameId: string) =>
    desktopOnly<CollectionInstallPlan[]>('list_collection_install_plans', { gameId }),
  updateCollectionInstall: (gameId: string, installId: string, action: 'pause' | 'resume' | 'cancel') =>
    desktopOnly<CollectionInstallPlan>('update_collection_install', { gameId, installId, action }),
  startCollectionInstall: (gameId: string, installId: string) =>
    desktopOnly<CollectionInstallPlan>('start_collection_install', { gameId, installId }),
  setNxmAssociation: (enabled: boolean) => desktopOnly<boolean>('set_nxm_association', { enabled }),
  nxmAssociationStatus: () => desktopOnly<boolean>('nxm_association_status'),
  pendingExternalInstalls: () => desktopOnly<NxmRequest[]>('pending_external_installs'),
  consumeExternalInstall: (requestId: string) => desktopOnly<void>('consume_external_install', { requestId }),
  pendingShortcutLaunches: () => desktopOnly<ShortcutLaunchRequest[]>('pending_shortcut_launches'),
  consumeShortcutLaunch: (rawUrl: string) => desktopOnly<void>('consume_shortcut_launch', { rawUrl }),
  createDesktopShortcut: (gameId: string, profileId: string, gameName: string, iconPath?: string) =>
    desktopOnly<string>('create_desktop_shortcut', { gameId, profileId, gameName, iconPath }),
  storeGameResource: (gameId: string, kind: GameResourceKind, sourcePath: string) =>
    desktopOnly<string>('store_game_resource', { gameId, kind, sourcePath }),
  cacheRemoteGameResource: (gameId: string, kind: Exclude<GameResourceKind, 'video'>, sourceUrl: string) =>
    desktopOnly<string>('cache_remote_game_resource', { gameId, kind, sourceUrl }),
  searchGameArtwork: (gameName: string, provider: string | undefined, providerGameId: string | undefined, kind: Exclude<GameResourceKind, 'video'>) =>
    desktopOnly<ArtworkCandidate[]>('search_game_artwork', { gameName, provider, providerGameId, kind }),
  removeGameResource: (gameId: string, resourcePath: string) =>
    desktopOnly<void>('remove_game_resource', { gameId, resourcePath }),
  openPath: (path: string) => desktopOnly<void>('open_path', { path }),
  openExternalUrl: (url: string) => desktopOnly<void>('open_external_url', { url }),
  prepareUpdateBackup: (snapshot: string, currentVersion: string, targetVersion: string) =>
    desktopOnly<string>('prepare_update_backup', { snapshot, currentVersion, targetVersion }),
  recordUpdateEvent: (event: string, version: string, message?: string) =>
    desktopOnly<void>('record_update_event', { event, version, message }),
  openUpdateLog: () => desktopOnly<void>('open_update_log'),
  checkForUpdate: (channel: UpdateChannel) =>
    desktopOnly<UpdateMetadata | null>('check_for_update', { channel }),
  installUpdate: (onEvent: (event: UpdateDownloadEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Updates are only available in the ZAILON desktop app.'))
    const channel = new Channel<UpdateDownloadEvent>()
    channel.onmessage = onEvent
    return invoke<void>('install_update', { onEvent: channel })
  },
}

export async function pickExecutable() {
  if (!isTauri()) return null
  const selected = await open({
    title: 'Select a game executable',
    multiple: false,
    filters: [{ name: 'Executables', extensions: ['exe', 'app'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function pickFolder(title = 'Select the mods folder') {
  if (!isTauri()) return null
  const selected = await open({ title, directory: true, multiple: false })
  return typeof selected === 'string' ? selected : null
}

export async function pickFolders(title = 'Sélectionnez les dossiers de mods à importer') {
  if (!isTauri()) return []
  const selected = await open({ title, directory: true, multiple: true })
  return Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : []
}

export async function pickProfileArchive() {
  if (!isTauri()) return null
  const selected = await open({
    title: 'Importer un profil ZAILON',
    multiple: false,
    filters: [{ name: 'Profil ZAILON', extensions: ['zailon-profile'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function saveProfileArchive(defaultName: string) {
  if (!isTauri()) return null
  const selected = await save({
    title: 'Exporter le profil ZAILON',
    defaultPath: `${defaultName.replace(/[^a-z0-9_-]+/gi, '-')}.zailon-profile`,
    filters: [{ name: 'Profil ZAILON', extensions: ['zailon-profile'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function pickGameResource(kind: GameResourceKind) {
  if (!isTauri()) return null
  const isVideo = kind === 'video'
  const selected = await open({
    title: `Sélectionnez ${kind === 'background' ? 'un arrière-plan' : `une ressource ${kind}`}`,
    multiple: false,
    filters: [{ name: isVideo ? 'Vidéos' : 'Images', extensions: isVideo ? ['mp4', 'webm'] : ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export const resourceUrl = (path?: string) => path && (isTauri() ? convertFileSrc(path) : path)
