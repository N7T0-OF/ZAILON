import { create } from 'zustand'
import { Game, Profile, Mod, ViewType, Platform, ExplodMod } from '../types'

const MOCK_MODS_NTE: Mod[] = [
  { id: 'm1', name: 'HD Character Textures', enabled: true, loader: 'UE5', author: 'ArtMod', autoUpdate: true, version: '2.1', source: 'gamebanana', size: '340 MB', description: 'Ultra HD retexture pack for all playable characters.' },
  { id: 'm2', name: 'Better Lighting FX', enabled: true, loader: 'UE5', author: 'FXDev', autoUpdate: false, version: '1.3', source: 'nexus', size: '120 MB' },
  { id: 'm3', name: 'UI Overhaul v2', enabled: false, loader: 'UE5', author: 'UIModder', autoUpdate: true, version: '2.0', source: 'local', size: '28 MB' },
  { id: 'm4', name: 'FOV Unlocker', enabled: true, loader: 'Manual', author: 'ToolDev', autoUpdate: false, version: '1.0', source: 'gamebanana', size: '2 MB' },
]

const MOCK_MODS_GI: Mod[] = [
  { id: 'g1', name: 'Raiden Shogun — Outfit Royal', enabled: true, loader: 'GIMI', author: 'GIMIUser', autoUpdate: true, version: '3.0', source: 'gamebanana', size: '45 MB' },
  { id: 'g2', name: 'Hu Tao — Dark Dress', enabled: true, loader: 'GIMI', author: 'ModArtist', autoUpdate: false, version: '1.2', source: 'gamebanana', size: '38 MB' },
  { id: 'g3', name: 'Improved Sky Textures', enabled: false, loader: 'GIMI', author: 'SkyMod', autoUpdate: false, version: '1.0', source: 'nexus', size: '190 MB' },
]

const MOCK_GAMES: Game[] = [
  {
    id: 'nte',
    name: 'Neverness to Everness',
    shortName: 'NTE',
    backgroundArt: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1200&q=80',
    profiles: [
      { id: 'nte-default', gameId: 'nte', name: 'Default', mods: MOCK_MODS_NTE, playtime: 240, lastPlayed: new Date(Date.now() - 3600000) },
      { id: 'nte-graphics', gameId: 'nte', name: 'Graphics+', mods: MOCK_MODS_NTE.slice(0, 2), playtime: 90, lastPlayed: new Date(Date.now() - 86400000 * 2) },
    ],
    totalPlaytime: 330,
    lastPlayed: new Date(Date.now() - 3600000),
    detected: true,
    platform: 'standalone',
  },
  {
    id: 'gi',
    name: 'Genshin Impact',
    shortName: 'GI',
    backgroundArt: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80',
    profiles: [
      { id: 'gi-default', gameId: 'gi', name: 'Default', mods: MOCK_MODS_GI, playtime: 1200, lastPlayed: new Date(Date.now() - 86400000 * 3) },
    ],
    totalPlaytime: 1200,
    lastPlayed: new Date(Date.now() - 86400000 * 3),
    detected: true,
    platform: 'standalone',
  },
  {
    id: 'wuwa',
    name: 'Wuthering Waves',
    shortName: 'WW',
    backgroundArt: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
    profiles: [
      { id: 'ww-default', gameId: 'wuwa', name: 'Default', mods: [], playtime: 560, lastPlayed: new Date(Date.now() - 86400000 * 5) },
    ],
    totalPlaytime: 560,
    lastPlayed: new Date(Date.now() - 86400000 * 5),
    detected: true,
    platform: 'standalone',
  },
  {
    id: 'cp',
    name: 'Cyberpunk 2077',
    shortName: 'CP',
    backgroundArt: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&q=80',
    profiles: [
      { id: 'cp-default', gameId: 'cp', name: 'Vanilla+', mods: [], playtime: 840, lastPlayed: new Date(Date.now() - 86400000 * 10) },
    ],
    totalPlaytime: 840,
    lastPlayed: new Date(Date.now() - 86400000 * 10),
    detected: true,
    platform: 'steam',
  },
]

export const MOCK_EXPLORE_MODS: ExplodMod[] = [
  { id: 'e1', name: 'Lumine — Galaxy Dress', author: 'ArtModder', game: 'Genshin Impact', thumbnail: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=300&q=60', downloads: 48200, rating: 4.9, tags: ['Character', 'Outfit'], nsfw: false, platform: 'gamebanana', url: '#', description: 'Complete galaxy-themed outfit for Lumine.' },
  { id: 'e2', name: 'Raiden — Oni Armor', author: 'SwordCrafter', game: 'Genshin Impact', thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=60', downloads: 32100, rating: 4.7, tags: ['Character', 'Armor'], nsfw: false, platform: 'gamebanana', url: '#', description: 'Dark samurai armor for Raiden Shogun.' },
  { id: 'e3', name: 'ReShade Ultra — Cinematic', author: 'FXLab', game: 'All Games', thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&q=60', downloads: 89400, rating: 4.8, tags: ['Graphics', 'ReShade'], nsfw: false, platform: 'nexus', url: '#', description: 'Cinematic color grading preset.' },
  { id: 'e4', name: 'HD World Textures 4K', author: 'WorldRebuild', game: 'Wuthering Waves', thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300&q=60', downloads: 21600, rating: 4.6, tags: ['World', 'Textures', '4K'], nsfw: false, platform: 'nexus', url: '#', description: 'Full 4K retexture for all environment assets.' },
  { id: 'e5', name: 'Combat Overhaul v3', author: 'FightMod', game: 'Cyberpunk 2077', thumbnail: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=300&q=60', downloads: 15300, rating: 4.5, tags: ['Gameplay', 'Combat'], nsfw: false, platform: 'nexus', url: '#', description: 'Completely reworked combat system.' },
  { id: 'e6', name: 'NTE — Alt Costume Pack', author: 'NTEMod', game: 'Neverness to Everness', thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=60', downloads: 8900, rating: 4.4, tags: ['Character', 'Outfit', 'Pack'], nsfw: false, platform: 'gamebanana', url: '#', description: 'Pack of 12 alternative costumes for NTE characters.' },
]

interface Store {
  // State
  currentView: ViewType
  games: Game[]
  selectedGame: Game
  selectedProfile: Profile
  nsfw: boolean
  language: string
  discordPresence: boolean
  isPlaying: boolean
  playStartTime?: number
  sessionTime: number
  explorePlatform: Platform
  exploreGame: string
  exploreSearch: string
  exploreGrid: boolean
  // Actions
  setView: (v: ViewType) => void
  setSelectedGame: (g: Game) => void
  setSelectedProfile: (p: Profile) => void
  toggleNSFW: () => void
  setLanguage: (l: string) => void
  toggleDiscord: () => void
  toggleMod: (modId: string) => void
  startPlaying: () => void
  stopPlaying: () => void
  setExplorePlatform: (p: Platform) => void
  setExploreGame: (g: string) => void
  setExploreSearch: (s: string) => void
  setExploreGrid: (g: boolean) => void
  installMod: (mod: ExplodMod) => void
  tick: () => void
}

export const useStore = create<Store>((set, get) => ({
  currentView: 'home',
  games: MOCK_GAMES,
  selectedGame: MOCK_GAMES[0],
  selectedProfile: MOCK_GAMES[0].profiles[0],
  nsfw: false,
  language: 'fr',
  discordPresence: true,
  isPlaying: false,
  sessionTime: 0,
  explorePlatform: 'gamebanana',
  exploreGame: 'all',
  exploreSearch: '',
  exploreGrid: true,

  setView: (v) => set({ currentView: v }),
  setSelectedGame: (g) => set({ selectedGame: g, selectedProfile: g.profiles[0] }),
  setSelectedProfile: (p) => set({ selectedProfile: p }),
  toggleNSFW: () => set(s => ({ nsfw: !s.nsfw })),
  setLanguage: (l) => set({ language: l }),
  toggleDiscord: () => set(s => ({ discordPresence: !s.discordPresence })),
  toggleMod: (modId) => set(s => ({
    selectedProfile: {
      ...s.selectedProfile,
      mods: s.selectedProfile.mods.map(m => m.id === modId ? { ...m, enabled: !m.enabled } : m),
    },
  })),
  startPlaying: () => set({ isPlaying: true, playStartTime: Date.now(), sessionTime: 0 }),
  stopPlaying: () => set({ isPlaying: false, playStartTime: undefined }),
  setExplorePlatform: (p) => set({ explorePlatform: p }),
  setExploreGame: (g) => set({ exploreGame: g }),
  setExploreSearch: (s) => set({ exploreSearch: s }),
  setExploreGrid: (g) => set({ exploreGrid: g }),
  installMod: (exploMod) => {
    const s = get()
    const newMod: Mod = {
      id: `installed-${exploMod.id}-${Date.now()}`,
      name: exploMod.name,
      enabled: true,
      loader: 'UE5',
      author: exploMod.author,
      autoUpdate: true,
      version: '1.0',
      source: exploMod.platform,
      sourceUrl: exploMod.url,
      nsfw: exploMod.nsfw,
      thumbnail: exploMod.thumbnail,
    }
    set({
      selectedProfile: {
        ...s.selectedProfile,
        mods: [...s.selectedProfile.mods, newMod],
      },
    })
  },
  tick: () => {
    const s = get()
    if (s.isPlaying && s.playStartTime) {
      set({ sessionTime: Math.floor((Date.now() - s.playStartTime) / 1000) })
    }
  },
}))
