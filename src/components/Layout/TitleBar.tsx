import { Gamepad2, Maximize2, Minimize2, Minus, Star, X } from 'lucide-react'
import { MouseEvent, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { saveWindowState } from '@tauri-apps/plugin-window-state'
import { appVersion, useStore } from '../../store/useStore'
import { activeSessions, isSearchingSession, pickPrioritySession } from '../../lib/sessionPriority'
import { formatElapsedDuration } from '../../utils'
import { SessionStopModal } from '../SessionStopModal'

type WindowAction = 'Réduire' | 'Agrandir' | 'Déplacer' | 'Fermer'

export function TitleBar() {
  const endSession = useStore(state => state.endSession)
  const cancelSession = useStore(state => state.cancelSession)
  const selectedGameId = useStore(state => state.selectedGameId)
  const gameSessions = useStore(state => state.gameSessions)
  const games = useStore(state => state.games)
  const pinnedPriorityGameId = useStore(state => state.pinnedPriorityGameId)
  const setPinnedPriority = useStore(state => state.setPinnedPriority)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [stopTarget, setStopTarget] = useState<{ gameId: string; name: string; searching: boolean }>()
  const [now, setNow] = useState(() => Date.now())
  const [maximized, setMaximized] = useState(false)
  const [windowError, setWindowError] = useState<string>()
  const desktop = isTauri()

  const running = activeSessions(gameSessions)
  const priorityGameId = pickPrioritySession(gameSessions, pinnedPriorityGameId)

  useEffect(() => {
    if (running.length === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [running.length])

  useEffect(() => {
    if (!desktop) return
    const appWindow = getCurrentWindow()
    const syncMaximized = () => void appWindow.isMaximized().then(setMaximized).catch(error => setWindowError(String(error)))
    let unlisten: (() => void) | undefined
    syncMaximized()
    void appWindow.onResized(syncMaximized).then(listener => { unlisten = listener }).catch(error => setWindowError(String(error)))
    return () => unlisten?.()
  }, [desktop])

  const run = async (label: WindowAction, action: () => Promise<unknown>) => {
    if (!desktop) return
    setWindowError(undefined)
    try {
      await action()
    } catch (error) {
      setWindowError(`${label} : ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const toggleMaximize = () => run('Agrandir', async () => {
    const appWindow = getCurrentWindow()
    await appWindow.toggleMaximize()
    setMaximized(await appWindow.isMaximized())
  })

  const startDragging = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) return
    void run('Déplacer', () => getCurrentWindow().startDragging())
  }

  const closeWindow = () => run('Fermer', async () => {
    if (selectedGameId) endSession(selectedGameId)
    else useStore.getState().stopPlaying()
    // La sauvegarde de géométrie ne doit jamais pouvoir bloquer la fermeture.
    try { await saveWindowState() } catch { /* fermeture prioritaire */ }
    await getCurrentWindow().close()
  })

  const stopChromeEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <header className="z-[70] flex h-8 flex-shrink-0 select-none items-center border-b border-white/[0.035] bg-[#090b0b]/98">
      <div
        data-tauri-drag-region
        onMouseDown={startDragging}
        onDoubleClick={event => { event.preventDefault(); void toggleMaximize() }}
        className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 px-3"
      >
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-white/62">ZAILON · v{appVersion}</span>
        {windowError && <span title={windowError} className="ml-2 max-w-sm truncate text-[11px] text-red-300/75">Contrôle de fenêtre indisponible</span>}
      </div>

      {running.length > 0 && <div className="relative flex h-full items-stretch" onDoubleClick={event => event.stopPropagation()}>
        <button type="button" onClick={() => setSessionsOpen(value => !value)} aria-expanded={sessionsOpen} title={`${running.length} session(s) en cours — cliquer pour voir la liste`} className="flex items-center gap-1.5 border-r border-white/[0.05] px-3 text-[11px] font-semibold text-emerald-200/90 hover:bg-white/[0.06]"><Gamepad2 size={11} /><span className="hidden lg:inline">{running.length} en cours</span><span className="lg:hidden">{running.length}</span></button>
        {sessionsOpen && <>
          <div className="fixed inset-0 z-[45]" onClick={() => setSessionsOpen(false)} />
          <section aria-label="Sessions en cours" className="absolute right-0 top-full z-[50] mt-1 w-72 overflow-hidden rounded-xl border border-white/[0.1] bg-[#141818] shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2"><p className="text-[11px] font-semibold text-white/70">{running.length} session(s) active(s)</p><p className="text-[10px] text-white/32">1 seule prioritaire</p></header>
            <ul className="max-h-72 overflow-y-auto p-1">{running.map(session => {
              const game = games.find(item => item.id === session.gameId)
              const name = game?.name || session.gameId
              const searching = isSearchingSession(session.state)
              const priority = session.gameId === priorityGameId
              return <li key={session.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${priority ? 'bg-emerald-300/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.state === 'GameRunning' ? 'animate-pulse bg-emerald-300' : 'bg-amber-300'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-white/78">{name}{priority ? <span className="ml-1.5 rounded-full bg-emerald-300/12 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-emerald-200/80">Prioritaire</span> : null}</span>
                  <span className="block text-[10px] text-white/36">{searching ? 'Recherche du jeu…' : 'En cours'} · {formatElapsedDuration(session.startedAt, now) || '—'}</span>
                </span>
                <button type="button" onClick={() => setPinnedPriority(priority ? undefined : session.gameId)} title={priority ? 'Revenir à la priorité automatique' : 'Définir comme prioritaire'} aria-label={priority ? 'Priorité automatique' : 'Épingler prioritaire'} className={`rounded p-1 ${priority ? 'text-gold' : 'text-white/28 hover:text-gold'}`}><Star size={12} fill={priority ? 'currentColor' : 'none'} /></button>
                <button type="button" onClick={() => setStopTarget({ gameId: session.gameId, name, searching })} title={searching ? 'Arrêter la recherche' : 'Quitter le jeu'} aria-label={searching ? 'Arrêter la recherche' : 'Quitter le jeu'} className="rounded p-1 text-white/28 hover:bg-red-400/10 hover:text-red-300"><X size={12} /></button>
              </li>
            })}
            </ul>
          </section>
        </>}
      </div>}
      {stopTarget && <SessionStopModal gameName={stopTarget.name} searching={stopTarget.searching} onCancel={() => setStopTarget(undefined)} onConfirm={() => {
        setStopTarget(undefined)
        setSessionsOpen(false)
        if (stopTarget.searching) cancelSession(stopTarget.gameId)
        else endSession(stopTarget.gameId)
      }} />}
      <div className="flex h-full items-stretch" onDoubleClick={event => event.stopPropagation()}>
        <WindowButton label="Réduire" onClick={() => void run('Réduire', () => getCurrentWindow().minimize())} onMouseDown={stopChromeEvent}>
          <Minus size={11} />
        </WindowButton>
        <WindowButton label={maximized ? 'Restaurer' : 'Agrandir'} onClick={() => void toggleMaximize()} onMouseDown={stopChromeEvent}>
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </WindowButton>
        <WindowButton label="Fermer" danger onClick={() => void closeWindow()} onMouseDown={stopChromeEvent}>
          <X size={13} />
        </WindowButton>
      </div>
    </header>
  )
}

function WindowButton({ label, danger = false, onClick, onMouseDown, children }: {
  label: string
  danger?: boolean
  onClick: () => void
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}) {
  return <button
    type="button"
    aria-label={label}
    title={label}
    onMouseDown={onMouseDown}
    onClick={event => { event.stopPropagation(); onClick() }}
    className={`flex h-full w-10 items-center justify-center text-white/38 transition-colors hover:text-white ${danger ? 'hover:bg-[#a72f40]' : 'hover:bg-white/[0.07]'}`}
  >{children}</button>
}
