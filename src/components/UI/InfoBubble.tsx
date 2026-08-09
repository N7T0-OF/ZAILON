import { Info } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * Micro-bulle d'information « ⓘ » (spec UI compacte).
 * - Ouverture au survol après ~180 ms, fermeture après ~120 ms.
 * - Échap, clic extérieur ou sortie de la souris ferment la bulle.
 * - Accessible : focus clavier, Entrée/Espace, role="tooltip".
 */
export function InfoBubble({ text, children, wide }: { text: string; children?: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number>()
  const root = useRef<HTMLSpanElement>(null)
  const id = useId()

  const schedule = (next: boolean) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), next ? 180 : 120)
  }
  const toggle = () => {
    window.clearTimeout(timer.current)
    setOpen(value => !value)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const onDown = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [open])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return <span ref={root} className="relative inline-flex align-middle" onMouseEnter={() => schedule(true)} onMouseLeave={() => schedule(false)}>
    <button type="button" aria-label="En savoir plus" aria-expanded={open} aria-controls={id} onClick={toggle} onFocus={() => schedule(true)} onBlur={() => schedule(false)} className="flex h-4 w-4 items-center justify-center rounded-full border border-white/[0.13] text-white/32 transition-colors hover:border-white/25 hover:text-white/60">
      <Info size={9} />
    </button>
    {open && <span id={id} role="tooltip" className={`absolute bottom-full left-1/2 z-[300] mb-1.5 -translate-x-1/2 rounded-lg border border-white/[0.1] bg-[#141818] p-2.5 text-left text-[11px] leading-relaxed text-white/55 shadow-2xl ${wide ? 'w-96' : 'w-64'}`}>
      {text}
      {children}
    </span>}
  </span>
}
