import { Boxes, Clock3, FolderPlus, Gamepad2, Palette, Play, Radar, Settings2, Square } from 'lucide-react'
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
  const [resourcesGameId, setResourcesGameId] = useState<string>()

  const resourcesGame = games.find(game => game.id === resourcesGameId)
  if (!selectedGame || !selectedProfile) {
    return <>
      <div className="relative flex h-full items-center justify-center overflow-hidden p-7 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_64%_30%,rgba(232,184,75,0.08),transparent_31%),linear-gradient(135deg,#0a0b0f,#07080b)]" />
        <div className="pointer-events-none absolute left-[12%] top-[12%] h-72 w-72 rounded-full border border-white/[0.035]" />
        <div className="relative max-w-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/28 bg-gold/[0.08] shadow-[0_0_50px_rgba(232,184,75,0.08)]"><span className="font-display text-3xl font-black text-gold">Z</span></div>
          <p className="mt-5 font-mono text-[8px] uppercase tracking-[0.25em] text-gold/58">Universal Mod Launcher</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-white">Construisez votre bibliothèque locale</h1>
          <p className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-white/38">Ajoutez un exécutable installé ou détectez vos bibliothèques. ZAILON n’invente aucun jeu et conserve la configuration sur cet appareil.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => void addGameFromExecutable()} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-[#0b0c10] hover:bg-white/88"><FolderPlus size={14} /> Ajouter un jeu</button>
            <button type="button" onClick={() => setSteamDialogOpen(true)} className="flex items-center gap-2 rounded-lg border border-white/[0.11] bg-white/[0.035] px-4 py-2 text-xs text-white/66 hover:bg-white/[0.075]"><Radar size={14} /> Détecter les jeux</button>
          </div>
        </div>
      </div>
      {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
    </>
  }

  const activeMods = selectedProfile.mods.filter(mod => mod.enabled).length
  const heroResource = selectedGame.resources?.backgroundPath || selectedGame.resources?.bannerPath || selectedGame.resources?.coverPath
  const background = resourceUrl(heroResource) || selectedGame.backgroundArt
  const heroTransform = selectedGame.resources?.backgroundPath
    ? { x: selectedGame.resources.backgroundPositionX, y: selectedGame.resources.backgroundPositionY, zoom: selectedGame.resources.backgroundZoom, fit: selectedGame.resources.backgroundFit }
    : selectedGame.resources?.bannerPath
      ? { x: selectedGame.resources.bannerPositionX, y: selectedGame.resources.bannerPositionY, zoom: selectedGame.resources.bannerZoom, fit: selectedGame.resources.bannerFit }
      : { x: selectedGame.resources?.coverPositionX, y: selectedGame.resources?.coverPositionY, zoom: selectedGame.resources?.coverZoom, fit: selectedGame.resources?.coverFit }
  const video = resourceUrl(selectedGame.resources?.videoPath)
  const logo = resourceUrl(selectedGame.resources?.logoPath)
  const visibleGames = games.filter(game => !game.hidden || game.id === selectedGame.id)

  return <div className="relative h-full overflow-y-auto bg-[#08090c] thin-scroll">
    <section className="relative min-h-[430px] overflow-hidden border-b border-white/[0.055] lg:min-h-[500px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(232,184,75,0.08),transparent_34%)]" />
      {video ? <video src={video} autoPlay muted loop playsInline className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-38" /> : background ? <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full opacity-38" style={{ objectFit: heroTransform.fit ?? 'cover', objectPosition: `${heroTransform.x ?? 50}% ${heroTransform.y ?? 50}%`, transform: `scale(${(heroTransform.zoom ?? 100) / 100})` }} /> : <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_74%_34%,rgba(108,64,135,0.24),transparent_39%),radial-gradient(ellipse_at_64%_58%,rgba(232,184,75,0.11),transparent_36%)]" />}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#08090c_4%,rgba(8,9,12,0.93)_35%,rgba(8,9,12,0.45)_72%,rgba(8,9,12,0.82)),linear-gradient(0deg,#08090c_0%,transparent_54%)]" />

      <div className="relative flex min-h-[430px] flex-col p-5 sm:p-7 lg:min-h-[500px]">
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-mono text-[8px] uppercase tracking-[0.24em] text-white/35">Jeu sélectionné</p><p className="mt-1 text-[9px] text-white/26">{selectedGame.provider || 'Ajout manuel'}{selectedGame.buildId ? ` · build ${selectedGame.buildId}` : ''}</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setSteamDialogOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/20 px-2.5 py-1.5 text-[9px] text-white/52 backdrop-blur hover:bg-white/[0.06] hover:text-white"><Radar size={11} /> Détecter</button><button type="button" onClick={() => setResourcesGameId(selectedGame.id)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/20 px-2.5 py-1.5 text-[9px] text-white/52 backdrop-blur hover:bg-white/[0.06] hover:text-white"><Palette size={11} /> Apparence</button></div>
        </div>

        <div className="mt-auto grid items-end gap-8 pb-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0">
            {logo ? <img src={logo} alt={selectedGame.name} className="mb-4 max-h-24 max-w-[min(420px,82vw)] object-contain object-left" /> : <h1 className="max-w-3xl font-display text-5xl font-black uppercase leading-[0.86] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">{selectedGame.name}</h1>}
            <p className="mt-4 text-[11px] text-white/46">Profil <span className="text-white/75">{selectedProfile.name}</span> · {activeMods} mod{activeMods !== 1 ? 's' : ''} actif{activeMods !== 1 ? 's' : ''}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void (isPlaying ? Promise.resolve(stopPlaying()) : launchSelectedGame())} className={`flex min-w-28 items-center justify-center gap-2 rounded-full px-5 py-2.5 font-display text-sm font-bold uppercase tracking-[0.12em] transition-all ${isPlaying ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-white text-[#0a0b0e] hover:-translate-y-0.5 hover:bg-white/90'}`}>
                {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}{isPlaying ? `Arrêter ${formatSeconds(sessionTime)}` : 'Jouer'}
              </button>
              <button type="button" onClick={() => setView('mods')} className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/18 px-4 py-2.5 text-[10px] text-white/62 backdrop-blur hover:bg-white/[0.07] hover:text-white"><Settings2 size={12} /> Gérer</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric icon={Boxes} label="Mods actifs" value={String(activeMods)} hint={`${selectedProfile.mods.length} installé${selectedProfile.mods.length !== 1 ? 's' : ''}`} />
            <Metric icon={Clock3} label="Temps de jeu" value={formatTime(selectedGame.totalPlaytime)} hint={selectedGame.lastPlayed ? timeAgo(selectedGame.lastPlayed) : 'Jamais lancé'} />
            <Metric icon={Gamepad2} label="Profils" value={String(selectedGame.profiles.length)} hint={selectedProfile.name} />
            <Metric icon={Radar} label="Source" value={selectedGame.provider || 'Local'} hint={selectedGame.detected ? 'Détecté' : 'Manuel'} />
          </div>
        </div>
      </div>
    </section>

    <section className="p-5 sm:p-7">
      <div className="mb-3 flex items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.22em] text-gold/52">Collection locale</p><h2 className="mt-1 font-display text-xl font-bold text-white">Bibliothèque</h2></div><button type="button" onClick={() => setView('games')} className="text-[9px] text-white/38 hover:text-gold">Tout gérer →</button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {visibleGames.map(game => <GameTile key={game.id} game={game} active={game.id === selectedGame.id} onSelect={() => setSelectedGame(game.id)} onContextMenu={(position) => { setSelectedGame(game.id); setMenu({ game, position }) }} />)}
      </div>
    </section>

    {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
    {resourcesGame && <GameResourcesDialog game={resourcesGame} onClose={() => setResourcesGameId(undefined)} onChange={resources => setGameResources(resourcesGame.id, resources)} />}
    {menu && <GameContextMenu game={menu.game} position={menu.position} onClose={() => setMenu(undefined)} onEditResources={() => setResourcesGameId(menu.game.id)} />}
  </div>
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Boxes; label: string; value: string; hint: string }) {
  return <article className="rounded-xl border border-white/[0.075] bg-black/25 p-3 backdrop-blur-md"><div className="flex items-center gap-1.5 text-white/29"><Icon size={10} /><span className="font-mono text-[7px] uppercase tracking-[0.16em]">{label}</span></div><p className="mt-2 truncate font-display text-xl font-bold text-white/88">{value}</p><p className="mt-0.5 truncate text-[8px] text-white/28">{hint}</p></article>
}

function GameTile({ game, active, onSelect, onContextMenu }: { game: Game; active: boolean; onSelect: () => void; onContextMenu: (position: { x: number; y: number }) => void }) {
  const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath)
  return <article onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onContextMenu({ x: event.clientX, y: event.clientY }) }} className={`group relative aspect-[1.72/1] min-w-0 overflow-hidden rounded-xl border transition-all ${active ? 'border-gold/36 shadow-[0_0_0_1px_rgba(232,184,75,0.08)]' : 'border-white/[0.075] hover:-translate-y-0.5 hover:border-white/20'}`}>
    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full opacity-76 transition-transform duration-300 group-hover:scale-[1.03]" style={{ objectFit: game.resources?.coverFit ?? 'cover', objectPosition: `${game.resources?.coverPositionX ?? 50}% ${game.resources?.coverPositionY ?? 50}%`, transform: `scale(${(game.resources?.coverZoom ?? 100) / 100})` }} /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_20%,rgba(232,184,75,0.14),transparent_32%),linear-gradient(145deg,#171922,#0b0c10)]" />}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/24 to-transparent" />
    <button type="button" onClick={onSelect} className="absolute inset-0 flex w-full flex-col justify-end p-3 text-left"><span className="truncate text-[11px] font-semibold text-white/90">{game.name}</span><span className="mt-0.5 truncate text-[8px] text-white/42">{game.favorite ? '★ Favori · ' : ''}{game.profiles.length} profil{game.profiles.length !== 1 ? 's' : ''}</span></button>
    <div className="absolute right-2 top-2"><GameMoreButton onClick={onContextMenu} /></div>
  </article>
}
