import { FileClock, FolderPlus, Radar, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { native } from '../../lib/native'
import { SteamDetectionDialog } from '../SteamDetectionDialog'

export function ToolsView() {
  const addGame = useStore(state => state.addGameFromExecutable)
  const importDetectedGames = useStore(state => state.importDetectedGames)
  const [detecting, setDetecting] = useState(false)

  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header><p className="font-mono text-[8px] uppercase tracking-[0.24em] text-gold/58">Maintenance</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Outils</h1><p className="mt-1 max-w-2xl text-[11px] text-white/38">Actions locales, explicites et réversibles pour entretenir la bibliothèque.</p></header>
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      <Tool icon={Radar} title="Détection locale" text="Interroge Steam, Epic Games et les applications Windows déclarées, sans parcourir tout le disque." action="Rechercher" onClick={() => setDetecting(true)} />
      <Tool icon={FolderPlus} title="Ajout manuel" text="Sélectionne un exécutable quand un fournisseur n’est pas encore pris en charge." action="Choisir un jeu" onClick={() => void addGame()} />
      <Tool icon={FileClock} title="Journal de mise à jour" text="Ouvre le journal local des sauvegardes et opérations de mise à jour." action="Ouvrir le journal" onClick={() => void native.openUpdateLog()} disabled={!native.isDesktop()} />
    </div>
    <section className="mt-4 rounded-xl border border-gold/12 bg-gold/[0.025] p-4"><div className="flex items-center gap-2 text-gold/75"><Wrench size={14} /><h2 className="text-xs font-semibold">Fournisseurs extensibles</h2></div><p className="mt-2 max-w-3xl text-[10px] leading-relaxed text-white/38">Steam, Epic Games et le Registre Windows utilisent déjà le même écran de diagnostic et de sélection. Les prochains connecteurs spécialisés pourront s’ajouter sans changer la bibliothèque.</p></section>
    {detecting && <SteamDetectionDialog onClose={() => setDetecting(false)} onImport={importDetectedGames} />}
  </div>
}

function Tool({ icon: Icon, title, text, action, onClick, disabled = false }: { icon: typeof Radar; title: string; text: string; action: string; onClick: () => void; disabled?: boolean }) {
  return <article className="flex min-h-44 flex-col rounded-xl border border-white/[0.07] bg-white/[0.018] p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-gold/72"><Icon size={16} /></div><h2 className="mt-3 text-xs font-semibold text-white/78">{title}</h2><p className="mt-1 flex-1 text-[10px] leading-relaxed text-white/34">{text}</p><button type="button" onClick={onClick} disabled={disabled} className="mt-3 self-start rounded-md border border-white/[0.09] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-white/58 hover:border-gold/25 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30">{action}</button></article>
}
