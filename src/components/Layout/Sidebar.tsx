import { Home, Gamepad2, Compass, Newspaper, Settings } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { ViewType } from '../../types'

const NAV = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'games', icon: Gamepad2, label: 'Games' },
  { id: 'explore', icon: Compass, label: 'Explore' },
  { id: 'news', icon: Newspaper, label: 'News' },
] as const

export function Sidebar() {
  const { currentView, setView } = useStore()

  return (
    <aside className="w-14 flex flex-col items-center py-2 gap-0.5 bg-ink-400/60 border-r border-white/[0.05] flex-shrink-0">
      {NAV.map(({ id, icon: Icon, label }) => {
        const active = currentView === id
        return (
          <button
            key={id}
            onClick={() => setView(id as ViewType)}
            title={label}
            className={`w-9 h-9 flex flex-col items-center justify-center rounded-lg transition-all duration-150 group relative ${
              active
                ? 'bg-gold/15 text-gold'
                : 'text-white/30 hover:text-white/70 hover:bg-white/[0.06]'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold rounded-r-full" />
            )}
            <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
          </button>
        )
      })}

      <div className="flex-1" />

      <button
        onClick={() => setView('settings')}
        title="Settings"
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 relative ${
          currentView === 'settings'
            ? 'bg-gold/15 text-gold'
            : 'text-white/30 hover:text-white/70 hover:bg-white/[0.06]'
        }`}
      >
        {currentView === 'settings' && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold rounded-r-full" />
        )}
        <Settings size={16} strokeWidth={1.8} />
      </button>
    </aside>
  )
}
