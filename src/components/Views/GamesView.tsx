import { Archive, Boxes, CheckSquare2, Copy, Download, FileArchive, FolderInput, FolderOpen, FolderPlus, Lock, MonitorDown, Plus, Radar, RefreshCw, RotateCcw, Search, ShieldAlert, Tag, Trash2, Unlock, Upload, Wrench, X } from 'lucide-react'
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSelectedGame, getSelectedProfile, resolveProfileMods, useStore } from '../../store/useStore'
import { BackgroundTaskSnapshot, native, pickExecutable, pickFolder, pickFolders, pickProfileArchive, resourceUrl, saveProfileArchive } from '../../lib/native'
import { ModCard } from '../UI/ModCard'
import { formatTime, timeAgo } from '../../utils'
import { SteamDetectionDialog } from '../SteamDetectionDialog'
import { GameAppearanceEditor } from '../GameResourcesDialog'
import type { GameTab, ModImportCandidate, Profile, ProfileArchiveManifest } from '../../types'

const TABS: Array<{ id: GameTab; label: string }> = [
  { id: 'overview', label: 'Aperçu' },
  { id: 'mods', label: 'Mods' },
  { id: 'profiles', label: 'Profils' },
  { id: 'downloads', label: 'Téléchargements' },
  { id: 'conflicts', label: 'Conflits' },
  { id: 'tools', label: 'Outils' },
  { id: 'backups', label: 'Sauvegardes' },
  { id: 'appearance', label: 'Apparence' },
  { id: 'settings', label: 'Paramètres' },
]

export function GamesView() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const tab = useStore(state => state.activeGameTab)
  const setTab = useStore(state => state.setActiveGameTab)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const setSelectedProfile = useStore(state => state.setSelectedProfile)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const importDetectedGames = useStore(state => state.importDetectedGames)
  const removeGame = useStore(state => state.removeGame)
  const setGamePath = useStore(state => state.setGamePath)
  const setModsPath = useStore(state => state.setModsPath)
  const setGameResources = useStore(state => state.setGameResources)
  const addProfile = useStore(state => state.addProfile)
  const duplicateProfile = useStore(state => state.duplicateProfile)
  const importProfileManifest = useStore(state => state.importProfileManifest)
  const renameProfile = useStore(state => state.renameProfile)
  const removeProfile = useStore(state => state.removeProfile)
  const scanMods = useStore(state => state.scanMods)
  const toggleMod = useStore(state => state.toggleMod)
  const deleteMod = useStore(state => state.deleteMod)
  const moveMod = useStore(state => state.moveMod)
  const setModNote = useStore(state => state.setModNote)
  const setConflictWinner = useStore(state => state.setConflictWinner)
  const libraryViewMode = useStore(state => state.libraryViewMode)
  const setLibraryViewMode = useStore(state => state.setLibraryViewMode)
  const bulkSetEnabled = useStore(state => state.bulkSetEnabled)
  const bulkTransferMods = useStore(state => state.bulkTransferMods)
  const bulkDeleteMods = useStore(state => state.bulkDeleteMods)
  const bulkAddTag = useStore(state => state.bulkAddTag)
  const undoLastBulkOperation = useStore(state => state.undoLastBulkOperation)
  const bulkHistory = useStore(state => state.bulkHistory)
  const toggleProfileLock = useStore(state => state.toggleProfileLock)
  const openProfileDirectory = useStore(state => state.openProfileDirectory)
  const checkProfileIntegrity = useStore(state => state.checkProfileIntegrity)
  const repairProfileStorage = useStore(state => state.repairProfileStorage)
  const [search, setSearch] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [onlyWithoutCover, setOnlyWithoutCover] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [steamDialogOpen, setSteamDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>()
  const [bulkDialog, setBulkDialog] = useState<'move' | 'copy' | 'delete' | 'tag'>()
  const [tagFilter, setTagFilter] = useState('')
  const modsListRef = useRef<HTMLDivElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const profileMods = useMemo(() => resolveProfileMods(selectedGame, selectedProfile), [selectedGame, selectedProfile])
  const filteredMods = profileMods.filter(mod => mod.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (!tagFilter || mod.categoryTags?.some(tag => tag.id === tagFilter)))
  const availableTags = [...new Map(profileMods.flatMap(mod => mod.categoryTags || []).map(tag => [tag.id, tag])).values()].sort((left, right) => left.label.localeCompare(right.label))
  const conflictMods = profileMods.filter(mod => mod.conflict && mod.conflict !== 'none')
  const resolvedConflicts = useMemo(() => {
    const files = new Map<string, { path: string; owners: typeof profileMods }>()
    profileMods.filter(mod => mod.enabled).forEach(mod => (mod.files || []).forEach(path => {
      const key = path.replace(/\\/g, '/').toLocaleLowerCase()
      const current = files.get(key) || { path: path.replace(/\\/g, '/'), owners: [] }
      current.owners.push(mod)
      files.set(key, current)
    }))
    return [...files.values()].filter(item => item.owners.length > 1).map(item => {
      const rule = selectedProfile?.conflictRules?.find(candidate => candidate.path.toLocaleLowerCase() === item.path.toLocaleLowerCase())
      return { ...item, winner: item.owners.find(owner => owner.id === rule?.winnerModId) || item.owners[item.owners.length - 1] }
    })
  }, [profileMods, selectedProfile])
  const visibleGames = games.filter(game => {
    const cover = game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath || game.backgroundArt
    return (!onlyWithoutCover || !cover) && game.name.toLocaleLowerCase().includes(librarySearch.trim().toLocaleLowerCase())
  })

  const selectedVisible = filteredMods.filter(mod => selectedModIds.has(mod.id)).length
  const allVisibleSelected = filteredMods.length > 0 && selectedVisible === filteredMods.length
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedVisible > 0 && !allVisibleSelected
  }, [allVisibleSelected, selectedVisible])
  useEffect(() => {
    setSelectedModIds(current => new Set([...current].filter(id => profileMods.some(mod => mod.id === id))))
  }, [selectedGame?.id, selectedProfile?.id, profileMods.length])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (tab !== 'mods' || !modsListRef.current?.contains(document.activeElement)) return
      const target = event.target as HTMLElement
      if (target.matches('input[type="text"], input[type="search"], textarea, select')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'a') {
        event.preventDefault(); setSelectedModIds(new Set(filteredMods.map(mod => mod.id)))
      }
      if (event.key === 'Escape') setSelectedModIds(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredMods, tab])

  const selectMod = (index: number, event: ReactMouseEvent<HTMLInputElement>) => {
    setSelectedModIds(current => {
      const next = new Set((event.ctrlKey || event.metaKey || event.shiftKey) ? current : [])
      if (event.shiftKey && lastSelectedIndex !== undefined) {
        const [start, end] = [lastSelectedIndex, index].sort((a, b) => a - b)
        filteredMods.slice(start, end + 1).forEach(mod => next.add(mod.id))
      } else if (next.has(filteredMods[index].id)) next.delete(filteredMods[index].id)
      else next.add(filteredMods[index].id)
      return next
    })
    setLastSelectedIndex(index)
  }

  const clearBulkSelection = () => setSelectedModIds(new Set())

  if (!selectedGame || !selectedProfile) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-white/50">Ajoutez un jeu pour gérer ses fichiers de mods.</p><button onClick={() => void addGameFromExecutable()} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-ink-400">Ajouter un jeu</button></div>
  }

  const browseExecutable = async () => {
    const path = await pickExecutable()
    if (path) await setGamePath(selectedGame.id, path)
  }
  const browseModsFolder = async () => {
    const path = await pickFolder()
    if (path) setModsPath(selectedGame.id, path)
  }

  const exportProfile = async (complete: boolean) => {
    const destination = await saveProfileArchive(`${selectedGame.name}-${selectedProfile.name}`)
    if (!destination) return
    const { mods: _legacy, ...profile } = selectedProfile
    const sanitizedMods = profileMods.map(mod => {
      const { path: _path, ...safe } = mod
      return safe
    })
    const manifest: ProfileArchiveManifest = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'ZAILON',
      appVersion: '1.6.0',
      exportMode: complete ? 'complete' : 'light',
      game: { name: selectedGame.name, provider: selectedGame.provider, providerGameId: selectedGame.providerGameId },
      profile,
      mods: sanitizedMods,
    }
    const sources = profileMods.flatMap(mod => mod.path ? [{ id: mod.id, name: mod.name, path: mod.path }] : [])
    await native.exportProfile(destination, manifest, complete, sources)
  }

  const importProfile = async () => {
    const archivePath = await pickProfileArchive()
    if (!archivePath) return
    const preview = await native.previewProfileImport(archivePath)
    const message = [
      `Profil : ${preview.manifest.profile.name}`,
      `Jeu source : ${preview.manifest.game.name}`,
      `${preview.manifest.mods.length} référence(s), ${preview.embeddedFiles} fichier(s) intégré(s).`,
      ...preview.warnings,
      'Importer ce profil sans écraser les profils existants ?',
    ].join('\n')
    if (!window.confirm(message)) return
    importProfileManifest(preview.manifest)
    if (preview.embeddedFiles && selectedGame.modsPath && window.confirm('Extraire aussi les fichiers intégrés dans le dossier Mods de ce jeu ?')) {
      await native.extractProfileArchive(archivePath, selectedGame.modsPath)
      await scanMods(selectedGame.id)
    }
  }

  return <div className="flex h-full">
    <aside className="flex w-72 flex-col border-r border-white/[0.05] bg-black/10">
      <div className="flex items-center justify-between px-3 pb-2 pt-3"><span className="text-xs font-mono uppercase tracking-widest text-white/38">Bibliothèque</span><button onClick={() => void addGameFromExecutable()} title="Ajouter un jeu" className="text-white/40 hover:text-gold"><Plus size={15} /></button></div>
      <div className="px-2"><label className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-2.5"><Search size={12} className="text-white/30" /><input value={librarySearch} onChange={event => setLibrarySearch(event.target.value)} placeholder="Chercher un jeu…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-white/68 outline-none" /></label><div className="mt-2 flex gap-1"><button onClick={() => setLibraryViewMode('grid')} className={`flex-1 rounded py-1 text-[11px] ${libraryViewMode === 'grid' ? 'bg-gold text-ink-400' : 'bg-white/[0.03] text-white/42'}`}>Grille</button><button onClick={() => setLibraryViewMode('illustrated')} className={`flex-1 rounded py-1 text-[11px] ${libraryViewMode === 'illustrated' ? 'bg-gold text-ink-400' : 'bg-white/[0.03] text-white/42'}`}>Liste</button><button onClick={() => setLibraryViewMode('compact')} className={`flex-1 rounded py-1 text-[11px] ${libraryViewMode === 'compact' ? 'bg-gold text-ink-400' : 'bg-white/[0.03] text-white/42'}`}>Compact</button></div><label className="mt-2 flex items-center gap-2 text-[11px] text-white/38"><input type="checkbox" checked={onlyWithoutCover} onChange={event => setOnlyWithoutCover(event.target.checked)} className="accent-gold" />Sans couverture</label></div>
      <div className={`${libraryViewMode === 'grid' ? 'grid grid-cols-2 content-start gap-2' : 'space-y-1'} mt-2 flex-1 overflow-y-auto px-2`} role="listbox" aria-label="Jeux de la bibliothèque">
        {visibleGames.map(game => {
          const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath || game.backgroundArt)
          return <button key={game.id} role="option" aria-selected={game.id === selectedGame.id} onClick={() => setSelectedGame(game.id)} className={`overflow-hidden rounded-lg text-left ${game.id === selectedGame.id ? 'border border-gold/35 bg-gold/10 text-gold' : 'border border-white/[0.055] text-white/58 hover:bg-white/[0.04]'} ${libraryViewMode === 'compact' ? 'w-full px-2.5 py-2' : libraryViewMode === 'illustrated' ? 'flex w-full items-center gap-2 p-1.5' : ''}`}>
            {libraryViewMode !== 'compact' && <span className={`relative block shrink-0 overflow-hidden bg-white/[0.035] ${libraryViewMode === 'grid' ? 'aspect-[3/4] w-full' : 'h-12 w-9 rounded'}`}>{cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-lg font-bold text-white/18">{game.name[0]}</span>}</span>}
            <span className={libraryViewMode === 'grid' ? 'block p-2' : 'min-w-0'}><span className="block truncate text-xs font-semibold">{game.name}</span>{libraryViewMode !== 'compact' && <span className="mt-0.5 block truncate font-mono text-[11px] text-white/30">{game.installedMods.length} mods</span>}</span>
          </button>
        })}
      </div>
      <button onClick={() => setSteamDialogOpen(true)} className="m-2 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[11px] text-white/45 hover:text-white/75"><Radar size={12} /> Détecter</button>
    </aside>

    <section className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-white/[0.05] px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div><h1 className="font-display text-lg font-bold text-white">{selectedGame.name}</h1>{selectedGame.lastPlayed && <p className="text-[11px] text-white/30">Joué {timeAgo(selectedGame.lastPlayed)}</p>}</div>
          <div className="flex gap-1.5"><button onClick={() => void scanMods(selectedGame.id)} title="Analyser le dossier Mods" className="rounded-lg border border-white/[0.07] p-2 text-white/40 hover:bg-white/[0.06] hover:text-gold"><RefreshCw size={13} /></button><button onClick={() => void browseModsFolder()} title="Choisir le dossier Mods" className="rounded-lg border border-white/[0.07] p-2 text-white/40 hover:bg-white/[0.06] hover:text-gold"><FolderOpen size={13} /></button><button onClick={() => { if (window.confirm(`Retirer ${selectedGame.name} de ZAILON ?`)) removeGame(selectedGame.id) }} title="Retirer de la bibliothèque" className="rounded-lg border border-white/[0.07] p-2 text-white/40 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={13} /></button></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">{selectedGame.profiles.map(profile => {
          const count = resolveProfileMods(selectedGame, profile).filter(mod => mod.enabled).length
          return <button key={profile.id} onClick={() => void setSelectedProfile(profile.id)} className={`rounded-full px-2.5 py-1.5 text-[11px] ${profile.id === selectedProfile.id ? 'bg-gold/15 text-gold' : 'bg-white/[0.025] text-white/45 hover:bg-white/[0.05]'}`}>{profile.name} <span className="opacity-60">{count}</span></button>
        })}</div>
      </header>

      <nav className="flex min-h-10 items-center overflow-x-auto border-b border-white/[0.05] px-3 thin-scroll"><div className="flex min-w-max gap-1">{TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`border-b-2 px-2.5 py-2.5 text-[11px] ${tab === item.id ? 'border-gold text-gold' : 'border-transparent text-white/38 hover:text-white/70'}`}>{item.label}</button>)}</div></nav>

      {tab === 'overview' && <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Mods partagés" value={String(selectedGame.installedMods.length)} /><Metric label="Mods actifs" value={String(profileMods.filter(mod => mod.enabled).length)} /><Metric label="Conflits détectés" value={String(conflictMods.length)} /><Metric label="Profils" value={String(selectedGame.profiles.length)} /><Metric label="Temps de jeu" value={formatTime(selectedGame.totalPlaytime)} /><Metric label="Dossier Mods" value={selectedGame.modsPath || 'Non configuré'} wide /></div>}

      {tab === 'mods' && <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] p-3">
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400"><FolderInput size={13} /> Importer des dossiers</button>
          <button onClick={() => void scanMods(selectedGame.id)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.05]"><RefreshCw size={13} /> Analyser</button>
          {bulkHistory.some(operation => operation.gameId === selectedGame.id && operation.undoable) && <button onClick={() => void undoLastBulkOperation()} title="Annuler la dernière opération groupée" className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]"><RotateCcw size={13} />Annuler</button>}
          <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-2.5 text-[11px] text-white/55"><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedModIds(current => { const next = new Set(current); if (allVisibleSelected) filteredMods.forEach(mod => next.delete(mod.id)); else filteredMods.forEach(mod => next.add(mod.id)); return next })} className="accent-gold" />Tout visible <span className="text-white/30">{selectedVisible}/{filteredMods.length}</span></label>
          {availableTags.length > 0 && <select value={tagFilter} onChange={event => setTagFilter(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-2 text-[11px] text-white/58"><option value="">Toutes les étiquettes</option>{availableTags.map(tag => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</select>}
          <div className="relative ml-auto"><Search size={12} className="absolute left-2.5 top-2.5 text-white/30" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher" className="w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 pl-7 pr-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /></div>
        </div>
        <div ref={modsListRef} tabIndex={-1} className="relative flex-1 overflow-y-auto p-3 outline-none"><p className="mb-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/65">Le store de paquets est partagé et immuable. Chaque profil possède son manifeste, son ordre, ses réglages et son overwrite ; un profil créé vide n’hérite d’aucun mod.</p>{selectedGame.provider === 'FiveM Client' && <p className="mb-2 rounded-lg border border-sky-300/18 bg-sky-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-sky-100/68">Adaptateur FiveM client : plugins et fichiers client uniquement. Tout paquet contenant <code>fxmanifest.lua</code>, <code>__resource.lua</code> ou <code>server.cfg</code> est refusé afin de ne jamais mélanger ressources serveur et profil client. Les règles des serveurs restent applicables.</p>}<div className="space-y-1.5 pb-20">{filteredMods.length ? filteredMods.map((mod, index) => <ModCard key={mod.id} mod={mod} selected={selectedModIds.has(mod.id)} onSelect={event => selectMod(index, event)} onToggle={() => void toggleMod(mod.id)} onDelete={() => { if (window.confirm(`Retirer « ${mod.name} » de ce profil ? Le paquet partagé n’est supprimé que s’il n’est référencé nulle part.`)) void deleteMod(mod.id) }} onMoveUp={index > 0 ? () => moveMod(mod.id, -1) : undefined} onMoveDown={index < filteredMods.length - 1 ? () => moveMod(mod.id, 1) : undefined} onNoteChange={note => setModNote(mod.id, note)} />) : <div className="flex h-40 flex-col items-center justify-center gap-2 text-[11px] text-white/35"><FolderPlus size={20} /><span>Aucun mod. Importez un dossier ou analysez le dossier Mods.</span></div>}</div>{selectedModIds.size > 0 && <div className="sticky bottom-2 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-[#101313]/95 p-2.5 shadow-2xl backdrop-blur-xl"><span className="flex items-center gap-1.5 pr-1 text-xs font-semibold text-white/72"><CheckSquare2 size={15} className="text-gold" />{selectedModIds.size} sélectionné(s)</span><button onClick={() => void bulkSetEnabled([...selectedModIds], true)} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]">Activer</button><button onClick={() => void bulkSetEnabled([...selectedModIds], false)} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]">Désactiver</button><button onClick={() => setBulkDialog('move')} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[var(--zailon-accent-text)]">Transférer</button><button onClick={() => setBulkDialog('copy')} className="rounded-lg border border-gold/25 px-3 py-2 text-xs text-gold">Copier</button><button onClick={() => setBulkDialog('tag')} className="flex items-center gap-1 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58"><Tag size={13} />Étiquette</button><button onClick={() => setBulkDialog('delete')} className="rounded-lg border border-red-300/15 px-3 py-2 text-xs text-red-200/70">Retirer</button><button onClick={clearBulkSelection} className="ml-auto rounded p-2 text-white/35 hover:bg-white/[0.05]" aria-label="Effacer la sélection"><X size={14} /></button></div>}</div>
      </div>}

      {tab === 'profiles' && <button onClick={() => void repairProfileStorage(selectedGame.id)} className="mx-4 mt-4 rounded-lg border border-gold/25 px-3 py-2 text-xs font-semibold text-gold">Réparer et séparer les profils existants</button>}

      {tab === 'profiles' && <div className="flex-1 space-y-4 overflow-y-auto p-4"><div className="rounded-xl border border-gold/15 bg-gold/[0.035] p-3"><p className="text-xs font-semibold text-white/72">Profils réellement isolés</p><p className="mt-1 text-xs leading-relaxed text-white/45">« Créer vide » produit toujours 0 mod actif, sans ordre, réglage ni overwrite hérité. « Dupliquer » est la seule action qui recopie explicitement l’état du profil source. Les paquets restent dans le store immuable commun.</p></div><div className="space-y-2">{selectedGame.profiles.map(profile => <div key={profile.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-3 ${profile.id === selectedProfile.id ? 'border-gold/20 bg-gold/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}><input value={profile.name} disabled={profile.locked} onChange={event => renameProfile(profile.id, event.target.value)} className="min-w-40 flex-1 bg-transparent text-xs font-medium text-white/78 outline-none disabled:opacity-55" /><span className="rounded-full bg-white/[0.035] px-2 py-1 text-[11px] text-white/38">{Object.keys(profile.modStates).length} référencé(s) · {resolveProfileMods(selectedGame, profile).filter(mod => mod.enabled).length} actif(s)</span>{profile.clonedFromProfileId && <span className="text-[11px] text-white/28">copie explicite</span>}<button onClick={() => void openProfileDirectory(profile.id)} title="Ouvrir le dossier racine du profil" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><FolderOpen size={13} /></button><button onClick={() => void checkProfileIntegrity(profile.id)} title="Vérifier l’intégrité" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><ShieldAlert size={13} /></button><button onClick={() => toggleProfileLock(profile.id)} title={profile.locked ? 'Déverrouiller' : 'Verrouiller'} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white">{profile.locked ? <Lock size={13} /> : <Unlock size={13} />}</button><button onClick={() => duplicateProfile(profile.id)} title="Dupliquer explicitement" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Copy size={13} /></button><button onClick={() => removeProfile(profile.id)} disabled={selectedGame.profiles.length < 2 || profile.isDefault || profile.locked} title="Placer le profil dans la corbeille ZAILON" className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-20"><Trash2 size={13} /></button></div>)}</div><div className="flex gap-2"><input value={profileName} onChange={event => setProfileName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { addProfile(profileName); setProfileName('') } }} placeholder="Nom du nouveau profil vide" className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /><button onClick={() => { addProfile(profileName); setProfileName('') }} className="rounded-lg bg-gold px-3 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Créer vide</button></div><div className="grid gap-2 sm:grid-cols-3"><button onClick={() => void openProfileDirectory(selectedProfile.id, 'root')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55">Ouvrir la racine</button><button onClick={() => void openProfileDirectory(selectedProfile.id, 'overwrite')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55">Ouvrir overwrite</button><button onClick={() => void openProfileDirectory(selectedProfile.id, 'generated')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55">Ouvrir generated</button></div></div>}

      {tab === 'downloads' && <EmptyPanel icon={Download} title="Aucun téléchargement en attente" detail="Les installations GameBanana terminées rejoignent directement le catalogue du jeu. Les téléchargements Nexus nécessitant une action manuelle resteront listés ici dans une prochaine étape." />}
      {tab === 'conflicts' && <div className="flex-1 overflow-y-auto p-4">{resolvedConflicts.length ? <div><div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-amber-100/65">TemporaryCopy déploie un seul gagnant par chemin. Sans règle explicite, le dernier mod dans l’ordre du profil gagne.</div><div className="overflow-x-auto rounded-xl border border-white/[0.07]"><table className="w-full text-left text-xs"><thead className="bg-white/[0.03] text-white/42"><tr><th className="px-3 py-2">Chemin résolu</th><th className="px-3 py-2">Fournisseurs</th><th className="px-3 py-2">Gagnant</th></tr></thead><tbody>{resolvedConflicts.map(conflict => <tr key={conflict.path} className="border-t border-white/[0.06]"><td className="max-w-sm break-all px-3 py-2 font-mono text-white/52">{conflict.path}</td><td className="px-3 py-2 text-white/45">{conflict.owners.map(owner => owner.name).join(' → ')}</td><td className="px-3 py-2"><select value={conflict.winner.id} onChange={event => setConflictWinner(conflict.path, event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-xs text-white/68">{conflict.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></td></tr>)}</tbody></table></div></div> : <EmptyPanel icon={ShieldAlert} title="Aucun conflit de fichiers" detail="L’analyse compare les chemins relatifs réellement fournis par chaque mod actif." />}</div>}
      {tab === 'tools' && <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2"><ActionCard icon={RefreshCw} title="Analyser le dossier Mods" detail="Actualise le catalogue, les tailles, les frameworks et les conflits." onClick={() => void scanMods(selectedGame.id)} /><ActionCard icon={FolderOpen} title="Ouvrir le dossier Mods" detail={selectedGame.modsPath || 'Configurez d’abord un dossier.'} disabled={!selectedGame.modsPath} onClick={() => selectedGame.modsPath && void native.openPath(selectedGame.modsPath)} /><ActionCard icon={FolderInput} title="Importer des dossiers" detail="Prévisualise les racines détectées avant toute copie." onClick={() => setImportOpen(true)} /></div>}
      {tab === 'backups' && <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2"><ActionCard icon={FileArchive} title="Exporter un profil léger" detail="Métadonnées, liens, versions, ordre et réglages. Aucun chemin personnel ni secret." onClick={() => void exportProfile(false)} /><ActionCard icon={Archive} title="Exporter un profil complet" detail={`${formatBytes(profileMods.reduce((sum, mod) => sum + (mod.sizeBytes || 0), 0))} maximum avant compression.`} onClick={() => void exportProfile(true)} /><ActionCard icon={Upload} title="Importer un profil" detail="Valide l’archive et affiche un aperçu avant création d’un nouveau profil." onClick={() => void importProfile()} /></div>}
      {tab === 'appearance' && <div className="min-h-0 flex-1 overflow-hidden p-3"><GameAppearanceEditor game={selectedGame} embedded onSave={resources => setGameResources(selectedGame.id, resources)} /></div>}
      {tab === 'settings' && <div className="flex-1 space-y-4 overflow-y-auto p-4"><Field label="Exécutable du jeu" value={selectedGame.execPath || ''} placeholder="Sélectionnez l’exécutable" onChange={value => void setGamePath(selectedGame.id, value)} onBrowse={() => void browseExecutable()} /><Field label="Dossier Mods" value={selectedGame.modsPath || ''} placeholder="Sélectionnez le dossier Mods" onChange={value => setModsPath(selectedGame.id, value)} onBrowse={() => void browseModsFolder()} /><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold text-white/68">Raccourci de lancement sécurisé</p><p className="mt-1 text-[11px] leading-relaxed text-white/34">Crée un raccourci bureau ZAILON lié à ce jeu et au profil « {selectedProfile.name} ». Le lien contient uniquement leurs identifiants internes.</p></div><button type="button" onClick={() => void native.createDesktopShortcut(selectedGame.id, selectedProfile.id, selectedGame.name, selectedGame.resources?.iconPath || selectedGame.execPath).then(path => window.alert(`Raccourci créé :\n${path}`)).catch(error => window.alert(String(error)))} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313]"><MonitorDown size={14} />Créer sur le bureau</button></div></div><p className="pt-1 text-[11px] font-mono text-white/35">Temps de jeu total : {formatTime(selectedGame.totalPlaytime)}</p></div>}
    </section>

    {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
    {importOpen && <ModImportDialog gameId={selectedGame.id} profileId={selectedProfile.id} gameName={selectedGame.name} destination={selectedGame.modsPath} onClose={() => setImportOpen(false)} onImported={() => void scanMods(selectedGame.id)} />}
    {bulkDialog && <BulkActionDialog mode={bulkDialog} count={selectedModIds.size} source={selectedProfile} profiles={selectedGame.profiles} onClose={() => setBulkDialog(undefined)} onConfirm={async value => {
      const ids = [...selectedModIds]
      if (bulkDialog === 'move' || bulkDialog === 'copy') await bulkTransferMods(ids, value, bulkDialog)
      else if (bulkDialog === 'delete') await bulkDeleteMods(ids, value === 'all' ? 'all' : 'current')
      else await bulkAddTag(ids, value)
      clearBulkSelection(); setBulkDialog(undefined)
    }} />}
  </div>
}

function BulkActionDialog({ mode, count, source, profiles, onClose, onConfirm }: {
  mode: 'move' | 'copy' | 'delete' | 'tag'
  count: number
  source: Profile
  profiles: Profile[]
  onClose: () => void
  onConfirm: (value: string) => Promise<void>
}) {
  const destinations = profiles.filter(profile => profile.id !== source.id)
  const [value, setValue] = useState(mode === 'delete' ? 'current' : mode === 'tag' ? '' : destinations[0]?.id || '')
  const title = mode === 'move' ? 'Transférer la sélection' : mode === 'copy' ? 'Copier la sélection' : mode === 'delete' ? 'Retirer la sélection' : 'Ajouter une étiquette'
  const valid = mode === 'tag' ? value.trim().length > 0 : Boolean(value)
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/78 p-4 backdrop-blur-md" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#101313] p-4 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold text-white">{title}</h2><p className="mt-1 text-xs text-white/42">Source : {source.name} · {count} mod(s)</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/40 hover:bg-white/[0.05]"><X size={16} /></button></header>{mode === 'move' || mode === 'copy' ? <><label className="mt-4 block text-xs text-white/50">Profil de destination<select value={value} onChange={event => setValue(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.09] bg-[#0b0d0d] px-3 py-2 text-white/75">{destinations.map(profile => <option key={profile.id} value={profile.id} disabled={profile.locked}>{profile.name}{profile.locked ? ' — verrouillé' : ''}</option>)}</select></label><div className="mt-3 rounded-lg border border-sky-300/15 bg-sky-300/[0.04] p-3 text-xs leading-relaxed text-sky-100/58">{mode === 'copy' ? 'La copie ajoute des références au même paquet immuable. Les futurs fichiers générés restent dans l’overwrite du profil destination : aucun fichier source partagé n’est modifié.' : 'Le transfert ajoute d’abord les références à la destination, valide les manifestes, puis les retire de la source. En cas d’échec, la transaction restaure les deux profils.'}</div></> : mode === 'delete' ? <><label className="mt-4 block text-xs text-white/50">Portée<select value={value} onChange={event => setValue(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.09] bg-[#0b0d0d] px-3 py-2 text-white/75"><option value="current">Profil courant uniquement</option><option value="all">Tous les profils — paquet conservé dans le store</option></select></label><p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-relaxed text-amber-100/58">Cette action est annulable. ZAILON ne supprime jamais physiquement un paquet encore référencé ; le nettoyage définitif du store est volontairement séparé.</p></> : <label className="mt-4 block text-xs text-white/50">Étiquette personnalisée<input autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder="Ex. Graphismes, Correctifs…" className="mt-1.5 block w-full rounded-lg border border-white/[0.09] bg-[#0b0d0d] px-3 py-2 text-white/75 outline-none focus:border-gold/35" /></label>}<footer className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-white/48">Annuler</button><button disabled={!valid} onClick={() => void onConfirm(value)} className="rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-[var(--zailon-accent-text)] disabled:opacity-35">Confirmer</button></footer></section></div>
}

function ModImportDialog({ gameId, profileId, gameName, destination, onClose, onImported }: { gameId: string; profileId: string; gameName: string; destination?: string; onClose: () => void; onImported: () => void }) {
  const autoReduce = useStore(state => state.taskAutoReduceImports)
  const [candidates, setCandidates] = useState<ModImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [dragActive, setDragActive] = useState(false)
  const [visibleCount, setVisibleCount] = useState(250)
  const [task, setTask] = useState<BackgroundTaskSnapshot>()
  const [taskId, setTaskId] = useState<string>()
  const [deployNow, setDeployNow] = useState(true)
  const reduceTimer = useRef<number>()
  const visibleCandidates = candidates.slice(0, visibleCount)

  const analyze = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    setBusy(true); setError(undefined)
    try {
      const nextTaskId = crypto.randomUUID()
      setTaskId(nextTaskId)
      const found = await native.scanModImportBackground(nextTaskId, paths, gameName, setTask)
      setCandidates(current => {
        const merged = new Map(current.map(item => [item.path, item]))
        found.forEach(item => merged.set(item.path, item))
        return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))
      })
      setSelected(current => {
        const next = new Set(current)
        found.forEach(item => next.add(item.path))
        return next
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false); setTaskId(undefined) }
  }, [gameName])

  const choose = async () => {
    const paths = await pickFolders('Sélectionnez un dossier contenant tous les mods')
    await analyze(paths)
  }

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    let disposed = false
    void getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDragActive(true)
      if (event.payload.type === 'leave') setDragActive(false)
      if (event.payload.type === 'drop') {
        setDragActive(false)
        void analyze(event.payload.paths)
      }
    }).then(listener => {
      if (disposed) listener()
      else unlisten = listener
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
    return () => { disposed = true; unlisten?.() }
  }, [analyze])

  const commit = async () => {
    if (!destination) { setError('Configurez le dossier Mods du jeu avant l’import.'); return }
    const paths = candidates.filter(item => selected.has(item.path)).map(item => item.path)
    if (!paths.length) return
    setBusy(true); setError(undefined)
    try {
      const nextTaskId = crypto.randomUUID()
      setTaskId(nextTaskId)
      await native.importModCandidatesBackground(nextTaskId, gameId, [profileId], paths, gameName, destination, deployNow, nextTask => {
        setTask(nextTask)
        if (autoReduce && nextTask.status === 'running' && nextTask.processed > 0 && !reduceTimer.current) reduceTimer.current = window.setTimeout(onClose, 1_500)
      })
      onImported()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(false)
      setTaskId(undefined)
    }
  }

  const cancelTask = () => taskId && void native.cancelBackgroundTask(taskId)
  const progress = task?.total ? Math.min(100, Math.round(task.processed / task.total * 100)) : 0

  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`relative flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-[#111414] shadow-2xl transition-colors ${dragActive ? 'border-gold/70 ring-2 ring-gold/20' : 'border-white/[0.1]'}`}>
      {dragActive && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#101313]/90 backdrop-blur-sm"><div className="text-center text-gold"><FolderInput size={36} className="mx-auto" /><p className="mt-3 text-sm font-semibold">Déposez le dossier contenant tous vos mods</p><p className="mt-1 text-[11px] text-white/48">Tous les sous-dossiers détectés seront ajoutés, sans limite de nombre.</p></div></div>}
      <header className="flex items-center gap-3 border-b border-white/[0.07] p-4"><FolderInput size={18} className="text-gold" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white">Import intelligent — {gameName}</h2><p className="mt-0.5 text-[11px] text-white/38">Glissez le dossier racine de votre collection, ou sélectionnez-le. Aucun dossier n’est copié avant confirmation.</p></div><button onClick={onClose} title={busy ? 'Réduire : la tâche continue en arrière-plan' : 'Fermer'} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button></header>
      <div className="min-h-48 flex-1 overflow-y-auto p-4">
        {!candidates.length ? <button onClick={() => void choose()} disabled={busy} className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-gold/25 bg-gold/[0.015] text-white/50 hover:bg-gold/[0.035]"><FolderPlus size={26} /><span className="mt-3 text-xs font-semibold">Glissez ici le dossier contenant tous les mods</span><span className="mt-1 text-[11px]">ou cliquez pour sélectionner le dossier racine — aucun maximum de mods</span><span className="mt-1 text-[11px] text-white/28">Générique, Cyberpunk, Bethesda, Unreal Pak, XXMI et BepInEx</span></button> : <div className="space-y-2">{visibleCandidates.map(candidate => <label key={candidate.path} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><input type="checkbox" checked={selected.has(candidate.path)} onChange={() => setSelected(current => { const next = new Set(current); next.has(candidate.path) ? next.delete(candidate.path) : next.add(candidate.path); return next })} className="mt-1 accent-gold" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-white/78">{candidate.name}</span><span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-white/45">{candidate.framework}</span><span className="text-[11px] text-white/30">confiance {candidate.confidence}</span></div><p className="mt-1 truncate font-mono text-[11px] text-white/30" title={candidate.path}>{candidate.path}</p>{candidate.sourceUrl && <p className="mt-1 text-[11px] text-emerald-200/55">Source détectée : {candidate.sourceUrl}</p>}{candidate.warnings.map(warning => <p key={warning} className="mt-1 text-[11px] text-amber-200/55">{warning}</p>)}</div><span className="text-[11px] text-white/30">{formatBytes(candidate.sizeBytes)}</span></label>)}{visibleCount < candidates.length && <button onClick={() => setVisibleCount(count => count + 250)} className="w-full rounded-lg border border-white/[0.08] py-2 text-[11px] text-white/45 hover:bg-white/[0.04]">Afficher 250 résultats supplémentaires ({candidates.length - visibleCount} restants)</button>}</div>}
        {task && <div className="mt-3 rounded-xl border border-gold/15 bg-gold/[0.025] p-3"><div className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-white/62">{task.message}</span><span className="shrink-0 font-mono text-gold/70">{task.total ? `${progress}%` : '…'}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/32"><span>{task.processed} / {task.total || '?'} · {task.status}</span>{busy && taskId && <button type="button" onClick={cancelTask} className="rounded border border-red-300/15 px-2 py-1 text-red-200/64">Annuler la tâche</button>}</div></div>}
        {candidates.length > 0 && <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3 text-[11px] text-white/58"><span><strong className="block text-white/72">Activer pour le prochain lancement</strong><span className="mt-1 block leading-relaxed text-white/34">Les fichiers restent stockés hors du jeu. Au lancement, TemporaryCopy résout les conflits, sauvegarde les originaux, copie chaque fichier vers sa vraie racine, vérifie sa visibilité puis restaure le jeu à sa fermeture. Ce backend n’est pas le VFS de MO2.</span></span><input type="checkbox" checked={deployNow} onChange={event => setDeployNow(event.target.checked)} className="mt-1 accent-gold" /></label>}
        {error && <p className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.04] p-3 text-[11px] text-red-200/70">{error}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] p-4"><div className="flex items-center gap-2"><button onClick={() => void choose()} disabled={busy} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]">Ajouter un dossier racine</button>{candidates.length > 0 && <span className="text-[11px] text-white/32">{candidates.length} mod(s) détecté(s)</span>}</div><div className="flex gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-[11px] text-white/45">{busy ? 'Réduire' : 'Fermer'}</button><button onClick={() => void commit()} disabled={busy || !selected.size} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-35">{busy ? `${task?.message || 'Tâche en cours…'} ${task?.total ? `${progress}%` : ''}` : `${deployNow ? 'Importer et activer' : 'Stocker'} ${selected.size} mod(s)`}</button></div></footer>
    </section>
  </div>
}

function Field({ label, value, placeholder, onChange, onBrowse }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onBrowse: () => void }) {
  return <div><label className="mb-1.5 block text-[11px] font-mono uppercase tracking-widest text-white/30">{label}</label><div className="flex gap-2"><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="flex-1 rounded-lg border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /><button onClick={onBrowse} className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-[11px] text-white/55 hover:text-white">Parcourir</button></div></div>
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 ${wide ? 'sm:col-span-2' : ''}`}><p className="text-[11px] uppercase tracking-widest text-white/30">{label}</p><p className="mt-2 break-all text-lg font-semibold text-white/75">{value}</p></div>
}

function ActionCard({ icon: Icon, title, detail, onClick, disabled }: { icon: typeof Wrench; title: string; detail: string; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left hover:border-gold/20 hover:bg-white/[0.04] disabled:opacity-35"><Icon size={17} className="text-gold/70" /><h3 className="mt-3 text-xs font-semibold text-white/75">{title}</h3><p className="mt-1 text-[11px] leading-relaxed text-white/38">{detail}</p></button>
}

function EmptyPanel({ icon: Icon, title, detail }: { icon: typeof Download; title: string; detail: string }) {
  return <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Icon size={22} className="text-white/22" /><h2 className="mt-3 text-sm font-semibold text-white/62">{title}</h2><p className="mt-1 max-w-lg text-[11px] leading-relaxed text-white/36">{detail}</p></div>
}

function formatBytes(size: number) {
  if (!size) return '0 octet'
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} Go`
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} Mo`
  return `${Math.max(1, Math.round(size / 1024))} Ko`
}
