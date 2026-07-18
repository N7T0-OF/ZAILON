import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { MouseEvent, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { saveWindowState } from '@tauri-apps/plugin-window-state'
import { appVersion, useStore } from '../../store/useStore'

type WindowAction = 'Réduire' | 'Agrandir' | 'Déplacer' | 'Fermer'

export function TitleBar() {
  const stopPlaying = useStore(state => state.stopPlaying)
  const [maximized, setMaximized] = useState(false)
  const [windowError, setWindowError] = useState<string>()
  const desktop = isTauri()

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
    stopPlaying()
    // La sauvegarde de géométrie ne doit jamais pouvoir bloquer la fermeture.
    try { await saveWindowState() } catch { /* fermeture prioritaire */ }
    await getCurrentWindow().close()
  })

  const stopChromeEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <header className="z-[70] flex h-10 flex-shrink-0 select-none items-center border-b border-white/[0.055] bg-[#0a0b0f]/95">
      <div
        data-tauri-drag-region
        onMouseDown={startDragging}
        onDoubleClick={event => { event.preventDefault(); void toggleMaximize() }}
        className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 px-3"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md border border-gold/30 bg-gold/10 shadow-[0_0_18px_rgba(232,184,75,0.12)]">
          <span className="font-display text-[10px] font-black text-gold">Z</span>
        </div>
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.19em] text-white/82">ZAILON</span>
        <span className="font-mono text-[8px] text-white/23">v{appVersion}</span>
        {windowError && <span title={windowError} className="ml-2 max-w-sm truncate text-[9px] text-red-300/75">Contrôle de fenêtre indisponible</span>}
      </div>

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
    className={`flex h-full w-12 items-center justify-center text-white/48 transition-colors hover:text-white ${danger ? 'hover:bg-[#c42b3b]' : 'hover:bg-white/[0.09]'}`}
  >{children}</button>
}
