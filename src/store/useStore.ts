import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ExplodMod, ExploreSort, Game, GameResources, GameTab, GamebananaGame, LiquidGlassMode, LiquidGlassSettings, LoaderType, Mod, Platform, Profile, ProfileArchiveManifest, ProfileModState, TextSize, UiDensity, UpdateChannel, ViewType } from '../types'
import { BackgroundTaskSnapshot, DetectedGame, native, NativeMod, pickExecutable } from '../lib/native'
import { fetchGamebananaDownload, fetchGamebananaMods, GAMEBANANA_GAMES, searchGamebananaGames } from './gamebanana'

const APP_VERSION = '1.5.0'
const loaderTypes = new Set<LoaderType>(['GIMI', 'ZZMI', 'SRMI', 'WWMI', 'EFMI', 'UE5', 'BepInEx', 'ASI', 'CLEO', 'REF', 'MelonLoader', 'DLL', 'Archive', 'Folder', 'Manual'])
export const DEFAULT_LIQUID_GLASS: LiquidGlassSettings = { opacity: 0.86, blur: 18, darkTint: 0.58, saturation: 1.08, border: 0.12, reflection: 0.08, shadow: 0.5, animations: true, reduceWhenUnfocused: true, preferNative: true }

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

const nativeModToMod = (mod: NativeMod, previous?: Mod, priority = 0): Mod => ({
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
})

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

function statesFromMods(mods: Mod[]): Record<string, ProfileModState> {
  return Object.fromEntries(mods.map((mod, index) => [mod.id, {
    enabled: mod.enabled,
    priority: mod.priority ?? index,
    note: mod.note,
  }]))
}

export function resolveProfileMods(game?: Game, profile?: Profile): Mod[] {
  if (!game || !profile) return []
  const catalog = game.installedMods?.length ? game.installedMods : profile.mods || []
  return decorateMods(catalog.map((mod, index) => {
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

async function automaticArtworkForGame(game: Game): Promise<Partial<GameResources>> {
  if (!native.isDesktop()) return {}
  const assignments: Array<{ kind: 'cover' | 'background' | 'banner' | 'logo' | 'icon'; key: 'coverPath' | 'backgroundPath' | 'bannerPath' | 'logoPath' | 'iconPath' }> = [
    { kind: 'cover', key: 'coverPath' },
    { kind: 'background', key: 'backgroundPath' },
    { kind: 'banner', key: 'bannerPath' },
    { kind: 'logo', key: 'logoPath' },
    { kind: 'icon', key: 'iconPath' },
  ]
  const resources: Partial<GameResources> = {}
  for (const assignment of assignments) {
    try {
      const candidates = await native.searchGameArtwork(game.name, game.provider || game.platform, game.providerGameId, assignment.kind)
      for (const candidate of candidates) {
        try {
          resources[assignment.key] = await native.cacheRemoteGameResource(game.id, assignment.kind, candidate.url)
          break
        } catch { /* essayer le candidat officiel suivant */ }
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
  autoArtwork: boolean
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
  lastInstalledUpdate?: { version: string; notes?: string; date?: string; installedAt: number }
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
  exploreMods: ExplodMod[]
  exploreLoading: boolean
  exploreError?: string
  exploreGamesLoading: boolean
  exploreGameError?: string
  backgroundTasks: BackgroundTaskSnapshot[]
  taskToastsEnabled: boolean
  taskAutoReduceImports: boolean
  libraryViewMode: 'grid' | 'illustrated' | 'compact'
  liquidGlassMode: LiquidGlassMode
  liquidGlassSettings: LiquidGlassSettings
  energySaver: boolean
  showSupportButton: boolean
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
  setGameResources: (gameId: string, resources: Partial<GameResources>) => void
  setGameFavorite: (gameId: string, favorite?: boolean) => void
  setGameHidden: (gameId: string, hidden?: boolean) => void
  setGameCategories: (gameId: string, categories: string[]) => void
  addProfile: (name: string) => void
  duplicateProfile: (profileId: string) => void
  importProfileManifest: (manifest: ProfileArchiveManifest) => void
  renameProfile: (profileId: string, name: string) => void
  removeProfile: (profileId: string) => void
  scanMods: (gameId?: string) => Promise<void>
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
  setAutoArtwork: (enabled: boolean) => void
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
  launchSelectedGame: () => Promise<void>
  stopPlaying: (gameId?: string, profileId?: string, cleanupError?: string) => void
  tick: () => void
  setExplorePlatform: (platform: Platform) => void
  setExploreGame: (gameId: number) => void
  setExploreGameQuery: (query: string) => void
  searchExploreGames: () => Promise<void>
  pinExploreGame: (game: GamebananaGame) => void
  setExploreSearch: (search: string) => void
  setExplorePage: (page: number) => void
  setExploreSort: (sort: ExploreSort) => void
  setExploreGrid: (grid: boolean) => void
  refreshExplore: () => Promise<void>
  installMod: (mod: ExplodMod) => Promise<void>
  replaceBackgroundTasks: (tasks: BackgroundTaskSnapshot[]) => void
  upsertBackgroundTask: (task: BackgroundTaskSnapshot) => void
  setTaskToastsEnabled: (enabled: boolean) => void
  setTaskAutoReduceImports: (enabled: boolean) => void
  setLibraryViewMode: (mode: Store['libraryViewMode']) => void
  setLiquidGlassMode: (mode: LiquidGlassMode) => void
  setLiquidGlassSettings: (settings: Partial<LiquidGlassSettings>) => void
  setEnergySaver: (enabled: boolean) => void
  setShowSupportButton: (enabled: boolean) => void
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
    const installedMods = decorateMods([...catalog.values()])
    const profiles = (game.profiles || []).map((rawProfile, index): Profile => {
      const legacyMods = rawProfile.mods || []
      const legacyByName = new Map(legacyMods.map(mod => [mod.name.toLocaleLowerCase(), mod]))
      const modStates = rawProfile.modStates && Object.keys(rawProfile.modStates).length
        ? rawProfile.modStates
        : Object.fromEntries(installedMods.map((mod, priority) => {
          const legacy = legacyMods.find(item => item.id === mod.id) || legacyByName.get(mod.name.toLocaleLowerCase())
          return [mod.id, { enabled: legacy?.enabled ?? mod.enabled, priority: legacy?.priority ?? priority, note: legacy?.note }]
        }))
      return {
        ...rawProfile,
        mods: undefined,
        modStates,
        createdAt: rawProfile.createdAt || Date.now(),
        isDefault: rawProfile.isDefault ?? index === 0,
      }
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
    liquidGlassMode: state.liquidGlassMode || 'off',
    liquidGlassSettings: { ...DEFAULT_LIQUID_GLASS, ...(state.liquidGlassSettings || {}) },
    energySaver: state.energySaver ?? false,
    showSupportButton: state.showSupportButton ?? true,
  }
}

export const useStore = create<Store>()(persist((set, get) => ({
  currentView: 'home',
  activeGameTab: 'mods',
  games: [],
  selectedGameId: undefined,
  selectedProfileId: undefined,
  nsfw: false,
  hideUnclassifiedNsfw: false,
  language: 'fr',
  textSize: 'normal',
  uiDensity: 'comfortable',
  autoArtwork: false,
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
  isPlaying: false,
  sessionTime: 0,
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
  exploreMods: [],
  exploreLoading: false,
  exploreGamesLoading: false,
  backgroundTasks: [],
  taskToastsEnabled: true,
  taskAutoReduceImports: true,
  libraryViewMode: 'grid',
  liquidGlassMode: 'off',
  liquidGlassSettings: { ...DEFAULT_LIQUID_GLASS },
  energySaver: false,
  showSupportButton: true,
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
      if (get().autoArtwork) {
        fresh.forEach(game => {
          void automaticArtworkForGame(game).then(resources => {
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
  addProfile: name => {
    const { game, profile } = selected(get())
    if (!game || !profile || !name.trim()) return
    const next: Profile = {
      ...profile,
      id: createId(),
      name: name.trim(),
      mods: undefined,
      modStates: { ...profile.modStates },
      playtime: 0,
      lastPlayed: undefined,
      createdAt: Date.now(),
      lastUsed: undefined,
      isDefault: false,
    }
    set(state => ({ games: state.games.map(item => item.id === game.id ? { ...item, profiles: [...item.profiles, next] } : item), selectedProfileId: next.id }))
  },
  duplicateProfile: profileId => {
    const { game } = selected(get())
    const source = game?.profiles.find(profile => profile.id === profileId)
    if (!game || !source) return
    const copy: Profile = {
      ...source,
      id: createId(),
      name: `${source.name} — copie`,
      modStates: { ...source.modStates },
      createdAt: Date.now(),
      lastUsed: undefined,
      isDefault: false,
      locked: false,
    }
    set(state => ({
      games: state.games.map(item => item.id === game.id ? { ...item, profiles: [...item.profiles, copy] } : item),
      selectedProfileId: copy.id,
      notice: `Le profil « ${source.name} » a été dupliqué.`,
    }))
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
    set(state => ({ games: updateProfile(state.games, game.id, profileId, profile => ({ ...profile, name: name.trim() })) }))
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
  },
  scanMods: async gameId => {
    const state = get()
    const game = state.games.find(item => item.id === (gameId ?? state.selectedGameId))
    const profile = game?.profiles.find(item => item.id === state.selectedProfileId) ?? game?.profiles[0]
    if (!game || !profile) return
    try {
      const [folderMods, stagedMods] = await Promise.all([
        game.modsPath ? native.scanMods(game.modsPath) : Promise.resolve([]),
        native.listStagedMods(game.id),
      ])
      const mods = [...stagedMods, ...folderMods.filter(folderMod => !stagedMods.some(staged => staged.fingerprint === folderMod.fingerprint))]
      const previous = resolveProfileMods(game, profile)
      const catalog = scannedMods(mods, game.installedMods || previous)
      const previousStates = profile.modStates || statesFromMods(previous)
      const nextStates = Object.fromEntries(catalog.map((mod, index) => [mod.id, previousStates[mod.id] || {
        enabled: mod.storage === 'staged'
          ? Boolean(mod.profileIds?.includes(profile.id) && mod.deploymentStatus !== 'stored')
          : mod.enabled,
        priority: index,
      }]))
      set(state => ({
        games: state.games.map(item => item.id !== game.id ? item : {
          ...item,
          installedMods: catalog,
          profiles: item.profiles.map(current => current.id === profile.id ? { ...current, mods: undefined, modStates: nextStates } : current),
        }),
        notice: `${mods.length} mod${mods.length !== 1 ? 's' : ''} analysé${mods.length !== 1 ? 's' : ''}, dont ${stagedMods.length} stocké${stagedMods.length !== 1 ? 's' : ''} par ZAILON.`,
      }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  toggleMod: async modId => {
    const { game, profile } = selected(get())
    const mod = resolveProfileMods(game, profile).find(item => item.id === modId)
    if (!game || !profile || !mod) return
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
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  deleteMod: async modId => {
    const { game, profile } = selected(get())
    const mod = resolveProfileMods(game, profile).find(item => item.id === modId)
    if (!game || !profile || !mod) return
    try {
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
    const mods = resolveProfileMods(game, profile)
    const index = mods.findIndex(mod => mod.id === modId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= mods.length) return
    const [moved] = mods.splice(index, 1)
    mods.splice(destination, 0, moved)
    const modStates = statesFromMods(decorateMods(mods))
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, modStates })) }))
  },
  setModNote: (modId, note) => {
    const { game, profile } = selected(get())
    if (!game || !profile) return
    const currentState = profile.modStates[modId] || { enabled: true, priority: 0 }
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, modStates: { ...current.modStates, [modId]: { ...currentState, note } } })) }))
  },
  toggleNSFW: () => set(state => ({ nsfw: !state.nsfw })),
  setHideUnclassifiedNsfw: hideUnclassifiedNsfw => set({ hideUnclassifiedNsfw }),
  setLanguage: language => set({ language }),
  setTextSize: textSize => set({ textSize }),
  setUiDensity: uiDensity => set({ uiDensity }),
  setAutoArtwork: autoArtwork => set({ autoArtwork }),
  toggleDiscord: () => set(state => ({ discordPresence: !state.discordPresence })),
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
  prepareInstalledUpdate: update => set({ lastInstalledUpdate: { ...update, installedAt: Date.now() } }),
  dismissInstalledUpdate: () => set({ lastInstalledUpdate: undefined }),
  launchSelectedGame: async () => {
    const state = get()
    if (state.isPlaying) { set({ notice: 'Un jeu est déjà en cours. Fermez son processus avant un nouveau lancement afin que ZAILON restaure proprement les fichiers temporaires.' }); return }
    const { game, profile } = selected(state)
    if (!game?.execPath) { set({ notice: 'Select a game executable before launching.' }); return }
    if (!profile) { set({ notice: 'Select a profile before launching.' }); return }
    try {
      const enabledMods = resolveProfileMods(game, profile).filter(mod => mod.enabled)
      const executableParent = game.execPath.replace(/[\\/][^\\/]+$/, '')
      const knownRoot = game.name.toLocaleLowerCase().includes('cyberpunk') && /[\\/]bin[\\/]x64(?:[\\/]|$)/i.test(game.execPath)
        ? game.execPath.split(/[\\/]bin[\\/]x64/i)[0]
        : executableParent
      const result = await native.launchGame(game.execPath, game.id, game.name, game.installDirectory || knownRoot, profile.id, profile.name, enabledMods.length, enabledMods.map(mod => mod.stageId || mod.id), profile.conflictRules || [], state.discordPresence ? {
        enabled: true,
        clientId: state.discordClientId,
        largeImageKey: state.discordLargeImageKey || undefined,
        showProfile: state.discordShowProfile,
        showModCount: state.discordShowModCount,
        showElapsed: state.discordShowElapsed,
      } : undefined)
      set(current => ({
        isPlaying: true,
        playStartTime: Date.now(),
        sessionTime: 0,
        games: current.games.map(item => item.id !== game.id ? item : { ...item, installedMods: item.installedMods.map(mod => enabledMods.some(enabled => enabled.id === mod.id) && mod.storage === 'staged' ? { ...mod, deploymentStatus: 'runtime-visible' } : mod) }),
        notice: `${game.name} lancé (PID ${result.pid}) après vérification de ${result.deployedFiles} fichier(s) via ${result.deploymentBackend}. ${result.discordMessage}`,
      }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  stopPlaying: (gameId, profileId, cleanupError) => {
    const state = get()
    const game = state.games.find(item => item.id === gameId) ?? state.games.find(item => item.id === state.selectedGameId)
    const profile = game?.profiles.find(item => item.id === profileId) ?? game?.profiles.find(item => item.id === state.selectedProfileId) ?? game?.profiles[0]
    if (!game || !profile) { set({ isPlaying: false, playStartTime: undefined, sessionTime: 0 }); return }
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
    set({ games, isPlaying: false, playStartTime: undefined, sessionTime: 0, notice: cleanupError ? `Restauration du jeu incomplète : ${cleanupError}` : state.notice })
  },
  tick: () => {
    const { isPlaying, playStartTime } = get()
    if (isPlaying && playStartTime) set({ sessionTime: Math.floor((Date.now() - playStartTime) / 1_000) })
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
  installMod: async mod => {
    const { game, profile } = selected(get())
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
      const downloadedPath = await native.installMod(downloadUrl, fileName)
      const taskId = createId()
      await native.importModCandidatesBackground(taskId, game.id, [profile.id], [downloadedPath], game.name, game.modsPath || game.installDirectory || '', true, task => get().upsertBackgroundTask(task))
      await get().scanMods(game.id)
      set({ notice: `${mod.name} a été téléchargé, validé et stocké. Il sera rendu visible dans ${game.name} au prochain lancement après vérification.` })
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  setConflictWinner: (path, winnerModId) => {
    const { game, profile } = selected(get())
    if (!game || !profile) return
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, conflictRules: [...(current.conflictRules || []).filter(rule => rule.path.toLocaleLowerCase() !== path.toLocaleLowerCase()), { path, winnerModId }] })) }))
  },
  replaceBackgroundTasks: backgroundTasks => set({ backgroundTasks: [...backgroundTasks].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 500) }),
  upsertBackgroundTask: task => set(state => ({ backgroundTasks: [task, ...state.backgroundTasks.filter(item => item.id !== task.id)].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 500) })),
  setTaskToastsEnabled: taskToastsEnabled => set({ taskToastsEnabled }),
  setTaskAutoReduceImports: taskAutoReduceImports => set({ taskAutoReduceImports }),
  setLibraryViewMode: libraryViewMode => set({ libraryViewMode }),
  setLiquidGlassMode: liquidGlassMode => set({ liquidGlassMode }),
  setLiquidGlassSettings: settings => set(state => ({ liquidGlassSettings: { ...state.liquidGlassSettings, ...settings }, liquidGlassMode: 'custom' })),
  setEnergySaver: energySaver => set({ energySaver }),
  setShowSupportButton: showSupportButton => set({ showSupportButton }),
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
    autoArtwork: state.autoArtwork,
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
    explorePlatform: state.explorePlatform,
    exploreGameId: state.exploreGameId,
    explorePinnedGames: state.explorePinnedGames,
    exploreRecentGames: state.exploreRecentGames,
    explorePage: state.explorePage,
    exploreSort: state.exploreSort,
    exploreGrid: state.exploreGrid,
    taskToastsEnabled: state.taskToastsEnabled,
    taskAutoReduceImports: state.taskAutoReduceImports,
    libraryViewMode: state.libraryViewMode,
    liquidGlassMode: state.liquidGlassMode,
    liquidGlassSettings: state.liquidGlassSettings,
    energySaver: state.energySaver,
    showSupportButton: state.showSupportButton,
  }),
  version: 3,
  migrate: persisted => migratePersistedState(persisted) as never,
}))

export const appVersion = APP_VERSION
export const getSelectedGame = (state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) => selected(state).game
export const getSelectedProfile = (state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) => selected(state).profile
