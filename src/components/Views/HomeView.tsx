import { FolderPlus, Play, Radar, Square } from 'lucide-react'
import { useState } from 'react'
import { Game } from '../../types'
import { resourceUrl } from '../../lib/native'
import { getSelectedGame, getSelectedProfile, useStore } from '../../store/useStore'
import { formatSeconds, formatTime, timeAgo } from '../../utils'
import { GameContextMenu, GameMoreButton } from '../GameContextMenu'
import { GameResourcesDialog } from '../GameResourcesDialog'
import { SteamDetectionDialog } from '../SteamDetectionDialog'

export function HomeView() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const importDetectedGames = useStore(state => state.importDetectedGames)
  const setGameResources = useStore(state => state.setGameResources)
  const launchSelectedGame = useStore(state => state.launchSelectedGame)
  const stopPlaying = useStore(state => state.stopPlaying)
  const isPlaying = useStore(state => state.isPlaying)
  const sessionTime = useStore(state => state.sessionTime)
  const setView = useStore(state => state.setView)
  const [steamDialogOpen, setSteamDialogOpen] = useState(false)
  const [menu, setMenu] = useState<{ game: Game; position: { x: number; y: number } }>()
  const [resourcesGame, setResourcesGame] = useState<Game>()

  if (!selectedGame || !selectedProfile) {
    return (<>
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
          <button onClick={() => setSteamDialogOpen(true)} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.08]">
            <Radar size={15} /> Detect Steam games
          </button>
        </div>
      </div>
      {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
    </>)
  }

  const activeMods = selectedProfile.mods.filter(mod => mod.enabled).length
  const background = resourceUrl(selectedGame.resources?.backgroundPath) || selectedGame.backgroundArt
  const visibleGames = games.filter(game => !game.hidden || game.id === selectedGame.id)
  return (
    <div className="relative flex h-full flex-col overflow-hidden p-6">
      {background && <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" style={{ objectPosition: `${selectedGame.resources?.backgroundPositionX ?? 50}% ${selectedGame.resources?.backgroundPositionY ?? 50}%`, transform: `scale(${(selectedGame.resources?.backgroundZoom ?? 100) / 100})` }} />}
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
      <div className="relative border-t border-white/[0.06] pt-3">
        <div className="mb-2 flex items-center gap-2"><span className="text-[9px] font-mono uppercase tracking-widest text-white/25">Bibliothèque</span><button onClick={() => setSteamDialogOpen(true)} title="Détecter des jeux Steam" className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-white/45 hover:text-gold"><Radar size={11} /></button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {visibleGames.slice(0, 10).map(game => <article key={game.id} onContextMenu={event => { event.preventDefault(); setSelectedGame(game.id); setMenu({ game, position: { x: event.clientX, y: event.clientY } }) }} className={`group relative min-w-0 overflow-hidden rounded-lg border text-left transition-colors ${game.id === selectedGame.id ? 'border-gold/35 bg-gold/[0.07]' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'}`}>
            {game.resources?.coverPath && <img src={resourceUrl(game.resources.coverPath)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" style={{ objectPosition: `${game.resources.coverPositionX ?? 50}% ${game.resources.coverPositionY ?? 50}%`, transform: `scale(${(game.resources.coverZoom ?? 100) / 100})` }} />}
            <button onClick={() => setSelectedGame(game.id)} className="relative flex min-h-16 w-full flex-col justify-end px-2 py-2 text-left"><span className="truncate text-[10px] font-medium text-white/85">{game.name}</span><span className="mt-0.5 text-[8px] text-white/40">{game.favorite ? '★ Favori · ' : ''}{game.profiles.length} profil{game.profiles.length !== 1 ? 's' : ''}</span></button>
            <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"><GameMoreButton onClick={position => { setSelectedGame(game.id); setMenu({ game, position }) }} /></div>
          </article>)}
        </div>
      </div>
      {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
      {resourcesGame && <GameResourcesDialog game={resourcesGame} onClose={() => setResourcesGame(undefined)} onChange={resources => { setGameResources(resourcesGame.id, resources); setResourcesGame(current => current ? { ...current, resources: { ...current.resources, ...resources } } : current) }} />}
      {menu && <GameContextMenu game={menu.game} position={menu.position} onClose={() => setMenu(undefined)} onEditResources={() => setResourcesGame(menu.game)} />}
    </div>
  )
}
