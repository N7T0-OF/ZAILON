import { useEffect } from 'react'
import { AppWindow } from './components/Layout/AppWindow'
import { UpdateProvider } from './components/UpdateProvider'
import { useStore } from './store/useStore'

export default function App() {
  const tick = useStore(s => s.tick)
  const notice = useStore(s => s.notice)
  const clearNotice = useStore(s => s.clearNotice)

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050606]"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(219,232,229,0.025) 0%, transparent 70%)',
      }}>
      <UpdateProvider>
        <AppWindow />
      </UpdateProvider>
      {notice && (
        <button onClick={clearNotice} className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-gold/30 bg-ink-200 px-3 py-2 text-left text-xs text-white/75 shadow-2xl">
          {notice}
        </button>
      )}
    </div>
  )
}
