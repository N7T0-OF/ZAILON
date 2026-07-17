import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { saveWindowState } from '@tauri-apps/plugin-window-state'
import { appVersion } from '../../store/useStore'
import { useStore } from '../../store/useStore'

export function TitleBar() {
  const stopPlaying = useStore(state => state.stopPlaying)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    const window = getCurrentWindow()
    const syncMaximized = () => void window.isMaximized().then(setMaximized).catch(() => undefined)
    let unlisten: (() => void) | undefined
    syncMaximized()
    void window.onResized(syncMaximized).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [])

  const withWindow = (action: (window: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) => {
    if (isTauri()) void action(getCurrentWindow())
  }

  const toggleMaximize = async () => {
    if (!isTauri()) return
    const window = getCurrentWindow()
    await window.toggleMaximize()
    setMaximized(await window.isMaximized())
  }

  const closeWindow = async () => {
    stopPlaying()
    if (!isTauri()) return
    await saveWindowState()
    await getCurrentWindow().close()
  }

  return (
    <div className="flex h-9 flex-shrink-0 select-none items-center border-b border-white/[0.05] bg-ink-400/90">
      <div
        data-tauri-drag-region
        onDoubleClick={() => void toggleMaximize()}
        className="flex h-full flex-1 cursor-default items-center gap-2 px-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-gold">
            <span className="text-[7px] font-display font-black text-ink-400">Z</span>
          </div>
          <span className="text-[10px] font-display font-bold tracking-[0.15em] text-gold/80 uppercase">
            ZAILON
          </span>
          <span className="text-[9px] text-white/20 font-mono">v{appVersion}</span>
        </div>
      </div>

      <div className="flex h-full items-center">
        <button aria-label="Minimize" onMouseDown={event => event.stopPropagation()} onClick={() => withWindow(window => window.minimize())} className="flex h-full w-11 items-center justify-center transition-colors hover:bg-white/10">
          <Minus size={9} className="text-white/40" />
        </button>
        <button aria-label={maximized ? 'Restore' : 'Maximize'} onMouseDown={event => event.stopPropagation()} onClick={() => void toggleMaximize()} className="flex h-full w-11 items-center justify-center transition-colors hover:bg-white/10">
          {maximized ? <Minimize2 size={11} className="text-white/50" /> : <Maximize2 size={11} className="text-white/50" />}
        </button>
        <button aria-label="Close" onMouseDown={event => event.stopPropagation()} onClick={() => void closeWindow()} className="group flex h-full w-11 items-center justify-center transition-colors hover:bg-red-500/80">
          <X size={12} className="text-white/45 group-hover:text-white" />
        </button>
      </div>
    </div>
  )
}
