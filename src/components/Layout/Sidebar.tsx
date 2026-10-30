import { BarChart3, Compass, Download, Gamepad2, Heart, Home, Monitor, Package, Plus, Settings, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { addonCapabilities, hasCapability } from '../../lib/addonGating'
import { ViewType } from '../../types'
import { SupportModal } from '../SupportModal'

const NAV: Array<{ id: ViewType; icon: LucideIcon; label: string }> = [
  { id: 'home', icon: Home, label: 'Accueil' },
  { id: 'games', icon: Gamepad2, label: 'Bibliothèque' },
  { id: 'explore', icon: Compass, label: 'Explorer' },
  { id: 'downloads', icon: Download, label: 'Téléchargements' },
  { id: 'visuals', icon: Monitor, label: 'Visual Profiles' },
  { id: 'addons', icon: Package, label: 'Add-ons' },
  { id: 'statistics', icon: BarChart3, label: 'Statistiques' },
  { id: 'frosty', icon: Wrench, label: 'Création Frosty' },
]

export function Sidebar() {
  const currentView = useStore(state => state.currentView)
  const setView = useStore(state => state.setView)
  const setGamesBrowsing = useStore(state => state.setGamesBrowsing)
  const setDiscoveryDialogOpen = useStore(state => state.setDiscoveryDialogOpen)
  const showSupportButton = useStore(state => state.showSupportButton)
  const language = useStore(state => state.language)
  const addons = useStore(state => state.addons)
  const addonsNudgePending = useStore(state => state.addonsNudgePending)
  // « Téléchargements » n'existe que lorsqu'une activité existe (spec
  // correctifs §1) : aucun téléchargement/scan/import en cours, en attente ou
  // récent → section totalement masquée. Elle réapparaît dès qu'une tâche
  // démarre et disparaît après le nettoyage automatique (rétention).
  const hasTaskActivity = useStore(state => state.backgroundTasks.length > 0)
  const [supportOpen, setSupportOpen] = useState(false)
  // Gating réel : « Création Frosty » n'existe que si Frosty Support ET Frosty
  // Editor sont installés et activés (spec Add-ons §10-24, Frosty Editor §1-4) ;
  // « Visual Profiles » n'existe que si l'add-on visual-profiles est installé
  // (spec §57-58, §102) — jamais de fonction Visual Profile dans le Core seul.
  const capabilities = addonCapabilities(addons)
  const showFrosty = hasCapability(capabilities, 'frosty.editor')
  const showVisuals = hasCapability(capabilities, 'visual.profiles')

  return <><aside className="relative z-20 flex w-[56px] flex-shrink-0 flex-col items-center border-r border-white/[0.045] bg-[#0a0c0c]/95 px-2 py-3 shadow-[12px_0_34px_rgba(0,0,0,0.15)]">
    <button type="button" onClick={() => setView('home')} title="ZAILON — Accueil" className="mb-6 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.11] bg-[#111515] shadow-[0_9px_22px_rgba(0,0,0,0.32)]">
      <span className="font-display text-sm font-black text-[var(--zailon-accent)]">Z</span>
    </button>

    <nav className="flex w-full flex-col items-center gap-2" aria-label="Navigation principale">
      {NAV.map(item => ((item.id === 'frosty' && !showFrosty) || (item.id === 'visuals' && !showVisuals) || (item.id === 'downloads' && !hasTaskActivity) ? null : <NavButton key={item.id} item={item} active={currentView === item.id} dot={item.id === 'addons' && addonsNudgePending} onClick={() => {
        // Clic « Bibliothèque » → toujours la vitrine (grille plein écran).
        if (item.id === 'games') setGamesBrowsing(true)
        setView(item.id)
      }} />))}
    </nav>

    <div className="flex-1" />
    <button type="button" onClick={() => setDiscoveryDialogOpen(true)} title="Ajouter un jeu ou logiciel" aria-label="Ajouter un jeu ou logiciel" className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] text-white/34 transition-colors hover:border-white/18 hover:bg-white/[0.06] hover:text-white"><Plus size={13} /></button>
    {showSupportButton && <button type="button" onClick={() => setSupportOpen(true)} title={language === 'fr' ? 'Me soutenir' : 'Support me'} aria-label={language === 'fr' ? 'Me soutenir' : 'Support me'} className="mb-2 flex h-8 w-8 items-center justify-center rounded-full text-rose-200/48 transition-colors hover:bg-rose-200/[0.07] hover:text-rose-100"><Heart size={13} /></button>}
    <NavButton item={{ id: 'settings', icon: Settings, label: 'Paramètres' }} active={currentView === 'settings'} onClick={() => setView('settings')} />
  </aside>{supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}</>
}

function NavButton({ item, active, dot, onClick }: { item: { id: ViewType; icon: LucideIcon; label: string }; active: boolean; dot?: boolean; onClick: () => void }) {
  const Icon = item.icon
  return <button
    type="button"
    onClick={onClick}
    title={item.label}
    aria-label={item.label}
    aria-current={active ? 'page' : undefined}
    className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all ${active ? 'bg-[var(--zailon-accent)] text-[var(--zailon-accent-text)] shadow-[0_8px_22px_rgba(0,0,0,0.32)]' : 'text-white/32 hover:bg-white/[0.06] hover:text-white/74'}`}
  >
    <Icon size={13} strokeWidth={active ? 2.35 : 1.7} />
    {dot && <span title="Nouveau contenu disponible" className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-gold ring-2 ring-[#0a0c0c]" />}
  </button>
}
