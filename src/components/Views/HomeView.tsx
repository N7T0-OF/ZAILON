import { FolderPlus, Play, Radar, Square } from 'lucide-react'
import { getSelectedGame, getSelectedProfile, useStore } from '../../store/useStore'
import { formatSeconds, formatTime, timeAgo } from '../../utils'

export function HomeView() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const addDetectedGames = useStore(state => state.addDetectedGames)
  const launchSelectedGame = useStore(state => state.launchSelectedGame)
  const stopPlaying = useStore(state => state.stopPlaying)
  const isPlaying = useStore(state => state.isPlaying)
  const sessionTime = useStore(state => state.sessionTime)
  const setView = useStore(state => state.setView)

  if (!selectedGame || !selectedProfile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/25 bg-gold/10 text-2xl text-gold">Z</div>
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Your library is empty</h1>
          <p className="mt-1 max-w-sm text-xs text-white/40">Add an installed game executable. ZAILON will keep the launcher configuration and mods locally on this device.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void addGameFromExecutable()} className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink-400 hover:bg-gold-bright">
            <FolderPlus size={15} /> Add a game
          </button>
          <button onClick={() => void addDetectedGames()} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.08]">
            <Radar size={15} /> Detect Steam games
          </button>
        </div>
      </div>
    )
  }

  const activeMods = selectedProfile.mods.filter(mod => mod.enabled).length
  return (
    <div className="relative flex h-full flex-col overflow-hidden p-6">
      {selectedGame.backgroundArt && <img src={selectedGame.backgroundArt} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-400 via-ink-400/85 to-ink-400/60" />
      <div className="relative flex flex-1 flex-col justify-center">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold/70">Universal Mod Launcher</p>
        <h1 className="font-display text-4xl font-bold tracking-wide text-white">{selectedGame.name}</h1>
        <p className="mt-2 text-xs text-white/45">{selectedProfile.name} · {activeMods} active mod{activeMods !== 1 ? 's' : ''}</p>
        <div className="mt-5 flex items-center gap-2">
          <button onClick={() => void (isPlaying ? Promise.resolve(stopPlaying()) : launchSelectedGame())} className={`flex items-center gap-2 rounded-lg px-5 py-2 font-display text-sm font-bold tracking-wider ${isPlaying ? 'bg-red-500 text-white' : 'bg-gold text-ink-400 hover:bg-gold-bright'}`}>
            {isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {isPlaying ? `STOP ${formatSeconds(sessionTime)}` : 'PLAY'}
          </button>
          <button onClick={() => setView('games')} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/65 hover:bg-white/[0.08]">Manage mods</button>
        </div>
        <div className="mt-5 flex gap-4 text-[10px] font-mono text-white/35">
          <span>{formatTime(selectedGame.totalPlaytime)} total</span>
          {selectedGame.lastPlayed && <span>Played {timeAgo(selectedGame.lastPlayed)}</span>}
          <span>{selectedGame.modsPath || 'No mods folder selected'}</span>
        </div>
      </div>
      <div className="relative flex items-center gap-2 border-t border-white/[0.06] pt-3">
        <span className="mr-1 text-[9px] font-mono uppercase tracking-widest text-white/25">Library</span>
        {games.slice(0, 6).map(game => (
          <button key={game.id} onClick={() => setSelectedGame(game.id)} className={`max-w-28 truncate rounded-md px-2 py-1 text-[10px] ${game.id === selectedGame.id ? 'bg-gold/15 text-gold' : 'bg-white/[0.04] text-white/45 hover:text-white/75'}`}>{game.name}</button>
        ))}
      </div>
    </div>
  )
}
