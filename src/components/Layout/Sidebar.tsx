import { Compass, Download, Gamepad2, Heart, Home, Plus, Settings, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { ViewType } from '../../types'
import { SupportModal } from '../SupportModal'

const NAV: Array<{ id: ViewType; icon: LucideIcon; label: string }> = [
  { id: 'home', icon: Home, label: 'Accueil' },
  { id: 'games', icon: Gamepad2, label: 'Bibliothèque' },
  { id: 'explore', icon: Compass, label: 'Explorer' },
  { id: 'downloads', icon: Download, label: 'Téléchargements' },
  { id: 'tools', icon: Wrench, label: 'Outils' },
]

export function Sidebar() {
  const currentView = useStore(state => state.currentView)
  const setView = useStore(state => state.setView)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const showSupportButton = useStore(state => state.showSupportButton)
  const language = useStore(state => state.language)
  const [supportOpen, setSupportOpen] = useState(false)

  return <><aside className="relative z-20 flex w-[56px] flex-shrink-0 flex-col items-center border-r border-white/[0.045] bg-[#0a0c0c]/95 px-2 py-3 shadow-[12px_0_34px_rgba(0,0,0,0.15)]">
    <button type="button" onClick={() => setView('home')} title="ZAILON — Accueil" className="mb-6 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.11] bg-[#111515] shadow-[0_9px_22px_rgba(0,0,0,0.32)]">
      <span className="font-display text-sm font-black text-[#dbe8e5]">Z</span>
    </button>

    <nav className="flex w-full flex-col items-center gap-2" aria-label="Navigation principale">
      {NAV.map(item => <NavButton key={item.id} item={item} active={currentView === item.id} onClick={() => setView(item.id)} />)}
    </nav>

    <div className="flex-1" />
    <button type="button" onClick={() => void addGameFromExecutable()} title="Ajouter un jeu ou logiciel" aria-label="Ajouter un jeu ou logiciel" className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] text-white/34 transition-colors hover:border-white/18 hover:bg-white/[0.06] hover:text-white"><Plus size={13} /></button>
    {showSupportButton && <button type="button" onClick={() => setSupportOpen(true)} title={language === 'fr' ? 'Me soutenir' : 'Support me'} aria-label={language === 'fr' ? 'Me soutenir' : 'Support me'} className="mb-2 flex h-8 w-8 items-center justify-center rounded-full text-rose-200/48 transition-colors hover:bg-rose-200/[0.07] hover:text-rose-100"><Heart size={13} /></button>}
    <NavButton item={{ id: 'settings', icon: Settings, label: 'Paramètres' }} active={currentView === 'settings'} onClick={() => setView('settings')} />
  </aside>{supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}</>
}

function NavButton({ item, active, onClick }: { item: { id: ViewType; icon: LucideIcon; label: string }; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return <button
    type="button"
    onClick={onClick}
    title={item.label}
    aria-label={item.label}
    aria-current={active ? 'page' : undefined}
    className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all ${active ? 'bg-[#dbe8e5] text-[#101313] shadow-[0_8px_22px_rgba(0,0,0,0.32)]' : 'text-white/32 hover:bg-white/[0.06] hover:text-white/74'}`}
  >
    <Icon size={13} strokeWidth={active ? 2.35 : 1.7} />
  </button>
}
