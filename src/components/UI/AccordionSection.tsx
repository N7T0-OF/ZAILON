import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * AccordionSection — section repliable des Paramètres (spec « Refonte globale
 * des toggles » §31-36).
 *
 * - En-tête compact : icône + titre + sous-titre très court + chevron (§35) ;
 * - repliée par défaut (§31), l'état ouvert/replié est piloté par l'appelant
 *   (mémoire de session via localStorage, §33) ;
 * - animation 180 ms (fade + léger glissement, §36) — annulée sous
 *   `prefers-reduced-motion` ;
 * - `alert` : petit point ambre quand la section contient une information ou
 *   une action à voir (spec §39 : ne jamais cacher complètement une erreur ou
 *   une action nécessaire — le point signale le contenu critique).
 */
export function AccordionSection({ id, title, subtitle, icon, open, onToggle, alert, className, children }: {
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  open: boolean
  onToggle: () => void
  /** Point ambre dans l'en-tête : information/action critique à voir (§39). */
  alert?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`rounded-xl border bg-white/[0.02] ${alert ? 'border-gold/25' : 'border-white/[0.06]'} ${className ?? ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`settings-section-${id}`}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.03]"
      >
        {icon && <span className="shrink-0 text-gold/70">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] uppercase tracking-widest text-white/72">{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-[10px] text-white/28">{subtitle}</span>}
        </span>
        {alert && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/90" title="Information ou action disponible" />}
        <ChevronRight size={13} className={`accordion-chevron shrink-0 text-white/30 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div id={`settings-section-${id}`} className="accordion-body px-3 pb-3 pt-1">
          {children}
        </div>
      )}
    </section>
  )
}
