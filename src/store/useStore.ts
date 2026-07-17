import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ExplodMod, Game, GameResources, LoaderType, Mod, Platform, Profile, UpdateChannel, ViewType } from '../types'
import { DetectedGame, native, NativeMod, pickExecutable } from '../lib/native'
import { fetchGamebananaDownload, fetchGamebananaMods, GAMEBANANA_GAMES } from './gamebanana'

const APP_VERSION = '1.1.0'
const loaderTypes = new Set<LoaderType>(['GIMI', 'ZZMI', 'SRMI', 'WWMI', 'EFMI', 'UE5', 'BepInEx', 'ASI', 'CLEO', 'REF', 'MelonLoader', 'DLL', 'Archive', 'Folder', 'Manual'])

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
const asError = (error: unknown) => error instanceof Error ? error.message : String(error)
const gameNameFromPath = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'New game'
const normalizedPath = (path?: string) => (path || '').trim().replace(/\//g, '\\').toLocaleLowerCase()
const formatBytes = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(size >= 100 * 1024 * 1024 ? 0 : 1)} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`

const nativeModToMod = (mod: NativeMod, previous?: Mod, priority = 0): Mod => ({
  id: mod.id,
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

function makeGame({ name, execPath, modsPath, platform = 'standalone', provider, providerGameId, installDirectory, steamLibrary, buildId, sizeBytes, lastUpdated, needsExecutable }: {
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
}): Game {
  const gameId = createId()
  const profile: Profile = { id: createId(), gameId, name: 'Default', mods: [], playtime: 0 }
  return {
    id: gameId,
    name,
    execPath,
    modsPath,
    profiles: [profile],
    totalPlaytime: 0,
    platform,
    detected: platform !== 'standalone',
    provider,
    providerGameId,
    installDirectory,
    steamLibrary,
    buildId,
    sizeBytes,
    lastProviderUpdate: lastUpdated,
    needsExecutable,
  }
}

export interface Store {
  currentView: ViewType
  games: Game[]
  selectedGameId?: string
  selectedProfileId?: string
  nsfw: boolean
  language: string
  discordPresence: boolean
  autoCheckUpdates: boolean
  autoInstallUpdates: boolean
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
  exploreSearch: string
  exploreGrid: boolean
  exploreMods: ExplodMod[]
  exploreLoading: boolean
  exploreError?: string
  notice?: string
  setView: (view: ViewType) => void
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
  renameProfile: (profileId: string, name: string) => void
  removeProfile: (profileId: string) => void
  scanMods: (gameId?: string) => Promise<void>
  toggleMod: (modId: string) => Promise<void>
  deleteMod: (modId: string) => Promise<void>
  moveMod: (modId: string, direction: -1 | 1) => void
  setModNote: (modId: string, note: string) => void
  toggleNSFW: () => void
  setLanguage: (language: string) => void
  toggleDiscord: () => void
  setAutoCheckUpdates: (enabled: boolean) => void
  setAutoInstallUpdates: (enabled: boolean) => void
  setUpdateChannel: (channel: UpdateChannel) => void
  recordUpdateCheck: (version?: string, error?: string) => void
  prepareInstalledUpdate: (update: { version: string; notes?: string; date?: string }) => void
  dismissInstalledUpdate: () => void
  launchSelectedGame: () => Promise<void>
  stopPlaying: () => void
  tick: () => void
  setExplorePlatform: (platform: Platform) => void
  setExploreGame: (gameId: number) => void
  setExploreSearch: (search: string) => void
  setExploreGrid: (grid: boolean) => void
  refreshExplore: () => Promise<void>
  installMod: (mod: ExplodMod) => Promise<void>
  clearNotice: () => void
}

export const useStore = create<Store>()(persist((set, get) => ({
  currentView: 'home',
  games: [],
  selectedGameId: undefined,
  selectedProfileId: undefined,
  nsfw: false,
  language: 'fr',
  discordPresence: false,
  autoCheckUpdates: true,
  autoInstallUpdates: false,
  updateChannel: 'stable',
  isPlaying: false,
  sessionTime: 0,
  explorePlatform: 'gamebanana',
  exploreGameId: GAMEBANANA_GAMES[0].id,
  exploreSearch: '',
  exploreGrid: true,
  exploreMods: [],
  exploreLoading: false,
  setView: currentView => set({ currentView }),
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
        const desired = new Map(profile.mods.map(mod => [mod.name.toLowerCase(), mod.enabled]))
        for (const mod of actual) {
          const enabled = desired.get(mod.name.toLowerCase())
          if (enabled !== undefined && enabled !== mod.enabled) await native.toggleMod(mod.path, enabled)
        }
        const refreshed = await native.scanMods(game.modsPath)
        const games = updateProfile(get().games, game.id, profile.id, current => ({ ...current, mods: scannedMods(refreshed, current.mods) }))
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
    const next: Profile = { ...profile, id: createId(), name: name.trim(), mods: profile.mods.map(mod => ({ ...mod })), playtime: 0, lastPlayed: undefined }
    set(state => ({ games: state.games.map(item => item.id === game.id ? { ...item, profiles: [...item.profiles, next] } : item), selectedProfileId: next.id }))
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
    if (!game.modsPath) { set({ notice: 'Select a mods folder first.' }); return }
    try {
      const mods = await native.scanMods(game.modsPath)
      set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, mods: scannedMods(mods, current.mods) })), notice: `${mods.length} mod${mods.length !== 1 ? 's' : ''} scanned.` }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  toggleMod: async modId => {
    const { game, profile } = selected(get())
    const mod = profile?.mods.find(item => item.id === modId)
    if (!game || !profile || !mod) return
    try {
      const path = mod.path ? await native.toggleMod(mod.path, !mod.enabled) : undefined
      set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, mods: decorateMods(current.mods.map(item => item.id === modId ? { ...item, enabled: !item.enabled, path, id: path ?? item.id } : item)) })) }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  deleteMod: async modId => {
    const { game, profile } = selected(get())
    const mod = profile?.mods.find(item => item.id === modId)
    if (!game || !profile || !mod) return
    try {
      if (mod.path) await native.deleteMod(mod.path)
      set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, mods: decorateMods(current.mods.filter(item => item.id !== modId)) })), notice: `${mod.name} removed.` }))
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  moveMod: (modId, direction) => {
    const { game, profile } = selected(get())
    if (!game || !profile) return
    const mods = decorateMods(profile.mods)
    const index = mods.findIndex(mod => mod.id === modId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= mods.length) return
    const [moved] = mods.splice(index, 1)
    mods.splice(destination, 0, moved)
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, mods: decorateMods(mods) })) }))
  },
  setModNote: (modId, note) => {
    const { game, profile } = selected(get())
    if (!game || !profile) return
    set(state => ({ games: updateProfile(state.games, game.id, profile.id, current => ({ ...current, mods: current.mods.map(mod => mod.id === modId ? { ...mod, note } : mod) })) }))
  },
  toggleNSFW: () => set(state => ({ nsfw: !state.nsfw })),
  setLanguage: language => set({ language }),
  toggleDiscord: () => set(state => ({ discordPresence: !state.discordPresence })),
  setAutoCheckUpdates: autoCheckUpdates => set({ autoCheckUpdates }),
  setAutoInstallUpdates: autoInstallUpdates => set(state => ({ autoInstallUpdates, autoCheckUpdates: autoInstallUpdates ? true : state.autoCheckUpdates })),
  setUpdateChannel: updateChannel => set({ updateChannel }),
  recordUpdateCheck: (lastUpdateVersion, lastUpdateError) => set({ lastUpdateCheck: Date.now(), lastUpdateVersion, lastUpdateError }),
  prepareInstalledUpdate: update => set({ lastInstalledUpdate: { ...update, installedAt: Date.now() } }),
  dismissInstalledUpdate: () => set({ lastInstalledUpdate: undefined }),
  launchSelectedGame: async () => {
    const { game } = selected(get())
    if (!game?.execPath) { set({ notice: 'Select a game executable before launching.' }); return }
    try {
      await native.launchGame(game.execPath)
      set({ isPlaying: true, playStartTime: Date.now(), sessionTime: 0, notice: `${game.name} launched.` })
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  stopPlaying: () => {
    const state = get()
    const { game, profile } = selected(state)
    if (!game || !profile || !state.playStartTime) { set({ isPlaying: false, playStartTime: undefined, sessionTime: 0 }); return }
    const minutes = Math.floor((Date.now() - state.playStartTime) / 60_000)
    const now = Date.now()
    const games = updateProfile(state.games, game.id, profile.id, current => ({ ...current, playtime: current.playtime + minutes, lastPlayed: now }))
      .map(item => item.id === game.id ? { ...item, totalPlaytime: item.totalPlaytime + minutes, lastPlayed: now } : item)
    set({ games, isPlaying: false, playStartTime: undefined, sessionTime: 0 })
  },
  tick: () => {
    const { isPlaying, playStartTime } = get()
    if (isPlaying && playStartTime) set({ sessionTime: Math.floor((Date.now() - playStartTime) / 1_000) })
  },
  setExplorePlatform: explorePlatform => set({ explorePlatform, exploreMods: [], exploreError: undefined }),
  setExploreGame: exploreGameId => set({ exploreGameId }),
  setExploreSearch: exploreSearch => set({ exploreSearch }),
  setExploreGrid: exploreGrid => set({ exploreGrid }),
  refreshExplore: async () => {
    const { explorePlatform, exploreGameId, exploreSearch } = get()
    if (explorePlatform !== 'gamebanana') {
      set({ exploreMods: [], exploreError: `${explorePlatform} needs its own API credentials and is not enabled in this build.` })
      return
    }
    set({ exploreLoading: true, exploreError: undefined })
    try {
      const exploreMods = await fetchGamebananaMods(exploreGameId, exploreSearch)
      set({ exploreMods, exploreLoading: false })
    } catch (error) {
      set({ exploreLoading: false, exploreError: asError(error) })
    }
  },
  installMod: async mod => {
    const { game } = selected(get())
    if (!game?.modsPath) { set({ notice: 'Select the game and its mods folder before installing a mod.' }); return }
    try {
      let downloadUrl = mod.downloadUrl
      let fileName = mod.fileName
      if (!downloadUrl && mod.platform === 'gamebanana' && mod.modId) {
        const download = await fetchGamebananaDownload(mod.modId)
        downloadUrl = download.url
        fileName = download.fileName
      }
      if (!downloadUrl || !fileName) throw new Error('No direct download is available for this mod.')
      await native.installMod(downloadUrl, fileName, game.modsPath)
      await get().scanMods(game.id)
      set({ notice: `${mod.name} installed.` })
    } catch (error) {
      set({ notice: asError(error) })
    }
  },
  clearNotice: () => set({ notice: undefined }),
}), {
  name: 'zailon-v1',
  partialize: state => ({
    games: state.games,
    selectedGameId: state.selectedGameId,
    selectedProfileId: state.selectedProfileId,
    nsfw: state.nsfw,
    language: state.language,
    discordPresence: state.discordPresence,
    autoCheckUpdates: state.autoCheckUpdates,
    autoInstallUpdates: state.autoInstallUpdates,
    updateChannel: state.updateChannel,
    lastUpdateCheck: state.lastUpdateCheck,
    lastUpdateVersion: state.lastUpdateVersion,
    lastUpdateError: state.lastUpdateError,
    lastInstalledUpdate: state.lastInstalledUpdate,
    explorePlatform: state.explorePlatform,
    exploreGameId: state.exploreGameId,
    exploreGrid: state.exploreGrid,
  }),
  version: 1,
}))

export const appVersion = APP_VERSION
export const getSelectedGame = (state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) => selected(state).game
export const getSelectedProfile = (state: Pick<Store, 'games' | 'selectedGameId' | 'selectedProfileId'>) => selected(state).profile
