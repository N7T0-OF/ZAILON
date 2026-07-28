import { Monitor } from 'lucide-react'
import type { VisualDisplayTarget } from '../domain/types'

export function MonitorSelector({ displays, value, onChange }: { displays: VisualDisplayTarget[]; value?: string; onChange: (id?: string) => void }) {
  return <div className="grid gap-2 sm:grid-cols-2">
    {displays.map(display => <button type="button" key={display.id} onClick={() => onChange(display.id)} className={`flex items-start gap-3 rounded-xl border p-3 text-left ${value === display.id ? 'border-gold/30 bg-gold/[0.055]' : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15'}`}>
      <Monitor size={18} className={value === display.id ? 'text-gold' : 'text-white/38'} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-white/72">{display.name}{display.primary ? ' · principal' : ''}</span>
        <span className="mt-1 block text-[11px] text-white/38">{display.width} × {display.height} · HDR {display.hdrEnabled === true ? 'actif' : display.hdrEnabled === false ? 'désactivé' : 'inconnu'}</span>
        <span className="mt-1 block truncate text-[11px] text-white/28">ICC : {display.iccProfile || 'non détecté'} · DDC/CI : {display.ddcCiStatus}</span>
      </span>
    </button>)}
  </div>
}
