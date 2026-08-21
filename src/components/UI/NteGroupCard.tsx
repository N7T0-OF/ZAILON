import { Layers } from 'lucide-react'
import { Mod } from '../../types'
import { ZailonSwitch } from './ZailonSwitch'

interface NteGroupCardProps {
  mod: Mod
  memberCount: number
  onToggle: () => void
}

/** Carte d'un groupe Aurora (spec §25) : conteneur `AU GRP - <nom>` affiché
 * comme une unité activable — le toggle bascule chaque membre du groupe. */
export function NteGroupCard({ mod, memberCount, onToggle }: NteGroupCardProps) {
  return (
    <div data-mod-id={mod.id} className={`group flex items-center gap-3 rounded-lg border border-amber-200/15 bg-amber-200/[0.035] px-3 py-2.5 transition-all duration-150 ${mod.enabled ? 'hover:border-amber-200/25 hover:bg-amber-200/[0.05]' : 'opacity-60 hover:opacity-80'}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-200/[0.06] text-amber-100/70"><Layers size={16} /></span>
      <span className="rounded-full border border-amber-200/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wide text-amber-100/60">Groupe</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-body font-medium leading-tight text-white/90">{mod.name}</p>
        <p className="mt-0.5 text-[11px] text-amber-100/45">{memberCount} mod{memberCount > 1 ? 's' : ''} membre{memberCount > 1 ? 's' : ''}</p>
      </div>
      <ZailonSwitch checked={mod.enabled} onChange={onToggle} size="compact" />
    </div>
  )
}
