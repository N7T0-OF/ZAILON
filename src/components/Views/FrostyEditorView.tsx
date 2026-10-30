import {
  Archive, ArrowLeft, Box, Check, CircleDot, ClipboardList, CloudOff, Download, FileArchive, FilePlus2,
  FolderOpen, Gauge, Hammer, HardDrive, History, Info, Package, Play, Plus, RefreshCw, Save, Server,
  Sparkles, Trash2, Wrench, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { addonCapabilities, hasCapability } from '../../lib/addonGating'
import {
  advanceFrostyBuild, autosaveProject, buildFrostyEditorDiagnostic, createFrostyProject,
  editorSupportForGame, estimateFrostyModSize, failFrostyBuild, FROSTY_BUILD_STAGES,
  FROSTY_LICENSE_POLICY,
  FROSTY_PLUGIN_INVENTORY, FROSTY_RUNTIME_BY_GAME, markAssetInProject, projectReady,
  recentFrostyProjects, recordFrostyBuild, restoreAutosave, setAssetNote, toggleFavorite,
  unmarkAssetInProject, validateFrostyProject, workerClosed, workerPluginCrashed,
  workerReset, workerTick, workerWarmed, type FrostyBuildPipeline, type FrostyProject,
  type FrostyWorkerStatus,
} from '../../lib/frostyEditor'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'
import { AssetBrowserPanel, BulkExportDialog, EbxEditorPanel, FrostyCommandPalette, PluginManagerPanel, type FrostyPaletteAction } from './FrostyPanels'
import { buildFrostyProjectArchive, frostyProjectArchiveText, parseFrostyProjectExport } from '../../lib/frostyProjectFile'
import { native } from '../../lib/native'
import { classifyRuntimeExe, type FrostyRuntime } from '../../lib/frostyBridge'
import type { FrostyAsset } from '../../lib/frostyAssets'

const WORKER_INITIAL: FrostyWorkerStatus = { state: 'stopped', crashCount: 0, disabledPlugins: [] }

function createId(): string {
  return `fp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function FrostyEditorView() {
  const games = useStore(state => state.games)
  const addons = useStore(state => state.addons)
  const projects = useStore(state => state.frostyProjects)
  const upsert = useStore(state => state.upsertFrostyProject)
  const removeProject = useStore(state => state.removeFrostyProject)
  const contextGameId = useStore(state => state.frostyContextGameId)
  const setContextGame = useStore(state => state.setFrostyContextGame)
  const setView = useStore(state => state.setView)
  const setSelectedGame = useStore(state => state.setSelectedGame)

  const capabilities = useMemo(() => addonCapabilities(addons), [addons])
  const hasBackend = hasCapability(capabilities, 'frosty.backend')
  const hasEditor = hasCapability(capabilities, 'frosty.editor')

  // Jeu de contexte : priorité au jeu ouvert depuis sa configuration, sinon le
  // premier jeu Frostbite compatible de la bibliothèque.
  const contextGame = contextGameId ? games.find(g => g.id === contextGameId) : undefined
  const frostyGame = contextGame ?? games.find(g => editorSupportForGame(g.name, g.execPath?.split(/[\\/]/).pop()))

  const [selectedId, setSelectedId] = useState<string | undefined>(projects[0]?.id)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [worker, setWorker] = useState<FrostyWorkerStatus>(WORKER_INITIAL)
  const [pipeline, setPipeline] = useState<FrostyBuildPipeline>({ stage: 'idle', progress: 0, issues: [] })
  const [error, setError] = useState<string | undefined>()
  const [ebxAsset, setEbxAsset] = useState<FrostyAsset | null>(null)
  const [bulkAssets, setBulkAssets] = useState<FrostyAsset[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<string | undefined>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [detectedRuntime, setDetectedRuntime] = useState<FrostyRuntime | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [nativeWorker, setNativeWorker] = useState<{ pid: number; running: boolean; memoryMb: number | null } | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const selected = projects.find(p => p.id === selectedId)
  const support = frostyGame ? editorSupportForGame(frostyGame.name, frostyGame.execPath?.split(/[\\/]/).pop()) : null
  const installedPlugins = FROSTY_PLUGIN_INVENTORY.filter(p => p.category !== 'legacy').map(p => p.name)

  const ready = selected ? projectReady(selected, { support, installedPlugins, runtimePresent: hasBackend }) : null
  const diagnostic = useMemo(
    () => selected ? buildFrostyEditorDiagnostic(selected, { support, installedPlugins, runtimePresent: hasBackend }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, support, hasBackend],
  )

  function selectGame(gameId: string) {
    setContextGame(gameId)
    const game = games.find(g => g.id === gameId)
    if (!game) return
    const existing = projects.find(p => p.gameId === gameId)
    setSelectedId(existing?.id)
  }

  function createProject() {
    if (!frostyGame) return
    const project = createFrostyProject({
      id: createId(),
      name: newName || 'Sans titre',
      gameId: frostyGame.id,
      gameName: frostyGame.name,
      editorProjectsRoot: 'ZAILON_DATA/editor-projects',
    })
    upsert(project)
    setSelectedId(project.id)
    setCreating(false)
    setNewName('')
  }

  function autosave() {
    if (!selected) return
    upsert(autosaveProject(selected, `Autosave ${selected.autosaves.length + 1}`))
  }

  function buildMod() {
    if (!selected || !ready) return
    if (!ready.ok) {
      setError(ready.issues.filter(i => i.severity === 'error').map(i => i.message).join(' '))
      return
    }
    setError(undefined)
    setWorker(workerWarmed(worker))
    setPipeline({ stage: 'validating', progress: 0.05, issues: [] })
    const total = 1_400
    const startedAt = Date.now()
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const steps = Math.floor(elapsed / total)
      setPipeline(prev => {
        if (prev.stage === 'done' || prev.stage === 'failed') {
          if (tickRef.current) clearInterval(tickRef.current)
          return prev
        }
        const next = steps >= FROSTY_BUILD_STAGES.length ? { ...prev, stage: 'done' as const, progress: 1 } : advanceFrostyBuild(prev)
        if (next.stage === 'done') {
          if (tickRef.current) clearInterval(tickRef.current)
          const size = estimateFrostyModSize(selected)
          upsert(recordFrostyBuild(selected, { version: '1.0.0', modName: selected.name, estimatedSize: size, status: 'built', issues: [] }))
        }
        return next
      })
    }, 200)
  }

  function crashSimulation() {
    // Test de crash (spec §76-78, §118) : le Worker redémarre, ZAILON reste.
    setWorker(workerPluginCrashed(worker, 'MeshSetPlugin'))
    if (tickRef.current) clearInterval(tickRef.current)
    setPipeline({ stage: 'idle', progress: 0, issues: [] })
  }

  function closeEditor() {
    if (tickRef.current) clearInterval(tickRef.current)
    setWorker(workerClosed(worker, 'balanced'))
    // Réchauffé 45 s, puis arrêt propre — la RAM Frosty est libérée (§79-80).
    setTimeout(() => setWorker(prev => workerTick(prev, Date.now() + 100)), 45_000)
  }

  const runtime = frostyGame ? FROSTY_RUNTIME_BY_GAME[frostyGame.name] ?? '1.0.6.3' : undefined // version conseillée
  const recent = recentFrostyProjects(projects)

  // Détection du runtime officiel à l'ouverture du jeu de contexte (spec §86).
  useEffect(() => {
    const execPath = frostyGame?.execPath
    if (!execPath) return
    void (async () => {
      setDetecting(true)
      try {
        const info = await native.detectFrostyRuntime(execPath, [])
        setDetectedRuntime(info ? { ...info, kind: classifyRuntimeExe(info.exe), detectedAt: Date.now() } : null)
      } catch { setDetectedRuntime(null) }
      setDetecting(false)
    })()
  }, [frostyGame?.id, frostyGame?.execPath])

  async function startNativeWorker() {
    if (!detectedRuntime || nativeWorker?.running) return
    try {
      const pid = await native.frostyWorkerStart(detectedRuntime.path)
      const status = await native.frostyWorkerStatus(pid)
      setNativeWorker({ pid, running: status.running, memoryMb: status.memoryMb })
      setWorker(workerWarmed(worker))
    } catch { setError('Impossible de démarrer le Worker Frosty natif.') }
  }

  async function stopNativeWorker() {
    if (!nativeWorker) return
    try {
      await native.frostyWorkerStop(nativeWorker.pid)
    } catch { /* déjà arrêté */ }
    setNativeWorker(null)
    setWorker(workerReset(worker))
  }

  const editorActions: FrostyPaletteAction[] = useMemo(() => {
    const actions: FrostyPaletteAction[] = [{
      id: 'search-asset', label: 'Rechercher un asset', detail: 'Focus l\'Asset Browser', shortcut: 'Ctrl+P',
      run: () => { window.dispatchEvent(new CustomEvent('zailon:frosty:focus-search')) },
    }]
    if (selected) {
      actions.push({
        id: 'build', label: 'Build & Test', detail: selected.name, shortcut: 'Ctrl+B',
        run: () => { if (ready?.ok) buildMod() },
      })
      actions.push({ id: 'save', label: 'Sauvegarder le projet', detail: selected.name, shortcut: 'Ctrl+S', run: autosave })
      actions.push({ id: 'export', label: 'Exporter le projet', detail: selected.name, run: () => setExporting(true) })
    }
    actions.push({ id: 'create', label: 'Créer un projet', detail: frostyGame ? `Pour ${frostyGame.name}` : 'Sélectionnez un jeu', run: () => setCreating(true) })
    actions.push({ id: 'library', label: 'Ouvrir la Bibliothèque', detail: 'Retour aux jeux', run: () => setView('games') })
    actions.push({ id: 'addons', label: 'Ouvrir Add-ons', detail: 'Installer Frosty Support / Editor', run: () => setView('addons') })
    return actions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, frostyGame, ready?.ok])

  // Raccourcis éditeur (spec §73) : Ctrl+S autosave, Ctrl+B build, Ctrl+K
  // palette, Ctrl+P recherche d'asset.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLocaleLowerCase()
      if (key === 's') { event.preventDefault(); autosave() }
      if (key === 'b') { event.preventDefault(); if (selected && ready?.ok) buildMod() }
      if (key === 'k') { event.preventDefault(); setPaletteOpen(prev => !prev) }
      if (key === 'p') { event.preventDefault(); setPaletteOpen(true); window.dispatchEvent(new CustomEvent('zailon:frosty:focus-search')) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready?.ok, worker, nativeWorker])

  if (!hasBackend || !hasEditor) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-white/28"><Wrench size={20} /></div>
      <h1 className="font-display text-xl font-bold text-white">Création Frosty</h1>
      <p className="max-w-md text-xs text-white/45">Cet espace nécessite les add-ons <b className="text-white/70">Frosty Support</b> et <b className="text-white/70">Frosty Editor</b>. Sans eux, aucun code d'édition n'est chargé.</p>
      <button type="button" onClick={() => setView('addons')} className="mt-2 rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Voir les add-ons</button>
    </div>
  }

  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Add-on officiel · Frosty Editor</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Création Frosty</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/42">
          Créer et éditer des mods Frostbite (assets, textures, meshes, sons, EBX) puis builder un .fbmod.
          <ZailonInfoPopover text="Le travail lourd tourne dans un Worker isolé : un plugin qui plante ne ferme jamais ZAILON, et fermer l'éditeur libère immédiatement la RAM Frosty. ZAILON ne bundle jamais le code Frosty — il pilote le runtime officiel détecté par Frosty Support." />
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setView('games')} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold"><ArrowLeft size={13} />Bibliothèque</button>
      </div>
    </header>

    {/* Sélecteur de jeu Frostbite */}
    <section className="mt-5 rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><GamepadIcon size={12} />Jeu cible</p>
      {games.filter(g => editorSupportForGame(g.name, g.execPath?.split(/[\\/]/).pop())).length === 0
        ? <p className="text-xs text-white/45">Aucun jeu Frostbite compatible détecté dans la Bibliothèque. Ajoutez-en un (ex. Need for Speed) pour commencer.</p>
        : <div className="flex flex-wrap gap-2">
          {games.filter(g => editorSupportForGame(g.name, g.execPath?.split(/[\\/]/).pop())).map(game => {
            const active = frostyGame?.id === game.id
            return <button key={game.id} type="button" onClick={() => selectGame(game.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] transition-colors ${active ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/[0.08] text-white/62 hover:border-white/16'}`}>
              <CircleDot size={12} className={active ? 'text-gold' : 'text-white/25'} />{game.name}
              <span className="font-mono text-[10px] text-white/30">{runtimeFor(game.name)}</span>
            </button>
          })}
        </div>}
    </section>

    <div className="mt-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Projets */}
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><FolderOpen size={12} />Projets</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setCreating(true)} title="Créer un projet" aria-label="Créer un projet" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/52 hover:border-gold/30 hover:text-gold"><Plus size={13} /></button>
            <button type="button" title="Ouvrir un projet Frosty existant" aria-label="Ouvrir un projet" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/52 hover:border-gold/30 hover:text-gold"><FolderOpen size={13} /></button>
            <button type="button" title="Importer un projet" aria-label="Importer un projet" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/52 hover:border-gold/30 hover:text-gold"><Archive size={13} /></button>
          </div>
        </div>

        {recent.length === 0
          ? <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/[0.09] py-6 text-center">
            <FilePlus2 size={16} className="text-white/25" />
            <p className="text-[11px] text-white/38">Aucun projet.<br />Créez-en un pour commencer.</p>
          </div>
          : <ul className="mt-3 space-y-1.5">
            {recent.map(project => {
              const active = selected?.id === project.id
              return <li key={project.id}>
                <button type="button" onClick={() => setSelectedId(project.id)} className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors ${active ? 'border-gold/35 bg-gold/8' : 'border-transparent hover:bg-white/[0.04]'}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white/78">{project.name}</span>
                    <span className="block text-[10px] text-white/34">{project.gameName} · {project.frostyRuntimeVersion}</span>
                  </span>
                  {project.dirty && <span className="ml-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold" title="Modifications non sauvegardées" />}
                </button>
              </li>
            })}
          </ul>}

        {selected && <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/32"><History size={11} />Autosave</p>
          {selected.autosaves.length === 0
            ? <p className="text-[10px] text-white/30">Aucun snapshot — sauvegarde automatique au premier changement.</p>
            : <ul className="space-y-1">
              {[...selected.autosaves].reverse().map(snapshot => (
                <li key={snapshot.at} className="flex items-center justify-between text-[10px] text-white/45">
                  <span>{snapshot.label} · {snapshot.assetCount} asset(s)</span>
                  <button type="button" onClick={() => upsert(restoreAutosave(selected, snapshot.at))} className="text-gold/70 hover:text-gold">Restaurer</button>
                </li>
              ))}
            </ul>}
          <button type="button" onClick={autosave} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] py-1.5 text-[10px] font-semibold text-white/55 hover:border-gold/30 hover:text-gold"><Save size={11} />Sauvegarder maintenant</button>
        </div>}
      </section>

      {/* Détail du projet */}
      {!selected
        ? <section className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.018] p-6 text-center">
          <Box size={20} className="text-white/22" />
          <p className="text-xs text-white/40">Sélectionnez ou créez un projet pour afficher ses assets, sa matrice de capacités et son build.</p>
        </section>
        : <div className="space-y-4">
          {/* En-tête projet */}
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-white">{selected.name}</h2>
                <p className="mt-0.5 font-mono text-[11px] text-white/38">{selected.gameName} · Frosty {selected.frostyRuntimeVersion} · {selected.gameVersion ?? 'version inconnue'}</p>
                <p className="mt-1 text-[11px] text-white/30">Projet hors du dossier du jeu : <span className="font-mono">{selected.projectPath}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExporting(true)} title="Exporter le projet (.zailon-frosty-project) — sources d'édition, jamais de caches ni de builds (§108)" className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/62 hover:border-gold/30 hover:text-gold"><Archive size={13} />Exporter</button>
                <button type="button" onClick={() => setImporting(true)} title="Importer un projet Frosty existant (conversion non destructive §63)" className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/62 hover:border-gold/30 hover:text-gold"><FileArchive size={13} />Importer</button>
                <button type="button" onClick={autosave} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/62 hover:border-gold/30 hover:text-gold"><Save size={13} />Autosave</button>
                <button type="button" onClick={() => { if (confirm('Supprimer ce projet ? Les mods déjà buildés sont conservés.')) { removeProject(selected.id); setSelectedId(undefined) } }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.09] text-white/45 hover:border-rose-300/30 hover:text-rose-200"><Trash2 size={13} /></button>
              </div>
            </div>
          </section>

          {/* Matrice de capacités */}
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><Sparkles size={12} />Support d'édition · {selected.gameName}<ZailonInfoPopover text="Les capacités viennent du profil Frosty et des plugins — jamais inventées (spec §60-61). NFS 2015 est la cible de validation complète ; les autres profils Frostbite suivent leur matrice." /></p>
            {!support
              ? <p className="text-xs text-amber-200/70">Aucun profil Frostbite reconnu pour ce jeu — l'édition n'est pas disponible.</p>
              : <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['ebx', 'EBX'], ['textures', 'Textures'], ['mesh', 'Meshes'], ['audio', 'Audio'], ['localization', 'Localisation'], ['bundles', 'Bundles'], ['build', 'Build']] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
                    <span className="text-[11px] text-white/50">{label}</span>
                    {support[key] ? <Check size={13} className="text-gold" /> : <span className="text-[10px] text-white/25">—</span>}
                  </div>
                ))}
              </div>}
          </section>

          {/* Assets */}
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Assets du projet</p>
            <div className="grid gap-3 sm:grid-cols-3">                {([['modifiedAssets', 'Modifiés', 'text-gold', 'modified'], ['addedAssets', 'Ajoutés', 'text-emerald-300/80', 'added'], ['removedAssets', 'Supprimés', 'text-rose-300/70', 'removed']] as const).map(([key, label, color, kind]) => (
                <div key={key} className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
                  <p className={`text-xl font-bold ${color}`}>{selected[key].length}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
                  <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto">
                    {selected[key].slice(0, 8).map(asset => (
                      <li key={asset} className="flex items-center justify-between gap-2 font-mono text-[10px] text-white/48">
                        <span className="truncate">{asset}</span>
                        <button type="button" onClick={() => upsert(unmarkAssetInProject(selected, asset, kind))} className="text-white/25 hover:text-rose-200">✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {['VehicleData', 'sky/lighting', 'CarPhysicsData', 'police/ai'].map(sample => (
                <button key={sample} type="button" onClick={() => upsert(markAssetInProject(selected, sample, 'modified'))} className="rounded-md border border-white/[0.08] px-2.5 py-1 font-mono text-[10px] text-white/48 hover:border-gold/30 hover:text-gold">+ {sample}</button>
              ))}
              <span className="text-[10px] text-white/28">— exemples de session (l'index réel arrive avec Frosty Support)</span>
            </div>
          </section>

          {/* Build */}
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><Hammer size={12} />Build du mod</p>
            {ready && <div className="mb-3 space-y-1">
              {ready.issues.length === 0
                ? <p className="flex items-center gap-1.5 text-[11px] text-emerald-300/75"><Check size={12} />Projet prêt ✓</p>
                : ready.issues.map((issue, i) => (
                  <p key={i} className={`flex items-center gap-1.5 text-[11px] ${issue.severity === 'error' ? 'text-rose-200/80' : 'text-amber-200/70'}`}>
                    {issue.severity === 'error' ? <Info size={11} /> : <Info size={11} />}{issue.message}
                  </p>
                ))}
            </div>}
            {error && <p className="mb-2 rounded-lg border border-rose-300/20 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-200/85">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={buildMod} disabled={!ready?.ok || pipeline.stage === 'validating' || pipeline.stage === 'resolving' || pipeline.stage === 'writing' || pipeline.stage === 'packaging'} className="flex items-center gap-1.5 rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40"><Play size={12} />Build & Test</button>
              {pipeline.stage !== 'idle' && <div className="flex flex-1 items-center gap-2">
                <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-[var(--zailon-accent)] transition-all" style={{ width: `${Math.round(pipeline.progress * 100)}%` }} />
                </div>
                <span className="font-mono text-[10px] capitalize text-white/45">{pipeline.stage === 'done' ? 'terminé' : pipeline.stage === 'failed' ? 'échec' : pipeline.stage}</span>
              </div>}
            </div>
            {pipeline.stage === 'done' && <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="w-full text-[11px] text-emerald-300/80">Mod créé — est. {formatSize(estimateFrostyModSize(selected))}</p>
              <button type="button" onClick={() => { const game = games.find(g => g.id === selected.gameId); if (game) { setSelectedGame(game.id); setView('games') } }} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/60 hover:border-gold/30 hover:text-gold">Installer dans un profil</button>
              <button type="button" onClick={() => setView('games')} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/60 hover:border-gold/30 hover:text-gold">Ouvrir le dossier</button>
            </div>}
            {pipeline.stage === 'failed' && <p className="mt-3 text-[11px] text-rose-200/80">{pipeline.error}</p>}
            {selected.buildHistory.length > 0 && <div className="mt-3 border-t border-white/[0.06] pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-white/32">Historique</p>
              <ul className="space-y-0.5">
                {[...selected.buildHistory].reverse().slice(0, 4).map(build => (
                  <li key={build.buildNumber} className="flex justify-between font-mono text-[10px] text-white/42">
                    <span>Build {build.buildNumber} · v{build.version}</span>
                    <span>{build.status === 'built' ? `✓ ${formatSize(build.estimatedSize)}` : '✕'}</span>
                  </li>
                ))}
              </ul>
            </div>}
          </section>

          {/* Runtime officiel (spec §86) */}
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><Package size={12} />Runtime Frosty officiel<ZailonInfoPopover text="Jamais bundle (licence CC BY-NC-ND — docs/frosty-license-audit.md) : ZAILON détecte l'installation officielle Frosty (ModManager/Editor/Cmd) près du jeu ou dans addon-data, puis la pilote en Worker séparé." /></p>
            {detectedRuntime
              ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/[0.05] px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200/90"><Check size={12} />Détecté · {detectedRuntime.exe} <span className="font-mono text-[9px] text-emerald-200/50">({detectedRuntime.kind})</span></p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-white/45">{detectedRuntime.path}</p>
                </div>
                <span className="font-mono text-[10px] text-white/40">{formatSize(detectedRuntime.size)}</span>
              </div>
              : <div className="mt-2 flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
                <p className="text-[11px] text-white/45">{detecting ? 'Détection en cours…' : 'Aucun runtime Frosty officiel détecté pour ce jeu.'}</p>
                {!detecting && <button type="button" onClick={() => setDetecting(true)} className="rounded-md border border-white/[0.09] px-2 py-1 text-[10px] text-white/50 hover:border-gold/30 hover:text-gold">Réessayer</button>}
              </div>}
          </section>

          {/* Worker + Diagnostic */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><Server size={12} />FrostyEditorWorker<ZailonInfoPopover text="Processus isolé : parsers, plugins et assets lourds tournent ici. Un crash redémarre le Worker, jamais ZAILON (spec §76-78). Fermer l'éditeur → réchauffé 45 s puis arrêt : la RAM Frosty est entièrement libérée (§79-81)." /></p>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
                <span className="text-[11px] text-white/50">État</span>
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${worker.state === 'warm' ? 'text-emerald-300/80' : worker.state === 'starting' ? 'text-gold' : worker.state === 'crashed' ? 'text-rose-200/80' : 'text-white/40'}`}>
                  <CircleDot size={11} />{worker.state === 'warm' ? 'actif (réchauffé)' : worker.state === 'starting' ? 'démarrage' : worker.state === 'crashed' ? 'crash — redémarrage' : 'arrêté — 0 RAM Frosty'}
                </span>
              </div>
              {worker.lastError && <p className="mt-2 text-[11px] text-rose-200/75">{worker.lastError}</p>}
              {worker.disabledPlugins.length > 0 && <p className="mt-2 text-[11px] text-amber-200/75">Plugins désactivés (2 crashs) : {worker.disabledPlugins.join(', ')}</p>}
              {nativeWorker && <div className="mt-2 flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-300/85"><CircleDot size={10} />PID {nativeWorker.pid} · {nativeWorker.running ? 'en cours' : 'terminé'}</span>
                <span className="font-mono text-[10px] text-white/40">{nativeWorker.memoryMb !== null ? `${nativeWorker.memoryMb} Mo RAM` : '—'}</span>
              </div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {detectedRuntime && !nativeWorker?.running && <button type="button" onClick={() => void startNativeWorker()} className="rounded-lg border border-emerald-300/25 bg-emerald-300/[0.06] px-3 py-1.5 text-[10px] font-semibold text-emerald-200/85 hover:border-emerald-300/45"><Play size={10} />Démarrer le Worker natif</button>}
                {nativeWorker?.running && <button type="button" onClick={() => void stopNativeWorker()} className="rounded-lg border border-rose-300/25 px-3 py-1.5 text-[10px] font-semibold text-rose-200/80 hover:border-rose-300/45">Arrêter le Worker</button>}
                <button type="button" onClick={crashSimulation} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/50 hover:border-rose-300/30 hover:text-rose-200">Simuler un crash de plugin</button>
                <button type="button" onClick={() => { setWorker(workerReset(worker)); if (tickRef.current) clearInterval(tickRef.current); setPipeline({ stage: 'idle', progress: 0, issues: [] }) }} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/50 hover:border-gold/30 hover:text-gold">Réinitialiser</button>
                <button type="button" onClick={closeEditor} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/50 hover:border-gold/30 hover:text-gold">Fermer l'éditeur</button>
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><Gauge size={12} />Diagnostic<ZailonInfoPopover text={`Runtime : ${selected.frostyRuntimeVersion} · Profil : ${diagnostic?.gameProfile ?? '—'} · Index : ${diagnostic?.assetIndex ?? 'not_started'} · Plugins : ${diagnostic?.pluginsLoaded ?? 0} · Projet : ${diagnostic?.projectValid ? 'valide' : 'problèmes'} · Cache mémoire : ${diagnostic?.memoryCacheMb ?? 0} Mo`} /></p>
              <dl className="space-y-1.5">
                {([['Runtime', selected.frostyRuntimeVersion], ['Profil', diagnostic?.gameProfile ?? '—'], ['Index assets', diagnostic?.assetIndex ?? 'not_started'], ['Plugins chargés', String(diagnostic?.pluginsLoaded ?? 0)], ['Projet', diagnostic?.projectValid ? 'Valide ✓' : 'Problèmes'], ['Cache mémoire', `${diagnostic?.memoryCacheMb ?? 0} Mo`]] as const).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/12 px-3 py-1.5">
                    <dt className="text-[11px] text-white/48">{k}</dt>
                    <dd className="text-[11px] font-semibold text-white/72">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-white/30"><CloudOff size={11} className="mt-0.5 flex-shrink-0" />{FROSTY_LICENSE_POLICY.externalRuntime} — {FROSTY_LICENSE_POLICY.license}. Attribution : {FROSTY_LICENSE_POLICY.attribution}.</p>
            </section>
          </div>

          {/* Asset Browser + éditeur EBX (spec §14-22) */}
          {ebxAsset
            ? <EbxEditorPanel
                asset={ebxAsset}
                onBack={() => setEbxAsset(null)}
                onSave={issueCount => { upsert(markAssetInProject(selected, ebxAsset.id, 'modified')); setEbxAsset(null); if (issueCount === 0) setError(undefined) }}
              />
            : <AssetBrowserPanel
                gameKey={selected.gameId}
                gamePath={frostyGame?.execPath ?? undefined}
                runtimePath={detectedRuntime?.path}
                frostyVersion={selected.frostyRuntimeVersion}
                favorites={selected.favorites}
                onToggleFavorite={assetId => upsert(toggleFavorite(selected, assetId))}
                onAddToProject={asset => upsert(markAssetInProject(selected, asset.id, 'modified'))}
                onOpenEbx={asset => setEbxAsset(asset)}
                onBulkExport={assets => setBulkAssets(assets)}
              />}

          {/* Plugin Manager + Bulk Export (spec §40-45) */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PluginManagerPanel />
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><HardDrive size={12} />Bulk Export<ZailonInfoPopover text="Export en masse des assets sélectionnés dans l'Asset Browser : textures DDS, meshes et audio EALayer3 — en arrière-plan, jamais bloquant (§44-45)." /></p>
              <p className="mt-2 text-[11px] text-white/45">Sélectionnez des assets dans l'Asset Browser, puis lancez l'export en masse.</p>
              <button type="button" onClick={() => setBulkAssets([])} className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/55 hover:border-gold/30 hover:text-gold"><Download size={13} />Ouvrir Bulk Export</button>
              <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-white/30"><Info size={11} className="mt-0.5 flex-shrink-0" />Formats selon les plugins Frosty réels — jamais d'export inventé si le backend ne le supporte pas (§26, §44).</p>
            </section>
          </div>
        </div>}
    </div>

    {/* Dialogue création */}
    {creating && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setCreating(false)}>
      <section className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <h3 className="font-display text-base font-bold text-white">Nouveau projet Frosty</h3>
        <p className="mt-1 text-[11px] text-white/45">{frostyGame?.name ?? 'Sélectionnez un jeu Frostbite.'} · Runtime {runtime ?? '1.0.6.3'} · stocké hors du dossier du jeu</p>
        <label className="mt-4 block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Nom du projet</span>
          <input autoFocus value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createProject() }} placeholder="Ex. NFS Night Visuals" className="mt-1.5 w-full rounded-lg border border-white/[0.09] bg-black/25 px-3 py-2 text-xs text-white/75 outline-none focus:border-gold/30" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-white/[0.09] px-4 py-2 text-[11px] font-semibold text-white/55 hover:bg-white/[0.05]">Annuler</button>
          <button type="button" onClick={createProject} disabled={!frostyGame} className="rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">Créer</button>
        </div>
      </section>
    </div>}

    {/* Dialogue Export projet (spec §107-108) */}
    {exporting && selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setExporting(false)}>
      <section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-white">Exporter le projet</h3>
          <button type="button" onClick={() => setExporting(false)} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/50 hover:text-white"><X size={13} /></button>
        </div>
        <p className="mt-1 text-[11px] text-white/45">Sources d'édition (.zailon-frosty-project) — <b className="text-white/70">jamais de caches ni de builds</b>. Le profil partage le .fbmod final ; le projet partage les sources (§107, §109).</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-md bg-white/[0.05] px-2 py-1 text-white/55">{selected.modifiedAssets.length + selected.addedAssets.length} assets</span>
          <span className="rounded-md bg-white/[0.05] px-2 py-1 text-white/55">{selected.autosaves.length} autosaves</span>
          <span className="rounded-md bg-white/[0.05] px-2 py-1 text-white/55">{selected.buildHistory.length} builds (référencés, jamais embarqués)</span>
        </div>
        <pre className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-white/[0.07] bg-black/25 p-3 font-mono text-[10px] leading-relaxed text-white/55">{frostyProjectArchiveText(selected)}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setExporting(false)} className="rounded-lg border border-white/[0.09] px-4 py-2 text-[11px] font-semibold text-white/55 hover:bg-white/[0.05]">Fermer</button>
          <button type="button" onClick={() => { void native.saveFrostyProjectArchive(buildFrostyProjectArchive(selected), selected.name).then(ok => { if (ok) setExporting(false) }) }} className="flex items-center gap-1.5 rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Archive size={12} />Enregistrer .zailon-frosty-project</button>
        </div>
      </section>
    </div>}

    {/* Dialogue Import projet (spec §63, §108) */}
    {importing && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setImporting(false)}>
      <section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-white">Importer un projet</h3>
          <button type="button" onClick={() => setImporting(false)} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/50 hover:text-white"><X size={13} /></button>
        </div>
        <p className="mt-1 text-[11px] text-white/45">Collez le manifest du projet .zailon-frosty-project. Conversion non destructive : l'original reste inchangé, une copie ZAILON est créée (§63).</p>
        <textarea value={importText} onChange={event => setImportText(event.target.value)} rows={10} placeholder='{ "schema": 1, "kind": "zailon-frosty-project", ... }' className="mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 p-3 font-mono text-[10px] leading-relaxed text-white/70 outline-none focus:border-gold/30" spellCheck={false} />
        {importResult && <p className={`mt-2 rounded-lg px-3 py-2 text-[11px] ${importResult.startsWith('✓') ? 'bg-emerald-300/[0.08] text-emerald-200/85' : 'bg-rose-300/[0.08] text-rose-200/85'}`}>{importResult}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setImporting(false)} className="rounded-lg border border-white/[0.09] px-4 py-2 text-[11px] font-semibold text-white/55 hover:bg-white/[0.05]">Fermer</button>
          <button type="button" onClick={() => {
            const parsed = parseFrostyProjectExport(importText)
            if (!parsed.ok) { setImportResult(`✕ ${parsed.error}`); return }
            const project = createFrostyProject({
              id: createId(),
              name: parsed.manifest.name,
              gameId: parsed.manifest.gameId,
              gameName: parsed.manifest.gameName,
              gameVersion: parsed.manifest.gameVersion,
              editorProjectsRoot: 'ZAILON_DATA/editor-projects',
              frostyRuntimeVersion: parsed.manifest.frostyRuntimeVersion,
            })
            upsert({
              ...project,
              modifiedAssets: parsed.manifest.modifiedAssets,
              addedAssets: parsed.manifest.addedAssets,
              removedAssets: parsed.manifest.removedAssets,
              assetNotes: parsed.manifest.assetNotes,
              favorites: parsed.manifest.favorites,
              bookmarks: parsed.manifest.bookmarks,
            })
            setSelectedId(project.id)
            setImportResult('✓ Projet importé — copie ZAILON créée, original intact.')
            setImportText('')
          }} disabled={!importText.trim()} className="rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">Importer</button>
        </div>
      </section>
    </div>}

    {/* Bulk Export (spec §44-45) */}
    {bulkAssets !== null && <BulkExportDialog assets={bulkAssets} onClose={() => setBulkAssets(null)} />}

    {/* Command palette éditeur (spec §72-73) */}
    {paletteOpen && <FrostyCommandPalette
      actions={editorActions}
      onClose={() => setPaletteOpen(false)}
    />}
  </div>
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} Ko`
  return `${bytes} o`
}

function runtimeFor(gameName: string): string {
  return FROSTY_RUNTIME_BY_GAME[gameName] ?? '1.0.6.x'
}

function GamepadIcon({ size }: { size?: number }) {
  return <svg width={size ?? 12} height={size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" /><rect width="20" height="12" x="2" y="6" rx="2" /></svg>
}
