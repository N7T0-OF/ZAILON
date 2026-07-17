import { useEffect } from 'react'
import { AppWindow } from './components/Layout/AppWindow'
import { useStore } from './store/useStore'

export default function App() {
  const tick = useStore(s => s.tick)

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  return (
    <div className="min-h-screen bg-[#030308] flex items-center justify-center p-8"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(232,184,75,0.03) 0%, transparent 70%)',
      }}>
      {/* Ambient glow behind window */}
      <div className="absolute w-[900px] h-[500px] rounded-2xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(232,184,75,0.06) 0%, transparent 70%)' }} />
      <AppWindow />
    </div>
  )
}
