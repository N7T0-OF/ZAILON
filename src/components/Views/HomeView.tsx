import { Boxes, Check, ChevronDown, Clock3, FolderPlus, Gamepad2, Loader2, MoreHorizontal, Palette, Play, Radar, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Game } from '../../types'
import { resourceUrl, native } from '../../lib/native'
import { effectiveInputProfile, effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { SESSION_STATE_LABELS } from '../../lib/launchAdapters'
import { useWorkspaceCache } from '../../lib/workspaceCache'
import { getSelectedGame, getSelectedProfile, resolveProfileMods, useStore } from '../../store/useStore'
import { formatSeconds, formatTime, timeAgo } from '../../utils'
import { GameContextMenu } from '../GameContextMenu'
import { GameResourcesDialog } from '../GameResourcesDialog'
import { SteamDetectionDialog } from '../SteamDetectionDialog'

export function HomeView() {
  const summaries = useWorkspaceCache()
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const importDetectedGames = useStore(state => state.importDetectedGames)
  const setGameResources = useStore(state => state.setGameResources)
  const launchSelectedGame = useStore(state => state.launchSelectedGame)
  const isLaunching = useStore(state => state.isLaunching)
  const launchProgress = useStore(state => state.launchProgress)
  const isPlaying = useStore(state => state.isPlaying)
  const sessionTime = useStore(state => state.sessionTime)
  const activeSession = useStore(state => state.gameSessions.find(session => session.gameId === state.selectedGameId && session.state !== 'Ended' && session.state !== 'Failed'))
  const continueWaiting = useStore(state => state.continueWaiting)
  const endSession = useStore(state => state.endSession)
  const prepareAndWait = useStore(state => state.prepareAndWait)
  const setView = useStore(state => state.setView)
  const setActiveGameTab = useStore(state => state.setActiveGameTab)
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [visualName, setVisualName] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ game: Game; position: { x: number; y: number } }>()
  const [playMenuOpen, setPlayMenuOpen] = useState(false)
  const [resourcesGameId, setResourcesGameId] = useState<string>()
  const launchPercent = launchProgress?.total
    ? Math.min(100, Math.round((launchProgress.current / launchProgress.total) * 100))
    : undefined

  const resourcesGame = games.find(game => game.id === resourcesGameId)
  useEffect(() => {
    if (!selectedGame || !selectedProfile || !native.isDesktop()) return
    let cancelled = false
    Promise.all([native.visualProfiles.association(selectedGame.id, selectedProfile.id), native.visualProfiles.list()])
      .then(([associationId, profiles]) => {
        if (cancelled) return
        const matched = associationId
          ? profiles.find(item => item.id === associationId)
          : profiles.find(item => item.gameAssociations.some(assoc => assoc.gameId === selectedGame.id && (!assoc.profileId || assoc.profileId === selectedProfile.id)))
        setVisualName(matched?.name || null)
      })
      .catch(() => { if (!cancelled) setVisualName(null) })
    return () => { cancelled = true }
  }, [selectedGame, selectedProfile])
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

  const profileMods = resolveProfileMods(selectedGame, selectedProfile)
  const activeMods = profileMods.filter(mod => mod.enabled).length
  const installedMods = profileMods.length
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
        ? <video src={video} autoPlay muted loop playsInline className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80" />
        : background
          ? <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full opacity-85" style={{ objectFit: heroTransform.fit ?? 'cover', objectPosition: `${heroTransform.x ?? 50}% ${heroTransform.y ?? 50}%`, transform: `scale(${(heroTransform.zoom ?? 100) / 100})` }} />
          : <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_30%,rgba(128,58,111,0.42),transparent_37%),radial-gradient(ellipse_at_68%_54%,rgba(42,78,77,0.18),transparent_40%),linear-gradient(130deg,#141718,#090b0b)]" />}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,9,0.82)_0%,rgba(7,9,9,0.55)_42%,rgba(7,9,9,0.18)_68%,rgba(7,9,9,0.30)_100%),linear-gradient(0deg,rgba(9,11,11,0.78)_0%,rgba(9,11,11,0.45)_22%,rgba(9,11,11,0.12)_55%,rgba(9,11,11,0.18)_100%)]" />

      <div className="relative flex h-full min-h-[520px] flex-col px-[clamp(1.25rem,4vw,4.5rem)] pb-4 pt-5">
        <header className="flex items-start justify-between gap-4">
          <div className="pt-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/30">Sélection actuelle</p>
            <p className="mt-1 text-[11px] text-white/22">{selectedGame.provider || 'Bibliothèque locale'}{selectedGame.version ? ` · v${selectedGame.version}` : ''}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-1 hidden text-right sm:block">
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/74">{isLaunching ? 'Préparation' : activeSession ? SESSION_STATE_LABELS[activeSession.state] || 'En jeu' : isPlaying ? 'En jeu' : 'Prêt à jouer'}</p>
              <p className="mt-0.5 max-w-72 truncate text-[11px] text-white/36">{isLaunching ? launchProgress?.message || 'Analyse des mods…' : activeSession?.state === 'WaitingForGame' && activeSession.reattachUntil ? `Rattachement dans ${Math.max(0, Math.ceil((activeSession.reattachUntil - Date.now()) / 1000))} s…` : activeSession?.state === 'GameLost' ? 'Jeu non détecté' : isPlaying ? formatSeconds(sessionTime) : selectedGame.lastPlayed ? timeAgo(selectedGame.lastPlayed) : 'Jamais lancé'}</p>
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
          {(activeMods > 0 || effectiveInputProfile(selectedGame, selectedProfile.id) || visualName || selectedGame.bypassPath || (selectedGame.runtimePaths || []).length > 0) && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {activeMods > 0 && <HomeBadge label={`${activeMods} mods`} />}
            {effectiveInputProfile(selectedGame, selectedProfile.id) && <HomeBadge label={LAYOUT_LABELS[effectiveLayout(selectedGame, selectedProfile.id)]} />}
            {visualName && <HomeBadge label={`Visuel · ${visualName}`} />}
            {selectedGame.bypassPath && <HomeBadge label="Bypass / Loader" />}
            {(selectedGame.runtimePaths || []).length > 0 && <HomeBadge label={`${selectedGame.runtimePaths!.length} chemin(s) runtime`} />}
          </div>}
          {activeSession && activeSession.state === 'GameRunning' && (
            <div className="mt-4 max-w-md rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-200/90">Session en cours</p>
                  <p className="mt-1 text-[11px] text-white/52">Profil <span className="font-semibold text-white/75">{selectedProfile.name}</span> · <span className="text-emerald-200/85">{formatSeconds(sessionTime)}</span>{effectiveInputProfile(selectedGame, selectedProfile.id) ? <span> · <span className="text-emerald-200/70">{LAYOUT_LABELS[effectiveLayout(selectedGame, selectedProfile.id)]}</span></span> : null}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100/85"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />En jeu</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">La session se termine quand le jeu se ferme ; ZAILON restaure alors automatiquement le déploiement et le remapping.</p>
            </div>
          )}
          {activeSession && (activeSession.state === 'WaitingForGame' || activeSession.state === 'LauncherStarted' || activeSession.state === 'WaitingForElevation') && (
            <div className={`mt-4 max-w-md rounded-xl border p-3 backdrop-blur-md ${activeSession.state === 'WaitingForElevation' ? 'border-sky-300/20 bg-sky-300/[0.05]' : 'border-amber-300/20 bg-amber-300/[0.05]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={`font-mono text-[11px] uppercase tracking-widest ${activeSession.state === 'WaitingForElevation' ? 'text-sky-200/90' : 'text-amber-100/90'}`}>{activeSession.state === 'WaitingForElevation' ? 'Autorisation Windows requise' : 'En attente du jeu'}</p>
                  <p className="mt-1 text-[11px] text-white/52">{activeSession.state === 'WaitingForElevation'
                    ? 'Le launcher demande une élévation. Acceptez la fenêtre UAC pour continuer — ZAILON ne la contourne jamais.'
                    : 'Le launcher a pris le relais (Steam / launcher officiel). Le déploiement et le remapping restent prêts.'}</p>
                </div>
                {activeSession.reattachUntil
                  ? <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${activeSession.state === 'WaitingForElevation' ? 'border-sky-300/25 bg-sky-300/10 text-sky-100/85' : 'border-amber-300/25 bg-amber-300/10 text-amber-100/85'}`}><Clock3 size={10} />{Math.max(0, Math.ceil((activeSession.reattachUntil - Date.now()) / 1000))} s</span>
                  : <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100/85">Rattachement</span>}
              </div>
            </div>
          )}
          {activeSession && activeSession.state === 'GameLost' && (
            <div className="mt-4 max-w-md rounded-xl border border-red-300/20 bg-red-300/[0.05] p-3 backdrop-blur-md">
              <p className="font-mono text-[11px] uppercase tracking-widest text-red-200/90">Jeu non détecté</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/52">Le launcher a été ouvert mais le jeu n'a pas été détecté pendant la fenêtre de rattachement. Le déploiement reste actif.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={() => continueWaiting(activeSession.gameId)} className="rounded-lg border border-gold/25 px-3 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10">Continuer à attendre</button>
                <button type="button" onClick={() => endSession(activeSession.gameId)} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06]">Terminer la session</button>
              </div>
            </div>
          )}
          <div className="mt-5 flex items-center gap-2">
            <div className="relative flex items-center">
              <button type="button" disabled={isPlaying || isLaunching} title={isLaunching ? launchProgress?.message || 'Préparation des mods en arrière-plan' : isPlaying ? 'Le déploiement sera restauré automatiquement à la fermeture du jeu.' : 'Préparer les mods et lancer le jeu'} onClick={() => void launchSelectedGame()} className={`flex items-center gap-2 rounded-full py-2.5 pl-5 font-display text-[11px] font-bold uppercase tracking-[0.11em] transition-all ${isPlaying || isLaunching ? 'cursor-not-allowed bg-emerald-200/18 text-emerald-100/72' : 'bg-[#dbe8e5] text-[#0d1111] hover:-translate-y-0.5 hover:bg-white'}`}>
                {isLaunching ? <Loader2 size={12} className="animate-spin" /> : <Play size={10} fill="currentColor" />}
                {isLaunching ? `Préparation${launchPercent === undefined ? '…' : ` ${launchPercent}%`}` : isPlaying ? 'En cours' : 'Jouer'}
              </button>
              <button type="button" disabled={isPlaying || isLaunching} onClick={() => setPlayMenuOpen(open => !open)} title="Options de lancement" aria-label="Options de lancement" aria-expanded={playMenuOpen} className={`flex h-full items-center rounded-r-full border-l border-black/15 px-2 transition-colors ${isPlaying || isLaunching ? 'cursor-not-allowed bg-emerald-200/18 text-emerald-100/60' : 'bg-[#dbe8e5] text-[#0d1111] hover:bg-white'}`}><ChevronDown size={12} className={`transition-transform ${playMenuOpen ? 'rotate-180' : ''}`} /></button>
              {playMenuOpen && !isPlaying && !isLaunching && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPlayMenuOpen(false)} />
                  <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/[0.09] bg-[#141818] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
                    <button type="button" onClick={() => { setPlayMenuOpen(false); void launchSelectedGame() }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[11px] text-white/70 hover:bg-white/[0.05]"><Play size={11} className="text-gold/80" /><span><span className="block font-semibold text-white/80">Jouer</span><span className="block text-[10px] text-white/30">Prépare les mods puis lance le jeu (ou son launcher).</span></span></button>
                    <button type="button" onClick={() => { setPlayMenuOpen(false); prepareAndWait(selectedGame.id, selectedProfile.id) }} className="flex w-full items-center gap-2.5 border-t border-white/[0.05] px-3.5 py-2.5 text-left text-[11px] text-white/70 hover:bg-white/[0.05]"><Clock3 size={11} className="text-gold/80" /><span><span className="block font-semibold text-white/80">Préparer et attendre le jeu</span><span className="block text-[10px] text-white/30">Lancez le jeu vous-même (launcher officiel) — ZAILON l'attache ensuite.</span></span></button>
                    <button type="button" onClick={() => { setPlayMenuOpen(false); void launchSelectedGame({ withoutMods: true }) }} className="flex w-full items-center gap-2.5 border-t border-white/[0.05] px-3.5 py-2.5 text-left text-[11px] text-white/70 hover:bg-white/[0.05]"><Boxes size={11} className="text-gold/80" /><span><span className="block font-semibold text-white/80">Lancer sans mods</span><span className="block text-[10px] text-white/30">Démarre le jeu avec le profil vide — utile pour diagnostiquer.</span></span></button>
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={() => setActiveGameTab('mods')} aria-label="Gérer les mods" title="Gérer les mods" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-black/25 text-white/50 backdrop-blur hover:bg-white/[0.08] hover:text-white"><Settings2 size={12} /></button>
          </div>
          {isLaunching && <div className="mt-3 w-full max-w-md" role="status" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div className={`h-full rounded-full bg-[#dbe8e5] transition-[width] duration-300 ${launchPercent === undefined ? 'w-1/3 animate-pulse' : ''}`} style={launchPercent === undefined ? undefined : { width: `${launchPercent}%` }} />
            </div>
            <p className="mt-2 truncate text-[11px] text-white/48">{launchProgress?.message || 'Préparation du jeu en arrière-plan…'}</p>
          </div>}
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

          <DashboardPanel eyebrow="Vos statistiques" footer="Gérer les mods" onFooter={() => setActiveGameTab('mods')}>
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
                return game ? <QuickGame key={game.id} game={game} summary={summaries[game.id]} active={game.id === selectedGame.id} onSelect={() => setSelectedGame(game.id)} /> : <div key={`empty-${index}`} className="rounded-lg border border-dashed border-white/[0.06] bg-black/10" />
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

function HomeBadge({ label }: { label: string }) {
  return <span className="flex items-center gap-1 rounded-full border border-white/[0.09] bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/58 backdrop-blur-sm"><Check size={9} className="text-emerald-300/80" />{label}</span>
}

function QuickGame({ game, summary, active, onSelect }: { game: Game; summary?: { health?: { verdict: 'ok' | 'vigilance' | 'attention' }; profileCounts?: Record<string, { active: number }> }; active: boolean; onSelect: () => void }) {
  const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath) || game.backgroundArt
  const firstProfileId = game.profiles[0]?.id
  const activeCount = firstProfileId ? summary?.profileCounts?.[firstProfileId]?.active : undefined
  const healthTone = summary?.health ? (summary.health.verdict === 'ok' ? 'bg-emerald-300/85' : summary.health.verdict === 'vigilance' ? 'bg-amber-300/85' : 'bg-red-300/85') : undefined
  return <button type="button" onClick={onSelect} title={game.name} className={`group/quick relative min-w-0 overflow-hidden rounded-lg border text-left ${active ? 'border-[#dbe8e5]/28' : 'border-white/[0.06] hover:border-white/20'}`}>
    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-68 transition-transform group-hover/quick:scale-105" /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#25292a,#101313)]" />}
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
    {healthTone && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${healthTone}`} title={`Santé : ${summary?.health?.verdict}`} />}
    <span className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 truncate text-[11px] font-semibold text-white/78"><span className="min-w-0 flex-1 truncate">{game.name}</span>{activeCount !== undefined && <span className="shrink-0 font-mono text-[9px] text-white/40">{activeCount} actif(s)</span>}</span>
  </button>
}
