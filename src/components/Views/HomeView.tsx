import { Play, ChevronDown, Clock, Zap } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { timeAgo, formatTime, formatSeconds } from '../../utils'

export function HomeView() {
  const { selectedGame, selectedProfile, games, setSelectedGame, setSelectedProfile, setView,
    isPlaying, startPlaying, stopPlaying, sessionTime } = useStore()

  const activeMods = selectedProfile.mods.filter(m => m.enabled).length

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src={selectedGame.backgroundArt}
          alt=""
          className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-400/98 via-ink-400/70 to-ink-400/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-400/95 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative flex flex-col h-full px-5 py-4">
        {/* Game title area */}
        <div className="flex-1 flex flex-col justify-center max-w-xs">
          <div className="mb-1">
            <span className="text-[9px] font-mono text-gold/60 tracking-widest uppercase">
              {selectedGame.platform === 'steam' ? '⬡ Steam' : '◈ Standalone'} · {selectedGame.shortName}
            </span>
          </div>
          <h1 className="font-display font-bold text-white leading-none mb-3" style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}>
            {selectedGame.name}
          </h1>

          {/* Profile selector */}
          <div className="flex items-center gap-1.5 mb-4">
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] hover:border-gold/30 transition-all text-xs">
                <span className="text-white/70 font-body">{selectedProfile.name}</span>
                <ChevronDown size={11} className="text-white/40" />
              </button>
              {/* Dropdown */}
              <div className="absolute top-full left-0 mt-1 w-36 bg-ink-200 border border-white/[0.08] rounded-md overflow-hidden z-10 hidden group-focus-within:block shadow-xl">
                {selectedGame.profiles.map(p => (
                  <button key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-body transition-colors ${
                      p.id === selectedProfile.id ? 'text-gold bg-gold/10' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                    }`}>
                    {p.name}
                    <span className="ml-2 text-[9px] text-white/25">{p.mods.filter(m=>m.enabled).length} mods</span>
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[10px] text-white/30 font-mono">
              {activeMods} mod{activeMods !== 1 ? 's' : ''} active
            </span>
          </div>

          {/* Play button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => isPlaying ? stopPlaying() : startPlaying()}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-display font-bold text-sm tracking-wider transition-all duration-200 ${
                isPlaying
                  ? 'bg-red-500/80 text-white hover:bg-red-600/80 border border-red-400/30'
                  : 'bg-gold text-ink-400 hover:bg-gold-bright shadow-[0_0_16px_rgba(232,184,75,0.3)] hover:shadow-[0_0_24px_rgba(232,184,75,0.5)]'
              }`}>
              <Play size={13} fill="currentColor" />
              {isPlaying ? `PLAYING ${formatSeconds(sessionTime)}` : 'PLAY'}
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-white/30" />
              <span className="text-[10px] text-white/40 font-mono">{formatTime(selectedGame.totalPlaytime)}</span>
            </div>
            {selectedGame.lastPlayed && (
              <span className="text-[10px] text-white/30">Last: {timeAgo(selectedGame.lastPlayed)}</span>
            )}
            <div className="flex items-center gap-1.5">
              <Zap size={11} className="text-gold/40" />
              <span className="text-[10px] text-gold/60">{activeMods} active</span>
            </div>
          </div>
        </div>

        {/* Recent games strip */}
        <div className="flex items-center gap-2 pb-1">
          <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest mr-1">Recent</span>
          {games.filter(g => g.lastPlayed).sort((a, b) =>
            (b.lastPlayed?.getTime() || 0) - (a.lastPlayed?.getTime() || 0)
          ).slice(0, 4).map(game => (
            <button
              key={game.id}
              onClick={() => { setSelectedGame(game); }}
              className={`relative w-16 h-9 rounded-md overflow-hidden border transition-all flex-shrink-0 ${
                game.id === selectedGame.id
                  ? 'border-gold/60 shadow-[0_0_8px_rgba(232,184,75,0.25)]'
                  : 'border-white/[0.06] hover:border-white/20 opacity-60 hover:opacity-90'
              }`}>
              <img src={game.backgroundArt} alt={game.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-ink-400/50 flex items-end p-1">
                <span className="text-[8px] font-display font-bold text-white leading-none truncate">{game.shortName || game.name.slice(0, 4)}</span>
              </div>
            </button>
          ))}
          <button
            onClick={() => setView('games')}
            className="w-16 h-9 rounded-md border border-dashed border-white/[0.08] hover:border-white/20 flex items-center justify-center flex-shrink-0 transition-all opacity-50 hover:opacity-80">
            <span className="text-[9px] text-white/40">All →</span>
          </button>
        </div>
      </div>
    </div>
  )
}
