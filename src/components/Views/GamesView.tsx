import { Plus, FolderOpen, RefreshCw, Search, ChevronRight, Clock } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { ModCard } from '../UI/ModCard'
import { formatTime, timeAgo } from '../../utils'

export function GamesView() {
  const { games, selectedGame, selectedProfile, setSelectedGame, setSelectedProfile, toggleMod } = useStore()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'mods' | 'settings'>('mods')

  const filteredMods = selectedProfile.mods.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )
  const activeMods = selectedProfile.mods.filter(m => m.enabled).length

  return (
    <div className="flex h-full">
      {/* Games list — 140px */}
      <div className="w-36 flex flex-col border-r border-white/[0.05] flex-shrink-0">
        <div className="px-2 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Games</span>
          <button className="text-white/30 hover:text-white/60 transition-colors">
            <Plus size={11} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide py-1 px-1.5 space-y-0.5">
          {games.map(game => (
            <button
              key={game.id}
              onClick={() => setSelectedGame(game)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-all text-left ${
                game.id === selectedGame.id
                  ? 'bg-gold/12 border border-gold/20'
                  : 'hover:bg-white/[0.04] border border-transparent'
              }`}>
              <div className="w-7 h-7 rounded-md overflow-hidden flex-shrink-0 bg-ink-50">
                <img src={game.backgroundArt} alt="" className="w-full h-full object-cover opacity-80" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] font-body font-medium leading-tight truncate ${
                  game.id === selectedGame.id ? 'text-gold' : 'text-white/70'
                }`}>{game.name}</p>
                <p className="text-[9px] text-white/25 font-mono">{game.profiles.length}p · {formatTime(game.totalPlaytime)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Profiles + mods */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Game header */}
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.04] flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display font-bold text-sm text-white">{selectedGame.name}</h2>
              {selectedGame.lastPlayed && (
                <p className="text-[9px] text-white/30 font-mono">Last played {timeAgo(selectedGame.lastPlayed)}</p>
              )}
            </div>
            <div className="flex gap-1">
              <button className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all">
                <RefreshCw size={11} />
              </button>
              <button className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all">
                <FolderOpen size={11} />
              </button>
            </div>
          </div>

          {/* Profile tabs */}
          <div className="flex items-center gap-1">
            {selectedGame.profiles.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProfile(p)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-body transition-all ${
                  p.id === selectedProfile.id
                    ? 'bg-gold/15 text-gold border border-gold/25'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04] border border-transparent'
                }`}>
                {p.name}
                <span className="text-[8px] opacity-60">{p.mods.filter(m=>m.enabled).length}</span>
              </button>
            ))}
            <button className="p-1 rounded text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all">
              <Plus size={10} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-white/[0.04] flex-shrink-0 px-3">
          {(['mods', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-[10px] font-body font-medium capitalize transition-all border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-gold border-gold'
                  : 'text-white/30 border-transparent hover:text-white/60'
              }`}>
              {tab}
              {tab === 'mods' && <span className="ml-1 text-[9px] opacity-60">{activeMods}/{selectedProfile.mods.length}</span>}
            </button>
          ))}

          <div className="flex-1" />
          <div className="relative py-1">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mods..."
              className="bg-white/[0.04] border border-white/[0.06] rounded text-[10px] pl-5 pr-2 py-0.5 text-white/70 placeholder-white/25 focus:outline-none focus:border-gold/30 w-28"
            />
          </div>
        </div>

        {/* Mods list */}
        {activeTab === 'mods' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
            {filteredMods.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 gap-2 opacity-40">
                <span className="text-2xl">📦</span>
                <p className="text-[10px] text-white/40">No mods yet — browse Explore</p>
              </div>
            ) : (
              filteredMods.map(mod => (
                <ModCard key={mod.id} mod={mod} onToggle={() => toggleMod(mod.id)} />
              ))
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 p-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Game Path</label>
              <div className="flex gap-1.5">
                <input
                  placeholder={selectedGame.execPath || 'Select .exe...'}
                  className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded text-[10px] px-2 py-1.5 text-white/50 placeholder-white/25 focus:outline-none focus:border-gold/30 font-mono"
                />
                <button className="px-2 py-1 bg-white/[0.06] rounded text-[10px] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all">
                  Browse
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Mods Folder</label>
              <div className="flex gap-1.5">
                <input
                  placeholder={selectedGame.modsPath || 'Select mods folder...'}
                  className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded text-[10px] px-2 py-1.5 text-white/50 placeholder-white/25 focus:outline-none focus:border-gold/30 font-mono"
                />
                <button className="px-2 py-1 bg-white/[0.06] rounded text-[10px] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all">
                  Browse
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Clock size={11} className="text-gold/40" />
              <span className="text-[10px] text-white/40 font-mono">Total playtime: {formatTime(selectedGame.totalPlaytime)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
