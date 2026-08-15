import { Boxes, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, FolderPlus, Gamepad2, Loader2, MoreHorizontal, Palette, Play, Radar, Settings2, SlidersHorizontal, Star, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Game, GameBackgroundMedia, GameSession } from '../../types'
import { resolveAudioSettings, resolveMediaType, shouldStartMuted } from '../../lib/backgroundMedia'
import { backgroundPlayerState, setBackgroundSessionMuted, setBackgroundSessionVolume, subscribeBackgroundPlayerState, type BackgroundPlayerState } from '../../lib/backgroundMediaPlayer'
import { resourceUrl, native } from '../../lib/native'
import { effectiveInputProfile, effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { isRed4extActive } from '../../lib/frameworkValidator'
import { SESSION_STATE_LABELS } from '../../lib/launchAdapters'
import { useWorkspaceCache } from '../../lib/workspaceCache'
import { getSelectedGame, getSelectedProfile, resolveProfileMods, useStore } from '../../store/useStore'
import { formatElapsedDuration, formatSeconds, formatTime, timeAgo } from '../../utils'
import { addonCapabilities, hasCapability } from '../../lib/addonGating'
import { HOME_PRESET_LABELS, HOME_WIDGET_DEFAULTS, HOME_WIDGET_VARIANTS, orderHomeWidgets, widgetGridClass, type HomeLayoutPreset, type HomeWidgetConfig } from '../../lib/homeWidgets'
import { pickPrioritySession } from '../../lib/sessionPriority'
import { groupProfilePairs, groupMembers, nextGroupProfile } from '../../lib/gameGroups'
import { GameContextMenu } from '../GameContextMenu'
import { GameResourcesDialog } from '../GameResourcesDialog'
import { FallbackArtwork } from '../UI/FallbackArtwork'
import { SessionStopModal } from '../SessionStopModal'
import { SteamDetectionDialog } from '../SteamDetectionDialog'
import { BackgroundMediaLayer } from '../UI/BackgroundMediaLayer'
import { ProfileSwitcherPopover } from '../UI/ProfileSwitcherPopover'
import { ZailonSwitch } from '../UI/ZailonSwitch'

export function HomeView() {
  const summaries = useWorkspaceCache()
  const games = useStore(state => state.games)
  const gameGroups = useStore(state => state.gameGroups)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const setGamesBrowsing = useStore(state => state.setGamesBrowsing)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const importDetectedGames = useStore(state => state.importDetectedGames)
  const setGameResources = useStore(state => state.setGameResources)
  const launchSelectedGame = useStore(state => state.launchSelectedGame)
  const isLaunching = useStore(state => state.isLaunching)
  const launchProgress = useStore(state => state.launchProgress)
  const isPlaying = useStore(state => state.isPlaying)
  const sessionTime = useStore(state => state.sessionTime)
  const backgroundMediaSettings = useStore(state => state.backgroundMediaSettings)
  const performanceMode = useStore(state => state.performanceModes[state.selectedGameId ?? ''] ?? state.globalPerformanceMode)
  const setGameBackgroundMedia = useStore(state => state.setGameBackgroundMedia)
  const activeSession = useStore(state => state.gameSessions.find(session => session.gameId === state.selectedGameId && session.state !== 'Ended' && session.state !== 'Failed'))
  const allSessions = useStore(state => state.gameSessions)
  const endSession = useStore(state => state.endSession)
  const cancelSession = useStore(state => state.cancelSession)
  const setView = useStore(state => state.setView)
  const setActiveGameTab = useStore(state => state.setActiveGameTab)
  const addons = useStore(state => state.addons)
  const homeWidgets = useStore(state => state.homeWidgets)
  const homeLayoutPreset = useStore(state => state.homeLayoutPreset)
  const setHomeWidget = useStore(state => state.setHomeWidget)
  const setHomeLayoutPreset = useStore(state => state.setHomeLayoutPreset)
  const resetHomeLayout = useStore(state => state.resetHomeLayout)
  const setSelectedProfile = useStore(state => state.setSelectedProfile)
  const addProfile = useStore(state => state.addProfile)
  const setGameFavorite = useStore(state => state.setGameFavorite)
  const recordNotice = useStore(state => state.recordNotice)
  // Gating add-ons (spec §57-58) : le badge visuel n'existe que si l'add-on
  // Visual Profiles est installé et activé — jamais dans le Core seul.
  const capabilities = useMemo(() => addonCapabilities(addons), [addons])
  const hasVisualProfiles = hasCapability(capabilities, 'visual.profiles')
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const [visualName, setVisualName] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ game: Game; position: { x: number; y: number } }>()
  const [quitOpen, setQuitOpen] = useState(false)
  const [quitConfirm, setQuitConfirm] = useState(false)
  const [stopSearchingOpen, setStopSearchingOpen] = useState(false)
  const [resourcesGameId, setResourcesGameId] = useState<string>()
  // Duck audio avant le lancement (spec §40, §63) : le fond se tait dès le clic
  // sur Jouer, avant même que la préparation démarre.
  const [mediaDucked, setMediaDucked] = useState(false)

  // Contrôle audio du Hero (spec Accueil §3-5) : volume persisté par jeu
  // (volumeOverride), état muet de SESSION (pont player) + intention persistée
  // (mutedOverride) écrite à part — jamais un réglage global.
  const heroAudio = resolveAudioSettings(selectedGame ? selectedGame.backgroundMedia : undefined, backgroundMediaSettings)
  const setHeroMedia = (patch: Partial<GameBackgroundMedia>) => { if (selectedGame) setGameBackgroundMedia(selectedGame.id, patch) }

  // SmartPlayButton — un seul CTA : l'état du jeu pilote le libellé et le
  // comportement (Jouer → Préparation… → Recherche du jeu… → En cours).
  const sessionRunning = activeSession?.state === 'GameRunning'
  const sessionWaiting = Boolean(activeSession && (activeSession.state === 'WaitingForGame' || activeSession.state === 'WaitingForElevation' || activeSession.state === 'LauncherStarted'))
  const sessionFailed = activeSession?.state === 'GameLost'
  const playBusy = isLaunching || sessionWaiting
  const launchPercent = launchProgress?.total
    ? Math.min(100, Math.round((launchProgress.current / launchProgress.total) * 100))
    : undefined

  // Réarmement du fond quand plus rien ne tourne (spec §65-66 : reprise muette).
  useEffect(() => {
    if (!playBusy && !sessionRunning) setMediaDucked(false)
  }, [playBusy, sessionRunning])

  const resourcesGame = games.find(game => game.id === resourcesGameId)
  useEffect(() => {
    // Add-on gating (spec §57-58) : sans l'add-on Visual Profiles, aucun
    // backend visuel n'est interrogé — le Core ne contient plus la fonction.
    if (!hasVisualProfiles || !selectedGame || !selectedProfile || !native.isDesktop()) return
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
  }, [selectedGame, selectedProfile, hasVisualProfiles])
  if (!selectedGame || !selectedProfile) {
    return <>
      <div className="relative flex h-full min-h-[480px] items-center justify-center overflow-hidden bg-[#0c0e0e] p-7 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_26%,rgba(126,67,116,0.20),transparent_35%),linear-gradient(120deg,#0b0d0d,#111314_55%,#090a0b)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,8,8,0.95),rgba(7,8,8,0.35),rgba(7,8,8,0.82)),linear-gradient(0deg,#080909,transparent_65%)]" />
        <div className="relative max-w-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.13] bg-black/35 shadow-[0_16px_55px_rgba(0,0,0,0.42)]"><span className="font-display text-2xl font-black text-[var(--zailon-accent)]">Z</span></div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-white/30">Universal Mod Launcher</p>
          <h1 className="mt-2 font-display text-5xl font-black uppercase leading-[0.88] text-white">Créez votre<br />bibliothèque</h1>
          <p className="mx-auto mt-4 max-w-md text-[11px] leading-relaxed text-white/38">Ajoutez un exécutable local ou détectez les bibliothèques installées sur cet appareil.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => void addGameFromExecutable()} className="flex items-center gap-2 rounded-full bg-[var(--zailon-accent)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--zailon-accent-text)] hover:bg-[var(--zailon-accent-hover)]"><FolderPlus size={12} /> Ajouter</button>
            <button type="button" onClick={() => setDiscoveryOpen(true)} className="flex items-center gap-2 rounded-full border border-white/[0.12] bg-black/22 px-5 py-2.5 text-[11px] uppercase tracking-[0.12em] text-white/58 backdrop-blur hover:bg-white/[0.07] hover:text-white"><Radar size={12} /> Détecter</button>
          </div>
        </div>
      </div>
      {discoveryOpen && <SteamDetectionDialog onClose={() => setDiscoveryOpen(false)} onImport={importDetectedGames} />}
    </>
  }

  const profileMods = resolveProfileMods(selectedGame, selectedProfile)
  const activeMods = profileMods.filter(mod => mod.enabled).length
  // Badge framework honnête (spec #38-39) : RED4ext ⚠ quand le loader est actif
  // dans le profil mais le chargement réel n'est PAS confirmé — jamais ✓ sans
  // confirmation runtime post-lancement.
  const red4extActive = isRed4extActive(profileMods)
  const heroResource = selectedGame.resources?.backgroundPath || selectedGame.resources?.bannerPath || selectedGame.resources?.coverPath
  const background = resourceUrl(heroResource) || selectedGame.backgroundArt
  const heroTransform = selectedGame.resources?.backgroundPath
    ? { x: selectedGame.resources.backgroundPositionX, y: selectedGame.resources.backgroundPositionY, zoom: selectedGame.resources.backgroundZoom, fit: selectedGame.resources.backgroundFit }
    : selectedGame.resources?.bannerPath
      ? { x: selectedGame.resources.bannerPositionX, y: selectedGame.resources.bannerPositionY, zoom: selectedGame.resources.bannerZoom, fit: selectedGame.resources.bannerFit }
      : { x: selectedGame.resources?.coverPositionX, y: selectedGame.resources?.coverPositionY, zoom: selectedGame.resources?.coverZoom, fit: selectedGame.resources?.coverFit }
  const video = resourceUrl(selectedGame.resources?.videoPath)
  // État de SESSION du fond (spec §44, §50) : le boot démarre muet selon la
  // politique « toujours démarrer muet » (jamais l'intention persistée seule) ;
  // les bascules du Hero agissent sur la session via le pont, et l'intention
  // persistée est écrite à part (store) pour les prochains lancements.
  const [sessionAudio, setSessionAudio] = useState<BackgroundPlayerState>(() => ({
    muted: shouldStartMuted(selectedGame.backgroundMedia, backgroundMediaSettings),
    volume: heroAudio.volume,
    available: false,
  }))
  useEffect(() => subscribeBackgroundPlayerState(() => setSessionAudio(backgroundPlayerState())), [])
  const heroMuted = sessionAudio.available ? sessionAudio.muted : shouldStartMuted(selectedGame.backgroundMedia, backgroundMediaSettings)
  const hasBackgroundSource = resolveMediaType(selectedGame.backgroundMedia, backgroundMediaSettings, Boolean(video)) !== 'none'
  // Indicateur « son coupé pour cette session » : l'utilisateur avait activé le
  // son (intention persistée non muette) mais la politique §44/§50 a démarré ce
  // lancement muet — la session est muette alors que l'intention est active.
  const persistedUnmuted = !(selectedGame.backgroundMedia?.mutedOverride ?? backgroundMediaSettings.bgAlwaysMuted)
  const sessionCut = Boolean(heroMuted && persistedUnmuted && backgroundMediaSettings.bgAudioEnabled && hasBackgroundSource)
  const logo = resourceUrl(selectedGame.resources?.logoPath)
  const gameIcon = resourceUrl(selectedGame.resources?.iconPath || selectedGame.resources?.coverPath || selectedGame.resources?.bannerPath)
  const visibleGames = games.filter(game => !game.hidden || game.id === selectedGame.id)
  // Favoris Accueil (spec « Quick Overlay + Favoris ») : les jeux marqués
  // favoris remplacent « Bibliothèque récente », 6 max, ordre d'ajout.
  const favoriteGames = visibleGames.filter(game => game.favorite).slice(0, 6)
  // Sessions actives (spec §77) : le widget « En cours » n'est rendu QUE pendant
  // une session — sinon il disparaît sans laisser de case vide (§7).
  const activeSessionsNow = allSessions.filter(session => session.state !== 'Ended' && session.state !== 'Failed')
  const pinnedPriorityGameId = useStore(state => state.pinnedPriorityGameId)
  const foregroundGameId = useStore(state => state.foregroundGameId)
  // Ordre des widgets (spec §3-4) : seuls les activés sont rendus, dans
  // l'ordre configuré — aucun trou, réorganisation automatique.
  const widgets = orderHomeWidgets(homeWidgets).filter(widget => widget.id !== 'session' || activeSessionsNow.length > 0)

  const openMenu = (position: { x: number; y: number }) => setMenu({ game: selectedGame, position })
  // Groupe du jeu sélectionné (spec « Groupes de jeux » §7, §16) : le bouton
  // flèche passe au profil suivant du GROUPE (tous les jeux membres, dans
  // l'ordre), pas seulement du jeu courant. Chaque profil reste indépendant.
  const currentGroup = gameGroups.find(group => group.memberGameIds.includes(selectedGame.id))
  const groupMembersList = currentGroup ? groupMembers(games, currentGroup) : []
  const groupContextLabel = currentGroup && groupMembersList.length > 1
    ? `${selectedGame.shortName || selectedGame.name} · ${selectedProfile.name}`
    : selectedProfile.name
  // Choix rapide du profil (spec §16-19) : le nom ouvre la liste complète, la
  // flèche passe au profil suivant (boucle). Jamais pendant une session active
  // si le backend ne peut pas changer en runtime — message honnête (§18).
  const cycleToNextProfile = () => {
    if (sessionRunning) { recordNotice('Changement de profil disponible après la fermeture du jeu.'); return }
    if (currentGroup) {
      const pairs = groupProfilePairs(games, currentGroup)
      if (pairs.length >= 2) {
        const next = nextGroupProfile(pairs, selectedGame.id, selectedProfile.id)
        if (next) {
          if (next.gameId !== selectedGame.id) setSelectedGame(next.gameId)
          void setSelectedProfile(next.profileId)
        }
        return
      }
    }
    const profiles = selectedGame.profiles
    if (profiles.length < 2) return
    const index = profiles.findIndex(profile => profile.id === selectedProfile.id)
    void setSelectedProfile(profiles[(index + 1) % profiles.length].id)
  }
  // Réordonnancement vertical dans la micro-fenêtre (spec §5, §79-80) : les
  // flèches échangent la position de deux widgets voisins.
  const moveWidget = (id: string, delta: number) => {
    const sorted = [...homeWidgets].sort((a, b) => a.order - b.order || (['favorites', 'statistics', 'activity'] as string[]).indexOf(a.id) - (['favorites', 'statistics', 'activity'] as string[]).indexOf(b.id))
    const index = sorted.findIndex(widget => widget.id === id)
    const target = sorted[index + delta]
    if (!target) return
    setHomeWidget(id, { order: target.order })
    setHomeWidget(target.id, { order: sorted[index].order })
  }

  return <div className="relative h-full min-h-0 overflow-y-auto bg-[#0a0c0c] thin-scroll">
    <section
      className="group relative h-full min-h-[520px] overflow-hidden"
      onContextMenu={event => { event.preventDefault(); openMenu({ x: event.clientX, y: event.clientY }) }}
    >
      <BackgroundMediaLayer
        playerKey="home-hero"
        media={selectedGame.backgroundMedia}
        localVideoUrl={video}
        fallbackImageUrl={background}
        fallbackArtwork={<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_30%,rgba(128,58,111,0.42),transparent_37%),radial-gradient(ellipse_at_68%_54%,rgba(42,78,77,0.18),transparent_40%),linear-gradient(130deg,#141718,#090b0b)]" />}
        paused={mediaDucked || playBusy || sessionRunning}
        gameRunning={sessionRunning}
        performanceMode={performanceMode}
        settings={backgroundMediaSettings}
        heroStyle={{ objectFit: heroTransform.fit ?? 'cover', objectPosition: `${heroTransform.x ?? 50}% ${heroTransform.y ?? 50}%`, transform: `scale(${(heroTransform.zoom ?? 100) / 100})` }}
        overlay={<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,9,0.82)_0%,rgba(7,9,9,0.55)_42%,rgba(7,9,9,0.18)_68%,rgba(7,9,9,0.30)_100%),linear-gradient(0deg,rgba(9,11,11,0.78)_0%,rgba(9,11,11,0.45)_22%,rgba(9,11,11,0.12)_55%,rgba(9,11,11,0.18)_100%)]" />}
      />

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
            <CircleAction label="Personnaliser l’Accueil" onClick={() => setCustomizeOpen(true)}><SlidersHorizontal size={11} /></CircleAction>
            <CircleAction label="Actions du jeu" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); openMenu({ x: rect.right - 252, y: rect.bottom + 5 }) }}><MoreHorizontal size={12} /></CircleAction>
            <button type="button" onClick={() => { setGamesBrowsing(false); setView('games') }} title="Ouvrir les paramètres du jeu" className="ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.14] bg-[#111515] shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:border-white/30">
              {gameIcon ? <img src={gameIcon} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-sm font-black text-[var(--zailon-accent)]">{selectedGame.name.charAt(0).toUpperCase()}</span>}
            </button>
          </div>
        </header>

        <div className="mt-[clamp(3.6rem,12vh,9rem)] max-w-[min(690px,72vw)]">
          {/* Spec « Nettoyage Accueil » §1 : plus de texte « Jeu sélectionné » —
              le Hero montre déjà le jeu. L'étoile favori reste seule (§13). */}
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setGameFavorite(selectedGame.id)} title={selectedGame.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-label={selectedGame.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${selectedGame.favorite ? 'bg-gold/15 text-gold' : 'text-white/26 hover:bg-white/[0.07] hover:text-gold'}`}><Star size={12} className={selectedGame.favorite ? 'fill-gold text-gold' : ''} /></button>
          </div>
          {logo
            ? <img src={logo} alt={selectedGame.name} className="mt-4 max-h-28 max-w-[min(430px,72vw)] object-contain object-left" />
            : <h1 className="mt-3 max-w-3xl font-display text-[clamp(3.2rem,6.7vw,7rem)] font-black uppercase leading-[0.78] tracking-[-0.025em] text-white">{selectedGame.shortName || selectedGame.name}</h1>}
          {/* Choix rapide du profil (spec §16-19) : nom = liste complète,
              flèche = profil suivant en boucle. */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-white/38">
            <span>Profil</span>
            <button ref={profileButtonRef} type="button" onClick={() => setProfileMenuOpen(open => !open)} title={groupContextLabel !== selectedProfile.name ? groupContextLabel : undefined} className="flex max-w-56 items-center gap-1 rounded-full border border-white/[0.12] bg-black/25 px-2.5 py-1 font-semibold text-white/75 backdrop-blur hover:border-white/25"><span className="truncate">{groupContextLabel}</span><ChevronDown size={10} className={`shrink-0 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} /></button>
            <button type="button" onClick={cycleToNextProfile} title="Profil suivant" aria-label="Profil suivant" className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.1] bg-black/25 text-white/45 backdrop-blur hover:bg-white/[0.08] hover:text-white"><ChevronRight size={11} /></button>
            <span className="mx-1 text-white/18">•</span>
            <span>{activeMods} mod{activeMods !== 1 ? 's' : ''} actif{activeMods !== 1 ? 's' : ''}</span>
          </div>
          {(() => {
            const badges = [
              ...(activeMods > 0 ? [{ label: `${activeMods} mods`, title: 'Mods actifs du profil' }] : []),
              ...(effectiveInputProfile(selectedGame, selectedProfile.id) ? [{ label: LAYOUT_LABELS[effectiveLayout(selectedGame, selectedProfile.id)], title: 'Disposition clavier active' }] : []),
              ...(visualName ? [{ label: `Visuel · ${visualName}`, title: 'Profil visuel actif' }] : []),
              ...(red4extActive ? [{ label: 'RED4ext ⚠', title: 'Loader RED4ext actif — chargement à confirmer après lancement' }] : []),
              ...(selectedGame.bypassPath ? [{ label: 'Bypass / Loader', title: 'Dossier bypass configuré' }] : []),
              ...((selectedGame.runtimePaths || []).length > 0 ? [{ label: `${selectedGame.runtimePaths!.length} runtime`, title: 'Chemins runtime déployés' }] : []),
            ]
            if (!badges.length) return null
            const shown = badges.slice(0, 3)
            const extra = badges.length - shown.length
            return <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {shown.map((badge, index) => <HomeBadge key={index} label={badge.label} title={badge.title} />)}
              {extra > 0 && <span className="rounded-full border border-white/[0.09] bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/40" title={badges.slice(3).map(badge => badge.label).join(' · ')}>+{extra}</span>}
            </div>
          })()}
          {activeSession && activeSession.state === 'GameRunning' && (
            <div className="mt-4 max-w-md rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-200/90">Session en cours</p>
                  <p className="mt-1 text-[11px] text-white/52">Profil <span className="font-semibold text-white/75">{selectedProfile.name}</span> · <span className="text-emerald-200/85">{formatSeconds(sessionTime)}</span></p>
                  {/* Spec RuntimeSessionV3 §48 : les badges reflètent l'état RÉEL
                      d'activation de la session, pas seulement la configuration. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${activeSession.inputProfileActive ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{activeSession.inputProfileActive ? '✓' : '⚠'} {effectiveInputProfile(selectedGame, selectedProfile.id) ? LAYOUT_LABELS[effectiveLayout(selectedGame, selectedProfile.id)] : 'Clavier'}</span>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${activeSession.visualProfileActive ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{activeSession.visualProfileActive ? '✓' : '⚠'} Visuel</span>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${activeSession.runtimeToolsActive ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{activeSession.runtimeToolsActive ? '✓' : '⚠'} ZAILON</span>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100/85"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />En jeu</span>
                <button type="button" onClick={() => { setQuitConfirm(false); setQuitOpen(true) }} title="Quitter le jeu" aria-label="Quitter le jeu" className="rounded-lg p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-300"><X size={13} /></button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">La session se termine quand le jeu se ferme ; ZAILON restaure alors automatiquement le déploiement et le remapping.</p>
            </div>
          )}
          {activeSession && (activeSession.state === 'WaitingForGame' || activeSession.state === 'LauncherStarted' || activeSession.state === 'WaitingForElevation') && (
            <div className={`mt-4 max-w-md rounded-xl border p-3 backdrop-blur-md ${activeSession.state === 'WaitingForElevation' ? 'border-sky-300/20 bg-sky-300/[0.05]' : 'border-amber-300/20 bg-amber-300/[0.05]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={`font-mono text-[11px] uppercase tracking-widest ${activeSession.state === 'WaitingForElevation' ? 'text-sky-200/90' : 'text-amber-100/90'}`}>{activeSession.state === 'WaitingForElevation' ? 'Élévation Windows en cours' : 'En attente du jeu'}</p>
                  <p className="mt-1 text-[11px] text-white/52">{activeSession.state === 'WaitingForElevation'
                    ? 'Le launcher officiel demande une élévation Windows. ZAILON continue de surveiller la chaîne — le jeu sera reconnu automatiquement dès qu’il démarre, aucune confirmation n’est nécessaire.'
                    : 'Le launcher a pris le relais (Steam / launcher officiel). Le déploiement et le remapping restent prêts.'}</p>
                </div>
                {activeSession.reattachUntil
                  ? <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${activeSession.state === 'WaitingForElevation' ? 'border-sky-300/25 bg-sky-300/10 text-sky-100/85' : 'border-amber-300/25 bg-amber-300/10 text-amber-100/85'}`}><Clock3 size={10} />{Math.max(0, Math.ceil((activeSession.reattachUntil - Date.now()) / 1000))} s</span>
                  : <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100/85">Rattachement</span>}
                <button type="button" onClick={() => setStopSearchingOpen(true)} title="Arrêter la recherche" aria-label="Arrêter la recherche" className="rounded-lg p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-300"><X size={13} /></button>
              </div>
            </div>
          )}
          {activeSession && activeSession.state === 'GameLost' && (
            <div className="mt-4 max-w-md rounded-xl border border-red-300/20 bg-red-300/[0.05] p-3 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3"><p className="font-mono text-[11px] uppercase tracking-widest text-red-200/90">Le jeu n'a pas démarré</p><button type="button" onClick={() => endSession(selectedGame.id)} title="Fermer cette session" aria-label="Fermer cette session" className="rounded-lg p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-300"><X size={13} /></button></div>
              <p className="mt-1 text-[11px] leading-relaxed text-white/52">ZAILON a suivi automatiquement Steam, le launcher et l'élévation, puis a cherché le processus final jusqu'à l'épuisement des preuves. Le déploiement reste en place. Réessayez, ou ouvrez le diagnostic pour voir la chaîne complète.</p>
            </div>
          )}
          <div className="mt-5 flex items-center gap-2">
            <div className="relative flex items-center">
              <button type="button" disabled={playBusy} title={sessionRunning ? 'Le jeu est en cours. Cliquez pour le quitter.' : playBusy ? 'En attente du jeu…' : 'Préparer les mods et lancer le jeu'} onClick={sessionRunning ? () => { setQuitConfirm(false); setQuitOpen(true) } : () => { setMediaDucked(true); void launchSelectedGame() }} className={`flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.11em] transition-all min-w-[168px] ${playBusy ? 'cursor-not-allowed bg-emerald-200/18 text-emerald-100/72' : sessionRunning ? 'bg-emerald-300/90 text-[#0c1212] hover:-translate-y-0.5 hover:bg-emerald-200' : 'bg-[var(--zailon-accent)] text-[var(--zailon-accent-text)] hover:-translate-y-0.5 hover:bg-white'}`}>
                {playBusy ? <Loader2 size={12} className="animate-spin" /> : sessionRunning ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-900/60" /> : <Play size={10} fill="currentColor" />}
                {isLaunching ? `Préparation${launchPercent === undefined ? '…' : ` ${launchPercent}%`}` : sessionRunning ? 'En cours' : sessionWaiting ? (activeSession?.state === 'WaitingForGame' ? 'Recherche du jeu…' : 'Lancement…') : sessionFailed ? 'Réessayer' : 'Jouer'}
              </button>
            </div>
            <button type="button" onClick={() => setActiveGameTab('mods')} aria-label="Gérer les mods" title="Gérer les mods" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-black/25 text-white/50 backdrop-blur hover:bg-white/[0.08] hover:text-white"><Settings2 size={12} /></button>
          </div>
          {isLaunching && <div className="mt-3 w-full max-w-md" role="status" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div className={`h-full rounded-full bg-[var(--zailon-accent)] transition-[width] duration-300 ${launchPercent === undefined ? 'w-1/3 animate-pulse' : ''}`} style={launchPercent === undefined ? undefined : { width: `${launchPercent}%` }} />
            </div>
            <p className="mt-2 truncate text-[11px] text-white/48">{launchProgress?.message || 'Préparation du jeu en arrière-plan…'}</p>
          </div>}
        </div>

        {/* Contrôle audio du Hero (spec §8-13, §27) : dans le flux, aligné à
            droite, TOUJOURS au-dessus des panneaux (Favoris) — jamais en
            position absolue sur toute la page. Le Hero bouge / la vidéo peut
            défiler derrière, le contrôle reste stable et cliquable. */}
        <div className="mt-auto">
          <HeroAudioControl
            muted={heroMuted}
            volume={Math.round((sessionAudio.available ? sessionAudio.volume : heroAudio.volume) * 100)}
            sessionCut={sessionCut}
            onToggle={() => { const next = !heroMuted; setBackgroundSessionMuted(next); setHeroMedia({ mutedOverride: next }) }}
            onVolume={value => { const next = value / 100; setBackgroundSessionVolume(next); setHeroMedia({ volumeOverride: next, mutedOverride: value === 0 }) }}
          />
        {/* Moteur de widgets (spec §1-28, §73-90) : seuls les widgets ACTIVÉS
            sont rendus — un widget désactivé ne coûte ni rendu, ni calcul, ni
            sondage (§7). Disposition automatique (§4) : Wide sur sa propre
            ligne, Medium à deux par ligne (§85-87). En mode Personnalisation :
            contour discret (§80). */}
        {widgets.length > 0 && (
          <div className={`grid gap-3 pt-8 min-[900px]:grid-cols-6 ${customizeOpen ? 'widget-customize-mode' : ''}`}>
            {widgets.map(widget => (
              <div key={widget.id} className={widgetGridClass(widget.size)}>
                {widget.id === 'favorites' && <FavoritesWidget variant={widget.variant} favoriteGames={favoriteGames} summaries={summaries} visibleGames={visibleGames} selectedId={selectedGame.id} onSelect={setSelectedGame} onBrowse={() => { setGamesBrowsing(true); setView('games') }} />}
                {widget.id === 'statistics' && <StatisticsWidget variant={widget.variant} games={games} onOpen={() => setView('statistics')} />}
                {widget.id === 'activity' && <ActivityWidget variant={widget.variant} gameSessions={allSessions} games={games} selectedGame={selectedGame} gameIcon={gameIcon} onProfiles={() => { setGamesBrowsing(false); setView('games') }} />}
                {widget.id === 'session' && <SessionWidget sessions={activeSessionsNow} games={games} pinned={pinnedPriorityGameId} foreground={foregroundGameId} />}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </section>

    {discoveryOpen && <SteamDetectionDialog onClose={() => setDiscoveryOpen(false)} onImport={importDetectedGames} />}
    {resourcesGame && <GameResourcesDialog game={resourcesGame} onClose={() => setResourcesGameId(undefined)} onChange={resources => setGameResources(resourcesGame.id, resources)} />}
    {/* Choix rapide du profil (spec §16-19) : le nom ouvre la liste complète. */}
    <ProfileSwitcherPopover
      open={profileMenuOpen}
      anchorRef={profileButtonRef}
      profiles={selectedGame.profiles}
      selectedProfileId={selectedProfile.id}
      running={sessionRunning}
      countFor={profile => resolveProfileMods(selectedGame, profile).filter(mod => mod.enabled).length}
      onSelect={profileId => void setSelectedProfile(profileId)}
      onCreate={name => addProfile(name)}
      onManage={() => { setActiveGameTab('profiles'); setGamesBrowsing(false); setView('games') }}
      onClose={() => setProfileMenuOpen(false)}
    />
    {customizeOpen && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setCustomizeOpen(false)}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
          <div className="border-b border-white/[0.06] px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">Personnaliser l’Accueil</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/42">Activez, ordonnez et choisissez la variante de chaque widget. ZAILON réorganise la grille automatiquement — aucun trou, aucune case vide (spec §3-4).</p>
          </div>
          <div className="max-h-[58vh] space-y-3 overflow-y-auto px-5 py-4 thin-scroll">
            <label className="block text-[11px] text-white/45">Disposition
              <select value={homeLayoutPreset} onChange={event => setHomeLayoutPreset(event.target.value as HomeLayoutPreset)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70">
                {(Object.keys(HOME_PRESET_LABELS) as HomeLayoutPreset[]).map(value => <option key={value} value={value}>{HOME_PRESET_LABELS[value]}</option>)}
              </select>
              <span className="mt-1 block text-[10px] leading-relaxed text-white/28">Minimal : Favoris · Standard : Favoris + Statistiques · Complet : tout · Personnalisé : vos choix (spec §111).</span>
            </label>
            {[...homeWidgets].sort((a, b) => a.order - b.order || (['favorites', 'statistics', 'activity'] as string[]).indexOf(a.id) - (['favorites', 'statistics', 'activity'] as string[]).indexOf(b.id)).map((widget, index, all) => (
              <div key={widget.id} className={`rounded-lg border p-3 ${widget.enabled ? 'border-white/[0.07] bg-white/[0.02]' : 'border-white/[0.04] bg-black/10 opacity-70'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex flex-none flex-col">
                      <button type="button" disabled={index === 0} onClick={() => moveWidget(widget.id, -1)} title="Monter" aria-label={`Monter ${WIDGET_LABELS[widget.id]}`} className="rounded p-0.5 text-white/30 hover:bg-white/[0.07] hover:text-white disabled:opacity-15"><ChevronUp size={11} /></button>
                      <button type="button" disabled={index === all.length - 1} onClick={() => moveWidget(widget.id, 1)} title="Descendre" aria-label={`Descendre ${WIDGET_LABELS[widget.id]}`} className="rounded p-0.5 text-white/30 hover:bg-white/[0.07] hover:text-white disabled:opacity-15"><ChevronDown size={11} /></button>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white/75">{WIDGET_LABELS[widget.id]}</p>
                      <p className="text-[10px] text-white/30">{widget.size === 'wide' ? 'Large — ligne entière' : 'Moyen — partage la ligne'}</p>
                    </div>
                  </div>
                  <ZailonSwitch checked={widget.enabled} onChange={enabled => setHomeWidget(widget.id, { enabled })} aria-label={`Activer ${WIDGET_LABELS[widget.id]}`} />
                </div>
                {widget.enabled && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/35">Variante</span>
                    <select value={widget.variant} onChange={event => setHomeWidget(widget.id, { variant: event.target.value })} className="rounded border border-white/[0.08] bg-ink-200 px-2 py-1 text-[10px] text-white/70">
                      {HOME_WIDGET_VARIANTS[widget.id].map(variant => <option key={variant.value} value={variant.value}>{variant.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3.5">
            <button type="button" onClick={() => { resetHomeLayout() }} className="text-[11px] text-white/40 hover:text-white/70">Réinitialiser l’Accueil</button>
            <button type="button" onClick={() => setCustomizeOpen(false)} className="rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Terminé</button>
          </div>
        </div>
      </div>
    )}
    {menu && <GameContextMenu game={menu.game} position={menu.position} onClose={() => setMenu(undefined)} onEditResources={() => setResourcesGameId(menu.game.id)} />}
    {stopSearchingOpen && activeSession && <SessionStopModal gameName={selectedGame.name} searching onCancel={() => setStopSearchingOpen(false)} onConfirm={() => { setStopSearchingOpen(false); cancelSession(selectedGame.id) }} />}
    {quitOpen && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setQuitOpen(false)}>
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
          <div className="border-b border-white/[0.06] px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">Quitter le jeu</p>
            <p className="mt-1 font-display text-base font-bold text-white/90">{selectedGame.name}</p>
          </div>
          <div className="px-5 py-4">
            {!quitConfirm
              ? <p className="text-[11px] leading-relaxed text-white/55">Le jeu est actuellement en cours d'exécution. Souhaitez-vous vraiment le quitter ?</p>
              : <p className="text-[11px] leading-relaxed text-amber-100/70">Toute progression non sauvegardée dans le jeu peut être perdue.</p>}
            <div className="mt-4 flex justify-end gap-2">
              {!quitConfirm ? (
                <>
                  <button type="button" onClick={() => setQuitOpen(false)} className="rounded-lg bg-gold px-3.5 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90">Retour au jeu</button>
                  <button type="button" onClick={() => setQuitConfirm(true)} className="rounded-lg border border-white/[0.12] px-3.5 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]">Quitter le jeu</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setQuitConfirm(false)} className="rounded-lg border border-white/[0.12] px-3.5 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]">Annuler</button>
                  <button type="button" onClick={() => { setQuitOpen(false); setQuitConfirm(false); endSession(selectedGame.id) }} className="rounded-lg bg-red-300/90 px-3.5 py-2 text-[11px] font-semibold text-[#160a0a] hover:bg-red-200">Quitter le jeu</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
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

function HomeBadge({ label, title }: { label: string; title?: string }) {
  return <span title={title} className="flex items-center gap-1 rounded-full border border-white/[0.09] bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/58 backdrop-blur-sm"><Check size={9} className="text-emerald-300/80" />{label}</span>
}

function QuickGame({ game, summary, active, onSelect, favorite }: { game: Game; summary?: GameSummary; active: boolean; onSelect: () => void; favorite?: boolean }) {
  const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath) || game.backgroundArt
  const healthTone = summary?.health ? (summary.health.verdict === 'ok' ? 'bg-emerald-300/85' : summary.health.verdict === 'vigilance' ? 'bg-amber-300/85' : 'bg-red-300/85') : undefined
  return <button type="button" onClick={onSelect} title={game.name} className={`group/quick relative min-w-0 overflow-hidden rounded-lg border text-left ${active ? 'border-[#dbe8e5]/28' : 'border-white/[0.06] hover:border-white/20'}`}>
    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-68 transition-transform group-hover/quick:scale-105" /> : <FallbackArtwork name={game.name} kind={game.itemKind} />}
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
    {healthTone && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${healthTone}`} title={`Santé : ${summary?.health?.verdict}`} />}
    {favorite && <span className="absolute left-1 top-1 text-[10px] text-amber-300/90" title="Favori">★</span>}
    {/* Spec §10-11 : couverture, nom, temps de jeu — jamais « 0 actif(s) ». */}
    <span className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 truncate text-[11px] font-semibold text-white/78"><span className="min-w-0 flex-1 truncate">{game.name}</span>{game.totalPlaytime ? <span className="shrink-0 font-mono text-[9px] text-white/40">{formatTime(game.totalPlaytime)}</span> : null}</span>
  </button>
}

const WIDGET_LABELS: Record<string, string> = {
  favorites: 'Favoris',
  statistics: 'Vos statistiques',
  activity: 'Activité des profils',
  session: 'Session active',
}

type GameSummary = { health?: { verdict: 'ok' | 'vigilance' | 'attention' }; profileCounts?: Record<string, { active: number }> }

/** Widget Favoris (spec §10-12, §86) : Wide par défaut, variantes Cartes/Compact. */
function FavoritesWidget({ variant, favoriteGames, summaries, visibleGames, selectedId, onSelect, onBrowse }: {
  variant: string
  favoriteGames: Game[]
  summaries: Record<string, GameSummary | undefined>
  visibleGames: Game[]
  selectedId: string
  onSelect: (gameId: string) => void
  onBrowse: () => void
}) {
  return <DashboardPanel eyebrow="Favoris" footer="Toute la bibliothèque" onFooter={onBrowse}>
    {favoriteGames.length > 0
      ? variant === 'compact'
        ? <ul className="space-y-1.5">{favoriteGames.map(game => <FavoriteRow key={game.id} game={game} active={game.id === selectedId} onSelect={() => onSelect(game.id)} />)}</ul>
        : <div className={`grid grid-cols-3 gap-2 ${favoriteGames.length > 3 ? 'h-[156px]' : 'h-[72px]'}`}>
            {favoriteGames.map(game => <QuickGame key={game.id} game={game} summary={summaries[game.id]} active={game.id === selectedId} onSelect={() => onSelect(game.id)} favorite />)}
          </div>
      : <div className="flex h-[72px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.06] bg-black/10 px-3 text-center">
          <p className="text-[11px] leading-relaxed text-white/34">Ajoutez vos jeux et applications préférés depuis la Bibliothèque.</p>
          <button type="button" onClick={onBrowse} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[10px] font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white/85">Ouvrir la Bibliothèque</button>
        </div>}
    <p className="mt-1 truncate text-[11px] text-white/26">{favoriteGames.length > 0 ? `${favoriteGames.length} favori${favoriteGames.length !== 1 ? 's' : ''} · clic droit sur un jeu pour en ajouter` : `${visibleGames.length} élément${visibleGames.length !== 1 ? 's' : ''} dans ZAILON`}</p>
  </DashboardPanel>
}

/** Ligne compacte du widget Favoris (spec §11) : icône, nom, temps de jeu. */
function FavoriteRow({ game, active, onSelect }: { game: Game; active: boolean; onSelect: () => void }) {
  const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath) || game.backgroundArt
  return <button type="button" onClick={onSelect} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${active ? 'border-[#dbe8e5]/25 bg-white/[0.04]' : 'border-white/[0.055] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'}`}>
    {cover ? <img src={cover} alt="" className="h-8 w-8 flex-none rounded object-cover" /> : <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-white/[0.05] font-display text-xs font-black text-[var(--zailon-accent)]">{game.name.charAt(0).toUpperCase()}</span>}
    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/72">{game.name}</span>
    {game.totalPlaytime ? <span className="shrink-0 font-mono text-[10px] text-white/38">{formatTime(game.totalPlaytime)}</span> : null}
  </button>
}

/** Widget « En cours » (spec §77) : rendu UNIQUEMENT pendant une session active
 * (le moteur le filtre sinon — aucune case vide §7). Session prioritaire
 * (épinglée > premier plan > plus récente), durée en direct, profil, et
 * raccourci vers le panneau rapide. */
function SessionWidget({ sessions, games, pinned, foreground }: {
  sessions: GameSession[]
  games: Game[]
  pinned?: string
  foreground?: string
}) {
  const priorityId = pickPrioritySession(sessions, pinned, foreground)
  const session = sessions.find(item => item.gameId === priorityId) ?? sessions[0]
  if (!session) return null
  const game = games.find(item => item.id === session.gameId)
  const profile = game?.profiles.find(item => item.id === session.profileId)
  const running = session.state === 'GameRunning'
  return <DashboardPanel eyebrow="En cours" footer="Ouvrir le panneau rapide" onFooter={() => { if (native.isDesktop()) void native.quickPanel.toggle() }}>
    <div className="flex h-[72px] items-center gap-3">
      <div className="relative flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-white/[0.10] bg-white/[0.035]">
        {game?.resources?.iconPath ? <img src={resourceUrl(game.resources.iconPath)} alt="" className="h-full w-full object-cover" /> : <Gamepad2 size={13} className="text-white/40" />}
        {running && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d1111] bg-emerald-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white/78">{game?.name || 'Jeu inconnu'}</p>
        <p className="mt-0.5 text-[11px] text-white/40">{formatElapsedDuration(session.startedAt, Date.now())} · {profile?.name || 'Profil par défaut'}{running ? '' : ' · en préparation'}</p>
      </div>
    </div>
  </DashboardPanel>
}

/** Widget « Vos statistiques » (spec §25-28) : données GLOBALES (tous jeux),
 * variantes Résumé/Minimal — jamais « 0/0 mods » ni pourcentage vide (§26-27). */
function StatisticsWidget({ variant, games, onOpen }: { variant: string; games: Game[]; onOpen: () => void }) {
  const totalPlaytime = games.reduce((sum, game) => sum + (game.totalPlaytime || 0), 0)
  const mostPlayed = [...games].sort((a, b) => (b.totalPlaytime || 0) - (a.totalPlaytime || 0))[0]
  const lastSession = [...games].filter(game => game.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0]
  return <DashboardPanel eyebrow="Vos statistiques" footer="Voir toutes les statistiques" onFooter={onOpen}>
    {variant === 'summary'
      ? <div className="grid h-[72px] grid-cols-2 divide-x divide-white/[0.07]">
          <MiniStat icon={Clock3} value={totalPlaytime ? formatTime(totalPlaytime) : '0h'} label="temps de jeu" />
          <MiniStat icon={Gamepad2} value={mostPlayed?.totalPlaytime ? mostPlayed.shortName || mostPlayed.name : '—'} label={mostPlayed?.totalPlaytime ? 'le plus joué' : 'aucune session'} />
        </div>
      : <div className="flex h-[72px] flex-col justify-center">
          <p className="font-display text-xl font-bold text-white/88">{totalPlaytime ? formatTime(totalPlaytime) : '0h'}</p>
          <p className="mt-1 text-[11px] text-white/24">temps de jeu total</p>
        </div>}
    <p className="mt-1 truncate text-[11px] text-white/26">{lastSession ? `Dernière session ${timeAgo(lastSession.lastPlayed!)}` : 'Prêt pour une première session'}</p>
  </DashboardPanel>
}

/** Widget « Activité des profils » (spec §73-75) : variante Profils = répartition
 * par profil, variante Dernières actions = sessions récentes lisibles. */
function ActivityWidget({ variant, gameSessions, games, selectedGame, gameIcon, onProfiles }: {
  variant: string
  gameSessions: GameSession[]
  games: Game[]
  selectedGame: Game
  gameIcon?: string
  onProfiles: () => void
}) {
  if (variant === 'profiles') {
    const activity = Array.from({ length: 7 }, (_, index) => selectedGame.profiles[index]?.playtime ?? 0)
    const activityMaximum = Math.max(1, ...activity)
    const profileActivity = selectedGame.profiles.reduce((total, profile) => total + (profile.playtime || 0), 0)
    return <DashboardPanel eyebrow="Activité des profils" footer="Voir les profils" onFooter={onProfiles}>
      <div className="flex h-[72px] items-end gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-white/[0.10] bg-white/[0.035]">
          {gameIcon ? <img src={gameIcon} alt="" className="h-full w-full object-cover" /> : <Gamepad2 size={13} className="text-white/40" />}
        </div>
        <div className="flex min-w-0 flex-1 items-end justify-between gap-1.5">
          {activity.map((value, index) => <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={selectedGame.profiles[index]?.name || 'Aucun profil'}>
            <span className="w-full max-w-3 rounded-[2px] bg-[var(--zailon-accent)]/75" style={{ height: `${Math.max(4, Math.round((value / activityMaximum) * 38))}px`, opacity: value ? 1 : 0.14 }} />
            <span className="max-w-full truncate font-mono text-[11px] uppercase text-white/18">{selectedGame.profiles[index]?.name.charAt(0) || '·'}</span>
          </div>)}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-white/26">{profileActivity ? `${formatTime(profileActivity)} sur les profils` : 'Aucune activité enregistrée'}</p>
    </DashboardPanel>
  }
  // Variante « Dernières actions » (spec §74) : sessions récentes lisibles,
  // jamais une grille de points vide incompréhensible.
  const recent = [...gameSessions].filter(session => session.state !== 'Failed').sort((a, b) => b.startedAt - a.startedAt).slice(0, 3)
  return <DashboardPanel eyebrow="Activité des profils" footer="Voir les profils" onFooter={onProfiles}>
    {recent.length > 0
      ? <ul className="flex h-[72px] flex-col justify-center space-y-1.5">
          {recent.map(session => {
            const game = games.find(item => item.id === session.gameId)
            const duration = session.endedAt ? formatElapsedDuration(session.startedAt, session.endedAt) : undefined
            return <li key={session.id} className="flex items-center gap-2 text-[11px]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.endedAt ? 'bg-white/20' : 'bg-emerald-300/80'}`} />
              <span className="min-w-0 flex-1 truncate text-white/60">{game?.name || 'Jeu inconnu'}{duration ? ` · ${duration}` : ''}</span>
              <span className="shrink-0 text-white/30">{timeAgo(session.startedAt)}</span>
            </li>
          })}
        </ul>
      : <div className="flex h-[72px] items-center text-[11px] text-white/30">Aucune activité récente.</div>}
    <p className="mt-1 text-[11px] text-white/26">Sessions de cette exécution — l'historique complet reste dans Statistiques.</p>
  </DashboardPanel>
}

/** Contrôle audio discret du Hero (spec correctifs §1-5, §8-13, §27-28) :
 * icône toujours visible, rangée alignée à droite DANS LE FLUX — positionnée
 * au-dessus de la section Favoris, jamais en absolu sur toute la page. La
 * capsule s'étend vers la GAUCHE de l'icône (spec §12) ; repli ~400 ms après
 * sortie de TOUTE la zone (icône + slider + fond de la capsule), repli
 * immédiat si la fenêtre perd le focus. */
function HeroAudioControl({ muted, volume, onToggle, onVolume, sessionCut = false }: {
  muted: boolean
  volume: number
  onToggle: () => void
  onVolume: (value: number) => void
  /** Son coupé pour cette session alors que l'intention persistée est active. */
  sessionCut?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const collapseTimer = useRef<number>()
  const scheduleCollapse = () => {
    window.clearTimeout(collapseTimer.current)
    collapseTimer.current = window.setTimeout(() => setExpanded(false), 400)
  }
  // Fallback §5 : si la fenêtre n'a plus le focus (Alt+Tab), repli immédiat.
  useEffect(() => {
    const onBlur = () => { window.clearTimeout(collapseTimer.current); setExpanded(false) }
    window.addEventListener('blur', onBlur)
    return () => {
      window.clearTimeout(collapseTimer.current)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2
  return (
    <div className="relative z-30 mb-1.5 flex items-center justify-end">
      <div
        className="flex flex-row-reverse items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/40 p-1.5 backdrop-blur-md transition-[width,opacity] duration-150"
        onMouseEnter={() => { window.clearTimeout(collapseTimer.current); setExpanded(true) }}
        onMouseLeave={scheduleCollapse}
        onFocus={() => { window.clearTimeout(collapseTimer.current); setExpanded(true) }}
        onBlur={scheduleCollapse}
      >
        <button
          type="button"
          onClick={() => { onToggle(); setExpanded(true); window.clearTimeout(collapseTimer.current) }}
          title={muted ? (sessionCut ? 'Son coupé pour cette session — activer le son du fond' : 'Activer le son du fond') : 'Couper le son du fond'}
          aria-label={muted ? 'Activer le son du fond' : 'Couper le son du fond'}
          className="relative flex h-6 w-6 items-center justify-center rounded-full text-white/70 hover:bg-white/[0.08] hover:text-white"
        >
          <VolumeIcon size={13} />
          {sessionCut && <span className="pointer-events-none absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.8)]" />}
        </button>
        {expanded && (
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={event => onVolume(Number(event.target.value))}
            aria-label="Volume du fond"
            className="h-1 w-24 accent-[var(--zailon-accent)]"
          />
        )}
      </div>
    </div>
  )
}
