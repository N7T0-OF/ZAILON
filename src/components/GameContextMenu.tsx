import { FolderCog, FolderOpen, Heart, MoreHorizontal, Palette, Play, Tag, Trash2, Wrench, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Game } from '../types'
import { native } from '../lib/native'
import { useStore } from '../store/useStore'

interface GameContextMenuProps {
  game: Game
  position: { x: number; y: number }
  onClose: () => void
  onEditResources: () => void
}

type MenuItem = { label: string; icon: LucideIcon; action?: () => void; disabled?: boolean; hint?: string; danger?: boolean }
type MenuEntry = MenuItem | { separator: true }

export function GameContextMenu({ game, position, onClose, onEditResources }: GameContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [placement, setPlacement] = useState(position)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const setView = useStore(state => state.setView)
  const launchSelectedGame = useStore(state => state.launchSelectedGame)
  const removeGame = useStore(state => state.removeGame)
  const setGameFavorite = useStore(state => state.setGameFavorite)
  const setGameHidden = useStore(state => state.setGameHidden)
  const setGameCategories = useStore(state => state.setGameCategories)

  const gameFolder = game.installDirectory || game.execPath?.replace(/[\\/][^\\/]+$/, '')
  const items: MenuEntry[] = [
    { label: 'Jouer', icon: Play, action: () => { setSelectedGame(game.id); void launchSelectedGame(); onClose() } },
    { label: 'Lancer sans mods', icon: X, disabled: true, hint: 'Indisponible tant que le moteur de déploiement ne peut pas restaurer les fichiers sans risque après le lancement.' },
    { separator: true },
    { label: 'Gérer les mods', icon: Wrench, action: () => { setSelectedGame(game.id); setView('mods'); onClose() } },
    { label: 'Modifier l’apparence', icon: Palette, action: () => { setSelectedGame(game.id); onEditResources(); onClose() } },
    { label: game.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: Heart, action: () => { setGameFavorite(game.id); onClose() } },
    { label: 'Modifier les catégories', icon: Tag, action: () => { const next = window.prompt('Catégories, séparées par des virgules', (game.categories || []).join(', ')); if (next !== null) setGameCategories(game.id, next.split(',').map(category => category.trim()).filter(Boolean)); onClose() } },
    { label: game.hidden ? 'Afficher dans la bibliothèque' : 'Masquer dans la bibliothèque', icon: Tag, action: () => { setGameHidden(game.id); onClose() } },
    { separator: true },
    { label: 'Ouvrir le dossier du jeu', icon: FolderOpen, disabled: !gameFolder, action: () => { if (gameFolder) void native.openPath(gameFolder); onClose() } },
    { label: 'Ouvrir le dossier des mods', icon: FolderCog, disabled: !game.modsPath, action: () => { if (game.modsPath) void native.openPath(game.modsPath); onClose() } },
    { separator: true },
    { label: 'Retirer de ZAILON', icon: Trash2, danger: true, action: () => { if (window.confirm(`Retirer « ${game.name} » de ZAILON ? Les fichiers du jeu et des mods seront conservés.`)) removeGame(game.id); onClose() } },
  ]
  const focusable = items.filter(item => !('separator' in item) && !item.disabled)

  useLayoutEffect(() => {
    const bounds = menuRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPlacement({
      x: Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8)),
    })
  }, [position])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose() }
    const closeBlur = () => onClose()
    const closeResize = () => onClose()
    document.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('blur', closeBlur)
    window.addEventListener('resize', closeResize)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('blur', closeBlur)
      window.removeEventListener('resize', closeResize)
    }
  }, [onClose])

  useEffect(() => { itemRefs.current[activeIndex]?.focus() }, [activeIndex])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (!focusable.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(current => (current + (event.key === 'ArrowDown' ? 1 : -1) + focusable.length) % focusable.length)
    }
    if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0) }
    if (event.key === 'End') { event.preventDefault(); setActiveIndex(focusable.length - 1) }
  }

  let focusIndex = -1
  return createPortal(<div
    ref={menuRef}
    role="menu"
    aria-label={`Actions pour ${game.name}`}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={onKeyDown}
    style={{ left: placement.x, top: placement.y }}
    className="fixed z-[200] w-64 rounded-xl border border-white/[0.12] bg-[#14151b]/[0.98] p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.62)] backdrop-blur-xl"
  >
    <p className="truncate px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/30">{game.name}</p>
    {items.map((item, index) => {
      if ('separator' in item) return <div key={`separator-${index}`} className="my-1 border-t border-white/[0.065]" role="separator" />
      const ItemIcon = item.icon
      const currentFocus = item.disabled ? -1 : ++focusIndex
      return <button
        key={item.label}
        ref={element => { if (currentFocus >= 0) itemRefs.current[currentFocus] = element }}
        role="menuitem"
        tabIndex={currentFocus === activeIndex ? 0 : -1}
        disabled={item.disabled}
        title={item.hint}
        onMouseEnter={() => { if (currentFocus >= 0) setActiveIndex(currentFocus) }}
        onClick={() => item.action?.()}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${item.danger ? 'text-red-300/80 hover:bg-red-500/10 hover:text-red-200' : 'text-white/66 hover:bg-white/[0.075] hover:text-white'} disabled:cursor-not-allowed disabled:text-white/22 disabled:hover:bg-transparent`}
      ><ItemIcon size={12} /><span className="flex-1">{item.label}</span>{item.disabled && <span className="text-[11px] uppercase tracking-wide text-white/18">indisponible</span>}</button>
    })}
  </div>, document.body)
}

export function GameMoreButton({ onClick }: { onClick: (position: { x: number; y: number }) => void }) {
  return <button
    type="button"
    onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onClick({ x: rect.right - 252, y: rect.bottom + 4 }) }}
    onContextMenu={event => event.preventDefault()}
    aria-label="Actions du jeu"
    className="rounded-md border border-white/[0.08] bg-black/35 p-1 text-white/52 opacity-0 backdrop-blur-md transition-all hover:bg-white/[0.1] hover:text-white group-hover:opacity-100 focus:opacity-100"
  ><MoreHorizontal size={14} /></button>
}
