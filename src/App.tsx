import { useEffect, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, Download, ExternalLink, Info, X } from 'lucide-react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { AppWindow } from './components/Layout/AppWindow'
import { UpdateProvider } from './components/UpdateProvider'
import { useStore } from './store/useStore'
import { native, type BackgroundTaskSnapshot, type GameProcessEvent, type NxmRequest, type ShortcutLaunchRequest } from './lib/native'
import { windowEffectsBackend } from './lib/windowEffects'

export default function App() {
  const tick = useStore(s => s.tick)
  const notice = useStore(s => s.notice)
  const clearNotice = useStore(s => s.clearNotice)
  const recordNotice = useStore(s => s.recordNotice)
  const notificationHistory = useStore(s => s.notificationHistory)
  const dismissNotification = useStore(s => s.dismissNotification)
  const clearCompletedNotifications = useStore(s => s.clearCompletedNotifications)
  const games = useStore(s => s.games)
  const setSelectedGame = useStore(s => s.setSelectedGame)
  const setSelectedProfile = useStore(s => s.setSelectedProfile)
  const textSize = useStore(s => s.textSize)
  const uiDensity = useStore(s => s.uiDensity)
  const liquidGlassMode = useStore(s => s.liquidGlassMode)
  const liquidGlassSettings = useStore(s => s.liquidGlassSettings)
  const energySaver = useStore(s => s.energySaver)
  const accentColor = useStore(s => s.accentColor)
  const setWindowEffectDiagnostic = useStore(s => s.setWindowEffectDiagnostic)
  const [externalInstalls, setExternalInstalls] = useState<NxmRequest[]>([])
  const [windowFocused, setWindowFocused] = useState(document.hasFocus())

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  useEffect(() => {
    if (!notice) return
    recordNotice(notice)
    clearNotice()
  }, [clearNotice, notice, recordNotice])

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize
    document.documentElement.dataset.density = uiDensity
  }, [textSize, uiDensity])

  useEffect(() => {
    const focused = () => setWindowFocused(true)
    const blurred = () => setWindowFocused(false)
    window.addEventListener('focus', focused)
    window.addEventListener('blur', blurred)
    return () => { window.removeEventListener('focus', focused); window.removeEventListener('blur', blurred) }
  }, [])

  useEffect(() => {
    void windowEffectsBackend.apply({ mode: liquidGlassMode, settings: liquidGlassSettings, energySaver, focused: windowFocused }).then(setWindowEffectDiagnostic)
  }, [energySaver, liquidGlassMode, liquidGlassSettings, setWindowEffectDiagnostic, windowFocused])

  useEffect(() => {
    const hex = accentColor.replace('#', '')
    const [red, green, blue] = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    const mix = (value: number, target: number, amount: number) => Math.round(value + (target - value) * amount)
    const rgb = (r: number, g: number, b: number) => `rgb(${r} ${g} ${b})`
    const root = document.documentElement
    root.style.setProperty('--zailon-accent', accentColor)
    root.style.setProperty('--zailon-accent-hover', rgb(mix(red, 255, .18), mix(green, 255, .18), mix(blue, 255, .18)))
    root.style.setProperty('--zailon-accent-active', rgb(mix(red, 0, .16), mix(green, 0, .16), mix(blue, 0, .16)))
    root.style.setProperty('--zailon-accent-muted', `rgb(${red} ${green} ${blue} / .14)`)
    root.style.setProperty('--zailon-accent-text', luminance > .56 ? '#090b0b' : '#ffffff')
    root.style.setProperty('--zailon-focus-ring', `rgb(${red} ${green} ${blue} / .78)`)
  }, [accentColor])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void native.pendingExternalInstalls().then(setExternalInstalls).catch(() => undefined)
    void listen<NxmRequest>('nxm-opened', event => setExternalInstalls(current => current.some(item => item.requestId === event.payload.requestId) ? current : [...current, event.payload])).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void native.backgroundTasks().then(tasks => useStore.getState().replaceBackgroundTasks(tasks)).catch(() => undefined)
    void listen<BackgroundTaskSnapshot>('background-task-changed', event => useStore.getState().upsertBackgroundTask(event.payload)).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void listen<GameProcessEvent>('game-process-stopped', event => useStore.getState().stopPlaying(event.payload.gameId, event.payload.profileId, event.payload.cleanupError)).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    const launchFromShortcut = async (request: ShortcutLaunchRequest) => {
      const state = useStore.getState()
      const game = state.games.find(item => item.id === request.gameId)
      const profile = game?.profiles.find(item => item.id === request.profileId)
      if (game && profile) {
        state.setSelectedGame(game.id)
        await useStore.getState().setSelectedProfile(profile.id)
        await useStore.getState().launchSelectedGame()
      }
      await native.consumeShortcutLaunch(request.rawUrl).catch(() => undefined)
    }
    void native.pendingShortcutLaunches().then(requests => requests.forEach(request => void launchFromShortcut(request))).catch(() => undefined)
    void listen<ShortcutLaunchRequest>('zailon-launch', event => void launchFromShortcut(event.payload)).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  const resolveExternalInstall = async (request: NxmRequest, gameId: string, profileId: string) => {
    setSelectedGame(gameId)
    await setSelectedProfile(profileId)
    const sourceUrl = `https://www.nexusmods.com/${request.gameDomain}/mods/${request.modId}?tab=files&file_id=${request.fileId}`
    await native.openExternalUrl(sourceUrl)
    await native.consumeExternalInstall(request.requestId)
    setExternalInstalls(current => current.filter(item => item.requestId !== request.requestId))
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(219,232,229,0.025) 0%, transparent 70%)',
      }}>
      <UpdateProvider>
        <AppWindow />
      </UpdateProvider>
      <NotificationCenter history={notificationHistory} onDismiss={dismissNotification} onClear={clearCompletedNotifications} />
      {externalInstalls[0] && <ExternalInstallDialog request={externalInstalls[0]} games={games} onCancel={() => void native.consumeExternalInstall(externalInstalls[0].requestId).finally(() => setExternalInstalls(current => current.slice(1)))} onContinue={(gameId, profileId) => void resolveExternalInstall(externalInstalls[0], gameId, profileId)} />}
    </div>
  )
}

function NotificationCenter({ history, onDismiss, onClear }: {
  history: ReturnType<typeof useStore.getState>['notificationHistory']
  onDismiss: (id: string) => void
  onClear: () => void
}) {
  const [paused, setPaused] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const active = [...history].reverse().find(item => !item.dismissed)
  useEffect(() => {
    if (!active?.durationMs || paused || showHistory) return
    const timeout = window.setTimeout(() => onDismiss(active.id), active.durationMs)
    return () => window.clearTimeout(timeout)
  }, [active?.durationMs, active?.id, onDismiss, paused, showHistory])
  const Icon = active?.kind === 'success' ? CheckCircle2 : active?.kind === 'error' || active?.kind === 'warning' ? AlertTriangle : Info
  const tone = active?.kind === 'error' ? 'border-red-300/25 text-red-100' : active?.kind === 'warning' || active?.kind === 'action' ? 'border-amber-200/25 text-amber-50' : active?.kind === 'success' ? 'border-emerald-200/20 text-emerald-50' : 'border-gold/25 text-white'
  return <div className="fixed bottom-4 right-4 z-[220] flex max-w-[min(420px,calc(100vw-2rem))] flex-col items-end gap-2">
    {showHistory && <section className="max-h-[55vh] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#101313]/95 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2"><div><p className="text-xs font-semibold text-white/78">Historique des notifications</p><p className="text-[11px] text-white/35">{history.length} événement(s), doublons regroupés</p></div><button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] text-white/42 hover:bg-white/[0.05]">Masquer les terminées</button></header>
      <div className="max-h-[45vh] space-y-1 overflow-y-auto p-2">{[...history].reverse().map(item => <button key={item.id} type="button" onClick={() => onDismiss(item.id)} className="flex w-full items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.018] p-2 text-left hover:bg-white/[0.04]"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.kind === 'error' ? 'bg-red-400' : item.kind === 'warning' ? 'bg-amber-300' : item.kind === 'success' ? 'bg-emerald-300' : 'bg-gold'}`} /><span className="min-w-0"><span className="block text-xs leading-relaxed text-white/64">{item.message}</span><span className="mt-1 block text-[11px] text-white/28">{new Date(item.createdAt).toLocaleTimeString()}</span></span></button>)}</div>
    </section>}
    {active && !showHistory && <article onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className={`flex w-full items-start gap-3 rounded-xl border bg-[#101313]/95 p-3 shadow-2xl backdrop-blur-xl ${tone}`}>
      <Icon size={17} className="mt-0.5 shrink-0 opacity-75" /><div className="min-w-0 flex-1"><p className="text-xs leading-relaxed">{active.message}</p><p className="mt-1 text-[11px] opacity-45">{paused ? 'Minuteur en pause' : active.durationMs ? `Fermeture automatique · ${Math.round(active.durationMs / 1000)} s` : 'Action requise'}</p></div><button type="button" onClick={() => onDismiss(active.id)} aria-label="Fermer la notification" className="rounded p-1 opacity-55 hover:bg-white/10 hover:opacity-100"><X size={14} /></button>
    </article>}
    <button type="button" onClick={() => setShowHistory(value => !value)} className="relative flex h-10 items-center gap-2 rounded-full border border-white/[0.1] bg-[#101313]/95 px-3 text-xs text-white/55 shadow-xl backdrop-blur hover:text-white"><Bell size={15} />Historique{history.some(item => !item.dismissed) && <span className="h-2 w-2 rounded-full bg-gold" />}</button>
  </div>
}

function ExternalInstallDialog({ request, games, onCancel, onContinue }: { request: NxmRequest; games: ReturnType<typeof useStore.getState>['games']; onCancel: () => void; onContinue: (gameId: string, profileId: string) => void }) {
  const [gameId, setGameId] = useState(games[0]?.id || '')
  const game = games.find(item => item.id === gameId)
  const [profileId, setProfileId] = useState(game?.profiles[0]?.id || '')
  const selectGame = (nextGameId: string) => { setGameId(nextGameId); setProfileId(games.find(item => item.id === nextGameId)?.profiles[0]?.id || '') }
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"><section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-4 shadow-2xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold"><Download size={17} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/80">Lien Nexus reçu</h2><p className="mt-1 text-[11px] leading-relaxed text-white/40">{request.gameDomain} · mod {request.modId} · fichier {request.fileId}</p></div><button onClick={onCancel} title="Annuler" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={14} /></button></div>{games.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[11px] text-white/45">Jeu cible<select value={gameId} onChange={event => selectGame(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#0d1010] px-2 py-2 text-[11px] text-white/70">{games.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[11px] text-white/45">Profil cible<select value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#0d1010] px-2 py-2 text-[11px] text-white/70">{game?.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label></div> : <p className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[11px] text-amber-100/60">Ajoutez d’abord le jeu cible à la bibliothèque.</p>}<p className="mt-4 text-[11px] leading-relaxed text-white/35">Sans paramètres d’application Nexus enregistrés, ZAILON ouvre la page exacte du fichier au lieu de prétendre l’avoir téléchargé.</p><div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} className="rounded-lg px-3 py-2 text-[11px] text-white/45">Annuler</button><button disabled={!gameId || !profileId} onClick={() => onContinue(gameId, profileId)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-30"><ExternalLink size={12} /> Ouvrir le fichier Nexus</button></div></section></div>
}
