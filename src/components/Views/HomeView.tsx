import { Boxes, Clock3, FolderPlus, Gamepad2, MoreHorizontal, Palette, Play, Radar, Settings2, Square } from 'lucide-react'
import { useState } from 'react'
import { Game } from '../../types'
import { resourceUrl } from '../../lib/native'
import { getSelectedGame, getSelectedProfile, useStore } from '../../store/useStore'
import { formatSeconds, formatTime, timeAgo } from '../../utils'
import { GameContextMenu } from '../GameContextMenu'
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
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [menu, setMenu] = useState<{ game: Game; position: { x: number; y: number } }>()
  const [resourcesGameId, setResourcesGameId] = useState<string>()

  const resourcesGame = games.find(game => game.id === resourcesGameId)
  if (!selectedGame || !selectedProfile) {
    return <>
      <div className="relative flex h-full min-h-[480px] items-center justify-center overflow-hidden bg-[#0c0e0e] p-7 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_26%,rgba(126,67,116,0.20),transparent_35%),linear-gradient(120deg,#0b0d0d,#111314_55%,#090a0b)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,8,8,0.95),rgba(7,8,8,0.35),rgba(7,8,8,0.82)),linear-gradient(0deg,#080909,transparent_65%)]" />
        <div className="relative max-w-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.13] bg-black/35 shadow-[0_16px_55px_rgba(0,0,0,0.42)]"><span className="font-display text-2xl font-black text-[#dbe8e5]">Z</span></div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-white/30">Universal Mod Launcher</p>
          <h1 className="mt-2 font-display text-5xl font-black uppercase leading-[0.88] text-white">Créez votre<br />bibliothèque</h1>
          <p className="mx-auto mt-4 max-w-md text-[11px] leading-relaxed text-white/38">Ajoutez un exécutable local ou détectez les bibliothèques installées sur cet appareil.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => void addGameFromExecutable()} className="flex items-center gap-2 rounded-full bg-[#dbe8e5] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#101313] hover:bg-white"><FolderPlus size={12} /> Ajouter</button>
            <button type="button" onClick={() => setDiscoveryOpen(true)} className="flex items-center gap-2 rounded-full border border-white/[0.12] bg-black/22 px-5 py-2.5 text-[11px] uppercase tracking-[0.12em] text-white/58 backdrop-blur hover:bg-white/[0.07] hover:text-white"><Radar size={12} /> Détecter</button>
          </div>
        </div>
      </div>
      {discoveryOpen && <SteamDetectionDialog onClose={() => setDiscoveryOpen(false)} onImport={importDetectedGames} />}
    </>
  }

  const activeMods = selectedProfile.mods.filter(mod => mod.enabled).length
  const installedMods = selectedProfile.mods.length
  const activePercent = installedMods ? Math.round((activeMods / installedMods) * 100) : 0
  const heroResource = selectedGame.resources?.backgroundPath || selectedGame.resources?.bannerPath || selectedGame.resources?.coverPath
  const background = resourceUrl(heroResource) || selectedGame.backgroundArt
  const heroTransform = selectedGame.resources?.backgroundPath
    ? { x: selectedGame.resources.backgroundPositionX, y: selectedGame.resources.backgroundPositionY, zoom: selectedGame.resources.backgroundZoom, fit: selectedGame.resources.backgroundFit }
    : selectedGame.resources?.bannerPath
      ? { x: selectedGame.resources.bannerPositionX, y: selectedGame.resources.bannerPositionY, zoom: selectedGame.resources.bannerZoom, fit: selectedGame.resources.bannerFit }
      : { x: selectedGame.resources?.coverPositionX, y: selectedGame.resources?.coverPositionY, zoom: selectedGame.resources?.coverZoom, fit: selectedGame.resources?.coverFit }
  const video = resourceUrl(selectedGame.resources?.videoPath)
  const logo = resourceUrl(selectedGame.resources?.logoPath)
  const gameIcon = resourceUrl(selectedGame.resources?.iconPath || selectedGame.resources?.coverPath || selectedGame.resources?.bannerPath)
  const visibleGames = games.filter(game => !game.hidden || game.id === selectedGame.id)
  const quickGames = [selectedGame, ...visibleGames.filter(game => game.id !== selectedGame.id)].slice(0, 3)
  const activity = Array.from({ length: 7 }, (_, index) => selectedGame.profiles[index]?.playtime ?? 0)
  const activityMaximum = Math.max(1, ...activity)
  const profileActivity = selectedGame.profiles.reduce((total, profile) => total + profile.playtime, 0)

  const openMenu = (position: { x: number; y: number }) => setMenu({ game: selectedGame, position })

  return <div className="relative h-full min-h-0 overflow-y-auto bg-[#0a0c0c] thin-scroll">
    <section
      className="group relative h-full min-h-[520px] overflow-hidden"
      onContextMenu={event => { event.preventDefault(); openMenu({ x: event.clientX, y: event.clientY }) }}
    >
      {video
        ? <video src={video} autoPlay muted loop playsInline className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70" />
        : background
          ? <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full opacity-72" style={{ objectFit: heroTransform.fit ?? 'cover', objectPosition: `${heroTransform.x ?? 50}% ${heroTransform.y ?? 50}%`, transform: `scale(${(heroTransform.zoom ?? 100) / 100})` }} />
          : <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_30%,rgba(128,58,111,0.42),transparent_37%),radial-gradient(ellipse_at_68%_54%,rgba(42,78,77,0.18),transparent_40%),linear-gradient(130deg,#141718,#090b0b)]" />}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,9,0.98)_0%,rgba(7,9,9,0.88)_30%,rgba(7,9,9,0.34)_64%,rgba(7,9,9,0.52)_100%),linear-gradient(0deg,#090b0b_0%,rgba(9,11,11,0.88)_17%,rgba(9,11,11,0.28)_51%,rgba(7,9,9,0.38)_100%)]" />

      <div className="relative flex h-full min-h-[520px] flex-col px-[clamp(1.25rem,4vw,4.5rem)] pb-4 pt-5">
        <header className="flex items-start justify-between gap-4">
          <div className="pt-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/30">Sélection actuelle</p>
            <p className="mt-1 text-[11px] text-white/22">{selectedGame.provider || 'Bibliothèque locale'}{selectedGame.version ? ` · v${selectedGame.version}` : ''}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-1 hidden text-right sm:block">
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/74">{isPlaying ? 'En jeu' : 'Prêt à jouer'}</p>
              <p className="mt-0.5 text-[11px] text-white/27">{isPlaying ? formatSeconds(sessionTime) : selectedGame.lastPlayed ? timeAgo(selectedGame.lastPlayed) : 'Jamais lancé'}</p>
            </div>
            <CircleAction label="Détecter" onClick={() => setDiscoveryOpen(true)}><Radar size={11} /></CircleAction>
            <CircleAction label="Modifier l’apparence" onClick={() => setResourcesGameId(selectedGame.id)}><Palette size={11} /></CircleAction>
            <CircleAction label="Actions du jeu" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); openMenu({ x: rect.right - 252, y: rect.bottom + 5 }) }}><MoreHorizontal size={12} /></CircleAction>
            <button type="button" onClick={() => setView('games')} title="Ouvrir les paramètres du jeu" className="ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.14] bg-[#111515] shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:border-white/30">
              {gameIcon ? <img src={gameIcon} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-sm font-black text-[#dbe8e5]">{selectedGame.name.charAt(0).toUpperCase()}</span>}
            </button>
          </div>
        </header>

        <div className="mt-[clamp(2.2rem,8vh,6.5rem)] max-w-[min(690px,72vw)]">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/32">{selectedGame.favorite ? 'Jeu favori' : selectedGame.itemKind === 'software' ? 'Application locale' : 'Jeu sélectionné'}</p>
          {logo
            ? <img src={logo} alt={selectedGame.name} className="mt-4 max-h-28 max-w-[min(430px,72vw)] object-contain object-left" />
            : <h1 className="mt-3 max-w-3xl font-display text-[clamp(3.2rem,6.7vw,7rem)] font-black uppercase leading-[0.78] tracking-[-0.025em] text-white">{selectedGame.shortName || selectedGame.name}</h1>}
          <p className="mt-5 text-[11px] text-white/38">Profil <span className="font-semibold text-white/70">{selectedProfile.name}</span><span className="mx-2 text-white/18">•</span>{activeMods} mod{activeMods !== 1 ? 's' : ''} actif{activeMods !== 1 ? 's' : ''}</p>
          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={() => void (isPlaying ? Promise.resolve(stopPlaying()) : launchSelectedGame())} className={`flex min-w-28 items-center justify-center gap-2 rounded-full px-5 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.11em] transition-all ${isPlaying ? 'bg-[#a73b4d] text-white hover:bg-[#bb4559]' : 'bg-[#dbe8e5] text-[#0d1111] hover:-translate-y-0.5 hover:bg-white'}`}>
              {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}{isPlaying ? 'Arrêter' : 'Jouer'}
            </button>
            <button type="button" onClick={() => setView('mods')} aria-label="Gérer les mods" title="Gérer les mods" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-black/25 text-white/50 backdrop-blur hover:bg-white/[0.08] hover:text-white"><Settings2 size={12} /></button>
          </div>
        </div>

        <div className="mt-auto grid gap-2 pt-8 min-[800px]:grid-cols-[1.08fr_0.92fr_1.14fr]">
          <DashboardPanel eyebrow="Activité des profils" footer="Voir les profils" onFooter={() => setView('games')}>
            <div className="flex h-[72px] items-end gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-white/[0.10] bg-white/[0.035]">
                {gameIcon ? <img src={gameIcon} alt="" className="h-full w-full object-cover" /> : <Gamepad2 size={13} className="text-white/40" />}
              </div>
              <div className="flex min-w-0 flex-1 items-end justify-between gap-1.5">
                {activity.map((value, index) => <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={selectedGame.profiles[index]?.name || 'Aucun profil'}>
                  <span className="w-full max-w-3 rounded-[2px] bg-[#dbe8e5]/75" style={{ height: `${Math.max(4, Math.round((value / activityMaximum) * 38))}px`, opacity: value ? 1 : 0.14 }} />
                  <span className="max-w-full truncate font-mono text-[11px] uppercase text-white/18">{selectedGame.profiles[index]?.name.charAt(0) || '·'}</span>
                </div>)}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-white/26">{profileActivity ? `${formatTime(profileActivity)} sur les profils` : 'Aucune activité enregistrée'}</p>
          </DashboardPanel>

          <DashboardPanel eyebrow="Vos statistiques" footer="Gérer les mods" onFooter={() => setView('mods')}>
            <div className="grid h-[72px] grid-cols-2 divide-x divide-white/[0.07]">
              <MiniStat icon={Boxes} value={`${activePercent}%`} label={`${activeMods}/${installedMods} mods`} />
              <MiniStat icon={Clock3} value={formatTime(selectedGame.totalPlaytime)} label="temps de jeu" />
            </div>
            <p className="mt-1 truncate text-[11px] text-white/26">{selectedGame.lastPlayed ? `Dernière session ${timeAgo(selectedGame.lastPlayed)}` : 'Prêt pour une première session'}</p>
          </DashboardPanel>

          <DashboardPanel eyebrow="Bibliothèque récente" footer="Toute la bibliothèque" onFooter={() => setView('games')}>
            <div className="grid h-[72px] grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, index) => {
                const game = quickGames[index]
                return game ? <QuickGame key={game.id} game={game} active={game.id === selectedGame.id} onSelect={() => setSelectedGame(game.id)} /> : <div key={`empty-${index}`} className="rounded-lg border border-dashed border-white/[0.06] bg-black/10" />
              })}
            </div>
            <p className="mt-1 truncate text-[11px] text-white/26">{visibleGames.length} élément{visibleGames.length !== 1 ? 's' : ''} dans ZAILON</p>
          </DashboardPanel>
        </div>
      </div>
    </section>

    {discoveryOpen && <SteamDetectionDialog onClose={() => setDiscoveryOpen(false)} onImport={importDetectedGames} />}
    {resourcesGame && <GameResourcesDialog game={resourcesGame} onClose={() => setResourcesGameId(undefined)} onChange={resources => setGameResources(resourcesGame.id, resources)} />}
    {menu && <GameContextMenu game={menu.game} position={menu.position} onClose={() => setMenu(undefined)} onEditResources={() => setResourcesGameId(menu.game.id)} />}
  </div>
}

function CircleAction({ label, onClick, children }: { label: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.11] bg-black/25 text-white/45 backdrop-blur-md transition-colors hover:bg-white/[0.09] hover:text-white">{children}</button>
}

function DashboardPanel({ eyebrow, footer, onFooter, children }: { eyebrow: string; footer: string; onFooter: () => void; children: React.ReactNode }) {
  return <article className="min-w-0">
    <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/26">{eyebrow}</p>
    <div className="overflow-hidden rounded-xl border border-white/[0.055] bg-black/25 shadow-[0_14px_38px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="px-3 pb-2 pt-3">{children}</div>
      <button type="button" onClick={onFooter} className="w-full border-t border-white/[0.045] bg-black/10 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/18 hover:bg-white/[0.035] hover:text-white/46">{footer}</button>
    </div>
  </article>
}

function MiniStat({ icon: Icon, value, label }: { icon: typeof Boxes; value: string; label: string }) {
  return <div className="flex min-w-0 flex-col justify-center px-3 first:pl-0 last:pr-0">
    <div className="flex items-center justify-between gap-2"><span className="truncate font-display text-xl font-bold text-white/88">{value}</span><Icon size={10} className="flex-none text-white/25" /></div>
    <p className="mt-1 truncate text-[11px] text-white/24">{label}</p>
  </div>
}

function QuickGame({ game, active, onSelect }: { game: Game; active: boolean; onSelect: () => void }) {
  const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath) || game.backgroundArt
  return <button type="button" onClick={onSelect} title={game.name} className={`group/quick relative min-w-0 overflow-hidden rounded-lg border text-left ${active ? 'border-[#dbe8e5]/28' : 'border-white/[0.06] hover:border-white/20'}`}>
    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-68 transition-transform group-hover/quick:scale-105" /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#25292a,#101313)]" />}
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
    <span className="absolute inset-x-1.5 bottom-1.5 truncate text-[11px] font-semibold text-white/78">{game.name}</span>
  </button>
}
