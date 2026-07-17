import { Search, Download, Star, Grid, List } from 'lucide-react'
import { useStore, MOCK_EXPLORE_MODS } from '../../store/useStore'
import { PLATFORM_COLORS, PLATFORM_LABELS, formatDownloads } from '../../utils'
import { Platform, ExplodMod } from '../../types'
import { Toggle } from '../UI/Toggle'

const PLATFORMS: Platform[] = ['gamebanana', 'nexus', 'curseforge', 'ayakamods']
const GAMES = ['all', 'Genshin Impact', 'Wuthering Waves', 'Neverness to Everness', 'Zenless Zone Zero', 'Honkai: Star Rail', 'Cyberpunk 2077']

export function ExploreView() {
  const {
    explorePlatform, exploreGame, exploreSearch, exploreGrid, nsfw,
    setExplorePlatform, setExploreGame, setExploreSearch, setExploreGrid,
    installMod, selectedProfile,
  } = useStore()

  const installed = new Set(selectedProfile.mods.map(m => m.sourceUrl))

  const filtered = MOCK_EXPLORE_MODS.filter(m => {
    if (!nsfw && m.nsfw) return false
    if (exploreGame !== 'all' && m.game !== 'All Games' && m.game !== exploreGame) return false
    if (exploreSearch && !m.name.toLowerCase().includes(exploreSearch.toLowerCase())) return false
    if (m.platform !== explorePlatform) return false
    return true
  })

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.04] flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={exploreSearch}
              onChange={e => setExploreSearch(e.target.value)}
              placeholder={`Search ${PLATFORM_LABELS[explorePlatform]}...`}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs pl-7 pr-3 py-1.5 text-white/80 placeholder-white/25 focus:outline-none focus:border-gold/30 font-body"
            />
          </div>
          <button onClick={() => setExploreGrid(!exploreGrid)}
            className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70 transition-all">
            {exploreGrid ? <List size={13} /> : <Grid size={13} />}
          </button>
        </div>

        {/* Mod grid/list */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
              <Compass16 />
              <p className="text-xs text-white/40">No mods found</p>
              {!nsfw && <p className="text-[10px] text-white/25">NSFW filter is active</p>}
            </div>
          ) : exploreGrid ? (
            <div className="grid grid-cols-3 gap-2">
              {filtered.map(mod => (
                <ModTile key={mod.id} mod={mod} installed={installed.has(mod.url)} onInstall={() => installMod(mod)} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map(mod => (
                <ModRow key={mod.id} mod={mod} installed={installed.has(mod.url)} onInstall={() => installMod(mod)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar — filters */}
      <div className="w-36 border-l border-white/[0.05] flex flex-col flex-shrink-0">
        {/* Platform */}
        <div className="px-2.5 pt-3 pb-2">
          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-2">Platform</p>
          <div className="space-y-0.5">
            {PLATFORMS.map(p => {
              const color = PLATFORM_COLORS[p]
              const active = explorePlatform === p
              return (
                <button key={p} onClick={() => setExplorePlatform(p)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                    active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: active ? color : '#ffffff30' }} />
                  <span className={`text-[10px] font-body transition-colors ${active ? 'text-white/90' : 'text-white/40'}`}>
                    {PLATFORM_LABELS[p]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mx-2.5 border-t border-white/[0.05]" />

        {/* Game filter */}
        <div className="px-2.5 pt-2 pb-2">
          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-2">Game</p>
          <div className="space-y-0.5">
            {GAMES.map(g => (
              <button key={g} onClick={() => setExploreGame(g)}
                className={`w-full text-left px-2 py-1 rounded text-[10px] font-body transition-all capitalize ${
                  exploreGame === g
                    ? 'text-gold bg-gold/10'
                    : 'text-white/35 hover:text-white/65 hover:bg-white/[0.04]'
                }`}>
                {g === 'all' ? 'All Games' : g.split(' ').slice(-1)[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* NSFW toggle */}
        <div className="px-2.5 pb-3 flex items-center gap-2">
          <Toggle checked={useStore.getState().nsfw} onChange={useStore.getState().toggleNSFW} size="sm" />
          <span className="text-[9px] text-white/30 font-mono">NSFW</span>
        </div>
      </div>
    </div>
  )
}

function Compass16() {
  return <span className="text-3xl opacity-30">🧭</span>
}

function ModTile({ mod, installed, onInstall }: { mod: ExplodMod, installed: boolean, onInstall: () => void }) {
  return (
    <div className="group relative rounded-lg overflow-hidden border border-white/[0.06] hover:border-gold/20 transition-all bg-ink-200">
      <div className="aspect-video relative overflow-hidden">
        <img src={mod.thumbnail} alt={mod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-300/90 via-transparent to-transparent" />
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-end justify-between">
          <div className="flex gap-0.5">
            {mod.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[8px] bg-black/50 text-white/60 px-1 py-0.5 rounded">{t}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="p-2">
        <p className="text-[10px] font-body font-medium text-white/90 truncate leading-tight">{mod.name}</p>
        <p className="text-[9px] text-white/40 truncate">{mod.author}</p>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-[9px] text-gold/60">
              <Star size={8} fill="currentColor" />{mod.rating}
            </span>
            <span className="text-[9px] text-white/25">↓{formatDownloads(mod.downloads)}</span>
          </div>
          <button
            onClick={onInstall}
            disabled={installed}
            className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded transition-all ${
              installed
                ? 'text-gold/50 bg-gold/5 cursor-default'
                : 'text-ink-400 bg-gold hover:bg-gold-bright'
            }`}>
            {installed ? '✓' : <Download size={8} />}
            {installed ? 'Installed' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModRow({ mod, installed, onInstall }: { mod: ExplodMod, installed: boolean, onInstall: () => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-gold/15 transition-all group">
      <img src={mod.thumbnail} alt="" className="w-10 h-7 object-cover rounded flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-body font-medium text-white/90 truncate">{mod.name}</p>
        <p className="text-[9px] text-white/35">{mod.author} · {mod.game}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[9px] text-white/25">↓{formatDownloads(mod.downloads)}</span>
        <button
          onClick={onInstall}
          disabled={installed}
          className={`text-[9px] px-2 py-0.5 rounded transition-all ${
            installed ? 'text-gold/40 cursor-default' : 'text-ink-400 bg-gold hover:bg-gold-bright'
          }`}>
          {installed ? '✓' : 'Install'}
        </button>
      </div>
    </div>
  )
}
