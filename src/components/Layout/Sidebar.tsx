import { Boxes, Compass, Download, Gamepad2, Home, Settings, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { ViewType } from '../../types'

const NAV: Array<{ id: ViewType; icon: LucideIcon; label: string; eyebrow?: string }> = [
  { id: 'home', icon: Home, label: 'Accueil' },
  { id: 'games', icon: Gamepad2, label: 'Bibliothèque' },
  { id: 'explore', icon: Compass, label: 'Explorer', eyebrow: 'ARCHIVÉ' },
  { id: 'downloads', icon: Download, label: 'Téléchargements' },
  { id: 'mods', icon: Boxes, label: 'Mods' },
  { id: 'tools', icon: Wrench, label: 'Outils' },
]

export function Sidebar() {
  const currentView = useStore(state => state.currentView)
  const setView = useStore(state => state.setView)

  return (
    <aside className="flex w-[68px] flex-shrink-0 flex-col border-r border-white/[0.055] bg-[#090a0e]/88 px-2 py-3 xl:w-48">
      <div className="mb-3 hidden px-2 xl:block">
        <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-white/24">Navigation</p>
      </div>
      <nav className="space-y-1" aria-label="Navigation principale">
        {NAV.map(item => <NavButton key={item.id} item={item} active={currentView === item.id} onClick={() => setView(item.id)} />)}
      </nav>

      <div className="flex-1" />
      <div className="mb-2 hidden rounded-lg border border-white/[0.055] bg-white/[0.02] p-2.5 xl:block">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]" />
          <span className="text-[9px] text-white/52">Services locaux</span>
        </div>
        <p className="mt-1 text-[8px] leading-relaxed text-white/26">Les données de la bibliothèque restent sur cet appareil.</p>
      </div>
      <NavButton item={{ id: 'settings', icon: Settings, label: 'Paramètres' }} active={currentView === 'settings'} onClick={() => setView('settings')} />
    </aside>
  )
}

function NavButton({ item, active, onClick }: { item: { id: ViewType; icon: LucideIcon; label: string; eyebrow?: string }; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return <button
    type="button"
    onClick={onClick}
    title={item.label}
    aria-current={active ? 'page' : undefined}
    className={`group relative flex h-10 w-full items-center rounded-lg transition-all ${active ? 'bg-white/[0.075] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.045)]' : 'text-white/38 hover:bg-white/[0.045] hover:text-white/76'}`}
  >
    {active && <span className="absolute -left-2 top-2 h-6 w-0.5 rounded-r-full bg-gold shadow-[0_0_10px_rgba(232,184,75,0.55)]" />}
    <span className="flex w-full items-center justify-center xl:w-11"><Icon size={16} strokeWidth={active ? 2.2 : 1.7} className={active ? 'text-gold' : ''} /></span>
    <span className="hidden min-w-0 flex-1 items-center justify-between pr-2 text-left xl:flex">
      <span className="truncate text-[11px] font-medium">{item.label}</span>
      {item.eyebrow && <span className="rounded border border-white/[0.07] px-1 py-0.5 font-mono text-[6px] tracking-wide text-white/22">{item.eyebrow}</span>}
    </span>
  </button>
}
