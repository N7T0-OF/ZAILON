import { Archive, Boxes, Copy, Download, FileArchive, FolderInput, FolderOpen, FolderPlus, Plus, Radar, RefreshCw, Search, ShieldAlert, Trash2, Upload, Wrench, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSelectedGame, getSelectedProfile, resolveProfileMods, useStore } from '../../store/useStore'
import { native, pickExecutable, pickFolder, pickFolders, pickProfileArchive, saveProfileArchive } from '../../lib/native'
import { ModCard } from '../UI/ModCard'
import { formatTime, timeAgo } from '../../utils'
import { SteamDetectionDialog } from '../SteamDetectionDialog'
import { GameAppearanceEditor } from '../GameResourcesDialog'
import type { GameTab, ModImportCandidate, ProfileArchiveManifest } from '../../types'

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
  const [search, setSearch] = useState('')
  const [profileName, setProfileName] = useState('')
  const [steamDialogOpen, setSteamDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const profileMods = useMemo(() => resolveProfileMods(selectedGame, selectedProfile), [selectedGame, selectedProfile])
  const filteredMods = profileMods.filter(mod => mod.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const conflictMods = profileMods.filter(mod => mod.conflict && mod.conflict !== 'none')

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
      appVersion: '1.3.1',
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
    <aside className="flex w-48 flex-col border-r border-white/[0.05] bg-black/10">
      <div className="flex items-center justify-between px-3 pb-2 pt-3"><span className="text-[11px] font-mono uppercase tracking-widest text-white/30">Bibliothèque</span><button onClick={() => void addGameFromExecutable()} title="Ajouter un jeu" className="text-white/40 hover:text-gold"><Plus size={14} /></button></div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2">
        {games.map(game => <button key={game.id} onClick={() => setSelectedGame(game.id)} className={`w-full rounded-lg px-2.5 py-2.5 text-left text-[11px] ${game.id === selectedGame.id ? 'border border-gold/20 bg-gold/10 text-gold' : 'text-white/55 hover:bg-white/[0.04]'}`}><p className="truncate font-medium">{game.name}</p><p className="mt-0.5 font-mono text-[11px] text-white/25">{game.profiles.length} profil{game.profiles.length !== 1 ? 's' : ''} · {game.installedMods.length} mods</p></button>)}
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
          <div className="relative ml-auto"><Search size={12} className="absolute left-2.5 top-2.5 text-white/30" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher" className="w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 pl-7 pr-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /></div>
        </div>
        <div className="flex-1 overflow-y-auto p-3"><p className="mb-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/65">Le catalogue est partagé entre les profils. Chaque profil conserve seulement l’état, l’ordre et les règles de ses mods.</p><div className="space-y-1.5">{filteredMods.length ? filteredMods.map((mod, index) => <ModCard key={mod.id} mod={mod} onToggle={() => void toggleMod(mod.id)} onDelete={() => { if (window.confirm(`Supprimer réellement « ${mod.name} » du disque et de tous les profils ?`)) void deleteMod(mod.id) }} onMoveUp={index > 0 ? () => moveMod(mod.id, -1) : undefined} onMoveDown={index < filteredMods.length - 1 ? () => moveMod(mod.id, 1) : undefined} onNoteChange={note => setModNote(mod.id, note)} />) : <div className="flex h-40 flex-col items-center justify-center gap-2 text-[11px] text-white/35"><FolderPlus size={20} /><span>Aucun mod. Importez un dossier ou analysez le dossier Mods.</span></div>}</div></div>
      </div>}

      {tab === 'profiles' && <div className="flex-1 space-y-4 overflow-y-auto p-4"><p className="text-[11px] leading-relaxed text-white/48">Changer de profil applique réellement les états activés/désactivés au dossier Mods. Les profils restent légers et ne recopient pas les fichiers.</p><div className="space-y-2">{selectedGame.profiles.map(profile => <div key={profile.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-3 ${profile.id === selectedProfile.id ? 'border-gold/20 bg-gold/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}><input value={profile.name} onChange={event => renameProfile(profile.id, event.target.value)} className="min-w-40 flex-1 bg-transparent text-xs font-medium text-white/78 outline-none" /><span className="text-[11px] text-white/35">{resolveProfileMods(selectedGame, profile).filter(mod => mod.enabled).length} actif(s)</span><button onClick={() => duplicateProfile(profile.id)} title="Dupliquer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Copy size={13} /></button><button onClick={() => removeProfile(profile.id)} disabled={selectedGame.profiles.length < 2 || profile.isDefault} title="Supprimer le profil" className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-20"><Trash2 size={13} /></button></div>)}</div><div className="flex gap-2"><input value={profileName} onChange={event => setProfileName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { addProfile(profileName); setProfileName('') } }} placeholder="Nom du nouveau profil" className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /><button onClick={() => { addProfile(profileName); setProfileName('') }} className="rounded-lg bg-gold px-3 text-[11px] font-semibold text-ink-400">Créer</button></div></div>}

      {tab === 'downloads' && <EmptyPanel icon={Download} title="Aucun téléchargement en attente" detail="Les installations GameBanana terminées rejoignent directement le catalogue du jeu. Les téléchargements Nexus nécessitant une action manuelle resteront listés ici dans une prochaine étape." />}
      {tab === 'conflicts' && <div className="flex-1 overflow-y-auto p-4">{conflictMods.length ? <div className="space-y-2">{conflictMods.map(mod => <ModCard key={mod.id} mod={mod} onToggle={() => void toggleMod(mod.id)} />)}</div> : <EmptyPanel icon={ShieldAlert} title="Aucun conflit de fichiers" detail="L’analyse compare les chemins relatifs réellement fournis par chaque mod actif." />}</div>}
      {tab === 'tools' && <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2"><ActionCard icon={RefreshCw} title="Analyser le dossier Mods" detail="Actualise le catalogue, les tailles, les frameworks et les conflits." onClick={() => void scanMods(selectedGame.id)} /><ActionCard icon={FolderOpen} title="Ouvrir le dossier Mods" detail={selectedGame.modsPath || 'Configurez d’abord un dossier.'} disabled={!selectedGame.modsPath} onClick={() => selectedGame.modsPath && void native.openPath(selectedGame.modsPath)} /><ActionCard icon={FolderInput} title="Importer des dossiers" detail="Prévisualise les racines détectées avant toute copie." onClick={() => setImportOpen(true)} /></div>}
      {tab === 'backups' && <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2"><ActionCard icon={FileArchive} title="Exporter un profil léger" detail="Métadonnées, liens, versions, ordre et réglages. Aucun chemin personnel ni secret." onClick={() => void exportProfile(false)} /><ActionCard icon={Archive} title="Exporter un profil complet" detail={`${formatBytes(profileMods.reduce((sum, mod) => sum + (mod.sizeBytes || 0), 0))} maximum avant compression.`} onClick={() => void exportProfile(true)} /><ActionCard icon={Upload} title="Importer un profil" detail="Valide l’archive et affiche un aperçu avant création d’un nouveau profil." onClick={() => void importProfile()} /></div>}
      {tab === 'appearance' && <div className="min-h-0 flex-1 overflow-hidden p-3"><GameAppearanceEditor game={selectedGame} embedded onSave={resources => setGameResources(selectedGame.id, resources)} /></div>}
      {tab === 'settings' && <div className="flex-1 space-y-4 overflow-y-auto p-4"><Field label="Exécutable du jeu" value={selectedGame.execPath || ''} placeholder="Sélectionnez l’exécutable" onChange={value => void setGamePath(selectedGame.id, value)} onBrowse={() => void browseExecutable()} /><Field label="Dossier Mods" value={selectedGame.modsPath || ''} placeholder="Sélectionnez le dossier Mods" onChange={value => setModsPath(selectedGame.id, value)} onBrowse={() => void browseModsFolder()} /><p className="pt-1 text-[11px] font-mono text-white/35">Temps de jeu total : {formatTime(selectedGame.totalPlaytime)}</p></div>}
    </section>

    {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
    {importOpen && <ModImportDialog gameName={selectedGame.name} destination={selectedGame.modsPath} onClose={() => setImportOpen(false)} onImported={() => void scanMods(selectedGame.id)} />}
  </div>
}

function ModImportDialog({ gameName, destination, onClose, onImported }: { gameName: string; destination?: string; onClose: () => void; onImported: () => void }) {
  const [candidates, setCandidates] = useState<ModImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [dragActive, setDragActive] = useState(false)
  const [visibleCount, setVisibleCount] = useState(250)
  const visibleCandidates = candidates.slice(0, visibleCount)

  const analyze = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    setBusy(true); setError(undefined)
    try {
      const found = await native.scanModImport(paths, gameName)
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
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
    try { await native.importModCandidates(paths, destination); onImported(); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }

  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`relative flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-[#111414] shadow-2xl transition-colors ${dragActive ? 'border-gold/70 ring-2 ring-gold/20' : 'border-white/[0.1]'}`}>
      {dragActive && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#101313]/90 backdrop-blur-sm"><div className="text-center text-gold"><FolderInput size={36} className="mx-auto" /><p className="mt-3 text-sm font-semibold">Déposez le dossier contenant tous vos mods</p><p className="mt-1 text-[11px] text-white/48">Tous les sous-dossiers détectés seront ajoutés, sans limite de nombre.</p></div></div>}
      <header className="flex items-center gap-3 border-b border-white/[0.07] p-4"><FolderInput size={18} className="text-gold" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white">Import intelligent — {gameName}</h2><p className="mt-0.5 text-[11px] text-white/38">Glissez le dossier racine de votre collection, ou sélectionnez-le. Aucun dossier n’est copié avant confirmation.</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button></header>
      <div className="min-h-48 flex-1 overflow-y-auto p-4">
        {!candidates.length ? <button onClick={() => void choose()} disabled={busy} className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-gold/25 bg-gold/[0.015] text-white/50 hover:bg-gold/[0.035]"><FolderPlus size={26} /><span className="mt-3 text-xs font-semibold">Glissez ici le dossier contenant tous les mods</span><span className="mt-1 text-[11px]">ou cliquez pour sélectionner le dossier racine — aucun maximum de mods</span><span className="mt-1 text-[11px] text-white/28">Générique, Cyberpunk, Bethesda, Unreal Pak, XXMI et BepInEx</span></button> : <div className="space-y-2">{visibleCandidates.map(candidate => <label key={candidate.path} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><input type="checkbox" checked={selected.has(candidate.path)} onChange={() => setSelected(current => { const next = new Set(current); next.has(candidate.path) ? next.delete(candidate.path) : next.add(candidate.path); return next })} className="mt-1 accent-gold" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-white/78">{candidate.name}</span><span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-white/45">{candidate.framework}</span><span className="text-[11px] text-white/30">confiance {candidate.confidence}</span></div><p className="mt-1 truncate font-mono text-[11px] text-white/30" title={candidate.path}>{candidate.path}</p>{candidate.sourceUrl && <p className="mt-1 text-[11px] text-emerald-200/55">Source détectée : {candidate.sourceUrl}</p>}{candidate.warnings.map(warning => <p key={warning} className="mt-1 text-[11px] text-amber-200/55">{warning}</p>)}</div><span className="text-[11px] text-white/30">{formatBytes(candidate.sizeBytes)}</span></label>)}{visibleCount < candidates.length && <button onClick={() => setVisibleCount(count => count + 250)} className="w-full rounded-lg border border-white/[0.08] py-2 text-[11px] text-white/45 hover:bg-white/[0.04]">Afficher 250 résultats supplémentaires ({candidates.length - visibleCount} restants)</button>}</div>}
        {error && <p className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.04] p-3 text-[11px] text-red-200/70">{error}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] p-4"><div className="flex items-center gap-2"><button onClick={() => void choose()} disabled={busy} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]">Ajouter un dossier racine</button>{candidates.length > 0 && <span className="text-[11px] text-white/32">{candidates.length} mod(s) détecté(s)</span>}</div><div className="flex gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-[11px] text-white/45">Annuler</button><button onClick={() => void commit()} disabled={busy || !selected.size} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-35">{busy ? 'Analyse/import en cours…' : `Importer ${selected.size} mod(s)`}</button></div></footer>
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
