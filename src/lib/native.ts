import { Channel, convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { UpdateChannel } from '../types'
import type { DownloadedModResult, ModImportCandidate, Profile, ProfileArchiveManifest, ProfileIntegrity, SecureImportResult, SensitiveImportAction } from '../types'
import type {
  VisualApplyResult,
  VisualBackendReport,
  VisualProfile,
  VisualProfileHistoryItem,
  VisualRestoreResult,
  VisualSafetyReport,
} from '../visual-profiles/domain/types'

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

export interface UpdateStateCounts {
  games: number
  profiles: number
  mods: number
}

export interface UpdateIntegrityReport {
  ok: boolean
  backupPath: string
  before: UpdateStateCounts
  current: UpdateStateCounts
  issues: string[]
}

export interface Mo2ProfilePreview {
  name: string
  modCount: number
  enabledCount: number
  disabledCount: number
  separatorCount: number
}

export interface Mo2ExecutablePreview {
  title: string
  binaryPresent: boolean
}

export interface Mo2ImportPreview {
  root: string
  version?: string
  installType: string
  gameName?: string
  selectedProfile?: string
  profiles: Mo2ProfilePreview[]
  executables: Mo2ExecutablePreview[]
  installedMods: number
  downloads: number
  overwriteFiles: number
  overwriteBytes: number
  pluginFiles: number
  hiddenFiles: number
  secretKeysDetected: number
  requiredBytes: number
  warnings: string[]
}

export interface Mo2ProfileMapping {
  sourceName: string
  targetId: string
  targetName: string
}

export interface Mo2ImportOptions {
  mods: boolean
  metadata: boolean
  overwrite: boolean
  downloads: boolean
  executables: boolean
  categories: boolean
  notes: boolean
  hiddenFiles: boolean
}

export interface Mo2ImportRequest {
  sourcePath: string
  gameId: string
  gameName: string
  profiles: Mo2ProfileMapping[]
  options: Mo2ImportOptions
}

export interface Mo2ImportResult {
  profiles: Profile[]
  installedPaths: string[]
  managedExecutables: Array<{ id: string; name: string; path: string; source: string; enabled: boolean }>
  importedMods: number
  skippedMods: number
  copiedDownloads: number
  overwriteFiles: number
  reportPath: string
  snapshotPath: string
  sourceUnchanged: boolean
  warnings: string[]
}

export interface PackageReferenceStatus {
  profileId: string
  packageId: string
  packageDirectory: string
  exists: boolean
  manifestExists: boolean
  filesExist: boolean
  sourceStillAvailable: boolean
  normalized: boolean
  deployable: boolean
  fileCount: number
  versionId?: string
  contentHash?: string
  expectedVersionId?: string
  expectedContentHash?: string
  identityMatches: boolean
  errors: string[]
}

export interface FrameworkProviderStatus {
  frameworkId: string
  packageId: string
  files: string[]
  enabled: boolean
  runtimeVisible: boolean
}

export interface VirtualFileMapEntry {
  gameRelativePath: string
  packageId: string
  sourcePhysicalPath: string
  hash: string
  size: number
  overriddenPackageIds: string[]
  winnerReason: string
}

export interface ProfileDeploymentAudit {
  gameId: string
  profileId: string
  referencedPackages: number
  accessiblePackages: number
  brokenReferences: number
  manifestedFiles: number
  virtualFileCount: number
  conflicts: number
  deployable: boolean
  packages: PackageReferenceStatus[]
  providers: FrameworkProviderStatus[]
  virtualFiles: VirtualFileMapEntry[]
  diagnostics: string[]
}

export interface StagedImportRepairReport {
  stage_id: string;
  name: string;
  repaired: boolean;
  files_before: number;
  files_after: number;
  layout: string;
  backup_path: string | null;
  error: string | null;
}

export interface Mo2DeploymentRepairResult {
  repairId: string
  packagesAudited: number
  packagesRestaged: number
  manifestsRebuilt: number
  normalizedFiles: number
  virtualFileCount: number
  brokenReferences: number
  providers: FrameworkProviderStatus[]
  snapshotPath: string
  reportPath: string
  deployable: boolean
  diagnostics: string[]
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

export interface StagedDuplicateGroup {
  canonicalId: string
  duplicateIds: string[]
  name: string
  reclaimableBytes: number
}

export interface StagedDuplicatePreview {
  gameId: string
  packagesScanned: number
  duplicatePackages: number
  reclaimableBytes: number
  groups: StagedDuplicateGroup[]
}

export interface StagedDedupReplacement {
  duplicateId: string
  canonicalId: string
}

export interface StagedDedupResult {
  gameId: string
  removedPackages: number
  reclaimedBytes: number
  replacements: StagedDedupReplacement[]
  warnings: string[]
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

export interface NexusModGallery {
  images: string[]
  source: string
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
  unsupportedInstructions: string[]
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

export interface CollectionStagingResult {
  plan: CollectionInstallPlan
  profile: Profile
  installedPaths: string[]
  warnings: string[]
}

export interface ArtworkCandidate {
  id: string
  /** Identifiant du fournisseur qui a produit l'image (ex. `steam`, `steamgriddb`). */
  provider: string
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

/** Événements du pipeline d'installation d'add-on (spec §14-15). */
export type AddonInstallEvent =
  | { event: 'Started'; data: { total: number } }
  | { event: 'Progress'; data: { received: number } }
  | { event: 'Finished'; data: Record<string, never> }

export interface DiscordPresenceConfig {
  enabled: boolean
  clientId: string
  largeImageKey?: string
  showProfile: boolean
  showModCount: boolean
  showElapsed: boolean
  /** State pré-construit par le frontend (spec Discord §25, §60) — prioritaire
   * sur le template natif : variantes de wording, anti-« 0 mods » incertain,
   * apps non-jeux, mode minimal. */
  stateOverride?: string
  /** Début réel de session (epoch secondes) — préservé après un redémarrage de
   * ZAILON pendant un jeu (spec §14, §95) : le timer Discord ne repart pas à
   * zéro après recovery. */
  startTimestampOverride?: number
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

export interface DeploymentProgressEvent {
  phase: string
  current: number
  total: number
  message: string
}

export interface GameProcessEvent {
  pid: number
  gameId: string
  gameName: string
  profileId: string
  exitCode?: number
  cleanupError?: string
}

export interface GameProcessDetectedEvent {
  gameId: string
  gameName: string
  processName: string
  processPath?: string
  confidence?: number
  profileId?: string
}

export interface GamePresenceRequest {
  gameId: string
  installRoot?: string
  launcherExecutable?: string
  /** Launchers intermédiaires connus (ex. `ntegloballauncher.exe` pour NTE) :
   * stage valide (+15) mais jamais le processus final. */
  launcherExecutableCandidates?: string[]
  gameExecutableCandidates: string[]
  reattachContext: boolean
  /** Signatures apprises (spec NTE §7 / #36) : nom + chemin relatif du
   * processus final confirmé lors d'un lancement précédent. */
  learnedSignatures?: LearnedProcessSignature[]
  /** Steam indique que l'AppID du jeu est « En cours » (registre RunningAppID,
   * spec UAC §5-6) → +20 au score. Preuve indépendante du chemin : fonctionne
   * même quand un processus élevé refuse de révéler son chemin. */
  steamRunning?: boolean
  /** Emplacements profonds connus du processus final sous l'installation (ex.
   * `Client/WindowsNoEditor/HT/Binaries/Win64` pour NTE) → +50 : le nom de
   * l'exécutable n'est plus requis (spec UAC §6). */
  gamePathPatterns?: string[]
}

/** Signature de processus apprise par installation (cache versionné). */
export interface LearnedProcessSignature {
  filename: string
  relativePath?: string
  publisher?: string
}

export interface GamePresence {
  gameId: string
  pid: number
  processName: string
  processPath: string
  score: number
  matchedExecutable?: string
  /** Vrai si le processus est un launcher intermédiaire connu (jamais le jeu
   * final). Utilisé pour la fin de session : un launcher encore ouvert ne doit
   * pas maintenir « En cours » (spec RuntimeSessionV3 §2). */
  isLauncherProcess?: boolean
}

/** État réel de la fenêtre du panneau rapide (spec Quick Panel §22, §50) —
 * jamais une fausse activation : chaque champ est interrogé côté natif. */
export interface QuickPanelStatus {
  created: boolean
  visible: boolean
  focused: boolean
  alwaysOnTop: boolean
  width: number
  height: number
  position?: [number, number]
}

export interface SteamRunningState {
  steam_running: boolean
  running_app_ids: number[]
}

export interface GameWindowRequest {
  gameId: string
  installRoot?: string
  gameExecutableCandidates: string[]
  titlePatterns: string[]
  reattachContext: boolean
}

export interface GameWindowMatch {
  gameId: string
  pid: number
  title: string
  className: string
  score: number
  /** Vrai si la fenêtre du jeu est au premier plan (priorité multi-sessions). */
  foreground: boolean
  matchedTitlePattern?: string
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
  visualProfiles: {
    backendReport: () => desktopOnly<VisualBackendReport>('visual_backend_report'),
    list: () => desktopOnly<VisualProfile[]>('list_visual_profiles'),
    save: (profile: VisualProfile) => desktopOnly<string>('save_visual_profile', { profile }),
    delete: (profileId: string) => desktopOnly<void>('delete_visual_profile', { profileId }),
    history: (profileId: string) => desktopOnly<VisualProfileHistoryItem[]>('visual_profile_history', { profileId }),
    restoreVersion: (profileId: string, fileName: string) =>
      desktopOnly<VisualProfile>('restore_visual_profile_version', { profileId, fileName }),
    readVersion: (profileId: string, fileName: string) =>
      desktopOnly<VisualProfile>('read_visual_profile_version', { profileId, fileName }),
    deleteVersion: (profileId: string, fileName: string) =>
      desktopOnly<void>('delete_visual_profile_version', { profileId, fileName }),
    export: (profileId: string, destination: string) =>
      desktopOnly<string>('export_visual_profile', { profileId, destination }),
    import: (source: string) => desktopOnly<VisualProfile>('import_visual_profile', { source }),
    apply: (profileId: string, monitorId?: string) =>
      desktopOnly<VisualApplyResult>('apply_visual_profile', { profileId, monitorId }),
    preview: (profile: VisualProfile, monitorId?: string) =>
      desktopOnly<VisualApplyResult>('preview_visual_profile', { profile, monitorId }),
    confirm: (confirmationToken: string) =>
      desktopOnly<void>('confirm_visual_profile', { confirmationToken }),
    restore: (monitorId?: string) =>
      desktopOnly<VisualRestoreResult>('restore_visual_state', { monitorId }),
    setAssociation: (gameId: string, zailonProfileId: string | undefined, visualProfileId: string | undefined) =>
      desktopOnly<void>('set_visual_profile_association', { gameId, zailonProfileId, visualProfileId }),
    association: (gameId: string, zailonProfileId?: string) =>
      desktopOnly<string | null>('visual_profile_association', { gameId, zailonProfileId }),
    shortcutAction: (action: 'restore' | 'toggle' | 'previous' | 'next') =>
      desktopOnly<string>('visual_shortcut_action', { action }),
    safetyReport: (gameId: string, gameName: string, gameRoot: string | undefined, backendId: string) =>
      desktopOnly<VisualSafetyReport>('visual_safety_report', { gameId, gameName, gameRoot, backendId }),
    openWindowsSettings: (kind: 'display' | 'hdr' | 'night-light' | 'accessibility' | 'color-management') =>
      desktopOnly<void>('open_visual_windows_settings', { kind }),
  },
  scanMods: (modsPath: string) => desktopOnly<NativeMod[]>('scan_mods', { modsPath }),
  // Add-ons (spec §14-15, §65) : téléchargement HTTPS + SHA-256 + installation
  // atomique avec rollback — jamais d'écrasement direct.
  addonDownload: (url: string, destPath: string, onProgress: (received: number, total: number) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Add-on download requires the ZAILON desktop app.'))
    const channel = new Channel<AddonInstallEvent>()
    channel.onmessage = event => {
      if (event.event === 'Started') onProgress(0, event.data.total)
      else if (event.event === 'Progress') onProgress(event.data.received, 0)
    }
    return invoke<void>('addon_download', { url, destPath, onEvent: channel })
  },
  addonVerifySha256: (path: string, expected: string) => desktopOnly<boolean>('addon_verify_sha256', { path, expected }),
  addonInstallStaged: (archivePath: string, installDir: string) => desktopOnly<void>('addon_install_staged', { archivePath, installDir }),
  addonInstallDir: () => desktopOnly<string>('addon_install_dir'),
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
  previewStagedDuplicates: (gameId: string) =>
    desktopOnly<StagedDuplicatePreview>('preview_staged_duplicates', { gameId }),
  deduplicateStagedMods: (gameId: string) =>
    desktopOnly<StagedDedupResult>('deduplicate_staged_mods', { gameId }),
  previewCyberpunkStructureRepair: (gameId: string) =>
    desktopOnly<CyberpunkRepairPreview>('preview_cyberpunk_structure_repair', { gameId }),
  applyCyberpunkStructureRepair: (gameId: string, stageIds: string[]) =>
    desktopOnly<CyberpunkRepairResult>('apply_cyberpunk_structure_repair', { gameId, stageIds }),
  rollbackCyberpunkStructureRepair: (gameId: string, repairId: string) =>
    desktopOnly<CyberpunkRepairResult>('rollback_cyberpunk_structure_repair', { gameId, repairId }),
  previewMo2Import: (sourcePath: string) =>
    desktopOnly<Mo2ImportPreview>('preview_mo2_import', { sourcePath }),
  importMo2Instance: (taskId: string, request: Mo2ImportRequest) =>
    desktopOnly<Mo2ImportResult>('import_mo2_instance', { taskId, request }),
  auditProfileDeployment: (gameId: string, profileId: string, enabledModIds: string[], conflictRules: Array<{ path: string; winnerModId: string }>, gameRoot?: string) =>
    desktopOnly<ProfileDeploymentAudit>('audit_profile_deployment', { gameId, profileId, enabledModIds, conflictRules, gameRoot }),
  repairMo2ProfileDeployment: (gameId: string, profileId: string, sourcePath: string, gameName: string, enabledModIds: string[], conflictRules: Array<{ path: string; winnerModId: string }>, gameRoot?: string) =>
    desktopOnly<Mo2DeploymentRepairResult>('repair_mo2_profile_deployment', { gameId, profileId, sourcePath, gameName, enabledModIds, conflictRules, gameRoot }),
  repairStagedImports: (gameId: string, gameName: string, stageIds: string[]) =>
    desktopOnly<StagedImportRepairReport[]>('repair_staged_imports', { gameId, gameName, stageIds }),
  syncProfileState: (gameId: string, profile: Profile) => desktopOnly<ProfilePaths>('sync_profile_state', { gameId, profileId: profile.id, profile }),
  applyProfileTransaction: (gameId: string, operationId: string, beforeProfiles: Profile[], afterProfiles: Profile[]) =>
    desktopOnly<ProfileTransactionResult>('apply_profile_transaction', { gameId, operationId, beforeProfiles, afterProfiles }),
  profileIntegrity: (gameId: string, profileId: string) => desktopOnly<ProfileIntegrity>('profile_integrity', { gameId, profileId }),
  trashProfileState: (gameId: string, profileId: string) => desktopOnly<string>('trash_profile_state', { gameId, profileId }),
  initializeFiveMBase: (gameId: string, installDirectory: string) => desktopOnly<BaseSnapshotResult>('initialize_fivem_base', { gameId, installDirectory }),
  scanGamePresence: (requests: GamePresenceRequest[]) => desktopOnly<GamePresence[]>('scan_game_presence', { requests }),
  /** Présence Steam (clé de registre RunningAppID, lecture seule) : preuve
   * supplémentaire du GamePresenceEngine — Steam n'est jamais la seule source. */
  steamRunningState: (appIds: number[]) => desktopOnly<SteamRunningState>('steam_running_state', { appIds }),
  /** Watcher de fenêtres : la fenêtre principale du jeu est une preuve de
   * présence indépendante de l'arbre des processus (survit aux launchers,
   * UAC et relances). */
  scanGameWindows: (requests: GameWindowRequest[]) => desktopOnly<GameWindowMatch[]>('scan_game_windows', { requests }),
  /** Plein écran exclusif : vrai si la fenêtre au premier plan a commuté le
   * mode d'affichage (le Quick Panel ne peut pas s'afficher au-dessus).
   * Heuristique documentée — un exclusif à la résolution du bureau n'est pas
   * détectable par cette seule preuve. */
  exclusiveFullscreenActive: () => desktopOnly<boolean>('exclusive_fullscreen_active', {}),
  /** Quick Game Panel : fenêtre native ZAILON pendant le jeu (jamais une
   * injection). Ouverte au raccourci, fermée à la perte de focus. */
  quickPanel: {
    open: () => desktopOnly<void>('open_quick_panel', {}),
    close: () => desktopOnly<void>('close_quick_panel', {}),
    toggle: () => desktopOnly<boolean>('toggle_quick_panel', {}),
    /** État réel de la fenêtre (spec §22, §50) : créée, visible, focus,
     * always-on-top, taille, position — jamais une fausse activation. */
    status: () => desktopOnly<QuickPanelStatus>('quick_panel_status', {}),
  },

  launchGame: (execPath: string, gameId: string, gameName: string, gameRoot: string, profileId: string, profileName: string, activeMods: number, enabledModIds: string[], conflictRules: Array<{ path: string; winnerModId: string }>, launcherBased: boolean, onProgress: (event: DeploymentProgressEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Le lancement est uniquement disponible dans l’application ZAILON.'))
    const channel = new Channel<DeploymentProgressEvent>()
    channel.onmessage = onProgress
    return invoke<LaunchGameResult>('launch_game', { execPath, gameId, gameName, gameRoot, profileId, profileName, activeMods, enabledModIds, conflictRules, launcherBased, onEvent: channel })
  },
  /** Restaure tout déploiement temporaire restant d'un jeu (fin de session
   * explicite). Pour un jeu lancé via un launcher intermédiaire, le déploiement
   * reste actif après la fermeture du launcher — il est restauré ici, à la fin
   * réelle de la session, et au plus tard par la récupération du lancement
   * suivant. Retourne le nombre de sessions restaurées. */
  restoreDeploymentSession: (gameId: string, gameRoot: string) =>
    desktopOnly<number>('restore_deployment_session', { gameId, gameRoot }),
  testDiscordConnection: (clientId: string) => desktopOnly<DiscordConnectionStatus>('test_discord_connection', { clientId }),
  /** Recalcule la Rich Presence vers la session prioritaire (multi-sessions) :
   * publiée si une session est prioritaire et la présence activée, arrêtée
   * sinon. Config absente = arrêter. */
  setDiscordActivityFor: (activity: { gameName: string; profileName: string; activeMods: number; config?: DiscordPresenceConfig }) =>
    desktopOnly<DiscordConnectionStatus>('set_discord_activity_for', {
      gameName: activity.gameName,
      profileName: activity.profileName,
      activeMods: activity.activeMods,
      config: activity.config ?? null,
    }),
  clearDiscordActivity: () => desktopOnly<DiscordConnectionStatus>('clear_discord_activity_for', {}),
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
  nexusModGallery: (gameDomain: string, modId: number) =>
    desktopOnly<NexusModGallery>('nexus_mod_gallery', { gameDomain, modId }),
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
  installCollectionDownloads: (gameId: string, installId: string, gameName: string) =>
    desktopOnly<CollectionStagingResult>('install_collection_downloads', { gameId, installId, gameName }),
  setNxmAssociation: (enabled: boolean) => desktopOnly<boolean>('set_nxm_association', { enabled }),
  nxmAssociationStatus: () => desktopOnly<boolean>('nxm_association_status'),
  pendingExternalInstalls: () => desktopOnly<NxmRequest[]>('pending_external_installs'),
  consumeExternalInstall: (requestId: string) => desktopOnly<void>('consume_external_install', { requestId }),
  pendingShortcutLaunches: () => desktopOnly<ShortcutLaunchRequest[]>('pending_shortcut_launches'),
  consumeShortcutLaunch: (rawUrl: string) => desktopOnly<void>('consume_shortcut_launch', { rawUrl }),
  /** Crée un raccourci bureau .lnk/.desktop/.webloc qui lance ZAILON avec l'URI
   * zailon:// (profil, mods, session, clavier, visuel conservés). L'icône est
   * résolue côté natif : personnalisée (ico/exe/dll/png) → exécutable du jeu
   * (icône native) → icône ZAILON en dernier recours. */
  createDesktopShortcut: (gameId: string, profileId: string, gameName: string, iconPath?: string, execPath?: string) =>
    desktopOnly<string>('create_desktop_shortcut', { gameId, profileId, gameName, iconPath, execPath }),
  storeGameResource: (gameId: string, kind: GameResourceKind, sourcePath: string) =>
    desktopOnly<string>('store_game_resource', { gameId, kind, sourcePath }),
  cacheRemoteGameResource: (gameId: string, kind: Exclude<GameResourceKind, 'video'>, sourceUrl: string) =>
    desktopOnly<string>('cache_remote_game_resource', { gameId, kind, sourceUrl }),
  /** Recherche multi-source : Steam officiel toujours, + chaque fournisseur
   * dont une clé est fournie dans `apiKeys` (ex. `steamgriddb`). Les résultats
   * sont fusionnés et dédupliqués côté natif dans une seule liste. */
  searchGameArtwork: (gameName: string, provider: string | undefined, providerGameId: string | undefined, kind: Exclude<GameResourceKind, 'video'>, apiKeys?: Record<string, string>) =>
    desktopOnly<ArtworkCandidate[]>('search_game_artwork', { gameName, provider, providerGameId, kind, apiKeys }),
  /** Teste la connexion d'un fournisseur d'illustrations (SteamGridDB : clé ;
   * IGDB : Client ID + Secret Twitch ; GameBanana : API publique).
   * Retourne un message lisible ; rejette en cas de connexion invalide. */
  testArtworkProvider: (provider: 'steamgriddb' | 'igdb' | 'gamebanana', apiKeys: Record<string, string>) =>
    desktopOnly<string>('test_artwork_provider', { provider, apiKeys }),
  removeGameResource: (gameId: string, resourcePath: string) =>
    desktopOnly<void>('remove_game_resource', { gameId, resourcePath }),
  openPath: (path: string) => desktopOnly<void>('open_path', { path }),
  openExternalUrl: (url: string) => desktopOnly<void>('open_external_url', { url }),
  prepareUpdateBackup: (snapshot: string, currentVersion: string, targetVersion: string) =>
    desktopOnly<string>('prepare_update_backup', { snapshot, currentVersion, targetVersion }),
  verifyUpdateState: (snapshot: string, currentVersion: string) =>
    desktopOnly<UpdateIntegrityReport>('verify_update_state', { snapshot, currentVersion }),
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
