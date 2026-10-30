import { Check, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z } from '../../lib/zIndex'
import type { Profile } from '../../types'

interface ProfileSwitcherPopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement>
  profiles: Profile[]
  selectedProfileId: string
  running: boolean
  countFor: (profile: Profile) => number
  onClose: () => void
  onSelect: (profileId: string) => void
  onCreate: (name: string) => void
  onManage: () => void
}

const POPOVER_WIDTH = 320
const SEARCH_THRESHOLD = 8
const LIST_MAX_HEIGHT = 288

/**
 * Sélecteur de profil rendu en portal (document.body) : il n'est plus soumis
 * aux `overflow-hidden` / stacking contexts des pages. Position calculée à
 * partir du bouton déclencheur ; ouverture vers le haut si l'espace manque
 * en bas (spec « le popup ne doit jamais être coupé »).
 */
export function ProfileSwitcherPopover({ open, anchorRef, profiles, selectedProfileId, running, countFor, onClose, onSelect, onCreate, onManage }: ProfileSwitcherPopoverProps) {
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>()
  const contentRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const measure = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const contentHeight = Math.min(contentRef.current?.offsetHeight ?? 340, viewportHeight - 24)
    const openUp = rect.bottom + 8 + contentHeight > viewportHeight && rect.top - 8 > contentHeight
    const left = Math.max(8, Math.min(rect.left, viewportWidth - POPOVER_WIDTH - 8))
    setPosition(openUp
      ? { bottom: viewportHeight - rect.top + 8, left, maxHeight: Math.max(160, rect.top - 16) }
      : { top: rect.bottom + 8, left, maxHeight: Math.max(160, viewportHeight - rect.bottom - 16) })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    const onResize = () => measure()
    const onScroll = () => measure()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setNewName('')
    }
  }, [open])

  if (!open) return null

  const normalized = query.trim().toLocaleLowerCase()
  const filtered = normalized
    ? profiles.filter(profile => profile.name.toLocaleLowerCase().includes(normalized))
    : profiles

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: Z.popover - 1 }} onClick={onClose} />
      <div
        ref={contentRef}
        role="menu"
        className="fixed w-80 overflow-hidden rounded-xl border border-white/[0.1] bg-[#111414]/[0.99] shadow-[0_22px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        style={{ zIndex: Z.popover, left: position?.left ?? 0, top: position?.top, bottom: position?.bottom, maxHeight: position?.maxHeight }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/34">Profils</p>
          {running && <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-200/80">Jeu en cours</span>}
        </div>
        {profiles.length >= SEARCH_THRESHOLD && (
          <div className="border-b border-white/[0.06] px-2.5 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
              <Search size={12} className="shrink-0 text-white/30" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Rechercher un profil…"
                autoFocus
                className="w-full bg-transparent text-[11px] text-white/70 outline-none placeholder:text-white/25"
              />
            </div>
          </div>
        )}
        <div className="thin-scroll max-h-[288px] overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-2.5 py-3 text-[11px] text-white/30">Aucun profil ne correspond.</p>}
          {filtered.map(profile => {
            const isActive = profile.id === selectedProfileId
            const blocked = running && !isActive
            return (
              <button
                key={profile.id}
                type="button"
                role="menuitem"
                disabled={blocked}
                onClick={() => { onSelect(profile.id); onClose() }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${blocked ? 'cursor-not-allowed opacity-45' : 'hover:bg-white/[0.05]'} ${isActive ? 'bg-gold/[0.07]' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white/78">
                    {profile.name}
                    {isActive && running && <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider text-emerald-200/80">Actif</span>}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-white/34">{blocked ? 'Disponible après fermeture du jeu' : `${countFor(profile)} mod(s) actif(s)`}</span>
                </span>
                {profile.locked && <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.05] px-2 py-0.5 text-[9px] text-emerald-200">Stable</span>}
                {isActive && <Check size={12} className="text-gold" />}
              </button>
            )
          })}
        </div>
        <div className="border-t border-white/[0.06] p-2">
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && newName.trim()) { onCreate(newName.trim()); setNewName(''); onClose() } }}
              placeholder="Nouveau profil vide…"
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1.5 text-[11px] text-white/70 outline-none placeholder:text-white/25 focus:border-gold/30"
            />
            <button
              type="button"
              onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName(''); onClose() } }}
              className="flex items-center gap-1 rounded-lg bg-gold px-2.5 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)]"
            >
              <Plus size={12} />Créer
            </button>
          </div>
          <button type="button" onClick={() => { onManage(); onClose() }} className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-white/45 hover:bg-white/[0.05] hover:text-white/75">Gérer les profils…</button>
        </div>
      </div>
    </>,
    document.body
  )
}
