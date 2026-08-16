import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Boxes, Compass, Download, Gamepad2, Layers, Monitor, Package, Play, Plus, Radar, Search, Settings, User, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { globalSearch, type GlobalSearchResult } from '../lib/globalSearch'

const KIND_META: Record<GlobalSearchResult['kind'] | 'action', { icon: typeof Search; label: string }> = {
  game: { icon: Gamepad2, label: 'Jeu' },
  profile: { icon: User, label: 'Profil' },
  mod: { icon: Boxes, label: 'Mod' },
  addon: { icon: Package, label: 'Add-on' },
  group: { icon: Layers, label: 'Groupe' },
  action: { icon: Settings, label: 'Action' },
}

interface SearchAction {
  key: string
  title: string
  subtitle: string
  icon: typeof Settings
  run: () => void
}

/** Recherche globale (spec « Recherche globale ») : une seule requête trouve
 * jeux, applications, profils, mods, groupes et add-ons. Ctrl/Cmd+K l'ouvre,
 * ↑/↓ naviguent, Entrée ouvre, Échap ferme. Rendu en portal — jamais coupé par
 * un `overflow-hidden`. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const games = useStore(state => state.games)
  const gameGroups = useStore(state => state.gameGroups)
  const addons = useStore(state => state.addons)
  const setView = useStore(state => state.setView)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const setSelectedProfile = useStore(state => state.setSelectedProfile)
  const setGamesBrowsing = useStore(state => state.setGamesBrowsing)
  const setActiveGameTab = useStore(state => state.setActiveGameTab)
  const setLibraryFilter = useStore(state => state.setLibraryFilter)
  const setDiscoveryDialogOpen = useStore(state => state.setDiscoveryDialogOpen)

  const actionResults = useMemo<SearchAction[]>(() => {
    // Spec « Passe de correction » §6 : une SEULE interface de recherche.
    // Les actions rapides (Paramètres, Explorer, Détecter, Ajouter…) vivent
    // dans la même palette que la recherche — plus de second overlay Ctrl+K.
    const actions: SearchAction[] = [
      { key: 'action:settings', title: 'Ouvrir les Paramètres', subtitle: 'Réglages globaux de ZAILON', icon: Settings, run: () => setView('settings') },
      { key: 'action:explore', title: 'Ouvrir Explorer', subtitle: 'Nexus, GameBanana, Collections', icon: Compass, run: () => setView('explore') },
      { key: 'action:downloads', title: 'Ouvrir Téléchargements', subtitle: 'Centre des tâches et de l’activité', icon: Download, run: () => setView('downloads') },
      { key: 'action:visuals', title: 'Ouvrir Visual Profiles', subtitle: 'Profils visuels système', icon: Monitor, run: () => setView('visuals') },
      { key: 'action:detect', title: 'Détecter des jeux', subtitle: 'Steam, Epic, applications Windows — Bibliothèque locale', icon: Radar, run: () => { setGamesBrowsing(true); setDiscoveryDialogOpen(true) } },
      { key: 'action:add-game', title: 'Ajouter un jeu', subtitle: 'Détecter ou choisir un exécutable', icon: Plus, run: () => { setGamesBrowsing(true); setDiscoveryDialogOpen(true) } },
    ]
    const launchGame = games.find(game => game.id === useStore.getState().selectedGameId)
    if (launchGame?.execPath) {
      actions.unshift({ key: 'action:launch', title: `Jouer à ${launchGame.name}`, subtitle: 'Lancer avec le profil actif', icon: Play, run: () => { void useStore.getState().launchSelectedGame() } })
    }
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return actions.slice(0, 3)
    return actions.filter(action => `${action.title} ${action.subtitle}`.toLocaleLowerCase().includes(needle))
  }, [query, games])

  const results = useMemo(
    () => globalSearch({ query, games, gameGroups, addons }, 60),
    [query, games, gameGroups, addons],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setOpen(value => {
          if (value) return false
          setQuery('')
          setIndex(0)
          return true
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(id)
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  // Une seule liste (actions + recherche) pour la navigation clavier unifiée.
  const entries = useMemo(() => [...actionResults, ...results], [actionResults, results])

  const go = (entry: GlobalSearchResult | SearchAction) => {
    close()
    if ('run' in entry) {
      entry.run()
      return
    }
    const result = entry as GlobalSearchResult
    if (result.kind === 'game') {
      if (result.gameId) setSelectedGame(result.gameId)
      setGamesBrowsing(false)
      setView('games')
    } else if (result.kind === 'profile') {
      if (result.gameId) setSelectedGame(result.gameId)
      if (result.profileId) void setSelectedProfile(result.profileId)
      setGamesBrowsing(false)
      setView('games')
    } else if (result.kind === 'mod') {
      if (result.gameId) setSelectedGame(result.gameId)
      setGamesBrowsing(false)
      setActiveGameTab('mods')
    } else if (result.kind === 'addon') {
      setView('addons')
    } else if (result.kind === 'group') {
      setLibraryFilter('groups')
      setGamesBrowsing(true)
      setView('games')
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i + 1, entries.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter') { const entry = entries[index]; if (entry) go(entry) }
    else if (event.key === 'Escape') close()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setQuery(''); setIndex(0); setOpen(true) }}
        title="Recherche globale (Ctrl K)"
        className="flex h-6 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] text-white/42 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white/70"
      >
        <Search size={11} />
        <span className="hidden xl:inline">Rechercher</span>
        <kbd className="hidden rounded border border-white/[0.1] bg-white/[0.04] px-1 text-[9px] font-mono text-white/35 xl:inline">Ctrl K</kbd>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[220] flex items-start justify-center bg-black/65 p-6 pt-[12vh] backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101116] shadow-[0_30px_90px_rgba(0,0,0,0.7)]" role="dialog" aria-modal="true" aria-label="Recherche globale">
            <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3">
              <Search size={15} className="shrink-0 text-gold" />
              <input
                ref={inputRef}
                value={query}
                onChange={event => { setQuery(event.target.value); setIndex(0) }}
                onKeyDown={onKeyDown}
                placeholder="Rechercher jeux, applications, profils, mods, groupes, add-ons…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-white/85 outline-none placeholder:text-white/28"
              />
              <button type="button" onClick={close} className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
            </div>

            <div className="max-h-[54vh] overflow-y-auto p-1.5 thin-scroll">
              {query.trim() === '' ? (
                <p className="px-3 py-8 text-center text-[11px] text-white/32">Tapez pour rechercher dans toute la bibliothèque.</p>
              ) : entries.length === 0 ? (
                <p className="px-3 py-8 text-center text-[11px] text-white/32">Aucun résultat pour « {query.trim()} ».</p>
              ) : (
                <ul>
                  {entries.map((entry, i) => {
                    const isAction = 'run' in entry
                    const meta = KIND_META[isAction ? 'action' : (entry as GlobalSearchResult).kind]
                    const Icon = isAction ? (entry as SearchAction).icon : meta.icon
                    return (
                      <li key={entry.key}>
                        <button
                          type="button"
                          onClick={() => go(entry)}
                          onMouseEnter={() => setIndex(i)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${i === index ? 'bg-gold/[0.09]' : 'hover:bg-white/[0.03]'}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-white/45"><Icon size={13} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-white/80">{entry.title}</span>
                            <span className="block truncate text-[10px] text-white/36">{entry.subtitle}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/30">{meta.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-2 text-[10px] text-white/30">
              <span>↑↓ naviguer</span>
              <span>Entrée ouvrir</span>
              <span>Échap fermer</span>
              <span className="ml-auto">{entries.length} résultat(s)</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
