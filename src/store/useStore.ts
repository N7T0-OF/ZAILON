import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BulkOperation, DownloadRetention, ExplodMod, ExploreColumns, ExploreSort, Game, GameInputProfile, GameKeyboardLayout, GamePreset, GameProcessSignature, GameResources, GameRuntimePath, GameSession, GameTab, GameTestRun, GamebananaGame, LoaderType, Mod, MotionMode, Platform, Profile, ProfileArchiveManifest, ProfileIntegrity, ProfileModState, RestorePoint, SessionSource, TextSize, UiDensity, UiNotification, UpdateChannel, ViewType } from '../types'
import { BackgroundTaskSnapshot, DeploymentProgressEvent, DetectedGame, Mo2ImportResult, native, NativeMod, NexusCollectionDetail, pickExecutable } from '../lib/native'
import { adapterFor, FALLBACK_ADAPTER, isLauncherBased } from '../lib/launchAdapters'
import { fetchGamebananaDownload, fetchGamebananaMods, GAMEBANANA_GAMES, searchGamebananaGames } from './gamebanana'
import { createUserTag, withInferredTags } from '../lib/modCategories'
import { validateFrameworkHierarchy } from '../lib/frameworkHierarchy'
import { mergeModCatalogs, reconcileModStates } from '../lib/profileState'
import { arbitrateInputProfiles, pickPrioritySession, recoveryKind } from '../lib/sessionPriority'
import { compareFrameworkSets, fingerprintFrameworkSet, hasFrameworkChanges, type FrameworkSnapshot } from '../lib/lastKnownGood'
import { effectivePerformance, type DownloadPolicy, type PerformanceMode, type ScanPolicy, type ZailonPerformancePolicies } from '../lib/performanceProfiles'
import { enabledCountFromState, isSilentClear, repairReport } from '../lib/profileConsistency'
import { createDebouncer } from '../lib/persistDebounce'

// Sauvegarde debounced des réglages continus (spec §17) : le color picker
// d'accent n'écrit pas sur disque à chaque pixel — coalescence 250 ms, flush
// forcé à la fermeture via `flushPendingSettings` (App.tsx, beforeunload).
const accentDebouncer = createDebouncer((value: string) => {
  useStore.setState({ accentColor: value })
}, 250)
import { evaluateSessionEnd } from '../lib/sessionEnd'

const APP_VERSION = '1.50.0'
const loaderTypes = new Set<LoaderType>(['GIMI', 'ZZMI', 'SRMI', 'WWMI', 'EFMI', 'UE5', 'BepInEx', 'ASI', 'CLEO', 'REF', 'MelonLoader', 'DLL', 'Archive', 'Folder', 'Manual'])
const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
/** Instant du démarrage du store : sert à distinguer « Jeu détecté par ZAILON »
 * (récupération en cours d'utilisation) de « Session récupérée » (jeu déjà
 * lancé quand ZAILON redémarre, spec §24) — fenêtre de 20 s. */
const STORE_BOOTED_AT = Date.now()
const RECOVERY_GRACE_MS = 20_000
/** Jeu dont le profil visuel a été appliqué par ZAILON (arbitrage multi-apps) :
 * permet de restaurer l'état système quand la session prioritaire change sans
 * association (jamais de profil d'un autre jeu laissé actif). Non persisté. */
let lastVisualAppliedGameId: string | undefined
const asError = (error: unknown) => error instanceof Error ? error.message : String(error)
const gameNameFromPath = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'New game'
const normalizedPath = (path?: string) => (path || '').trim().replace(/\//g, '\\').toLocaleLowerCase()
const formatBytes = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(size >= 100 * 1024 * 1024 ? 0 : 1)} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`
let exploreCatalogController: AbortController | undefined
let exploreGameController: AbortController | undefined
let exploreCatalogRequest = 0
let exploreGameRequest = 0

const nativeModToMod = (mod: NativeMod, previous?: Mod, priority = 0): Mod => withInferredTags({
  id: previous?.id ?? mod.id,
  name: mod.name,
  path: mod.path,
  enabled: mod.enabled,
  loader: loaderTypes.has(mod.modType as LoaderType) ? mod.modType as LoaderType : 'Manual',
  autoUpdate: false,
  source: 'local',
  sizeBytes: mod.sizeBytes,
  size: formatBytes(mod.sizeBytes),
  files: mod.files,
  priority: previous?.priority ?? priority,
  note: previous?.note,
  fingerprint: mod.fingerprint,
  framework: mod.framework,
  manifests: mod.manifests,
  version: mod.version ?? previous?.version,
  sourceUrl: mod.sourceUrl ?? previous?.sourceUrl,
  storage: mod.storage,
  stageId: mod.stageId,
  profileIds: mod.profileIds,
  deploymentStatus: mod.deploymentStatus,
  diagnostics: mod.diagnostics,
  quarantinePath: mod.quarantinePath,
})

const withProfilePaths = (profile: Profile, paths: Awaited<ReturnType<typeof native.syncProfileState>>): Profile => ({
  ...profile,
  directory: paths.directory,
  manifestPath: paths.manifestPath,
  loadOrderPath: paths.loadOrderPath,
  settingsPath: paths.settingsPath,
  overwritePath: paths.overwritePath,
  generatedPath: paths.generatedPath,
  deploymentPath: paths.deploymentPath,
})

async function persistProfileTransaction(gameId: string, operationId: string, beforeProfiles: Profile[], afterProfiles: Profile[], opts: { explicitDisableAll?: boolean; allowEmpty?: boolean } = {}) {
  // Invariant anti-« 0 mods silencieux » (spec Fiabilité profils §8) : une
  // transaction qui ferait passer un profil de > 0 à 0 actifs SANS être une
  // désactivation massive explicite ou une suppression explicite est rejetée
  // AVANT toute écriture — le profil ne peut plus être vidé par un bug ou un
  // cache vide. Les opérations légitimes (bulkSetEnabled sur tous les actifs,
  // suppression de tous les mods, restauration volontaire) passent le flag.
  for (const before of beforeProfiles) {
    const after = afterProfiles.find(candidate => candidate.id === before.id)
    if (!after) continue
    if (isSilentClear(enabledCountFromState(before), enabledCountFromState(after), opts)) {
      throw new Error('Une modification anormale du profil a été détectée et annulée. La désactivation massive n’est possible que via « Désactiver » sur la sélection complète.')
    }
  }
  if (!native.isDesktop()) return afterProfiles
  await native.applyProfileTransaction(gameId, operationId, beforeProfiles, afterProfiles)
  return Promise.all(afterProfiles.map(async profile => withProfilePaths(profile, await native.syncProfileState(gameId, profile))))
}

const cloneProfile = (profile: Profile): Profile => JSON.parse(JSON.stringify(profile)) as Profile
const cloneMods = (mods: Mod[]): Mod[] => JSON.parse(JSON.stringify(mods)) as Mod[]

function replaceProfiles(game: Game, replacements: Profile[]) {
  const byId = new Map(replacements.map(profile => [profile.id, profile]))
  return { ...game, profiles: game.profiles.map(profile => byId.get(profile.id) || profile) }
}

function decorateMods(mods: Mod[]): Mod[] {
  const ordered = [...mods]
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
    .map((mod, priority) => ({ ...mod, priority, conflict: 'none' as const, conflictCount: 0 }))
  const owners = new Map<string, number[]>()
  ordered.forEach((mod, index) => {
    if (!mod.enabled) return
    for (const file of mod.files || []) {
      const normalized = file.replace(/\\/g, '/').toLocaleLowerCase()
      const list = owners.get(normalized) || []
      list.push(index)
      owners.set(normalized, list)
    }
  })
  const overwritten = new Set<number>()
  const overwrites = new Set<number>()
  const counts = new Map<number, number>()
  for (const indices of owners.values()) {
    if (indices.length < 2) continue
    indices.forEach((index, ownerPosition) => {
      counts.set(index, (counts.get(index) || 0) + 1)
      if (ownerPosition === 0) overwritten.add(index)
      else if (ownerPosition === indices.length - 1) overwrites.add(index)
      else { overwritten.add(index); overwrites.add(index) }
    })
  }
  return ordered.map((mod, index) => {
    const conflict: NonNullable<Mod['conflict']> = overwritten.has(index) && overwrites.has(index) ? 'mixed' : overwritten.has(index) ? 'overwritten' : overwrites.has(index) ? 'overwrites' : 'none'
    return { ...mod, conflictCount: counts.get(index) || 0, conflict }
  })
}

function scannedMods(nativeMods: NativeMod[], previous: Mod[]) {
  const byPath = new Map(previous.filter(mod => mod.path).map(mod => [normalizedPath(mod.path), mod]))
  const byName = new Map(previous.map(mod => [mod.name.toLocaleLowerCase(), mod]))
  return decorateMods(nativeMods.map((mod, index) => nativeModToMod(mod, byPath.get(normalizedPath(mod.path)) || byName.get(mod.name.toLocaleLowerCase()), index)))
}

function exactProfileModState(mod: Mod, priority: number, previous?: ProfileModState): ProfileModState {
  const providerReference = mod.externalReferences?.find(reference => reference.confirmedByUser || reference.confidence === 'exact')
    || mod.externalReferences?.[0]
  const contentHash = /^[0-9a-f]{64}$/i.test(mod.fingerprint || '') ? mod.fingerprint : undefined
  return {
    enabled: previous?.enabled ?? mod.enabled,
    priority: previous?.priority ?? mod.priority ?? priority,
    note: previous?.note ?? mod.note,
    packageId: previous?.packageId || mod.stageId || mod.id,
    versionId: previous?.versionId || mod.version || contentHash,
    providerFileId: previous?.providerFileId || providerReference?.fileId,
    contentHash: previous?.contentHash || contentHash,
    sourceProvider: previous?.sourceProvider || providerReference?.provider || mod.source,
  }
}

function statesFromMods(mods: Mod[]): Record<string, ProfileModState> {
  return Object.fromEntries(mods.map((mod, index) => [mod.id, exactProfileModState(mod, index)]))
}

function withExactProfileReferences(profile: Profile, catalog: Mod[]): Profile {
  const byId = new Map(catalog.map(mod => [mod.id, mod]))
  const byPackageId = new Map(catalog.flatMap(mod => (mod.stageId ? [[mod.stageId, mod] as const] : [])))
  return {
    ...profile,
    modStates: Object.fromEntries(Object.entries(profile.modStates || {}).map(([stateId, state], index) => {
      const mod = byId.get(stateId) || (state.packageId ? byPackageId.get(state.packageId) : undefined)
      return [stateId, mod ? exactProfileModState(mod, index, state) : state]
    })),
  }
}

export function resolveProfileMods(game?: Game, profile?: Profile): Mod[] {
  if (!game || !profile) return []
  // Source de vérité unique (spec « compteur de mods fiable ») : union de la
  // liste installée et des références du profil (anciens imports MO2, ids
  // ré-importés). Une liste stale ne doit jamais faire disparaître des mods
  // réellement référencés → le compteur ne peut plus afficher 0 alors que le
  // déploiement contient des mods.
  const catalog = mergeModCatalogs(game.installedMods || [], profile.mods || [])
  const states = profile.modStates || {}
  // Réconciliation (migration de réparation) : les clés de modStates sans
  // entrée de catalogue (ids ré-importés, cache périmé) reçoivent un
  // enregistrement minimal — le profil n'affiche jamais 0 par erreur.
  const reconciled = reconcileModStates(catalog, states)
  return decorateMods(reconciled.map((mod, index) => {
    const state = profile.modStates?.[mod.id]
    return {
      ...mod,
      enabled: state?.enabled ?? (mod.storage === 'staged' ? false : mod.enabled),
      priority: state?.priority ?? mod.priority ?? index,
      note: state?.note ?? mod.note,
    }
  }))
}

function withProfileStates(profile: Profile, mods: Mod[]): Profile {
  return { ...profile, mods: undefined, modStates: statesFromMods(mods) }
}

function updateProfile(games: Game[], gameId: string, profileId: string, update: (profile: Profile) => Profile) {
  return games.map(game => game.id !== gameId ? game : {
    ...game,
    profiles: game.profiles.map(profile => profile.id === profileId ? update(profile) : profile),
  })
}

function selected(state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) {
  const game = state.games.find(item => item.id === state.selectedGameId)
  const profile = game?.profiles.find(item => item.id === state.selectedProfileId) ?? game?.profiles[0]
  return { game, profile }
}

function makeGame({ name, execPath, modsPath, platform = 'standalone', provider, providerGameId, installDirectory, steamLibrary, buildId, sizeBytes, lastUpdated, needsExecutable, itemKind, confidence, version, publisher, detectionSource }: {
  name: string
  execPath: string
  modsPath: string
  platform?: Game['platform']
  provider?: string
  providerGameId?: string
  installDirectory?: string
  steamLibrary?: string
  buildId?: string
  sizeBytes?: number
  lastUpdated?: number
  needsExecutable?: boolean
  itemKind?: Game['itemKind']
  confidence?: Game['confidence']
  version?: string
  publisher?: string
  detectionSource?: string
}): Game {
  const gameId = createId()
  const profile: Profile = {
    id: createId(), gameId, name: 'Default', modStates: {}, playtime: 0,
    createdAt: Date.now(), isDefault: true,
  }
  return {
    id: gameId,
    name,
    execPath,
    modsPath,
    installedMods: [],
    profiles: [profile],
    totalPlaytime: 0,
    platform,
    detected: Boolean(detectionSource) || platform !== 'standalone',
    provider,
    providerGameId,
    installDirectory,
    steamLibrary,
    buildId,
    sizeBytes,
    lastProviderUpdate: lastUpdated,
    needsExecutable,
    itemKind,
    confidence,
    version,
    publisher,
    detectionSource,
  }
}

async function automaticArtworkForGame(game: Game, artworkKeys: { steamGridDbKey: string; igdbClientId: string; igdbClientSecret: string }): Promise<Partial<GameResources>> {
  if (!native.isDesktop()) return {}
  const assignments: Array<{ kind: 'cover' | 'background' | 'banner' | 'logo' | 'icon'; key: 'coverPath' | 'backgroundPath' | 'bannerPath' | 'logoPath' | 'iconPath' }> = [
    { kind: 'cover', key: 'coverPath' },
    { kind: 'background', key: 'backgroundPath' },
    { kind: 'banner', key: 'bannerPath' },
    { kind: 'logo', key: 'logoPath' },
    { kind: 'icon', key: 'iconPath' },
  ]
  const apiKeys: Record<string, string> = {}
  if (artworkKeys.steamGridDbKey.trim()) apiKeys.steamgriddb = artworkKeys.steamGridDbKey.trim()
  if (artworkKeys.igdbClientId.trim()) apiKeys.igdbClientId = artworkKeys.igdbClientId.trim()
  if (artworkKeys.igdbClientSecret.trim()) apiKeys.igdbClientSecret = artworkKeys.igdbClientSecret.trim()
  const resources: Partial<GameResources> = {}
  for (const assignment of assignments) {
    try {
      const candidates = await native.searchGameArtwork(game.name, game.provider || game.platform, game.providerGameId, assignment.kind, apiKeys)
      // L'auto-artwork privilégie l'art officiel Steam ; les autres sources
      // ne servent que si Steam ne fournit rien pour cet emplacement.
      const ordered = candidates.filter(candidate => candidate.provider === 'steam').concat(candidates.filter(candidate => candidate.provider !== 'steam'))
      for (const candidate of ordered) {
        try {
          resources[assignment.key] = await native.cacheRemoteGameResource(game.id, assignment.kind, candidate.url)
          break
        } catch { /* essayer le candidat suivant */ }
      }
    } catch { /* aucun résultat fiable pour cet emplacement */ }
  }
  return resources
}

export interface Store {
  currentView: ViewType
  activeGameTab: GameTab
  games: Game[]
  selectedGameId?: string
  selectedProfileId?: string
  nsfw: boolean
  hideUnclassifiedNsfw: boolean
  language: string
  textSize: TextSize
  uiDensity: UiDensity
  /** Mode d'animation global : auto (suit le système) / activées / réduites. */
  motionMode: MotionMode
  /** Effet 3D des couvertures (parallaxe subtil, spec §12). */
  coverParallax: boolean
  /** Profil Performance par jeu (spec §5-10, §23) : id du jeu → mode. */
  performanceModes: Record<string, PerformanceMode>
  /** Personnalisation du mode custom par jeu (spec §10, §23). */
  performanceCustom: Record<string, Partial<ZailonPerformancePolicies>>
  /** Mode Performance global par défaut (spec §40). */
  globalPerformanceMode: PerformanceMode
  /** Comportement sur batterie (spec §40, §34). */
  batteryPerformanceBehavior: 'economy' | 'balanced'
  /** Activité runtime dérivée des sessions (spec §11-13, §36) : les politiques
   * effectives des profils Performance — recalculée à chaque changement de
   * session ; jamais persistée, rien ne reste bloqué à la fermeture. */
  runtimeActivity: { downloads: DownloadPolicy; scans: ScanPolicy }
  autoArtwork: boolean
  /** Clé API SteamGridDB (illustrations). Stockée localement, transmise
   * uniquement à SteamGridDB — jamais à un autre fournisseur. */
  artworkSteamGridDbKey: string
  /** Client ID de l'application Twitch pour IGDB (illustrations). */
  artworkIgdbClientId: string
  /** Client Secret de l'application Twitch pour IGDB — jamais affiché. */
  artworkIgdbClientSecret: string
  /** Mode de recherche d'illustrations : première source fiable ou toutes les
   * sources disponibles (spec « Refonte Apparence » §1-2). */
  artworkSourceMode: 'automatic' | 'all'
  discordPresence: boolean
  discordClientId: string
  discordLargeImageKey: string
  discordShowProfile: boolean
  discordShowModCount: boolean
  discordShowElapsed: boolean
  autoCheckUpdates: boolean
  autoInstallUpdates: boolean
  modUpdateFrequency: 'never' | 'startup' | 'daily' | 'weekly'
  autoDownloadModUpdates: boolean
  autoInstallModUpdates: boolean
  updateChannel: UpdateChannel
  lastUpdateCheck?: number
  lastUpdateVersion?: string
  lastUpdateError?: string
  lastInstalledUpdate?: { version: string; notes?: string; date?: string; previousVersion?: string; installedAt: number }
  lastSeenReleaseNotesVersion?: string
  showReleaseNotesOnUpdate: boolean
  isLaunching: boolean
  launchProgress?: DeploymentProgressEvent
  isPlaying: boolean
  playStartTime?: number
  sessionTime: number
  explorePlatform: Platform
  exploreGameId: number
  exploreGames: GamebananaGame[]
  exploreGameQuery: string
  explorePinnedGames: GamebananaGame[]
  exploreRecentGames: GamebananaGame[]
  exploreSearch: string
  explorePage: number
  exploreHasNextPage: boolean
  exploreSort: ExploreSort
  exploreGrid: boolean
  exploreColumns: ExploreColumns
  exploreMods: ExplodMod[]
  exploreLoading: boolean
  exploreError?: string
  exploreGamesLoading: boolean
  exploreGameError?: string
  backgroundTasks: BackgroundTaskSnapshot[]
  taskToastsEnabled: boolean
  taskAutoReduceImports: boolean
  libraryViewMode: 'grid' | 'illustrated' | 'compact'
  /** Mode de la Bibliothèque (refonte « vitrine Steam ») : `true` = grille de
   * couvertures plein écran, `false` = page du jeu (hero + onglets). État de
   * session, non persisté — la grille garde recherche/filtre/scroll au retour. */
  gamesBrowsing: boolean
  activityMaxEvents: number
  downloadRetention: DownloadRetention
  remapSuspendShortcut: string
  remapKillSwitchShortcut: string
  quickPanelEnabled: boolean
  quickPanelShortcut: string
  reduceActivityDuringGame: boolean
  autoMinimizeOnGameStart: boolean
  restoreAfterGame: boolean
  reduceExplanations: boolean
  advancedMode: boolean
  showSupportButton: boolean
  autoAttachGames: string[]
  accentColor: string
  bulkHistory: BulkOperation[]
  notificationHistory: UiNotification[]
  notice?: string
  setView: (view: ViewType) => void
  setActiveGameTab: (tab: GameTab) => void
  setSelectedGame: (gameId: string) => void
  setSelectedProfile: (profileId: string) => Promise<void>
  addGameFromExecutable: () => Promise<void>
  addDetectedGames: () => Promise<number>
  importDetectedGames: (detected: DetectedGame[]) => number
  removeGame: (gameId: string) => void
  setGamePath: (gameId: string, execPath: string) => Promise<void>
  setModsPath: (gameId: string, modsPath: string) => void
  setGameBypassPath: (gameId: string, path: string) => void
  addGameRuntimePath: (gameId: string, path: GameRuntimePath) => void
  updateGameRuntimePath: (gameId: string, index: number, path: Partial<GameRuntimePath>) => void
  removeGameRuntimePath: (gameId: string, index: number) => void
  saveGamePreset: (gameId: string, preset: GamePreset) => void
  deleteGamePreset: (gameId: string, presetId: string) => void
  recordGameTestRun: (gameId: string, run: GameTestRun) => void
  clearGameTestRuns: (gameId: string) => void
  applyGamePreset: (gameId: string, presetId: string) => Promise<void>
  setGameResources: (gameId: string, resources: Partial<GameResources>) => void
  setGameFavorite: (gameId: string, favorite?: boolean) => void
  setGameHidden: (gameId: string, hidden?: boolean) => void
  setGameCategories: (gameId: string, categories: string[]) => void
  setGameKeyboardLayout: (gameId: string, layout: GameKeyboardLayout) => void
  saveGameInputProfile: (profile: GameInputProfile) => void
  deleteGameInputProfile: (gameId: string, profileId: string) => void
  restorePoints: RestorePoint[]
  autoRestorePoints: boolean
  createRestorePoint: (label: string, source?: 'manual' | 'auto') => void
  restoreRestorePoint: (gameId: string, pointId: string) => void
  deleteRestorePoint: (gameId: string, pointId: string) => void
  setAutoRestorePoints: (value: boolean) => void
  addProfile: (name: string) => void
  prepareCollectionProfile: (collection: NexusCollectionDetail, name: string, includeAdult: boolean) => Promise<string | undefined>
  installCollectionDownloads: (gameId: string, installId: string, gameName: string) => Promise<boolean>
  duplicateProfile: (profileId: string) => void
  importProfileManifest: (manifest: ProfileArchiveManifest) => void
  renameProfile: (profileId: string, name: string) => void
  removeProfile: (profileId: string) => void
  registerImportedStages: (gameId: string, profileId: string, installedPaths: string[], enabled: boolean) => Promise<void>
  completeMo2Import: (gameId: string, result: Mo2ImportResult) => Promise<void>
  scanMods: (gameId?: string) => Promise<void>
  /** Re-scan staged au démarrage (spec Fiabilité profils §9-10) : le catalogue
   * installé est réconcilié avec le store staged réel pour qu'un cache vide
   * persisté ne fasse jamais afficher « 0 mods » à un profil qui possède des
   * références. Toast « Profil restauré automatiquement » si réparation. */
  refreshStagedCatalogs: () => Promise<void>
  toggleMod: (modId: string) => Promise<void>
  deleteMod: (modId: string) => Promise<void>
  moveMod: (modId: string, direction: -1 | 1) => void
  setModNote: (modId: string, note: string) => void
  setConflictWinner: (path: string, modId: string) => void
  toggleNSFW: () => void
  setHideUnclassifiedNsfw: (enabled: boolean) => void
  setLanguage: (language: string) => void
  setTextSize: (size: TextSize) => void
  setUiDensity: (density: UiDensity) => void
  setMotionMode: (mode: MotionMode) => void
  setCoverParallax: (enabled: boolean) => void
  setPerformanceMode: (gameId: string, mode: PerformanceMode) => void
  setPerformanceCustom: (gameId: string, policies: Partial<ZailonPerformancePolicies>) => void
  setGlobalPerformanceMode: (mode: PerformanceMode) => void
  setBatteryPerformanceBehavior: (behavior: 'economy' | 'balanced') => void
  reconcileRuntimeActivity: () => void
  setAutoArtwork: (enabled: boolean) => void
  setArtworkSteamGridDbKey: (value: string) => void
  setArtworkIgdbClientId: (value: string) => void
  setArtworkIgdbClientSecret: (value: string) => void
  setArtworkSourceMode: (mode: 'automatic' | 'all') => void
  toggleDiscord: () => void
  setDiscordClientId: (value: string) => void
  setDiscordLargeImageKey: (value: string) => void
  setDiscordShowProfile: (enabled: boolean) => void
  setDiscordShowModCount: (enabled: boolean) => void
  setDiscordShowElapsed: (enabled: boolean) => void
  setAutoCheckUpdates: (enabled: boolean) => void
  setAutoInstallUpdates: (enabled: boolean) => void
  setModUpdateFrequency: (frequency: Store['modUpdateFrequency']) => void
  setAutoDownloadModUpdates: (enabled: boolean) => void
  setAutoInstallModUpdates: (enabled: boolean) => void
  setUpdateChannel: (channel: UpdateChannel) => void
  recordUpdateCheck: (version?: string, error?: string) => void
  prepareInstalledUpdate: (update: { version: string; notes?: string; date?: string }) => void
  dismissInstalledUpdate: () => void
  setLastSeenReleaseNotes: (version: string) => void
  setShowReleaseNotesOnUpdate: (enabled: boolean) => void
  launchSelectedGame: (options?: { withoutMods?: boolean }) => Promise<void>
  stopPlaying: (gameId?: string, profileId?: string, cleanupError?: string) => void
  tick: () => void
  gameSessions: GameSession[]
  /** Session prioritaire épinglée (spec multi-sessions) : `undefined` = automatique. */
  pinnedPriorityGameId?: string
  setPinnedPriority: (gameId?: string) => void
  /** Session dont la fenêtre est au premier plan (watcher de fenêtres natif). */
  foregroundGameId?: string
  setForegroundGame: (gameId?: string) => void
  /** Toast « jeu en cours » (spec « Correctif NTE » §21-24) : affiché quand le
   * processus final est détecté — jamais au lancement du launcher intermédiaire.
   * `started` = lancé par ZAILON · `detected` = récupéré hors ZAILON ·
   * `recovered` = session reprise après redémarrage de ZAILON ·
   * `ended` = session terminée (spec RuntimeSessionV3 §52). */
  sessionToast?: { kind: 'started' | 'detected' | 'recovered' | 'ended'; gameName: string; at: number; detail?: string }
  setSessionToast: (toast?: { kind: 'started' | 'detected' | 'recovered' | 'ended'; gameName: string; at: number; detail?: string }) => void
  /** Rapport de présence du PROCESSUS FINAL pour une session en cours (spec
   * RuntimeSessionV3 §1-5). `present=false` ouvre la période PossibleExit ; si
   * elle expire sans preuve, la session se termine réellement. Le launcher
   * seul ne compte JAMAIS comme présence du jeu. */
  sessionPresenceReport: (gameId: string, present: boolean, evidence?: string[]) => void
  /** Empreinte des frameworks au dernier lancement réussi, par jeu (spec
   * « Last Known Good » §41) — `undefined` = aucune référence encore. */
  lastKnownGoodFrameworks?: Record<string, FrameworkSnapshot | undefined>
  /** Enregistre l'empreinte actuelle des frameworks du profil actif du jeu. */
  recordLastKnownGoodFrameworks: (gameId: string) => void
  /** Verrouille/déverrouille les frameworks d'un profil (spec §42). */
  setLockFrameworks: (gameId: string, profileId: string, locked: boolean) => void
  /** Signatures de processus final apprises par installation (spec NTE §7 / #36). */
  gameProcessSignatures?: Record<string, GameProcessSignature | undefined>
  /** Apprend la signature d'un processus final confirmé (confiance ≥ 80). */
  learnGameProcessSignature: (gameId: string, filename: string, relativePath?: string, publisher?: string) => void
  /** Recalcule la Rich Presence vers la session prioritaire (spec
   * multi-sessions §14) : une seule activité publiée, celle de la session
   * prioritaire — appelé à chaque changement de priorité. */
  syncDiscordPresence: () => void
  /** Arbitrage des Visual Profiles (spec multi-sessions §9) : UN seul profil au
   * premier plan — appliqué pour la session prioritaire en cours (association),
   * restauré sinon. Recalcule aussi les indicateurs `visualProfileActive`. */
  syncVisualProfiles: () => Promise<void>
  cancelSession: (gameId: string) => void
  applyInputArbiter: () => void
  beginSession: (gameId: string, profileId: string, source?: SessionSource) => void
  onGameProcessStopped: (payload: { gameId: string; profileId?: string; cleanupError?: string; processName?: string }) => void
  sessionLauncherExited: (gameId: string, processName?: string) => void
  sessionGameDetected: (gameId: string, processName: string, confidence?: number, evidence?: string[]) => void
  attachDetectedGame: (gameId: string, processName: string, confidence?: number, evidence?: string[]) => void
  attachGameSession: (gameId: string, profileId: string, processName?: string) => void
  prepareAndWait: (gameId: string, profileId: string) => void
  continueWaiting: (gameId: string) => void
  endSession: (gameId: string, reason?: string) => void
  sessionWatchdog: (steamAppIds?: number[]) => void
  setExplorePlatform: (platform: Platform) => void
  setExploreGame: (gameId: number) => void
  setExploreGameQuery: (query: string) => void
  searchExploreGames: () => Promise<void>
  pinExploreGame: (game: GamebananaGame) => void
  setExploreSearch: (search: string) => void
  setExplorePage: (page: number) => void
  setExploreSort: (sort: ExploreSort) => void
  setExploreGrid: (grid: boolean) => void
  setExploreColumns: (columns: ExploreColumns) => void
  refreshExplore: () => Promise<void>
  installMod: (mod: ExplodMod, target?: { gameId: string; profileId: string }) => Promise<void>
  replaceBackgroundTasks: (tasks: BackgroundTaskSnapshot[]) => void
  upsertBackgroundTask: (task: BackgroundTaskSnapshot) => void
  setTaskToastsEnabled: (enabled: boolean) => void
  setTaskAutoReduceImports: (enabled: boolean) => void
  setLibraryViewMode: (mode: Store['libraryViewMode']) => void
  setGamesBrowsing: (browsing: boolean) => void
  setActivityMaxEvents: (count: number) => void
  setDownloadRetention: (retention: DownloadRetention) => void
  setRemapSuspendShortcut: (shortcut: string) => void
  setRemapKillSwitchShortcut: (shortcut: string) => void
  setQuickPanelEnabled: (enabled: boolean) => void
  setQuickPanelShortcut: (shortcut: string) => void
  setReduceActivityDuringGame: (enabled: boolean) => void
  setAutoMinimizeOnGameStart: (enabled: boolean) => void
  setRestoreAfterGame: (enabled: boolean) => void
  setSessionInputActive: (gameId: string, active: boolean) => void
  setReduceExplanations: (enabled: boolean) => void
  setAdvancedMode: (enabled: boolean) => void
  cleanupBackgroundTasks: () => void
  clearBackgroundTasks: () => void
  setShowSupportButton: (enabled: boolean) => void
  setGameAutoAttach: (gameId: string, enabled: boolean) => void
  setAccentColor: (color: string) => void
  /** Écrit immédiatement les réglages debouncés en attente (spec §17 — flush à
   * la fermeture de l'application). */
  flushPendingSettings: () => void
  bulkSetEnabled: (modIds: string[], enabled: boolean) => Promise<void>
  bulkTransferMods: (modIds: string[], destinationProfileId: string, mode: 'copy' | 'move') => Promise<void>
  bulkDeleteMods: (modIds: string[], scope: 'current' | 'all' | 'permanent') => Promise<void>
  deduplicateStagedMods: (gameId: string) => Promise<void>
  purgeUnreferencedStagedMods: (gameId: string) => Promise<void>
  bulkAddTag: (modIds: string[], label: string) => Promise<void>
  undoLastBulkOperation: () => Promise<void>
  toggleProfileLock: (profileId: string) => void
  openProfileDirectory: (profileId: string, kind?: 'root' | 'overwrite' | 'generated') => Promise<void>
  checkProfileIntegrity: (profileId: string) => Promise<ProfileIntegrity | undefined>
  repairProfileStorage: (gameId: string) => Promise<void>
  recordNotice: (message: string) => void
  dismissNotification: (id: string) => void
  clearCompletedNotifications: () => void
  clearNotificationHistory: () => void
  clearNotice: () => void
}

export function migratePersistedState(persisted: unknown) {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<Store> & { currentView?: string }
  const games = Array.isArray(state.games) ? state.games.map(rawGame => {
    const game = rawGame as Game
    const catalog = new Map<string, Mod>()
    for (const mod of game.installedMods || []) catalog.set(mod.id, mod)
    for (const profile of game.profiles || []) {
      for (const mod of profile.mods || []) {
        const existing = [...catalog.values()].find(item => item.id === mod.id || item.name.toLocaleLowerCase() === mod.name.toLocaleLowerCase())
        if (!existing) catalog.set(mod.id, mod)
      }
    }
    const installedMods = decorateMods([...catalog.values()].map(mod => withInferredTags(mod)))
    const profiles = (game.profiles || []).map((rawProfile, index): Profile => {
      const legacyMods = rawProfile.mods || []
      const legacyByName = new Map(legacyMods.map(mod => [mod.name.toLocaleLowerCase(), mod]))
      const legacyStates = rawProfile.modStates && Object.keys(rawProfile.modStates).length
        ? rawProfile.modStates
        : Object.fromEntries(installedMods.map((mod, priority) => {
          const legacy = legacyMods.find(item => item.id === mod.id) || legacyByName.get(mod.name.toLocaleLowerCase())
          return [mod.id, { enabled: legacy?.enabled ?? mod.enabled, priority: legacy?.priority ?? priority, note: legacy?.note }]
        }))
      return withExactProfileReferences({
        ...rawProfile,
        mods: undefined,
        modStates: legacyStates,
        createdAt: rawProfile.createdAt || Date.now(),
        isDefault: rawProfile.isDefault ?? index === 0,
      }, installedMods)
    })
    return { ...game, installedMods, profiles }
  }) : []
  return {
    ...state,
    games,
    currentView: (state.currentView as string) === 'mods' ? 'games' : state.currentView,
    activeGameTab: state.activeGameTab || 'mods',
    exploreGames: state.exploreGames || [...GAMEBANANA_GAMES],
    explorePinnedGames: state.explorePinnedGames || [],
    exploreRecentGames: state.exploreRecentGames || [],
    explorePage: state.explorePage || 1,
    exploreSort: state.exploreSort || 'recent',
    exploreColumns: state.exploreColumns === '3' ? '3' : '2',
    textSize: state.textSize || 'normal',
    uiDensity: state.uiDensity || 'comfortable',
    autoArtwork: state.autoArtwork ?? false,
    discordClientId: state.discordClientId || '',
    discordLargeImageKey: state.discordLargeImageKey || '',
    discordShowProfile: state.discordShowProfile ?? true,
    discordShowModCount: state.discordShowModCount ?? true,
    discordShowElapsed: state.discordShowElapsed ?? true,
    taskToastsEnabled: state.taskToastsEnabled ?? true,
    taskAutoReduceImports: state.taskAutoReduceImports ?? true,
    libraryViewMode: state.libraryViewMode || 'grid',
    activityMaxEvents: state.activityMaxEvents || 250,
    downloadRetention: state.downloadRetention || 'startup',
    remapSuspendShortcut: state.remapSuspendShortcut || 'Ctrl+Alt+K',
    remapKillSwitchShortcut: state.remapKillSwitchShortcut || 'Ctrl+Alt+Backspace',
    reduceActivityDuringGame: state.reduceActivityDuringGame ?? true,
    autoMinimizeOnGameStart: state.autoMinimizeOnGameStart ?? true,
    restoreAfterGame: state.restoreAfterGame ?? true,
    reduceExplanations: state.reduceExplanations ?? false,
    advancedMode: state.advancedMode ?? false,
    showSupportButton: state.showSupportButton ?? true,
    autoAttachGames: state.autoAttachGames || [],
    accentColor: /^#[0-9a-f]{6}$/i.test(state.accentColor || '') ? state.accentColor : '#f3faf8',
    bulkHistory: state.bulkHistory || [],
    notificationHistory: state.notificationHistory || [],
    isLaunching: false,
    launchProgress: undefined,
    isPlaying: false,
    playStartTime: undefined,
    sessionTime: 0,
    gameSessions: [],
  }
}

export const useStore = create<Store>()(persist((set, get) => ({
  currentView: 'home',
  activeGameTab: 'mods',
  restorePoints: [],
  autoRestorePoints: true,
  games: [],
  selectedGameId: undefined,
  selectedProfileId: undefined,
  nsfw: false,
  hideUnclassifiedNsfw: false,
  language: 'fr',
  textSize: 'normal',
  uiDensity: 'comfortable',
  motionMode: 'auto',
  coverParallax: true,
  performanceModes: {},
  performanceCustom: {},
  globalPerformanceMode: 'auto',
  batteryPerformanceBehavior: 'economy',
  runtimeActivity: { downloads: 'normal', scans: 'normal' },
  autoArtwork: false,
  artworkSteamGridDbKey: '',
  artworkIgdbClientId: '',
  artworkIgdbClientSecret: '',
  artworkSourceMode: 'automatic',
  discordPresence: false,
  discordClientId: '',
  discordLargeImageKey: '',
  discordShowProfile: true,
  discordShowModCount: true,
  discordShowElapsed: true,
  autoCheckUpdates: true,
  autoInstallUpdates: false,
  modUpdateFrequency: 'weekly',
  autoDownloadModUpdates: false,
  autoInstallModUpdates: false,
  updateChannel: 'stable',
  isLaunching: false,
  isPlaying: false,
  sessionTime: 0,
  gameSessions: [],
  explorePlatform: 'gamebanana',
  exploreGameId: GAMEBANANA_GAMES[0].id,
  exploreGames: [...GAMEBANANA_GAMES],
  exploreGameQuery: '',
  explorePinnedGames: [],
  exploreRecentGames: [],
  exploreSearch: '',
  explorePage: 1,
  exploreHasNextPage: false,
  exploreSort: 'recent',
  exploreGrid: true,
  exploreColumns: '2',
  exploreMods: [],
  exploreLoading: false,
  exploreGamesLoading: false,
  backgroundTasks: [],
  taskToastsEnabled: true,
  taskAutoReduceImports: true,
  libraryViewMode: 'grid',
  gamesBrowsing: true,
  activityMaxEvents: 250,
  downloadRetention: 'startup',
  remapSuspendShortcut: 'Ctrl+Alt+K',
  remapKillSwitchShortcut: 'Ctrl+Alt+Backspace',
  quickPanelEnabled: false,
  quickPanelShortcut: 'Ctrl+Alt+Z',
  reduceActivityDuringGame: true,
  autoMinimizeOnGameStart: true,
  restoreAfterGame: true,
  reduceExplanations: false,
  advancedMode: false,
  showSupportButton: true,
  autoAttachGames: [],
  showReleaseNotesOnUpdate: true,
  accentColor: '#f3faf8',
  bulkHistory: [],
  notificationHistory: [],
  setView: currentView => set({ currentView }),
  setActiveGameTab: activeGameTab => set({ activeGameTab, currentView: 'games' }),
  setSelectedGame: selectedGameId => {
    const game = get().games.find(item => item.id === selectedGameId)
    set({ selectedGameId, selectedProfileId: game?.profiles[0]?.id })
  },
  setSelectedProfile: async selectedProfileId => {
    const state = get()
    const { game, profile } = selected({ ...state, selectedProfileId })
    if (!game || !profile) return
    if (game.modsPath && native.isDesktop()) {
      try {
        const actual = await native.scanMods(game.modsPath)
        const desiredMods = resolveProfileMods(game, profile)
        const desired = new Map(desiredMods.map(mod => [mod.name.toLowerCase(), mod.enabled]))
        for (const mod of actual) {
          const enabled = desired.get(mod.name.toLowerCase())
          if (enabled !== undefined && enabled !== mod.enabled) await native.toggleMod(mod.path, game.modsPath, enabled)
        }
        const refreshed = await native.scanMods(game.modsPath)
        const catalog = scannedMods(refreshed, game.installedMods || desiredMods)
        const games = get().games.map(item => item.id !== game.id ? item : {
          ...item,
          installedMods: catalog,
          profiles: item.profiles.map(current => current.id === profile.id
            ? { ...withProfileStates(current, catalog.map(mod => ({ ...mod, enabled: desired.get(mod.name.toLowerCase()) ?? mod.enabled }))), lastUsed: Date.now() }
            : current),
        })
        set({ games, selectedProfileId: profile.id, notice: `Profile “${profile.name}” applied.` })
        return
      } catch (error) {
        set({ notice: asError(error) })
        return
      }
    }
    set({ selectedProfileId })
  },
  addGameFromExecutable: async () => {
    const execPath = await pickExecutable()
    if (!execPath) return
    try {
      const modsPath = native.isDesktop() ? await native.guessModsPath(execPath) : ''
      const game = makeGame({ name: gameNameFromPath(execPath), execPath, modsPath })
      set(state => ({ games: [...state.games, game], selectedGameId: game.id, selectedProfileId: game.profiles[0].id, currentView: 'games', notice: 'Game added. Choose or create its mods folder, then scan it.' }))
      if (native.isDesktop()) {
        const profile = game.profiles[0]
        void native.syncProfileState(game.id, profile).then(paths => set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => withProfilePaths(current, paths)) })))
      }
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  addDetectedGames: async () => {
    try {
      const scan = await native.scanSteamGames(undefined, () => undefined)
      return get().importDetectedGames(scan.games)
    } catch (error) {
      set({ notice: asError(error) })
      return 0
    }
  },
  importDetectedGames: detected => {
    const existing = get().games
    const fresh = detected
      .filter(game => {
        const appId = game.providerGameId
        const installDirectory = normalizedPath(game.installDirectory)
        const executable = normalizedPath(game.execPath)
        return !existing.some(current =>
          (appId && current.provider === game.provider && current.providerGameId === appId)
          || (installDirectory && normalizedPath(current.installDirectory) === installDirectory)
          || (executable && normalizedPath(current.execPath) === executable)
        )
      })
      .map(game => makeGame(game))
    if (fresh.length) {
      set(state => ({
        games: [...state.games, ...fresh],
        selectedGameId: state.selectedGameId ?? fresh[0].id,
        selectedProfileId: state.selectedProfileId ?? fresh[0].profiles[0].id,
        notice: `${fresh.length} jeu${fresh.length > 1 ? 'x' : ''} Steam ajouté${fresh.length > 1 ? 's' : ''}.`,
      }))
      if (native.isDesktop()) {
        fresh.forEach(game => {
          const initial = game.profiles[0]
          void native.syncProfileState(game.id, initial).then(paths => {
            set(state => ({ games: updateProfile(state.games, game.id, initial.id, profile => withProfilePaths(profile, paths)) }))
          }).catch(error => set({ notice: asError(error) }))
          if (game.provider === 'FiveM Client' && game.installDirectory) {
            void native.initializeFiveMBase(game.id, game.installDirectory).then(snapshot => {
              set({ notice: `FiveM client détecté. Base neutre indexée (${snapshot.files} fichiers, aucune copie complète).` })
            }).catch(error => set({ notice: asError(error) }))
          }
        })
      }
      // Spec Performance §12 : quand un jeu actif met les scans en pause, la
      // recherche d'artwork automatique est suspendue (reprise au prochain
      // ajout — aucune file orpheline).
      if (get().autoArtwork && get().runtimeActivity.scans === 'normal') {
        fresh.forEach(game => {
          void automaticArtworkForGame(game, { steamGridDbKey: get().artworkSteamGridDbKey, igdbClientId: get().artworkIgdbClientId, igdbClientSecret: get().artworkIgdbClientSecret }).then(resources => {
            if (!Object.keys(resources).length) return
            set(state => ({
              games: state.games.map(current => current.id === game.id ? { ...current, resources: { ...current.resources, ...resources } } : current),
            }))
          })
        })
      }
    } else {
      set({ notice: 'Aucun nouveau jeu Steam sélectionné à ajouter.' })
    }
    return fresh.length
  },
  removeGame: gameId => set(state => {
    const games = state.games.filter(game => game.id !== gameId)
    const current = games[0]
    return { games, selectedGameId: current?.id, selectedProfileId: current?.profiles[0]?.id }
  }),
  setGamePath: async (gameId, execPath) => {
    try {
      const modsPath = execPath && native.isDesktop() ? await native.guessModsPath(execPath) : undefined
      set(state => ({
        games: state.games.map(game => game.id !== gameId ? game : { ...game, execPath, modsPath: game.modsPath || modsPath }),
      }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  setModsPath: (gameId, modsPath) => set(state => ({ games: state.games.map(game => game.id === gameId ? { ...game, modsPath } : game) })),
  setGameBypassPath: (gameId, bypassPath) => set(state => ({ games: state.games.map(game => game.id === gameId ? { ...game, bypassPath } : game) })),
  addGameRuntimePath: (gameId, path) => set(state => ({ games: state.games.map(game => game.id === gameId ? { ...game, runtimePaths: [...(game.runtimePaths || []), path] } : game) })),
  updateGameRuntimePath: (gameId, index, path) => set(state => ({ games: state.games.map(game => game.id === gameId ? { ...game, runtimePaths: (game.runtimePaths || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...path } : item) } : game) })),
  removeGameRuntimePath: (gameId, index) => set(state => ({ games: state.games.map(game => game.id === gameId ? { ...game, runtimePaths: (game.runtimePaths || []).filter((_, itemIndex) => itemIndex !== index) } : game) })),
  saveGamePreset: (gameId, preset) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, presets: [...(game.presets || []).filter(item => item.id !== preset.id), preset] } : game),
  })),
  deleteGamePreset: (gameId, presetId) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, presets: (game.presets || []).filter(item => item.id !== presetId) } : game),
  })),
  recordGameTestRun: (gameId, run) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, testRuns: [run, ...(game.testRuns || [])].slice(0, 10) } : game),
  })),
  clearGameTestRuns: (gameId) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, testRuns: undefined } : game),
  })),
  applyGamePreset: async (gameId, presetId) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const preset = game?.presets?.find(item => item.id === presetId)
    if (!game || !preset) return
    await state.setSelectedProfile(preset.profileId)
    if (preset.visualProfileId && native.isDesktop()) {
      try { await native.visualProfiles.setAssociation(gameId, preset.profileId, preset.visualProfileId) } catch { /* association non critique */ }
    }
    set({ notice: `Preset « ${preset.name} » appliqué (profil ${game.profiles.find(item => item.id === preset.profileId)?.name || ''}).` })
  },
  setGameResources: (gameId, resources) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, resources: { ...game.resources, ...resources } } : game),
  })),
  setGameFavorite: (gameId, favorite) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, favorite: favorite ?? !game.favorite } : game),
  })),
  setGameHidden: (gameId, hidden) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, hidden: hidden ?? !game.hidden } : game),
  })),
  setGameCategories: (gameId, categories) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, categories } : game),
  })),
  setGameKeyboardLayout: (gameId, layout) => set(state => ({
    games: state.games.map(game => game.id === gameId ? { ...game, keyboardLayout: layout } : game),
  })),
  saveGameInputProfile: profile => set(state => ({
    games: state.games.map(game => game.id === profile.gameId ? {
      ...game,
      keyboardProfiles: [
        ...(game.keyboardProfiles || []).filter(item => item.id !== profile.id),
        profile,
      ],
    } : game),
  })),
  deleteGameInputProfile: (gameId, profileId) => set(state => ({
    games: state.games.map(game => game.id === gameId ? {
      ...game,
      keyboardProfiles: (game.keyboardProfiles || []).filter(item => item.id !== profileId),
    } : game),
  })),
  createRestorePoint: (label, source = 'manual') => {
    const { game, profile } = selected(get())
    if (!game) return
    const strip = (item: Profile): RestorePoint['profiles'][number] => {
      const { directory: _directory, manifestPath: _manifestPath, loadOrderPath: _loadOrderPath, settingsPath: _settingsPath, overwritePath: _overwritePath, generatedPath: _generatedPath, deploymentPath: _deploymentPath, mods: _mods, ...rest } = item
      return rest
    }
    const point: RestorePoint = {
      id: createId(),
      gameId: game.id,
      label,
      source,
      createdAt: Date.now(),
      profiles: game.profiles.map(strip),
      keyboardProfiles: game.keyboardProfiles?.map(item => JSON.parse(JSON.stringify(item)) as GameInputProfile),
      keyboardLayout: game.keyboardLayout,
      selectedProfileId: profile?.id,
    }
    set(state => ({ restorePoints: [...state.restorePoints, point].slice(-30) }))
    if (source === 'manual') set({ notice: `Point de restauration « ${label} » créé.` })
  },
  restoreRestorePoint: (gameId, pointId) => {
    const point = get().restorePoints.find(item => item.id === pointId && item.gameId === gameId)
    if (!point) return
    set(state => ({
      games: state.games.map(game => game.id === gameId ? {
        ...game,
        profiles: point.profiles as Profile[],
        keyboardProfiles: point.keyboardProfiles,
        keyboardLayout: point.keyboardLayout,
      } : game),
      selectedProfileId: point.selectedProfileId || state.selectedProfileId,
      notice: `Point de restauration « ${point.label} » appliqué : profils, touches et apparence restaurés.`,
    }))
  },
  deleteRestorePoint: (gameId, pointId) => set(state => ({
    restorePoints: state.restorePoints.filter(item => !(item.id === pointId && item.gameId === gameId)),
  })),
  setAutoRestorePoints: value => set({ autoRestorePoints: value }),
  addProfile: name => {
    const { game } = selected(get())
    if (!game || !name.trim()) return
    const next: Profile = {
      id: createId(),
      gameId: game.id,
      name: name.trim(),
      modStates: {},
      playtime: 0,
      createdAt: Date.now(),
      isDefault: false,
    }
    set(state => ({
      games: state.games.map(item => item.id === game.id ? { ...item, profiles: [...item.profiles, next] } : item),
      selectedProfileId: next.id,
      notice: `Profil vide « ${next.name} » créé : 0 mod actif, aucun réglage hérité.`,
    }))
    if (native.isDesktop()) void native.syncProfileState(game.id, next).then(paths => {
      set(state => ({ games: updateProfile(state.games, game.id, next.id, profile => withProfilePaths(profile, paths)) }))
    }).catch(error => set({ notice: `Profil créé localement, mais sa persistance native a échoué : ${asError(error)}` }))
  },
  prepareCollectionProfile: async (collection, name, includeAdult) => {
    const { game } = selected(get())
    if (!game) {
      set({ notice: 'Sélectionnez un jeu ZAILON avant de préparer une Collection.' })
      return undefined
    }
    if (!native.isDesktop()) {
      set({ notice: 'Les Collections Nexus exigent l’application bureau ZAILON.' })
      return undefined
    }
    const baseName = name.trim() || `${collection.collection.name} · r${collection.revisionNumber}`
    const existing = new Set(game.profiles.map(profile => profile.name.toLocaleLowerCase()))
    let profileName = baseName
    let suffix = 2
    while (existing.has(profileName.toLocaleLowerCase())) profileName = `${baseName} (${suffix++})`
    const installId = createId()
    const profile: Profile = {
      id: createId(),
      gameId: game.id,
      name: profileName,
      description: `Collection Nexus ${collection.collection.name}, révision ${collection.revisionNumber}.`,
      modStates: {},
      playtime: 0,
      createdAt: Date.now(),
      isDefault: false,
      locked: true,
      collectionState: 'Preparing',
      collectionMetadata: {
        installId,
        collectionId: collection.collection.id,
        slug: collection.collection.slug,
        latestKnownRevisionId: collection.revisionId,
        sourceGameDomain: collection.collection.gameDomain,
        selections: [],
        localOverrides: [],
      },
    }
    try {
      const prepared = await native.prepareNexusCollectionInstall(
        game.id,
        installId,
        profile,
        collection.collection.gameDomain,
        collection.collection.slug,
        collection.revisionNumber,
        includeAdult,
      )
      const persisted = withProfilePaths(prepared.profile, prepared.profilePaths)
      set(state => ({
        games: state.games.map(item => item.id === game.id
          ? { ...item, profiles: [...item.profiles, persisted] }
          : item),
        selectedProfileId: persisted.id,
        notice: prepared.plan.accountCapabilities.membershipTier === 'premium'
          ? `Profil « ${persisted.name} » préparé. La file Premium attend votre confirmation.`
          : `Profil « ${persisted.name} » préparé. Nexus demandera les confirmations de téléchargement officielles.`,
      }))
      return persisted.id
    } catch (error) {
      set({ notice: `La Collection n’a créé aucun profil local : ${asError(error)}` })
      return undefined
    }
  },
  installCollectionDownloads: async (gameId, installId, gameName) => {
    if (!native.isDesktop()) return false
    try {
      const result = await native.installCollectionDownloads(gameId, installId, gameName)
      const stagedMods = await native.listStagedMods(gameId)
      set(state => ({
        games: state.games.map(game => {
          if (game.id !== gameId) return game
          const installedMods = scannedMods(stagedMods, game.installedMods)
          return {
            ...game,
            installedMods,
            profiles: game.profiles.map(profile => profile.id === result.plan.profileId
              ? { ...profile, ...result.profile, mods: undefined }
              : profile),
          }
        }),
        notice: result.plan.profileState === 'Ready'
          ? `Collection « ${result.plan.collectionName} » prête dans le profil « ${result.plan.profileName} ».`
          : `${result.installedPaths.length} paquet(s) installé(s). La Collection demande encore une intervention.`,
      }))
      return true
    } catch (error) {
      set({ notice: `Installation de la Collection interrompue : ${asError(error)}` })
      return false
    }
  },
  duplicateProfile: profileId => {
    const { game } = selected(get())
    const source = game?.profiles.find(profile => profile.id === profileId)
    if (!game || !source) return
    const copy: Profile = {
      ...source,
      id: createId(),
      name: `${source.name} — copie`,
      modStates: Object.fromEntries(Object.entries(source.modStates).map(([id, state]) => [id, { ...state }])),
      conflictRules: source.conflictRules?.map(rule => ({ ...rule })),
      installOptions: source.installOptions ? { ...source.installOptions } : undefined,
      createdAt: Date.now(),
      lastUsed: undefined,
      isDefault: false,
      locked: false,
      temporary: false,
      clonedFromProfileId: source.id,
      directory: undefined,
      manifestPath: undefined,
      loadOrderPath: undefined,
      settingsPath: undefined,
      overwritePath: undefined,
      generatedPath: undefined,
      deploymentPath: undefined,
    }
    set(state => ({
      games: state.games.map(item => item.id === game.id ? { ...item, profiles: [...item.profiles, copy] } : item),
      selectedProfileId: copy.id,
      notice: `Le profil « ${source.name} » a été dupliqué.`,
    }))
    if (native.isDesktop()) void native.syncProfileState(game.id, copy).then(paths => {
      set(state => ({ games: updateProfile(state.games, game.id, copy.id, profile => withProfilePaths(profile, paths)) }))
    }).catch(error => set({ notice: asError(error) }))
  },
  importProfileManifest: manifest => {
    const { game } = selected(get())
    if (!game) return
    const importedMods = manifest.mods.map((mod, index): Mod => ({
      ...mod,
      id: mod.id || createId(),
      enabled: mod.enabled ?? false,
      autoUpdate: mod.autoUpdate ?? false,
      priority: mod.priority ?? index,
      path: undefined,
    }))
    const catalogById = new Map(game.installedMods.map(mod => [mod.id, mod]))
    importedMods.forEach(mod => { if (!catalogById.has(mod.id)) catalogById.set(mod.id, mod) })
    const source = manifest.profile
    const profile: Profile = {
      ...source,
      id: createId(),
      gameId: game.id,
      name: `${source.name} — importé`,
      modStates: source.modStates || statesFromMods(importedMods),
      createdAt: Date.now(),
      lastUsed: undefined,
      isDefault: false,
      locked: false,
    }
    set(state => ({
      games: state.games.map(item => item.id === game.id ? { ...item, installedMods: [...catalogById.values()], profiles: [...item.profiles, profile] } : item),
      selectedProfileId: profile.id,
      notice: `${manifest.mods.length} référence(s) de mods importée(s). Les fichiers absents restent désactivés.`,
    }))
  },
  renameProfile: (profileId, name) => {
    const { game } = selected(get())
    if (!game || !name.trim()) return
    const profile = game.profiles.find(item => item.id === profileId)
    if (!profile || profile.locked) return
    const renamed = { ...profile, name: name.trim() }
    set(state => ({ games: updateProfile(state.games, game.id, profileId, () => renamed) }))
    if (native.isDesktop()) void native.syncProfileState(game.id, renamed).catch(error => set({ notice: asError(error) }))
  },
  removeProfile: profileId => {
    const { game } = selected(get())
    if (!game || game.profiles.length < 2) { set({ notice: 'Le profil par défaut ne peut pas être le seul profil.' }); return }
    const profiles = game.profiles.filter(profile => profile.id !== profileId)
    if (profiles.length === game.profiles.length) return
    const next = profiles[0]
    set(state => ({
      games: state.games.map(item => item.id === game.id ? { ...item, profiles } : item),
      selectedProfileId: state.selectedProfileId === profileId ? next.id : state.selectedProfileId,
      notice: 'Profil retiré. Les fichiers de mods ne sont pas supprimés.',
    }))
    if (native.isDesktop()) void native.trashProfileState(game.id, profileId).then(path => {
      if (path) set({ notice: `Profil placé dans la corbeille ZAILON : ${path}` })
    }).catch(error => set({ notice: asError(error) }))
  },
  registerImportedStages: async (gameId, profileId, installedPaths, enabled) => {
    const game = get().games.find(item => item.id === gameId)
    const profile = game?.profiles.find(item => item.id === profileId)
    if (!game || !profile) return
    const stageIds = [...new Set(installedPaths.map(path => path.split(/[\\/]/).pop()).filter((id): id is string => Boolean(id)))]
    if (!stageIds.length) return
    const modStates = { ...profile.modStates }
    let priority = Object.keys(modStates).length
    stageIds.forEach(stageId => {
      modStates[stageId] = modStates[stageId] || { enabled, priority: priority++ }
    })
    const updated = { ...profile, modStates }
    set(state => ({ games: updateProfile(state.games, gameId, profileId, () => updated) }))
    if (native.isDesktop()) await native.syncProfileState(gameId, updated)
  },
  completeMo2Import: async (gameId, result) => {
    const game = get().games.find(item => item.id === gameId)
    if (!game) return
    const [folderMods, stagedMods] = await Promise.all([
      game.modsPath ? native.scanMods(game.modsPath) : Promise.resolve([]),
      native.listStagedMods(gameId),
    ])
    const nativeMods = [
      ...stagedMods,
      ...folderMods.filter(folderMod => !stagedMods.some(staged => staged.fingerprint === folderMod.fingerprint)),
    ]
    const catalog = scannedMods(nativeMods, game.installedMods)
    const importedProfilesWithReferences = result.profiles.map(profile => withExactProfileReferences(profile, catalog))
    const importedProfiles = await Promise.all(importedProfilesWithReferences.map(async profile =>
      native.isDesktop() ? withProfilePaths(profile, await native.syncProfileState(gameId, profile)) : profile,
    ))
    const importedIds = new Set(importedProfiles.map(profile => profile.id))
    const executables = new Map((game.managedExecutables || []).map(item => [normalizedPath(item.path), item]))
    result.managedExecutables.forEach(item => executables.set(normalizedPath(item.path), item))
    set(state => ({
      games: state.games.map(item => item.id !== gameId ? item : {
        ...item,
        installedMods: catalog,
        profiles: [...item.profiles.filter(profile => !importedIds.has(profile.id)), ...importedProfiles],
        managedExecutables: [...executables.values()],
      }),
      selectedGameId: gameId,
      selectedProfileId: importedProfiles[0]?.id ?? state.selectedProfileId,
      notice: `Import MO2 terminé : ${result.importedMods} mod(s), ${importedProfiles.length} profil(s), ${result.skippedMods} élément(s) ignoré(s). Source ${result.sourceUnchanged ? 'inchangée' : 'à vérifier'}.`,
    }))
  },
  scanMods: async gameId => {
    const state = get()
    const game = state.games.find(item => item.id === (gameId ?? state.selectedGameId))
    const profile = game?.profiles.find(item => item.id === state.selectedProfileId) ?? game?.profiles[0]
    if (!game || !profile) return
    try {
      if (native.isDesktop()) {
        for (const currentProfile of game.profiles) {
          await native.syncProfileState(game.id, currentProfile)
        }
      }
      const [folderMods, stagedMods] = await Promise.all([
        game.modsPath ? native.scanMods(game.modsPath) : Promise.resolve([]),
        native.listStagedMods(game.id),
      ])
      const mods = [...stagedMods, ...folderMods.filter(folderMod => !stagedMods.some(staged => staged.fingerprint === folderMod.fingerprint))]
      const previous = resolveProfileMods(game, profile)
      const catalog = scannedMods(mods, game.installedMods || previous)
      const previousStates = profile.modStates || statesFromMods(previous)
      const nextStates = Object.fromEntries(catalog.flatMap((mod, index) => {
        const stagedReference = mod.storage === 'staged' && mod.profileIds?.includes(profile.id)
        if (mod.storage === 'staged' && !stagedReference) return []
        const previousState = previousStates[mod.id]
        return [[mod.id, exactProfileModState(mod, index, previousState || {
          enabled: mod.storage === 'staged' ? mod.deploymentStatus !== 'stored' : mod.enabled,
          priority: index,
        })]]
      }))
      set(state => ({
        games: state.games.map(item => item.id !== game.id ? item : {
          ...item,
          installedMods: catalog,
          profiles: item.profiles.map(current => current.id === profile.id ? { ...current, mods: undefined, modStates: nextStates } : current),
        }),
        notice: `${mods.length} mod${mods.length !== 1 ? 's' : ''} analysé${mods.length !== 1 ? 's' : ''}, dont ${stagedMods.length} stocké${stagedMods.length !== 1 ? 's' : ''} par ZAILON.`,
      }))
      const updated = get().games.find(item => item.id === game.id)?.profiles.find(item => item.id === profile.id)
      if (updated && native.isDesktop()) await native.syncProfileState(game.id, updated)
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  refreshStagedCatalogs: async () => {
    // Spec Fiabilité profils §9-10 : au démarrage, le catalogue installé de
    // chaque jeu est réconcilié avec le store staged réel (lecture des
    // manifest.json uniquement — léger). Un cache UI vide persisté ne peut
    // plus faire afficher « 0 mods » à un profil qui référence des paquets.
    if (!native.isDesktop()) return
    const current = get().games
    let repairedProfiles = 0
    let changed = false
    const nextGames = await Promise.all(current.map(async game => {
      try {
        const stagedMods = await native.listStagedMods(game.id)
        const catalog = scannedMods(stagedMods, game.installedMods || [])
        const report = repairReport({ installedMods: catalog, profiles: game.profiles })
        if (report) repairedProfiles += 1
        const same = catalog.length === (game.installedMods || []).length
          && catalog.every((mod, index) => mod.id === game.installedMods?.[index]?.id)
        if (same) return game
        changed = true
        return { ...game, installedMods: catalog }
      } catch {
        return game
      }
    }))
    if (changed) set(state => ({ games: nextGames }))
    if (repairedProfiles > 0) {
      set({ notice: `Profil${repairedProfiles > 1 ? 's' : ''} restauré${repairedProfiles > 1 ? 's' : ''} automatiquement — références réconciliées avec le store staged.` })
    }
  },
  toggleMod: async modId => {
    const { game, profile } = selected(get())
    const mod = resolveProfileMods(game, profile).find(item => item.id === modId)
    if (!game || !profile || !mod) return
    if (profile.locked) { set({ notice: `Le profil « ${profile.name} » est verrouillé.` }); return }
    try {
      const path = mod.storage !== 'staged' && mod.path ? await native.toggleMod(mod.path, game.modsPath || '', !mod.enabled) : undefined
      set(state => ({ games: state.games.map(item => item.id !== game.id ? item : {
        ...item,
        installedMods: item.installedMods.map(current => current.id === modId ? { ...current, path: path ?? current.path } : current),
        profiles: item.profiles.map(current => current.id !== profile.id ? current : {
          ...current,
          modStates: { ...current.modStates, [modId]: { ...(current.modStates[modId] || { priority: mod.priority ?? 0 }), enabled: !mod.enabled } },
        }),
      }) }))
      const updated = get().games.find(item => item.id === game.id)?.profiles.find(item => item.id === profile.id)
      if (updated && native.isDesktop()) await native.syncProfileState(game.id, updated)
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  deleteMod: async modId => {
    const { game, profile } = selected(get())
    const mod = resolveProfileMods(game, profile).find(item => item.id === modId)
    if (!game || !profile || !mod) return
    if (profile.locked) { set({ notice: `Le profil « ${profile.name} » est verrouillé.` }); return }
    try {
      const otherReferences = game.profiles.filter(item => item.id !== profile.id && Object.prototype.hasOwnProperty.call(item.modStates, modId))
      if (otherReferences.length) {
        set(state => ({
          games: updateProfile(state.games, game.id, profile.id, current => {
            const modStates = { ...current.modStates }
            delete modStates[modId]
            return { ...current, modStates }
          }),
          notice: `${mod.name} retiré de « ${profile.name} ». Le paquet partagé reste utilisé par ${otherReferences.length} autre(s) profil(s).`,
        }))
        const updated = get().games.find(item => item.id === game.id)?.profiles.find(item => item.id === profile.id)
        if (updated && native.isDesktop()) await native.syncProfileState(game.id, updated)
        return
      }
      if (mod.storage === 'staged' && mod.stageId) await native.deleteStagedMod(game.id, mod.stageId)
      else if (mod.path) await native.deleteMod(mod.path, game.modsPath || '')
      set(state => ({
        games: state.games.map(item => item.id !== game.id ? item : {
          ...item,
          installedMods: item.installedMods.filter(current => current.id !== modId),
          profiles: item.profiles.map(current => {
            const modStates = { ...current.modStates }
            delete modStates[modId]
            return { ...current, modStates }
          }),
        }),
        notice: `${mod.name} removed.`,
      }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  moveMod: (modId, direction) => {
    const { game, profile } = selected(get())
    if (!game || !profile) return
    if (profile.locked) { set({ notice: `Le profil « ${profile.name} » est verrouillé.` }); return }
    const mods = resolveProfileMods(game, profile)
    const index = mods.findIndex(mod => mod.id === modId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= mods.length) return
    const [moved] = mods.splice(index, 1)
    mods.splice(destination, 0, moved)
    const modStates = statesFromMods(decorateMods(mods))
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, modStates })) }))
    const updated = get().games.find(item => item.id === game.id)?.profiles.find(item => item.id === profile.id)
    if (updated && native.isDesktop()) void native.syncProfileState(game.id, updated).catch(error => set({ notice: asError(error) }))
  },
  setModNote: (modId, note) => {
    const { game, profile } = selected(get())
    if (!game || !profile) return
    if (profile.locked) return
    const currentState = profile.modStates[modId] || { enabled: true, priority: 0 }
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, modStates: { ...current.modStates, [modId]: { ...currentState, note } } })) }))
    const updated = get().games.find(item => item.id === game.id)?.profiles.find(item => item.id === profile.id)
    if (updated && native.isDesktop()) void native.syncProfileState(game.id, updated).catch(error => set({ notice: asError(error) }))
  },
  toggleNSFW: () => set(state => ({ nsfw: !state.nsfw })),
  setHideUnclassifiedNsfw: hideUnclassifiedNsfw => set({ hideUnclassifiedNsfw }),
  setLanguage: language => set({ language }),
  setTextSize: textSize => set({ textSize }),
  setUiDensity: uiDensity => set({ uiDensity }),
  setMotionMode: motionMode => set({ motionMode }),
  setCoverParallax: coverParallax => set({ coverParallax }),
  setPerformanceMode: (gameId, mode) => set(state => ({ performanceModes: { ...state.performanceModes, [gameId]: mode } })),
  setPerformanceCustom: (gameId, policies) => set(state => ({ performanceCustom: { ...state.performanceCustom, [gameId]: { ...state.performanceCustom[gameId], ...policies } } })),
  setGlobalPerformanceMode: globalPerformanceMode => set({ globalPerformanceMode }),
  setBatteryPerformanceBehavior: batteryPerformanceBehavior => set({ batteryPerformanceBehavior }),
  /** Recalcule les politiques effectives (spec §37-39, §36) à chaque
   * changement de session / de profil : dérivé des sessions vivantes, il
   * revient automatiquement à « normal » quand le jeu ferme. */
  reconcileRuntimeActivity: () => {
    const state = get()
    // Le mode global (spec §40) s'applique aux jeux sans mode explicite.
    const modes: Record<string, PerformanceMode> = { ...state.performanceModes }
    for (const session of state.gameSessions) {
      if (!modes[session.gameId]) modes[session.gameId] = state.globalPerformanceMode
    }
    const effective = effectivePerformance(
      modes,
      state.performanceCustom,
      state.gameSessions,
      pickPrioritySession(state.gameSessions, state.pinnedPriorityGameId, state.foregroundGameId),
    )
    const next = { downloads: effective.downloads, scans: effective.scans }
    if (state.runtimeActivity.downloads !== next.downloads || state.runtimeActivity.scans !== next.scans) {
      set({ runtimeActivity: next })
    }
  },
  setAutoArtwork: autoArtwork => set({ autoArtwork }),
  setArtworkSteamGridDbKey: artworkSteamGridDbKey => set({ artworkSteamGridDbKey }),
  setArtworkIgdbClientId: artworkIgdbClientId => set({ artworkIgdbClientId }),
  setArtworkIgdbClientSecret: artworkIgdbClientSecret => set({ artworkIgdbClientSecret }),
  setArtworkSourceMode: artworkSourceMode => set({ artworkSourceMode }),
  toggleDiscord: () => {
    set(state => ({ discordPresence: !state.discordPresence }))
    get().syncDiscordPresence()
  },
  setDiscordClientId: discordClientId => set({ discordClientId }),
  setDiscordLargeImageKey: discordLargeImageKey => set({ discordLargeImageKey }),
  setDiscordShowProfile: discordShowProfile => set({ discordShowProfile }),
  setDiscordShowModCount: discordShowModCount => set({ discordShowModCount }),
  setDiscordShowElapsed: discordShowElapsed => set({ discordShowElapsed }),
  setAutoCheckUpdates: autoCheckUpdates => set({ autoCheckUpdates }),
  setAutoInstallUpdates: autoInstallUpdates => set(state => ({ autoInstallUpdates, autoCheckUpdates: autoInstallUpdates ? true : state.autoCheckUpdates })),
  setModUpdateFrequency: modUpdateFrequency => set({ modUpdateFrequency }),
  setAutoDownloadModUpdates: autoDownloadModUpdates => set({ autoDownloadModUpdates }),
  setAutoInstallModUpdates: autoInstallModUpdates => set(state => ({ autoInstallModUpdates, autoDownloadModUpdates: autoInstallModUpdates ? true : state.autoDownloadModUpdates })),
  setUpdateChannel: updateChannel => set({ updateChannel }),
  recordUpdateCheck: (lastUpdateVersion, lastUpdateError) => set({ lastUpdateCheck: Date.now(), lastUpdateVersion, lastUpdateError }),
  prepareInstalledUpdate: update => set({ lastInstalledUpdate: { ...update, previousVersion: APP_VERSION, installedAt: Date.now() } }),
  dismissInstalledUpdate: () => set({ lastInstalledUpdate: undefined }),
  setLastSeenReleaseNotes: lastSeenReleaseNotesVersion => set({ lastSeenReleaseNotesVersion }),
  setShowReleaseNotesOnUpdate: showReleaseNotesOnUpdate => set({ showReleaseNotesOnUpdate }),
  launchSelectedGame: async (options?: { withoutMods?: boolean }) => {
    const state = get()
    if (state.isPlaying || state.isLaunching) { set({ notice: state.isLaunching ? 'La préparation du jeu est déjà en cours.' : 'Un jeu est déjà en cours. Fermez son processus avant un nouveau lancement afin que ZAILON restaure proprement les fichiers temporaires.' }); return }
    const { game, profile } = selected(state)
    if (!game?.execPath) { set({ notice: 'Select a game executable before launching.' }); return }
    if (!profile) { set({ notice: 'Select a profile before launching.' }); return }
    try {
      if (get().autoRestorePoints) {
        const now = new Date()
        const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        get().createRestorePoint(`Avant lancement · ${stamp}`, 'auto')
      }
      const enabledMods = options?.withoutMods ? [] : resolveProfileMods(game, profile).filter(mod => mod.enabled)
      // Verrou pré-lancement frameworks (spec Cyberpunk RED4ext §5, §36-43) :
      // on ne lance jamais le jeu avec un framework incomplet (ex. plugins
      // RED4ext sans le core red4ext/red4ext.dll) — sinon « RED4ext could not
      // be loaded ». Diagnostic HIÉRARCHIQUE : RED4ext vérifié en premier, la
      // cause primaire est affichée avant les conséquences (TweakXL/ArchiveXL
      // ne sont jamais accusés quand RED4ext est la cause commune).
      if (!options?.withoutMods && game.name.toLocaleLowerCase().includes('cyberpunk')) {
        const validation = validateFrameworkHierarchy(enabledMods)
        if (!validation.valid) {
          set({ notice: `Lancement bloqué — ${validation.blockers.join(' ')} Activez ou placez correctement le framework manquant, ou utilisez « Lancer sans mods » depuis le diagnostic pour diagnostiquer.` })
          return
        }
      }
      // Last Known Good (§41-42) : si une référence existe et la configuration
      // des frameworks a changé depuis le dernier lancement réussi, on avertit
      // (et on BLOQUE si le profil est verrouillé — pas de remplacement silencieux).
      if (!options?.withoutMods) {
        const previous = state.lastKnownGoodFrameworks?.[game.id]
        const current = fingerprintFrameworkSet(enabledMods)
        if (previous && hasFrameworkChanges(previous, current)) {
          const changes = compareFrameworkSets(previous, current)
            .map(change => `${change.framework} (${change.kind === 'added' ? 'ajouté' : change.kind === 'removed' ? 'retiré' : 'mis à jour'}${change.previousVersion && change.currentVersion && change.previousVersion !== change.currentVersion ? ` : ${change.previousVersion} → ${change.currentVersion}` : ''})`)
            .join(', ')
          if (profile.lockFrameworks) {
            set({ notice: `Lancement bloqué — le profil est verrouillé (frameworks) et la configuration a changé depuis le dernier lancement réussi : ${changes}. Déverrouillez les frameworks (Configuration) ou restaurez la configuration précédente.` })
            return
          }
          set({ notice: `Attention — la configuration des frameworks a changé depuis le dernier lancement réussi : ${changes}. Vérifiez dans État & Diagnostic > Frameworks avant de continuer.` })
        }
      }
      const executableParent = game.execPath.replace(/[\\/][^\\/]+$/, '')
      const knownRoot = game.name.toLocaleLowerCase().includes('cyberpunk') && /[\\/]bin[\\/]x64(?:[\\/]|$)/i.test(game.execPath)
        ? game.execPath.split(/[\\/]bin[\\/]x64/i)[0]
        : executableParent
      const stagedModIds = enabledMods
        .map(mod => mod.stageId || (mod.storage === 'staged' ? mod.id : undefined))
        .filter((id): id is string => Boolean(id))
      set({
        isLaunching: true,
        launchProgress: { phase: 'starting', current: 0, total: 0, message: 'Préparation du jeu…' },
        notice: 'Préparation du jeu en arrière-plan…',
      })
      const result = await native.launchGame(game.execPath, game.id, game.name, game.installDirectory || knownRoot, profile.id, profile.name, enabledMods.length, stagedModIds, profile.conflictRules || [], state.discordPresence ? {
        enabled: true,
        clientId: state.discordClientId,
        largeImageKey: state.discordLargeImageKey || undefined,
        showProfile: state.discordShowProfile,
        showModCount: state.discordShowModCount,
        showElapsed: state.discordShowElapsed,
      } : undefined, isLauncherBased(adapterFor(game)), progress => set({ launchProgress: progress }))
      set(current => ({
        isLaunching: false,
        launchProgress: undefined,
        isPlaying: true,
        playStartTime: Date.now(),
        sessionTime: 0,
        games: current.games.map(item => item.id !== game.id ? item : { ...item, installedMods: item.installedMods.map(mod => enabledMods.some(enabled => enabled.id === mod.id) && mod.storage === 'staged' ? { ...mod, deploymentStatus: 'runtime-visible' } : mod) }),
        notice: `${game.name} lancé${options?.withoutMods ? ' sans mods' : ''} (PID ${result.pid}) après vérification de ${result.deployedFiles} fichier(s) via ${result.deploymentBackend}. ${result.discordMessage}`,
      }))
      get().beginSession(game.id, profile.id)
    } catch (error) {
      set({ isLaunching: false, launchProgress: undefined, notice: asError(error) })
    }
  },
  stopPlaying: (gameId, profileId, cleanupError) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId) ?? state.games.find(item => item.id === state.selectedGameId)
    const profile = game?.profiles.find(item => item.id === profileId) ?? game?.profiles.find(item => item.id === state.selectedProfileId) ?? game?.profiles[0]
    if (!game || !profile) { set({ isLaunching: false, launchProgress: undefined, isPlaying: false, playStartTime: undefined, sessionTime: 0 }); return }
    const minutes = state.playStartTime ? Math.floor((Date.now() - state.playStartTime) / 60_000) : 0
    const now = Date.now()
    const restoredStatus: NonNullable<Mod['deploymentStatus']> = cleanupError ? 'failed' : 'enabled'
    const games = updateProfile(state.games, game.id, profile.id, current => ({ ...current, playtime: current.playtime + minutes, lastPlayed: now }))
      .map(item => item.id === game.id ? {
        ...item,
        totalPlaytime: item.totalPlaytime + minutes,
        lastPlayed: now,
        installedMods: item.installedMods.map(mod => mod.storage === 'staged' && mod.deploymentStatus === 'runtime-visible'
          ? { ...mod, deploymentStatus: restoredStatus, diagnostics: cleanupError ? [...(mod.diagnostics || []), cleanupError] : mod.diagnostics }
          : mod),
      } : item)
    set({ games, isLaunching: false, launchProgress: undefined, isPlaying: false, playStartTime: undefined, sessionTime: 0, notice: cleanupError ? `Restauration du jeu incomplète : ${cleanupError}` : state.notice })
  },
  tick: () => {
    const { isPlaying, playStartTime } = get()
    if (isPlaying && playStartTime) set({ sessionTime: Math.floor((Date.now() - playStartTime) / 1_000) })
  },
  beginSession: (gameId, profileId, source = 'zailon') => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    if (!game) return
    const adapter = adapterFor(game)
    const now = Date.now()
    const session: GameSession = {
      id: createId(),
      gameId,
      profileId,
      launchStrategy: adapter.launchBehavior,
      launcherProcessIds: [],
      gameProcessIds: [],
      startedAt: now,
      state: 'LauncherStarted',
      runtimeToolsActive: false,
      deploymentActive: true,
      inputProfileActive: false,
      visualProfileActive: false,
      source,
      timeline: [{ at: now, stage: 'GameLaunchRequested', detail: adapter.launchBehavior }],
    }
    set(current => ({
      gameSessions: [session, ...current.gameSessions.filter(item => item.gameId !== gameId || item.state === 'Ended' || item.state === 'Failed')],
      isPlaying: true,
      playStartTime: now,
      sessionTime: 0,
    }))
  },
  onGameProcessStopped: ({ gameId, cleanupError, processName }) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const adapter = game ? adapterFor(game) : FALLBACK_ADAPTER
    if (isLauncherBased(adapter)) {
      state.sessionLauncherExited(gameId, processName)
    } else {
      state.endSession(gameId, cleanupError)
    }
  },
  sessionLauncherExited: (gameId, processName) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const session = state.gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    if (!game || !session) return
    const adapter = adapterFor(game)
    const now = Date.now()
    const reattachUntil = now + adapter.reattachWindowSeconds * 1000
    const expectsElevation = adapter.launchChainStages.includes('UAC')
    const nextState: GameSession['state'] = expectsElevation ? 'WaitingForElevation' : 'WaitingForGame'
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        state: nextState,
        reattachUntil,
        deploymentActive: true,
        timeline: [...item.timeline,
          { at: now, stage: 'LauncherExited', detail: processName ? `Processus initial terminé (${processName})` : 'Processus initial terminé' },
          ...(expectsElevation
            ? [{ at: now, stage: 'ElevationRequested', detail: 'Élévation Windows demandée par le launcher — ZAILON continue de surveiller la chaîne (aucune confirmation n’est nécessaire)' }]
            : []),
          { at: now, stage: nextState, detail: `Fenêtre de rattachement : ${adapter.reattachWindowSeconds} s — le déploiement reste actif` },
        ],
      } : item),
      notice: expectsElevation
        ? `${game.name} : le launcher demande une élévation Windows. ZAILON suit la chaîne automatiquement — le jeu sera reconnu dès qu'il démarre.`
        : `${game.name} : processus initial fermé (launcher). En attente du jeu — le déploiement reste actif pendant ${adapter.reattachWindowSeconds} s.`,
    }))
  },
  sessionGameDetected: (gameId, processName, confidence, evidence) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const session = state.gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    if (!game || !session) return
    const now = Date.now()
    const firstDetected = !session.gameDetectedAt
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        state: 'GameRunning',
        gameDetectedAt: item.gameDetectedAt || now,
        finalProcess: processName,
        confidence,
        presenceEvidence: evidence || item.presenceEvidence,
        runtimeToolsActive: true,
        inputProfileActive: true,
        visualProfileActive: true,
        reattachUntil: undefined,
        lastSeenAt: now,
        possibleExitSince: undefined,
        timeline: [...item.timeline, { at: now, stage: 'GameAttached', detail: processName ? `${processName} (confiance ${confidence ?? '—'}%)` : 'Jeu détecté — session reconnectée' }],
      } : item),
    }))
    if (firstDetected) {
      get().recordNotice(`${game.name} détecté — session ZAILON reconnectée.`)
      // Spec #21-22 : la session a été lancée par ZAILON, le processus final est
      // détecté → « En cours via ZAILON » (jamais au lancement du launcher).
      get().setSessionToast({ kind: 'started', gameName: game.name, at: now })
    }
    // Spec #41 : le jeu fonctionne → nouvelle référence Last Known Good.
    get().recordLastKnownGoodFrameworks(gameId)
    get().applyInputArbiter()
  },
  /** GamePresenceEngine : un jeu configuré tourne hors ZAILON (Steam, launcher
   * externe…) — la session est créée automatiquement, sans bouton « Attacher ».
   * Le déploiement pré-lancement n'est pas appliqué (deploymentActive: false) ;
   * les fonctions runtime attachables (QWERTY, visuel, compteur) le sont. */
  attachDetectedGame: (gameId, processName, confidence, evidence) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    if (!game) return
    const existing = state.gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    if (existing) { state.sessionGameDetected(gameId, processName, confidence, evidence); return }
    const adapter = adapterFor(game)
    const profile = [...game.profiles].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0] ?? game.profiles[0]
    if (!profile) return
    const now = Date.now()
    const session: GameSession = {
      id: createId(),
      gameId,
      profileId: profile.id,
      launchStrategy: adapter.launchBehavior,
      launcherProcessIds: [],
      gameProcessIds: [],
      startedAt: now,
      gameDetectedAt: now,
      state: 'GameRunning',
      runtimeToolsActive: true,
      deploymentActive: false,
      inputProfileActive: true,
      visualProfileActive: true,
      source: 'external',
      finalProcess: processName,
      confidence,
      presenceEvidence: evidence,
      lastSeenAt: now,
      possibleExitSince: undefined,
      timeline: [{ at: now, stage: 'GameAttached', detail: `${processName || 'Processus'} détecté hors ZAILON (${evidence?.join(', ') || 'présence'}) — confiance ${confidence ?? '—'}%` }],
    }
    set(current => ({
      gameSessions: [session, ...current.gameSessions.filter(item => item.gameId !== gameId || item.state === 'Ended' || item.state === 'Failed')],
      isPlaying: true,
      playStartTime: now,
      sessionTime: 0,
    }))
    get().recordNotice(`${game.name} détecté — session ZAILON récupérée automatiquement.`)
    // Spec #21-24 : détecté hors ZAILON → « Jeu détecté par ZAILON » ; si ZAILON
    // vient de redémarrer, le jeu tournait déjà → « Session récupérée ».
    get().setSessionToast({
      kind: recoveryKind(STORE_BOOTED_AT, now, RECOVERY_GRACE_MS),
      gameName: game.name,
      at: now,
    })
    // Spec #41 : jeu fonctionnel (détecté) → référence Last Known Good.
    get().recordLastKnownGoodFrameworks(gameId)
    get().applyInputArbiter()
  },
  attachGameSession: (gameId, profileId, processName) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    if (!game) return
    const adapter = adapterFor(game)
    const now = Date.now()
    const existing = state.gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    if (existing) {
      set(current => ({
        gameSessions: current.gameSessions.map(item => item.id === existing.id ? {
          ...item,
          state: 'GameRunning',
          source: item.source === 'zailon' ? 'reattached' : item.source,
          gameDetectedAt: item.gameDetectedAt || now,
          finalProcess: processName,
          runtimeToolsActive: true,
          inputProfileActive: true,
          visualProfileActive: true,
          reattachUntil: undefined,
          timeline: [...item.timeline, { at: now, stage: 'GameAttached', detail: processName ? `${processName} (rattachement manuel)` : 'Rattachement manuel' }],
        } : item),
        isPlaying: true,
      }))
    } else {
      const session: GameSession = {
        id: createId(),
        gameId,
        profileId,
        launchStrategy: adapter.launchBehavior,
        launcherProcessIds: [],
        gameProcessIds: [],
        startedAt: now,
        gameDetectedAt: now,
        state: 'GameRunning',
        runtimeToolsActive: true,
        deploymentActive: true,
        inputProfileActive: true,
        visualProfileActive: true,
        source: 'manual',
        finalProcess: processName,
        timeline: [{ at: now, stage: 'GameAttached', detail: processName ? `${processName} (lancé hors ZAILON)` : 'Jeu détecté hors ZAILON' }],
      }
      set(current => ({
        gameSessions: [session, ...current.gameSessions.filter(item => item.gameId !== gameId || item.state === 'Ended' || item.state === 'Failed')],
        isPlaying: true,
        playStartTime: now,
        sessionTime: 0,
      }))
    }
    get().recordNotice(`${game.name} — session attachée à ZAILON.`)
  },
  prepareAndWait: (gameId, profileId) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    if (!game) return
    const adapter = adapterFor(game)
    const now = Date.now()
    const session: GameSession = {
      id: createId(),
      gameId,
      profileId,
      launchStrategy: adapter.launchBehavior,
      launcherProcessIds: [],
      gameProcessIds: [],
      startedAt: now,
      state: 'WaitingForGame',
      runtimeToolsActive: false,
      deploymentActive: true,
      inputProfileActive: false,
      visualProfileActive: false,
      source: 'manual',
      reattachUntil: now + adapter.reattachWindowSeconds * 1000,
      timeline: [{ at: now, stage: 'WaitingForGame', detail: 'Préparer et attendre le jeu — lancez-le depuis son launcher officiel' }],
    }
    set(current => ({
      gameSessions: [session, ...current.gameSessions.filter(item => item.gameId !== gameId || item.state === 'Ended' || item.state === 'Failed')],
      isPlaying: true,
      playStartTime: now,
      sessionTime: 0,
      notice: `${game.name} : mods préparés, watcher actif. Lancez le jeu normalement (launcher officiel) — ZAILON l'attachera automatiquement.`,
    }))
  },
  continueWaiting: (gameId) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const session = state.gameSessions.find(item => item.gameId === gameId && (item.state === 'GameLost' || item.state === 'WaitingForGame'))
    if (!game || !session) return
    const adapter = adapterFor(game)
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        state: 'WaitingForGame',
        reattachUntil: Date.now() + adapter.reattachWindowSeconds * 1000,
        timeline: [...item.timeline, { at: Date.now(), stage: 'WaitingForGame', detail: 'Attente prolongée' }],
      } : item),
    }))
  },
  endSession: (gameId, reason) => {
    const state = get()
    const session = state.gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    const game = state.games.find(item => item.id === gameId)
    // Fin réelle de session : restaure le déploiement temporaire restant. Pour un
    // jeu lancé via un launcher intermédiaire, le déploiement n'est JAMAIS démonté
    // à la fermeture du launcher (spec) — il est restauré ici, à la fin de session.
    if (session?.deploymentActive && game?.installDirectory && native.isDesktop()) {
      void native.restoreDeploymentSession(game.id, game.installDirectory).catch(() => undefined)
    }
    if (!session) { state.stopPlaying(gameId, undefined, reason); return }
    state.stopPlaying(gameId, session.profileId, undefined)
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        state: 'Ended',
        endedAt: Date.now(),
        runtimeToolsActive: false,
        deploymentActive: false,
        inputProfileActive: false,
        visualProfileActive: false,
        timeline: [...item.timeline, { at: Date.now(), stage: 'GameExited', detail: reason || 'Session terminée' }],
      } : item),
    }))
    get().applyInputArbiter()
  },
  /** Watchdog de session : quand la fenêtre de rattachement expire, la session
   * passe en GameLost — SAUF si Steam indique encore que le jeu tourne
   * (preuve de présence supplémentaire, spec GameSessionV2) : dans ce cas
   * l'attente est prolongée, le déploiement et le compteur restent actifs. */
  sessionWatchdog: (steamAppIds = []) => {
    const state = get()
    const now = Date.now()
    const expired = state.gameSessions.filter(item => (item.state === 'WaitingForGame' || item.state === 'WaitingForElevation') && item.reattachUntil !== undefined && now > item.reattachUntil)
    if (!expired.length) return
    const steamAlive = new Set(steamAppIds)
    const stillWaiting: GameSession[] = []
    const lost: GameSession[] = []
    for (const session of expired) {
      const game = state.games.find(item => item.id === session.gameId)
      const adapter = game ? adapterFor(game) : FALLBACK_ADAPTER
      if (adapter.steamAppId !== undefined && steamAlive.has(adapter.steamAppId)) stillWaiting.push(session)
      else lost.push(session)
    }
    if (lost.length) {
      set(current => ({
        gameSessions: current.gameSessions.map(item => lost.some(lostItem => lostItem.id === item.id) ? {
          ...item,
          state: 'GameLost',
          timeline: [...item.timeline, { at: now, stage: 'GameLost', detail: 'Aucun processus final détecté pendant la fenêtre de rattachement' }],
        } : item),
      }))
      lost.forEach(session => {
        const game = state.games.find(item => item.id === session.gameId)
        // Le jeu n'a jamais démarré : restaure le déploiement laissé par le
        // launcher intermédiaire (démontage jamais fait à la sortie du launcher).
        if (session.deploymentActive && game?.installDirectory && native.isDesktop()) {
          void native.restoreDeploymentSession(game.id, game.installDirectory).catch(() => undefined)
        }
        get().recordNotice(`${game?.name || session.gameId} : le launcher a été ouvert mais le jeu n'a pas été détecté.`)
      })
    }
    if (stillWaiting.length) {
      set(current => ({
        gameSessions: current.gameSessions.map(item => stillWaiting.some(stillItem => stillItem.id === item.id) ? {
          ...item,
          reattachUntil: now + 45_000,
          timeline: [...item.timeline, { at: now, stage: 'SteamEvidence', detail: 'Steam indique que le jeu est encore actif — attente prolongée' }],
        } : item),
      }))
    }
  },
  /** Spec RuntimeSessionV3 §1-5 : rapport de présence du PROCESSUS FINAL pour
   * les sessions GameRunning. Un launcher encore ouvert ou un Steam bloqué ne
   * maintiennent jamais « En cours » : sans preuve du jeu final pendant la
   * période PossibleExit, la session se termine réellement (restauration du
   * déploiement, arrêt du timer, remapping restauré). */
  sessionPresenceReport: (gameId, present, evidence) => {
    const state = get()
    const session = state.gameSessions.find(item => item.gameId === gameId && item.state === 'GameRunning')
    if (!session) return
    const now = Date.now()
    const evaluation = evaluateSessionEnd({
      running: true,
      present,
      possibleExitSince: session.possibleExitSince,
      now,
    })
    if (evaluation.shouldEnd) {
      const game = state.games.find(item => item.id === gameId)
      const totalSeconds = Math.max(0, Math.floor((now - session.startedAt) / 1000))
      state.endSession(gameId, evaluation.reason)
      const minutes = Math.floor(totalSeconds / 60)
      const hours = Math.floor(minutes / 60)
      const duration = hours > 0
        ? `${hours} h ${minutes % 60} min`
        : minutes > 0
          ? `${minutes} min`
          : `${totalSeconds} s`
      // Toast « Session terminée » (spec §52) : bref, aucune action requise.
      get().setSessionToast({ kind: 'ended', gameName: game?.name || session.gameId, at: now, detail: `Session terminée · ${duration}` })
      return
    }
    const firstAbsence = evaluation.possibleExitSince !== undefined && session.possibleExitSince === undefined
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        lastSeenAt: evaluation.present ? now : item.lastSeenAt,
        possibleExitSince: evaluation.present ? undefined : (evaluation.possibleExitSince ?? item.possibleExitSince),
        ...(evaluation.present && evidence && evidence.length ? { presenceEvidence: evidence } : {}),
        timeline: firstAbsence ? [...item.timeline, { at: now, stage: 'PossibleExit', detail: 'Plus aucun processus final ni fenêtre du jeu détecté — vérification de fermeture en cours' }] : item.timeline,
      } : item),
    }))
  },
  setExplorePlatform: explorePlatform => set({ explorePlatform, exploreMods: [], explorePage: 1, exploreError: undefined }),
  setExploreGame: exploreGameId => set(state => {
    const selectedGame = [...state.exploreGames, ...state.explorePinnedGames, ...state.exploreRecentGames].find(game => game.id === exploreGameId)
    const recent = selectedGame ? [selectedGame, ...state.exploreRecentGames.filter(game => game.id !== exploreGameId)].slice(0, 8) : state.exploreRecentGames
    return { exploreGameId, exploreRecentGames: recent, exploreMods: [], explorePage: 1, exploreError: undefined }
  }),
  setExploreGameQuery: exploreGameQuery => set({ exploreGameQuery }),
  searchExploreGames: async () => {
    const query = get().exploreGameQuery.trim()
    if (query.length < 2) { exploreGameController?.abort(); set({ exploreGames: [...GAMEBANANA_GAMES], exploreGamesLoading: false, exploreGameError: undefined }); return }
    exploreGameController?.abort()
    exploreGameController = new AbortController()
    const request = ++exploreGameRequest
    set({ exploreGamesLoading: true, exploreGameError: undefined })
    try {
      const exploreGames = await searchGamebananaGames(query, exploreGameController.signal)
      if (request === exploreGameRequest) set({ exploreGames, exploreGamesLoading: false })
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError' && request === exploreGameRequest) set({ exploreGamesLoading: false, exploreGameError: asError(error) })
    }
  },
  pinExploreGame: game => set(state => ({
    explorePinnedGames: state.explorePinnedGames.some(item => item.id === game.id)
      ? state.explorePinnedGames.filter(item => item.id !== game.id)
      : [game, ...state.explorePinnedGames],
  })),
  setExploreSearch: exploreSearch => set({ exploreSearch, explorePage: 1 }),
  setExplorePage: explorePage => set({ explorePage: Math.max(1, explorePage) }),
  setExploreSort: exploreSort => set({ exploreSort, explorePage: 1 }),
  setExploreGrid: exploreGrid => set({ exploreGrid }),
  setExploreColumns: exploreColumns => set({ exploreColumns }),
  refreshExplore: async () => {
    const { explorePlatform, exploreGameId, exploreSearch, explorePage, exploreSort } = get()
    if (explorePlatform !== 'gamebanana') {
      set({ exploreMods: [], exploreError: `${explorePlatform} exige ses propres identifiants API et n’est pas encore connecté.` })
      return
    }
    exploreCatalogController?.abort()
    exploreCatalogController = new AbortController()
    const request = ++exploreCatalogRequest
    set({ exploreLoading: true, exploreError: undefined })
    try {
      const result = await fetchGamebananaMods(exploreGameId, exploreSearch, explorePage, exploreSort, exploreCatalogController.signal)
      if (request === exploreCatalogRequest) set({ exploreMods: result.mods, exploreHasNextPage: result.hasNextPage, exploreLoading: false })
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError' && request === exploreCatalogRequest) set({ exploreLoading: false, exploreError: asError(error) })
    }
  },
  installMod: async (mod, target) => {
    const fallback = selected(get())
    const game = target ? get().games.find(item => item.id === target.gameId) : fallback.game
    const profile = target ? game?.profiles.find(item => item.id === target.profileId) : fallback.profile
    if (!game || !profile) { set({ notice: 'Sélectionnez un jeu et un profil avant l’import.' }); return }
    try {
      let downloadUrl = mod.downloadUrl
      let fileName = mod.fileName
      if (!downloadUrl && mod.platform === 'gamebanana' && mod.modId) {
        const download = await fetchGamebananaDownload(mod.modId)
        downloadUrl = download.url
        fileName = download.fileName
      }
      if (!downloadUrl || !fileName) throw new Error('Aucun téléchargement direct n’est disponible pour ce mod.')
      const download = await native.installMod(downloadUrl, fileName, game.name, 'quarantine')
      if (download.status === 'CompletedWithWarnings') {
        const now = Math.floor(Date.now() / 1000)
        get().upsertBackgroundTask({
          id: createId(), kind: 'mod-import', title: `Mod importé · ${mod.name}`, status: 'completed_with_warnings',
          processed: download.sensitiveFiles.length, total: download.sensitiveFiles.length,
          message: `${download.sensitiveFiles.length} fichier(s) sensible(s) isolé(s). ${download.warnings.join(' ')}`,
          startedAt: now, updatedAt: now,
        })
      }
      if (!download.path) {
        set({ notice: `Téléchargement isolé : ${download.warnings.join(' ')}` })
        return
      }
      const taskId = createId()
      const imported = await native.importModCandidatesBackground(taskId, game.id, [profile.id], [download.path], game.name, game.modsPath || game.installDirectory || '', true, 'quarantine', task => get().upsertBackgroundTask(task))
      await get().registerImportedStages(game.id, profile.id, imported.installedPaths, true)
      await get().scanMods(game.id)
      set(state => ({
        games: state.games.map(item => item.id === game.id ? {
          ...item,
          profiles: item.profiles.map(profileItem => profileItem.id === profile.id ? {
            ...profileItem,
            installHistory: [{ name: mod.name, action: 'added' as const, at: Date.now() }, ...(profileItem.installHistory || [])].slice(0, 50),
          } : profileItem),
        } : item),
      }))
      set({ notice: imported.status === 'CompletedWithWarnings' || download.status === 'CompletedWithWarnings' ? `${mod.name} a été importé avec avertissement : ${(download.sensitiveFiles.length + imported.sensitiveFiles.length)} fichier(s) sensible(s) isolé(s). Aucun n’a été exécuté.` : `${mod.name} a été téléchargé, validé et stocké. Il sera rendu visible dans ${game.name} au prochain lancement après vérification.` })
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  setConflictWinner: (path, winnerModId) => {
    const { game, profile } = selected(get())
    if (!game || !profile || profile.locked) return
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, conflictRules: [...(current.conflictRules || []).filter(rule => rule.path.toLocaleLowerCase() !== path.toLocaleLowerCase()), { path, winnerModId }] })) }))
    const updated = get().games.find(item => item.id === game.id)?.profiles.find(item => item.id === profile.id)
    if (updated && native.isDesktop()) void native.syncProfileState(game.id, updated).catch(error => set({ notice: asError(error) }))
  },
  replaceBackgroundTasks: backgroundTasks => set({ backgroundTasks: [...backgroundTasks].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 500) }),
  upsertBackgroundTask: task => set(state => ({ backgroundTasks: [task, ...state.backgroundTasks.filter(item => item.id !== task.id)].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 500) })),
  setTaskToastsEnabled: taskToastsEnabled => set({ taskToastsEnabled }),
  setTaskAutoReduceImports: taskAutoReduceImports => set({ taskAutoReduceImports }),
  setLibraryViewMode: libraryViewMode => set({ libraryViewMode }),
  setGamesBrowsing: gamesBrowsing => set({ gamesBrowsing }),
  setActivityMaxEvents: activityMaxEvents => set({ activityMaxEvents }),
  setDownloadRetention: downloadRetention => set({ downloadRetention }),
  setRemapSuspendShortcut: remapSuspendShortcut => set({ remapSuspendShortcut }),
  setRemapKillSwitchShortcut: remapKillSwitchShortcut => set({ remapKillSwitchShortcut }),
  setQuickPanelEnabled: quickPanelEnabled => set({ quickPanelEnabled }),
  setQuickPanelShortcut: quickPanelShortcut => set({ quickPanelShortcut }),
  setReduceActivityDuringGame: reduceActivityDuringGame => set({ reduceActivityDuringGame }),
  setAutoMinimizeOnGameStart: autoMinimizeOnGameStart => set({ autoMinimizeOnGameStart }),
  setRestoreAfterGame: restoreAfterGame => set({ restoreAfterGame }),
  setSessionInputActive: (gameId, active) => {
    const session = get().gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    if (!session) return
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        inputProfileActive: active,
        timeline: [...item.timeline, { at: Date.now(), stage: active ? 'InputProfileEnabled' : 'InputProfileDisabled', detail: 'Panneau rapide' }],
      } : item),
    }))
  },
  /** Priorité épinglée : la session du jeu reste prioritaire même si une autre
   * prend le premier plan (spec multi-sessions). `undefined` = automatique. */
  setPinnedPriority: pinnedPriorityGameId => {
    set({ pinnedPriorityGameId })
    get().applyInputArbiter()
  },
  setForegroundGame: foregroundGameId => {
    const state = get()
    if (state.foregroundGameId === foregroundGameId) return
    set({ foregroundGameId })
    state.applyInputArbiter()
  },
  setSessionToast: toast => set({ sessionToast: toast }),
  /** Last Known Good (§41) : empreinte des frameworks du profil actif, à
   * enregistrer quand le processus final est détecté (jeu fonctionnel). */
  recordLastKnownGoodFrameworks: gameId => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const profile = game?.profiles.find(item => item.id === state.selectedProfileId) ?? game?.profiles[0]
    if (!game || !profile) return
    const snapshot = fingerprintFrameworkSet(resolveProfileMods(game, profile))
    if (!Object.keys(snapshot).length) return
    set(current => ({ lastKnownGoodFrameworks: { ...(current.lastKnownGoodFrameworks || {}), [gameId]: snapshot } }))
  },
  setLockFrameworks: (gameId, profileId, locked) => set(state => ({
    games: state.games.map(game => game.id !== gameId ? game : {
      ...game,
      profiles: game.profiles.map(profile => profile.id !== profileId ? profile : { ...profile, lockFrameworks: locked }),
    }),
  })),
  /** Apprentissage (§7 / #36) : le processus final confirmé devient la référence
   * de détection — au prochain lancement, même si l'exécutable a changé (mise à
   * jour du jeu), la signature apprise permet une détection instantanée. */
  learnGameProcessSignature: (gameId, filename, relativePath, publisher) => {
    if (!filename.trim()) return
    const signature: GameProcessSignature = {
      filename,
      relativePath: relativePath || undefined,
      publisher: publisher || undefined,
      seenAt: Date.now(),
      schemaVersion: 1,
    }
    set(current => ({
      gameProcessSignatures: { ...(current.gameProcessSignatures || {}), [gameId]: signature },
    }))
  },
  /** Rich Presence prioritaire (§14) : publiée pour la session prioritaire en
   * cours quand la présence est activée, arrêtée sinon. Appelée par
   * `applyInputArbiter` (donc à chaque transition de session / changement de
   * priorité) et par `toggleDiscord`. */
  syncDiscordPresence: () => {
    const state = get()
    const stop = () => void native.clearDiscordActivity().catch(() => undefined)
    if (!state.discordPresence) { stop(); return }
    const priorityGameId = pickPrioritySession(state.gameSessions, state.pinnedPriorityGameId, state.foregroundGameId)
    const session = state.gameSessions.find(item => item.gameId === priorityGameId && item.state === 'GameRunning')
    if (!session) { stop(); return }
    const game = state.games.find(item => item.id === session.gameId)
    const profile = game?.profiles.find(item => item.id === session.profileId)
    if (!game || !profile) { stop(); return }
    const activeMods = resolveProfileMods(game, profile).filter(mod => mod.enabled).length
    void native.setDiscordActivityFor({
      gameName: game.name,
      profileName: profile.name,
      activeMods,
      config: {
        enabled: true,
        clientId: state.discordClientId,
        largeImageKey: state.discordLargeImageKey || undefined,
        showProfile: state.discordShowProfile,
        showModCount: state.discordShowModCount,
        showElapsed: state.discordShowElapsed,
      },
    }).catch(() => undefined)
  },
  /** Visual Profiles multi-apps (§9) : seule la session au premier plan applique
   * son profil — l'association du jeu/profil est appliquée à l'Alt+Tab (la
   * session devient prioritaire), l'état système est restauré quand aucune
   * session prioritaire n'a d'association ou plus aucune session n'est active. */
  syncVisualProfiles: async () => {
    const state = get()
    const priorityGameId = pickPrioritySession(state.gameSessions, state.pinnedPriorityGameId, state.foregroundGameId)
    const session = state.gameSessions.find(item => item.gameId === priorityGameId && item.state === 'GameRunning')
    const game = session ? state.games.find(item => item.id === session.gameId) : undefined
    const profile = session && game ? game.profiles.find(item => item.id === session.profileId) : undefined
    // Indicateurs : un seul profil « actif » possible — celui de la prioritaire
    // (même arbitrage que les entrées : seule la prioritaire en GameRunning).
    const visual = arbitrateInputProfiles(state.gameSessions, priorityGameId)
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.visualProfileActive === visual[item.gameId] ? item : { ...item, visualProfileActive: visual[item.gameId] }),
    }))
    if (!session || !game || !profile) {
      if (lastVisualAppliedGameId) {
        lastVisualAppliedGameId = undefined
        await native.visualProfiles.restore().catch(() => undefined)
      }
      return
    }
    const visualProfileId = await native.visualProfiles.association(game.id, profile.id).catch(() => null)
    if (visualProfileId) {
      await native.visualProfiles.apply(visualProfileId).catch(() => undefined)
      lastVisualAppliedGameId = game.id
    } else if (lastVisualAppliedGameId && lastVisualAppliedGameId !== game.id) {
      // La session prioritaire n'a pas d'association mais un autre jeu avait
      // appliqué un profil → restaurer pour ne jamais superposer deux profils.
      lastVisualAppliedGameId = undefined
      await native.visualProfiles.restore().catch(() => undefined)
    }
  },
  /** Annule une session encore en recherche (launcher ouvert, jeu pas encore
   * identifié) : arrête le suivi ZAILON et restaure le déploiement SANS toucher
   * au launcher externe (Steam / launcher officiel peuvent rester ouverts). */
  cancelSession: gameId => {
    const state = get()
    const game = state.games.find(item => item.id === gameId)
    const session = state.gameSessions.find(item => item.gameId === gameId && item.state !== 'Ended' && item.state !== 'Failed')
    if (!session) return
    if (session.deploymentActive && game?.installDirectory && native.isDesktop()) {
      void native.restoreDeploymentSession(game.id, game.installDirectory).catch(() => undefined)
    }
    state.stopPlaying(gameId, session.profileId, undefined)
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.id === session.id ? {
        ...item,
        state: 'Ended',
        endedAt: Date.now(),
        deploymentActive: false,
        inputProfileActive: false,
        visualProfileActive: false,
        timeline: [...item.timeline, { at: Date.now(), stage: 'GameExited', detail: 'Recherche annulée par l’utilisateur — le launcher externe peut rester ouvert' }],
      } : item),
      pinnedPriorityGameId: current.pinnedPriorityGameId === gameId ? undefined : current.pinnedPriorityGameId,
    }))
    get().recordNotice(`${game?.name || gameId} : suivi ZAILON arrêté. Le launcher externe n’a pas été fermé.`)
  },
  /** Arbitrage des mappings clavier (spec « un seul mapping de fenêtre actif à
   * la fois ») : seule la session prioritaire en GameRunning garde son entrée
   * active. Appelé après chaque transition de session et changement de priorité. */
  applyInputArbiter: () => {
    const state = get()
    const priority = pickPrioritySession(state.gameSessions, state.pinnedPriorityGameId, state.foregroundGameId)
    const active = arbitrateInputProfiles(state.gameSessions, priority)
    set(current => ({
      gameSessions: current.gameSessions.map(item => item.inputProfileActive === active[item.gameId] ? item : {
        ...item,
        inputProfileActive: active[item.gameId],
        timeline: item.state === 'GameRunning' && item.inputProfileActive !== active[item.gameId]
          ? [...item.timeline, { at: Date.now(), stage: active[item.gameId] ? 'InputProfileEnabled' : 'InputProfileDisabled', detail: 'Arbitrage multi-sessions — session prioritaire' }]
          : item.timeline,
      }),
    }))
    // §14 : la Rich Presence suit la session prioritaire (une seule activité).
    get().syncDiscordPresence()
    // §9 : un seul Visual Profile au premier plan (association appliquée/
    // restaurée selon la session prioritaire).
    void get().syncVisualProfiles()
  },
  setReduceExplanations: reduceExplanations => set({ reduceExplanations }),
  setAdvancedMode: advancedMode => set({ advancedMode }),
  cleanupBackgroundTasks: () => set(state => {
    if (state.downloadRetention === 'never') return {}
    const cutoffSeconds = Date.now() / 1000 - (state.downloadRetention === 'startup' ? 0 : (state.downloadRetention === '1d' ? 24 : 7 * 24) * 3600)
    const keepFailedUntil = Date.now() / 1000 - 7 * 24 * 3600
    const next = state.backgroundTasks.filter(task =>
      task.status === 'running' || task.status === 'awaiting_user_decision'
      || task.status === 'failed' && task.updatedAt >= keepFailedUntil
      || task.updatedAt >= cutoffSeconds
    )
    return next.length === state.backgroundTasks.length ? {} : { backgroundTasks: next }
  }),
  clearBackgroundTasks: () => set(state => ({
    backgroundTasks: state.backgroundTasks.filter(task => task.status === 'running' || task.status === 'awaiting_user_decision'),
  })),
  setShowSupportButton: showSupportButton => set({ showSupportButton }),
  setGameAutoAttach: (gameId, enabled) => set(state => ({
    autoAttachGames: enabled ? [...new Set([...(state.autoAttachGames || []), gameId])] : (state.autoAttachGames || []).filter(id => id !== gameId),
  })),
  setAccentColor: accentColor => {
    if (/^#[0-9a-f]{6}$/i.test(accentColor)) accentDebouncer.push(accentColor)
  },
  flushPendingSettings: () => { accentDebouncer.flush() },
  bulkSetEnabled: async (modIds, enabled) => {
    const { game, profile } = selected(get())
    if (!game || !profile || !modIds.length) return
    if (profile.locked) { set({ notice: `Le profil « ${profile.name} » est verrouillé.` }); return }
    const allowed = new Set(modIds)
    const resolved = resolveProfileMods(game, profile)
    const next = cloneProfile(profile)
    resolved.forEach((mod, index) => {
      if (!allowed.has(mod.id)) return
      next.modStates[mod.id] = { ...(next.modStates[mod.id] || { priority: index }), enabled }
    })
    const id = createId()
    try {
      // Désactiver TOUTE la sélection des actifs = désactivation massive
      // explicite (spec §8) — le garde anti-clear est levé dans ce cas.
      const explicitDisableAll = !enabled && resolved.filter(mod => mod.enabled).every(mod => allowed.has(mod.id))
      const [persisted] = await persistProfileTransaction(game.id, id, [cloneProfile(profile)], [next], { explicitDisableAll })
      const operation: BulkOperation = {
        id, kind: enabled ? 'enable' : 'disable', gameId: game.id, profileIds: [profile.id], modIds,
        createdAt: Date.now(), label: `${enabled ? 'Activation' : 'Désactivation'} de ${modIds.length} mod(s)`,
        beforeProfiles: [cloneProfile(profile)], afterProfiles: [cloneProfile(persisted)], undoable: true,
      }
      set(state => ({
        games: state.games.map(item => item.id === game.id ? replaceProfiles(item, [persisted]) : item),
        bulkHistory: [...state.bulkHistory, operation].slice(-30),
        notice: `${operation.label} terminée.`,
      }))
    } catch (error) { set({ notice: asError(error) }) }
  },
  bulkTransferMods: async (modIds, destinationProfileId, mode) => {
    const { game, profile: source } = selected(get())
    const destination = game?.profiles.find(item => item.id === destinationProfileId)
    if (!game || !source || !destination || source.id === destination.id || !modIds.length) return
    if (source.locked || destination.locked) { set({ notice: 'Le profil source ou destination est verrouillé.' }); return }
    const before = [cloneProfile(source), cloneProfile(destination)]
    const nextSource = cloneProfile(source)
    const nextDestination = cloneProfile(destination)
    const resolved = new Map(resolveProfileMods(game, source).map((mod, index) => [mod.id, { mod, index }]))
    modIds.forEach(modId => {
      const entry = resolved.get(modId)
      if (!entry) return
      const state = source.modStates[modId] || { enabled: entry.mod.enabled, priority: entry.index, note: entry.mod.note }
      nextDestination.modStates[modId] = { ...state }
      if (mode === 'move') delete nextSource.modStates[modId]
    })
    const after = mode === 'move' ? [nextSource, nextDestination] : [nextDestination]
    const transactionBefore = mode === 'move' ? before : [before[1]]
    const id = createId()
    try {
      // Un « move » qui déplace tous les mods actifs de la source est une
      // opération explicite — le garde anti-clear est levé.
      const persisted = await persistProfileTransaction(game.id, id, transactionBefore, after, { allowEmpty: mode === 'move' })
      const operation: BulkOperation = {
        id, kind: mode, gameId: game.id, profileIds: [source.id, destination.id], modIds, createdAt: Date.now(),
        label: `${mode === 'move' ? 'Transfert' : 'Copie'} de ${modIds.length} mod(s) vers ${destination.name}`,
        beforeProfiles: transactionBefore, afterProfiles: persisted.map(cloneProfile), undoable: true,
      }
      set(state => ({
        games: state.games.map(item => item.id === game.id ? replaceProfiles(item, persisted) : item),
        bulkHistory: [...state.bulkHistory, operation].slice(-30),
        notice: `${operation.label} terminée sans dupliquer les fichiers immuables.`,
      }))
    } catch (error) { set({ notice: asError(error) }) }
  },
  bulkDeleteMods: async (modIds, scope) => {
    const { game, profile } = selected(get())
    if (!game || !profile || !modIds.length) return
    if (scope === 'permanent') {
      if (!native.isDesktop()) {
        set({ notice: 'La suppression physique est disponible uniquement dans l’application ZAILON.' })
        return
      }
      const requested = new Set(modIds)
      const candidates = game.installedMods.filter(mod => requested.has(mod.id))
      const succeeded = new Set<string>()
      const failures: string[] = []
      for (const mod of candidates) {
        try {
          if (mod.storage === 'staged' && mod.stageId) await native.deleteStagedMod(game.id, mod.stageId)
          else if (mod.path) await native.deleteMod(mod.path, game.modsPath || '')
          else throw new Error('aucun chemin physique vérifiable')
          succeeded.add(mod.id)
        } catch (error) {
          failures.push(`${mod.name} : ${asError(error)}`)
        }
      }
      if (!succeeded.size) {
        set({ notice: `Aucun fichier supprimé. ${failures[0] || 'Les paquets sont introuvables.'}` })
        return
      }
      const before = game.profiles.map(cloneProfile)
      const after = game.profiles.map(current => {
        const next = cloneProfile(current)
        succeeded.forEach(modId => delete next.modStates[modId])
        return next
      })
      let persisted = after
      let profileError = ''
      try {
        // Suppression physique explicite — le garde anti-clear est levé.
        persisted = await persistProfileTransaction(game.id, createId(), before, after, { allowEmpty: true })
      } catch (error) {
        profileError = asError(error)
      }
      const id = createId()
      const operation: BulkOperation = {
        id, kind: 'delete', gameId: game.id, profileIds: game.profiles.map(item => item.id),
        modIds: [...succeeded], createdAt: Date.now(),
        label: `Suppression définitive de ${succeeded.size} mod(s) du PC`,
        beforeProfiles: [], afterProfiles: persisted.map(cloneProfile), undoable: false,
      }
      set(state => ({
        games: state.games.map(item => item.id !== game.id ? item : {
          ...replaceProfiles(item, persisted),
          installedMods: item.installedMods.filter(mod => !succeeded.has(mod.id)),
        }),
        bulkHistory: [...state.bulkHistory, operation].slice(-30),
        notice: `${operation.label}. Les fichiers ont été effacés et ne peuvent pas être restaurés par ZAILON.${failures.length ? ` ${failures.length} échec(s) conservé(s).` : ''}${profileError ? ` Manifestes à resynchroniser : ${profileError}` : ''}`,
      }))
      return
    }
    const targets = scope === 'all' ? game.profiles : [profile]
    if (targets.some(item => item.locked)) { set({ notice: 'Au moins un profil ciblé est verrouillé.' }); return }
    const before = targets.map(cloneProfile)
    const after = targets.map(current => {
      const next = cloneProfile(current)
      modIds.forEach(modId => delete next.modStates[modId])
      return next
    })
    const id = createId()
    try {
      // Retrait explicite de mods du/des profil(s) — garde anti-clear levé.
      const persisted = await persistProfileTransaction(game.id, id, before, after, { allowEmpty: true })
      const operation: BulkOperation = {
        id, kind: 'delete', gameId: game.id, profileIds: targets.map(item => item.id), modIds, createdAt: Date.now(),
        label: `Retrait de ${modIds.length} mod(s) ${scope === 'all' ? 'de tous les profils' : `du profil ${profile.name}`}`,
        beforeProfiles: before, afterProfiles: persisted.map(cloneProfile), undoable: true,
      }
      set(state => ({
        games: state.games.map(item => item.id === game.id ? replaceProfiles(item, persisted) : item),
        bulkHistory: [...state.bulkHistory, operation].slice(-30),
        notice: `${operation.label}. Les paquets partagés restent dans le store et peuvent être restaurés.`,
      }))
    } catch (error) { set({ notice: asError(error) }) }
  },
  deduplicateStagedMods: async gameId => {
    const game = get().games.find(item => item.id === gameId)
    if (!game) return
    try {
      const preview = await native.previewStagedDuplicates(gameId)
      if (!preview.duplicatePackages) {
        set({ notice: `Aucun doublon physique parmi ${preview.packagesScanned} paquet(s) du store.` })
        return
      }
      const confirmed = window.confirm(
        `${preview.duplicatePackages} copie(s) strictement identique(s) détectée(s) dans ${preview.groups.length} groupe(s).\n\n` +
        `${formatBytes(preview.reclaimableBytes)} seront supprimés du disque. Les profils seront automatiquement reliés à une seule copie.\n\nContinuer ?`,
      )
      if (!confirmed) return
      const result = await native.deduplicateStagedMods(gameId)
      const replacements = new Map(result.replacements.map(item => [item.duplicateId, item.canonicalId]))
      const mergeStates = (profile: Profile): Profile => {
        const modStates = { ...profile.modStates }
        for (const [duplicateId, canonicalId] of replacements) {
          const duplicate = modStates[duplicateId]
          if (!duplicate) continue
          const canonical = modStates[canonicalId]
          modStates[canonicalId] = canonical ? {
            ...canonical,
            enabled: canonical.enabled || duplicate.enabled,
            priority: Math.min(canonical.priority, duplicate.priority),
            note: canonical.note || duplicate.note,
          } : duplicate
          delete modStates[duplicateId]
        }
        return { ...profile, modStates }
      }
      set(state => ({
        games: state.games.map(item => item.id !== gameId ? item : {
          ...item,
          installedMods: item.installedMods.filter(mod => !replacements.has(mod.id)),
          profiles: item.profiles.map(mergeStates),
        }),
        notice: `${result.removedPackages} doublon(s) supprimé(s) définitivement · ${formatBytes(result.reclaimedBytes)} récupérés.${result.warnings.length ? ` ${result.warnings.length} avertissement(s).` : ''}`,
      }))
      await get().scanMods(gameId)
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  purgeUnreferencedStagedMods: async gameId => {
    const game = get().games.find(item => item.id === gameId)
    if (!game) return
    try {
      if (!native.isDesktop()) throw new Error('Le nettoyage physique est disponible uniquement dans l’application ZAILON.')
      for (const profile of game.profiles) {
        await native.syncProfileState(gameId, profile)
      }
      const staged = await native.listStagedMods(gameId)
      const orphaned = staged.filter(mod => !mod.profileIds.length && mod.stageId)
      if (!orphaned.length) {
        set({ notice: `Aucun paquet sans profil parmi ${staged.length} paquet(s) du store.` })
        return
      }
      const bytes = orphaned.reduce((sum, mod) => sum + mod.sizeBytes, 0)
      if (!window.confirm(
        `${orphaned.length} paquet(s) ne sont référencés par aucun profil.\n\n` +
        `${formatBytes(bytes)} seront supprimés définitivement du disque. Cette action n’est pas annulable.\n\nContinuer ?`,
      )) return
      const removed = new Set<string>()
      const failures: string[] = []
      for (const mod of orphaned) {
        try {
          await native.deleteStagedMod(gameId, mod.stageId!)
          removed.add(mod.id)
        } catch (error) {
          failures.push(`${mod.name} : ${asError(error)}`)
        }
      }
      set(state => ({
        games: state.games.map(item => item.id !== gameId ? item : {
          ...item,
          installedMods: item.installedMods.filter(mod => !removed.has(mod.id)),
        }),
        notice: `${removed.size} paquet(s) non référencé(s) supprimé(s) définitivement.${failures.length ? ` ${failures.length} échec(s) conservé(s).` : ''}`,
      }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  bulkAddTag: async (modIds, label) => {
    const { game } = selected(get())
    const tag = createUserTag(label)
    if (!game || !modIds.length || !tag.label) return
    const selectedIds = new Set(modIds)
    const beforeMods = cloneMods(game.installedMods)
    const afterMods = game.installedMods.map(mod => selectedIds.has(mod.id)
      ? { ...mod, categoryTags: [...(mod.categoryTags || []).filter(item => item.id !== tag.id), tag] }
      : mod)
    const operation: BulkOperation = {
      id: createId(), kind: 'tag', gameId: game.id, profileIds: [], modIds, createdAt: Date.now(),
      label: `Étiquette « ${tag.label} » ajoutée à ${modIds.length} mod(s)`, beforeProfiles: [], afterProfiles: [],
      beforeMods, afterMods: cloneMods(afterMods), undoable: true,
    }
    set(state => ({
      games: state.games.map(item => item.id === game.id ? { ...item, installedMods: afterMods } : item),
      bulkHistory: [...state.bulkHistory, operation].slice(-30), notice: operation.label,
    }))
  },
  undoLastBulkOperation: async () => {
    const operation = [...get().bulkHistory].reverse().find(item => item.undoable)
    if (!operation) { set({ notice: 'Aucune opération groupée annulable.' }); return }
    const game = get().games.find(item => item.id === operation.gameId)
    if (!game) return
    try {
      let restoredProfiles = operation.beforeProfiles
      if (operation.beforeProfiles.length) {
        const current = operation.afterProfiles.map(profile => game.profiles.find(item => item.id === profile.id)).filter(Boolean) as Profile[]
        // Restauration explicite de l'état antérieur à l'opération annulée.
        restoredProfiles = await persistProfileTransaction(game.id, createId(), current.map(cloneProfile), operation.beforeProfiles.map(cloneProfile), { allowEmpty: true })
      }
      set(state => ({
        games: state.games.map(item => item.id !== game.id ? item : {
          ...replaceProfiles(item, restoredProfiles),
          installedMods: operation.beforeMods ? cloneMods(operation.beforeMods) : item.installedMods,
        }),
        bulkHistory: state.bulkHistory.filter(item => item.id !== operation.id),
        notice: `Opération annulée : ${operation.label}.`,
      }))
    } catch (error) { set({ notice: asError(error) }) }
  },
  toggleProfileLock: profileId => {
    const { game } = selected(get())
    const profile = game?.profiles.find(item => item.id === profileId)
    if (!game || !profile) return
    if (profile.locked && !window.confirm(`Déverrouiller le profil stable « ${profile.name} » ?\n\nZAILON enregistrera d’abord un point de restauration du manifeste. Les paquets physiques ne seront pas modifiés.`)) return
    const next = { ...profile, locked: !profile.locked, stableSince: profile.locked ? undefined : Date.now() }
    set(state => ({ games: updateProfile(state.games, game.id, profileId, () => next), notice: next.locked ? `Profil marqué comme stable : ${next.name}. Les mises à jour et changements sont protégés.` : `Point de restauration créé avant déverrouillage de ${next.name}.` }))
    if (native.isDesktop()) void (async () => {
      if (profile.locked) await native.applyProfileTransaction(game.id, createId(), [cloneProfile(profile)], [cloneProfile(profile)])
      await native.syncProfileState(game.id, next)
    })().catch(error => {
      set(state => ({ games: updateProfile(state.games, game.id, profileId, () => profile), notice: `Protection conservée : ${asError(error)}` }))
    })
  },
  openProfileDirectory: async (profileId, kind = 'root') => {
    const { game } = selected(get())
    const profile = game?.profiles.find(item => item.id === profileId)
    if (!game || !profile) return
    try {
      const paths = native.isDesktop() ? await native.syncProfileState(game.id, profile) : undefined
      if (!paths) { set({ notice: 'Les dossiers de profil sont disponibles dans l’application native.' }); return }
      const path = kind === 'overwrite' ? paths.overwritePath : kind === 'generated' ? paths.generatedPath : paths.directory
      await native.openPath(path)
      set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => withProfilePaths(current, paths)) }))
    } catch (error) { set({ notice: asError(error) }) }
  },
  checkProfileIntegrity: async profileId => {
    const { game } = selected(get())
    const profile = game?.profiles.find(item => item.id === profileId)
    if (!game || !profile || !native.isDesktop()) return undefined
    try {
      await native.syncProfileState(game.id, profile)
      const integrity = await native.profileIntegrity(game.id, profile.id)
      set({ notice: integrity.ok ? `Profil « ${profile.name} » intègre.` : integrity.issues.join(' · ') })
      return integrity
    } catch (error) { set({ notice: asError(error) }); return undefined }
  },
  repairProfileStorage: async gameId => {
    const game = get().games.find(item => item.id === gameId)
    if (!game) return
    const seen = new Set<string>()
    const repaired = game.profiles.map(profile => {
      let id = profile.id
      if (seen.has(id)) id = createId()
      seen.add(id)
      return {
        ...cloneProfile(profile), id, gameId,
        directory: id === profile.id ? profile.directory : undefined,
        manifestPath: id === profile.id ? profile.manifestPath : undefined,
        loadOrderPath: id === profile.id ? profile.loadOrderPath : undefined,
        settingsPath: id === profile.id ? profile.settingsPath : undefined,
        overwritePath: id === profile.id ? profile.overwritePath : undefined,
        generatedPath: id === profile.id ? profile.generatedPath : undefined,
        deploymentPath: id === profile.id ? profile.deploymentPath : undefined,
      }
    })
    try {
      const persisted = await persistProfileTransaction(game.id, createId(), game.profiles.map(cloneProfile), repaired)
      set(state => ({
        games: state.games.map(item => item.id === game.id ? { ...item, profiles: persisted } : item),
        selectedProfileId: persisted.some(profile => profile.id === state.selectedProfileId) ? state.selectedProfileId : persisted[0]?.id,
        notice: `${persisted.length} profil(s) vérifiés et séparés dans leurs répertoires natifs. Aucun état de mod n’a été hérité ou fusionné.`,
      }))
    } catch (error) { set({ notice: asError(error) }) }
  },
  recordNotice: message => set(state => {
    const normalized = message.trim().toLocaleLowerCase().replace(/\d+/g, '#').slice(0, 160)
    const error = /erreur|échec|impossible|failed|invalid|refus|introuvable/i.test(message)
    const warning = /attention|avert|verrouill|requis|manquant|aucun|non trouvé/i.test(message)
    const action = /confirmer|choisissez|sélectionnez|action requise/i.test(message)
    const success = /terminé|créé|ajouté|installé|intègre|annulée|détecté/i.test(message)
    const kind: UiNotification['kind'] = action ? 'action' : error ? 'error' : warning ? 'warning' : success ? 'success' : 'info'
    const durationMs = kind === 'action' ? undefined : kind === 'error' ? 8_000 : kind === 'warning' ? 5_000 : 2_000
    const notification: UiNotification = { id: createId(), key: normalized, message, kind, createdAt: Date.now(), durationMs, completed: true }
    return { notificationHistory: [...state.notificationHistory.filter(item => item.key !== normalized), notification].slice(-(state.activityMaxEvents || 250)) }
  }),
  dismissNotification: id => set(state => ({ notificationHistory: state.notificationHistory.map(item => item.id === id ? { ...item, dismissed: true } : item) })),
  clearCompletedNotifications: () => set(state => ({ notificationHistory: state.notificationHistory.filter(item => !item.completed) })),
  clearNotificationHistory: () => set({ notificationHistory: [] }),
  clearNotice: () => set({ notice: undefined }),
}), {
  name: 'zailon-v1',
  partialize: state => ({
    activeGameTab: state.activeGameTab,
    games: state.games,
    selectedGameId: state.selectedGameId,
    selectedProfileId: state.selectedProfileId,
    nsfw: state.nsfw,
    hideUnclassifiedNsfw: state.hideUnclassifiedNsfw,
    language: state.language,
    textSize: state.textSize,
    uiDensity: state.uiDensity,
    motionMode: state.motionMode,
    coverParallax: state.coverParallax,
    performanceModes: state.performanceModes,
    performanceCustom: state.performanceCustom,
    globalPerformanceMode: state.globalPerformanceMode,
    batteryPerformanceBehavior: state.batteryPerformanceBehavior,
    autoArtwork: state.autoArtwork,
    artworkSteamGridDbKey: state.artworkSteamGridDbKey,
    artworkIgdbClientId: state.artworkIgdbClientId,
    artworkIgdbClientSecret: state.artworkIgdbClientSecret,
    artworkSourceMode: state.artworkSourceMode,
    discordPresence: state.discordPresence,
    discordClientId: state.discordClientId,
    discordLargeImageKey: state.discordLargeImageKey,
    discordShowProfile: state.discordShowProfile,
    discordShowModCount: state.discordShowModCount,
    discordShowElapsed: state.discordShowElapsed,
    autoCheckUpdates: state.autoCheckUpdates,
    autoInstallUpdates: state.autoInstallUpdates,
    modUpdateFrequency: state.modUpdateFrequency,
    autoDownloadModUpdates: state.autoDownloadModUpdates,
    autoInstallModUpdates: state.autoInstallModUpdates,
    updateChannel: state.updateChannel,
    lastUpdateCheck: state.lastUpdateCheck,
    lastUpdateVersion: state.lastUpdateVersion,
    lastUpdateError: state.lastUpdateError,
    lastInstalledUpdate: state.lastInstalledUpdate,
    lastSeenReleaseNotesVersion: state.lastSeenReleaseNotesVersion,
    showReleaseNotesOnUpdate: state.showReleaseNotesOnUpdate,
    explorePlatform: state.explorePlatform,
    exploreGameId: state.exploreGameId,
    explorePinnedGames: state.explorePinnedGames,
    exploreRecentGames: state.exploreRecentGames,
    explorePage: state.explorePage,
    exploreSort: state.exploreSort,
    exploreGrid: state.exploreGrid,
    exploreSearch: state.exploreSearch,
    taskToastsEnabled: state.taskToastsEnabled,
    taskAutoReduceImports: state.taskAutoReduceImports,
    libraryViewMode: state.libraryViewMode,
    activityMaxEvents: state.activityMaxEvents,
    downloadRetention: state.downloadRetention,
    remapSuspendShortcut: state.remapSuspendShortcut,
    remapKillSwitchShortcut: state.remapKillSwitchShortcut,
    reduceActivityDuringGame: state.reduceActivityDuringGame,
    autoMinimizeOnGameStart: state.autoMinimizeOnGameStart,
    restoreAfterGame: state.restoreAfterGame,
    reduceExplanations: state.reduceExplanations,
    advancedMode: state.advancedMode,
    showSupportButton: state.showSupportButton,
    autoAttachGames: state.autoAttachGames,
    restorePoints: state.restorePoints,
    autoRestorePoints: state.autoRestorePoints,
  }),
  version: 3,
  migrate: persisted => migratePersistedState(persisted) as never,
}))

export const appVersion = APP_VERSION
export const getSelectedGame = (state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) => selected(state).game
export const getSelectedProfile = (state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) => selected(state).profile
