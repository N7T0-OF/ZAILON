import { Compass, Download, Gamepad2, Monitor, Play, Plus, Radar, Search, Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

interface PaletteItem {
  id: string
  group: 'Jeux' | 'Profils' | 'Mods' | 'Actions'
  label: string
  detail: string
  icon: typeof Gamepad2
  run: () => void
}

const ACTION_ITEMS: Array<Omit<PaletteItem, 'id' | 'label' | 'detail'> & { label: string; detail: string }> = [
  { group: 'Actions', label: 'Ouvrir les Paramètres', detail: 'Réglages globaux de ZAILON', icon: Settings, run: () => useStore.getState().setView('settings') },
  { group: 'Actions', label: 'Ouvrir Explorer', detail: 'Nexus, GameBanana, Collections', icon: Compass, run: () => useStore.getState().setView('explore') },
  { group: 'Actions', label: 'Ouvrir Téléchargements', detail: 'Centre des tâches et de l’activité', icon: Download, run: () => useStore.getState().setView('downloads') },
  { group: 'Actions', label: 'Ouvrir Visual Profiles', detail: 'Profils visuels système', icon: Monitor, run: () => useStore.getState().setView('visuals') },
  { group: 'Actions', label: 'Détecter des jeux', detail: 'Steam, Epic, applications Windows — Bibliothèque locale', icon: Radar, run: () => { useStore.getState().setGamesBrowsing(true); useStore.getState().setDiscoveryDialogOpen(true) } },
  { group: 'Actions', label: 'Ajouter un jeu', detail: 'Détecter ou choisir un exécutable', icon: Plus, run: () => { useStore.getState().setGamesBrowsing(true); useStore.getState().setDiscoveryDialogOpen(true) } },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // L'espace Création Frosty possède sa propre palette (spec Frosty Editor §72).
      if (useStore.getState().currentView === 'frosty') return
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setOpen(current => {
          const next = !current
          if (next) setQuery('')
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const items = useMemo<PaletteItem[]>(() => {
    const state = useStore.getState()
    const result: PaletteItem[] = []
    // Favoris en tête des résultats locaux (spec « Favoris Accueil » §36).
    const orderedGames = [...state.games].sort((left, right) => Number(Boolean(right.favorite)) - Number(Boolean(left.favorite)))
    for (const game of orderedGames) {
      result.push({ id: `game:${game.id}`, group: 'Jeux', label: game.favorite ? `${game.name} ★` : game.name, detail: `${game.profiles.length} profil(s) · ${game.installedMods.length} mod(s)`, icon: Gamepad2, run: () => {
        state.setGamesBrowsing(false)
        state.setView('games')
        state.setSelectedGame(game.id)
        state.setActiveGameTab('overview')
      } })
    }
    for (const game of state.games) {
      for (const profile of game.profiles) {
        result.push({ id: `profile:${game.id}:${profile.id}`, group: 'Profils', label: profile.name, detail: `${game.name} · ${Object.keys(profile.modStates).length} référence(s)`, icon: Gamepad2, run: () => {
          state.setGamesBrowsing(false)
          state.setView('games')
          state.setSelectedGame(game.id)
          void state.setSelectedProfile(profile.id)
          state.setActiveGameTab('profiles')
        } })
      }
    }
    const selectedGame = state.games.find(game => game.id === state.selectedGameId)
    if (selectedGame) {
      for (const mod of selectedGame.installedMods.slice(0, 200)) {
        result.push({ id: `mod:${selectedGame.id}:${mod.id}`, group: 'Mods', label: mod.name, detail: `${selectedGame.name}${mod.enabled ? '' : ' · inactif'}`, icon: Gamepad2, run: () => {
          state.setGamesBrowsing(false)
          state.setView('games')
          state.setSelectedGame(selectedGame.id)
          state.setActiveGameTab('mods')
        } })
      }
    }
    const launchGame = state.games.find(game => game.id === state.selectedGameId)
    if (launchGame?.execPath) {
      result.push({ id: 'action:launch', group: 'Actions', label: `Jouer à ${launchGame.name}`, detail: 'Lancer avec le profil actif', icon: Play, run: () => { void useStore.getState().launchSelectedGame() } })
    }
    for (const action of ACTION_ITEMS) {
      result.push({ id: `action:${action.label}`, ...action })
    }
    return result
  }, [open])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const match = (item: PaletteItem) => !normalized || `${item.label} ${item.detail}`.toLocaleLowerCase().includes(normalized)
    return items.filter(match).slice(0, 24)
  }, [items, query])

  useEffect(() => setActive(0), [query])

  const runActive = (index: number) => {
    const item = filtered[index]
    if (!item) return
    setOpen(false)
    setQuery('')
    item.run()
  }

  if (!open) return null

  return <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/70 p-6 pt-[12vh] backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) { setOpen(false); setQuery('') } }}>
    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#111414]/98 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
        <Search size={15} className="text-white/30" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') { setOpen(false); setQuery('') }
            else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, Math.max(filtered.length - 1, 0))) }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
            else if (event.key === 'Enter') { event.preventDefault(); runActive(active) }
          }}
          placeholder="Rechercher un jeu, un profil, un mod ou une action…"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white/85 outline-none placeholder:text-white/28"
        />
        <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/35">Ctrl K</kbd>
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-1.5">
        {filtered.length === 0 && <p className="px-3 py-8 text-center text-xs text-white/35">Aucun résultat pour « {query} ».</p>}
        {filtered.map((item, index) => {
          const Icon = item.icon
          const previous = filtered[index - 1]
          return <div key={item.id}>
            {(!previous || previous.group !== item.group) && <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-white/28">{item.group}</p>}
            <button type="button" onClick={() => runActive(index)} onMouseEnter={() => setActive(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === active ? 'bg-gold/[0.09]' : ''}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${index === active ? 'border-gold/25 bg-gold/10 text-gold' : 'border-white/[0.08] bg-white/[0.03] text-white/40'}`}><Icon size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white/82">{item.label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-white/34">{item.detail}</span>
              </span>
              {index === active && <span className="text-[10px] text-gold/70">↵</span>}
            </button>
          </div>
        })}
      </div>
      <footer className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2 text-[10px] text-white/30">
        <span>↑↓ naviguer</span><span>↵ ouvrir</span><span>Échap fermer</span>
      </footer>
    </div>
  </div>
}
