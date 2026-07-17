import { FolderCog, FolderOpen, Heart, MoreHorizontal, Palette, Play, Tag, Trash2, Wrench, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'
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
    { label: 'Lancer sans mods', icon: X, disabled: true, hint: 'Indisponible : le mode de déploiement direct ne peut pas rétablir les mods en toute sécurité après un lancement.' },
    { separator: true },
    { label: 'Gérer les mods', icon: Wrench, action: () => { setSelectedGame(game.id); setView('games'); onClose() } },
    { label: 'Modifier l’identité visuelle', icon: Palette, action: () => { setSelectedGame(game.id); onEditResources(); onClose() } },
    { label: game.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: Heart, action: () => { setGameFavorite(game.id); onClose() } },
    { label: 'Modifier les catégories', icon: Tag, action: () => { const next = window.prompt('Catégories, séparées par des virgules', (game.categories || []).join(', ')); if (next !== null) setGameCategories(game.id, next.split(',').map(category => category.trim()).filter(Boolean)); onClose() } },
    { label: game.hidden ? 'Afficher dans la bibliothèque' : 'Masquer dans la bibliothèque', icon: Tag, action: () => { setGameHidden(game.id); onClose() } },
    { separator: true },
    { label: 'Ouvrir le dossier du jeu', icon: FolderOpen, disabled: !gameFolder, action: () => { if (gameFolder) void native.openPath(gameFolder); onClose() } },
    { label: 'Ouvrir le dossier des mods', icon: FolderCog, disabled: !game.modsPath, action: () => { if (game.modsPath) void native.openPath(game.modsPath); onClose() } },
    { separator: true },
    { label: 'Retirer de ZAILON', icon: Trash2, danger: true, action: () => { if (window.confirm(`Retirer « ${game.name} » de la bibliothèque ZAILON ? Les fichiers du jeu et des mods ne seront pas supprimés.`)) removeGame(game.id); onClose() } },
  ]
  const focusable = items.filter(item => !('separator' in item) && !item.disabled)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const closeBlur = () => onClose()
    document.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('blur', closeBlur)
    return () => { document.removeEventListener('pointerdown', closeOutside, true); window.removeEventListener('blur', closeBlur) }
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

  const left = Math.max(8, Math.min(position.x, window.innerWidth - 270))
  const top = Math.max(8, Math.min(position.y, window.innerHeight - 360))
  let focusIndex = -1
  return <div ref={menuRef} role="menu" aria-label={`Actions pour ${game.name}`} onKeyDown={onKeyDown} style={{ left, top }} className="fixed z-[60] w-64 rounded-lg border border-white/[0.12] bg-[#171923] p-1.5 shadow-2xl">
    <p className="truncate px-2 py-1.5 text-[9px] font-mono uppercase tracking-widest text-white/35">{game.name}</p>
    {items.map((item, index) => {
      if ('separator' in item) return <div key={`separator-${index}`} className="my-1 border-t border-white/[0.07]" role="separator" />
      const ItemIcon = item.icon
      const currentFocus = item.disabled ? -1 : ++focusIndex
      return <button key={item.label} ref={element => { if (currentFocus >= 0) itemRefs.current[currentFocus] = element }} role="menuitem" tabIndex={currentFocus === activeIndex ? 0 : -1} disabled={item.disabled} title={item.hint} onMouseEnter={() => { if (currentFocus >= 0) setActiveIndex(currentFocus) }} onClick={() => item.action?.()} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] transition-colors ${item.danger ? 'text-red-300 hover:bg-red-500/10' : 'text-white/70 hover:bg-white/[0.08] hover:text-white'} disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:bg-transparent`}><ItemIcon size={12} /><span className="flex-1">{item.label}</span>{item.disabled && <span className="text-[8px] text-white/20">non disponible</span>}</button>
    })}
  </div>
}

export function GameMoreButton({ onClick }: { onClick: (position: { x: number; y: number }) => void }) {
  return <button onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onClick({ x: rect.right - 248, y: rect.bottom + 4 }) }} aria-label="Actions du jeu" className="rounded p-1 text-white/45 hover:bg-white/[0.1] hover:text-white"><MoreHorizontal size={15} /></button>
}
