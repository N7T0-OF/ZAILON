import { AlertTriangle, ExternalLink, Info, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { INFO_POPOVER_CLOSE_DELAY_MS, INFO_POPOVER_OPEN_DELAY_MS, popoverHasMore, popoverShortText } from '../../lib/infoPopover'

export type InfoPopoverVariant = 'info' | 'warning' | 'technical'

/**
 * ZailonInfoPopover — la bulle d'information UNIFORME de ZAILON
 * (spec « Refonte globale des toggles » §40-42).
 *
 * - Variantes : `info` (ⓘ), `warning` (⚠ ambre), `technical` (ⓘ technique) —
 *   jamais « ! » pour une simple documentation (§40) ;
 * - Desktop : ouverture au survol après ~200 ms (§42) ; **clic = verrouille la
 *   bulle** (l'utilisateur peut déplacer la souris dans la bulle) ; clic
 *   ailleurs ou Échap referment et déverrouillent ;
 * - Contenu court dans la bulle (max quelques lignes) ; si le texte est long ou
 *   qu'un bloc `details` est fourni → bouton **« En savoir plus »** qui ouvre
 *   une petite modale scrollable (§41) ;
 * - Accessible : focus clavier, Entrée/Espace, `role="tooltip"`, `aria-expanded`.
 */
export function ZailonInfoPopover({ text, details, variant = 'info', wide, children }: {
  /** Texte court affiché dans la bulle (tronqué s'il est long, §41). */
  text: string
  /** Contenu long (optionnel) : ouvre la modale « En savoir plus ». */
  details?: ReactNode
  variant?: InfoPopoverVariant
  wide?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [modal, setModal] = useState(false)
  const timer = useRef<number>()
  const root = useRef<HTMLSpanElement>(null)
  const id = useId()
  const hasMore = popoverHasMore(text, details)

  const schedule = (next: boolean) => {
    window.clearTimeout(timer.current)
    // §42 : une bulle verrouillée au clic reste ouverte même si la souris sort.
    if (pinned) return
    timer.current = window.setTimeout(() => setOpen(next), next ? INFO_POPOVER_OPEN_DELAY_MS : INFO_POPOVER_CLOSE_DELAY_MS)
  }

  const toggle = () => {
    window.clearTimeout(timer.current)
    const next = !open
    setOpen(next)
    setPinned(next)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); setPinned(false) }
    }
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) { setOpen(false); setPinned(false) }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [open])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const icon = variant === 'warning'
    ? <AlertTriangle size={9} />
    : <Info size={9} />
  const buttonClass = variant === 'warning'
    ? 'flex h-4 w-4 items-center justify-center rounded-full border border-amber-300/25 text-amber-200/60 transition-colors hover:border-amber-300/45 hover:text-amber-100'
    : variant === 'technical'
      ? 'flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-sky-300/25 text-sky-200/50 transition-colors hover:border-sky-300/45 hover:text-sky-100'
      : 'flex h-4 w-4 items-center justify-center rounded-full border border-white/[0.13] text-white/32 transition-colors hover:border-white/25 hover:text-white/60'

  return <span ref={root} className="relative inline-flex align-middle" onMouseEnter={() => schedule(true)} onMouseLeave={() => schedule(false)}>
    <button type="button" aria-label={variant === 'warning' ? 'Avertissement' : 'En savoir plus'} aria-expanded={open || modal} aria-controls={id} onClick={toggle} onFocus={() => schedule(true)} onBlur={() => schedule(false)} className={buttonClass}>
      {icon}
    </button>
    {open && (
      <span id={id} role="tooltip" className={`absolute bottom-full left-1/2 z-[300] mb-1.5 -translate-x-1/2 rounded-lg border border-white/[0.1] bg-[#141818] p-2.5 text-left text-[11px] leading-relaxed text-white/55 shadow-2xl ${wide ? 'w-96' : 'w-64'}`}>
        {popoverShortText(text)}
        {children}
        {hasMore && (
          <button type="button" onClick={() => { setModal(true); setOpen(false) }} className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-gold/80 hover:text-gold">
            En savoir plus <ExternalLink size={9} />
          </button>
        )}
      </span>
    )}
    {modal && (
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setModal(false) }}>
        <div className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/[0.1] bg-[#141818] p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] leading-relaxed text-white/62">{text}</p>
            <button type="button" onClick={() => setModal(false)} aria-label="Fermer" className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={13} /></button>
          </div>
          {details && <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-white/48">{details}</div>}
          <div className="mt-3 flex justify-end"><button type="button" onClick={() => setModal(false)} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.05]">Fermer</button></div>
        </div>
      </div>
    )}
  </span>
}
