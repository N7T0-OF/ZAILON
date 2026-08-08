import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ScrollableModalProps {
  title: string
  subtitle?: ReactNode
  /** Contenu défilant (unique zone avec overflow-y auto). */
  children: ReactNode
  /** Zone de pied fixe (boutons d'action). Toujours visible. */
  footer?: ReactNode
  maxWidth?: number | string
  maxHeight?: number | string
  closeOnEscape?: boolean
  closeOnBackdrop?: boolean
  onClose: () => void
}

/**
 * Modale scrollable réutilisable — corrige le bug UX des fenêtres trop longues :
 * la modale ne dépasse jamais la fenêtre (largeur `min(720px, 100vw - 48px)`,
 * hauteur `min(760px, 100vh - 64px)`), le header et le footer restent fixes et
 * seule la zone centrale défile. Échap / X / clic extérieur ferment (configurable).
 *
 * À utiliser pour : notes de mise à jour, changelogs, grandes confirmations,
 * logs, licences — jamais de contenu qui pousse les boutons hors écran.
 */
export function ScrollableModal({ title, subtitle, children, footer, maxWidth = 720, maxHeight = 760, closeOnEscape = true, closeOnBackdrop = true, onClose }: ScrollableModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus initial + restauration + verrou du scroll de la page derrière.
  useEffect(() => {
    dialogRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    if (!closeOnEscape) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOnEscape, onClose])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_28px_80px_rgba(0,0,0,0.6)] outline-none"
        style={{ width: `min(${typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth}, calc(100vw - 48px))`, maxHeight: `min(${typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight}, calc(100vh - 64px))` }}
      >
        {/* Header fixe */}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold/75">Nouveautés</p>
            <h2 className="mt-1 truncate font-display text-base font-bold text-white/92">{title}</h2>
            {subtitle && <div className="mt-1 text-[11px] leading-relaxed text-white/45">{subtitle}</div>}
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"><X size={15} /></button>
        </header>

        {/* Corps défilant : seule cette zone scrolle */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 thin-scroll">{children}</div>

        {/* Footer fixe */}
        {footer !== undefined && footer !== null && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  )
}
