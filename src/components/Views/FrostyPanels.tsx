import {
  Check, ChevronDown, ChevronRight, Download, FileJson, FolderOpen, History, RefreshCw, Search, Star, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  filterFrostyAssets, frostyAssetBundles, frostyAssetCounts, pushSearchHistory,
  searchFrostyAssets, setFrostyIndexProgress, synthFrostyAssets, toggleAssetSelection,
  virtualizeFrostyAssets, type FrostyAsset, type FrostyAssetFilters, type FrostyAssetIndex,
  type FrostyAssetType,
} from '../../lib/frostyAssets'
import {
  assetReferences, diffEbxAsset, pointerRefActions, pointerRefsOf, referencingAssets,
  revertEbxAsset, revertEbxProperty, setEbxProperty, validateEbxAsset,
  type EbxAsset, type EbxProperty, type EbxValue,
} from '../../lib/frostyEbx'
import { gameDataSummary, gameFilesToAssetIndex, type GameDataFile } from '../../lib/frostyBridge'
import { catEntriesToAssets, parseFrostyCat } from '../../lib/frostyCat'
import {
  enablePlugin, frostyPluginRegistry, loadPluginsForType, pluginCrashed, pluginStats,
  releasePluginsForType, type FrostyPluginRuntime,
} from '../../lib/frostyPlugins'
import {
  advanceBulkExport, bulkExportFileName, bulkExportSummary, finishBulkExport,
  planBulkExport, startBulkExport, type BulkExportRun,
} from '../../lib/frostyBulk'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'
import { native } from '../../lib/native'

// ─────────────────────────────── Asset Browser ────────────────────────────

function formatScanBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} Go`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`
  return `${Math.round(bytes / 1_000)} Ko`
}

const TYPE_LABELS: Array<{ type: FrostyAssetType; label: string }> = [
  { type: 'ebx', label: 'EBX' },
  { type: 'res', label: 'RES' },
  { type: 'chunk', label: 'Chunks' },
  { type: 'texture', label: 'Textures' },
  { type: 'mesh', label: 'Meshes' },
  { type: 'audio', label: 'Audio' },
]

export function AssetBrowserPanel({ gameKey, gamePath, runtimePath, frostyVersion, favorites, onToggleFavorite, onAddToProject, onOpenEbx, onBulkExport }: {
  gameKey: string
  gamePath?: string
  runtimePath?: string
  frostyVersion: string
  favorites: string[]
  onToggleFavorite: (assetId: string) => void
  onAddToProject: (asset: FrostyAsset) => void
  onOpenEbx: (asset: FrostyAsset) => void
  onBulkExport?: (assets: FrostyAsset[]) => void
}) {
  const [index, setIndex] = useState<FrostyAssetIndex | null>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [types, setTypes] = useState<FrostyAssetType[]>([])
  const [bundle, setBundle] = useState<string | undefined>()
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [bundlesOpen, setBundlesOpen] = useState(false)
  const [realFiles, setRealFiles] = useState<GameDataFile[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [catAssets, setCatAssets] = useState<FrostyAsset[] | null>(null)
  const [catStats, setCatStats] = useState<{ count: number; bytes: number; archives: number } | null>(null)
  const [catLoading, setCatLoading] = useState(false)
  const [catView, setCatView] = useState(false)
  const WINDOW = 12

  const searchRef = useRef<HTMLInputElement>(null)

  // Index réel : les données scannées remplacent la démonstration (spec §16).
  useEffect(() => {
    setRealFiles(null)
    setCatAssets(null)
    setCatStats(null)
    setCatView(false)
  }, [gameKey, gamePath])

  // Focus de la recherche depuis la command palette (spec §72-73).
  useEffect(() => {
    const onFocus = () => { setQuery(''); searchRef.current?.focus() }
    window.addEventListener('zailon:frosty:focus-search', onFocus)
    return () => window.removeEventListener('zailon:frosty:focus-search', onFocus)
  }, [])

  // Indexation simulée en arrière-plan (spec §17 : jamais bloquant).
  useEffect(() => {
    let active = true
    let progress = 0
    const timer = setInterval(() => {
      progress = Math.min(1, progress + 0.08)
      if (!active) return
      setIndex(prev => {
        const base = prev ?? { gameKey, frostyVersion, assets: [], builtAt: 0, progress: 0 }
        const assets = base.assets.length === 0 ? synthFrostyAssets(gameKey, 'game', 420) : base.assets
        return setFrostyIndexProgress({ ...base, assets, gameKey, frostyVersion }, progress)
      })
      if (progress >= 1) clearInterval(timer)
    }, 120)
    return () => { active = false; clearInterval(timer) }
  }, [gameKey, frostyVersion])

  // Recherche debounced (§18) + historique (§98).
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query)
      setHistory(prev => pushSearchHistory(prev, query))
      setOffset(0)
    }, 180)
    return () => clearTimeout(timer)
  }, [query])

  const allAssets = index?.assets ?? []
  const activeAssets = catView && catAssets ? catAssets : allAssets
  const counts = useMemo(() => frostyAssetCounts(activeAssets), [activeAssets])
  const bundles = useMemo(() => frostyAssetBundles(activeAssets), [activeAssets])
  const results = useMemo(() => filterFrostyAssets(activeAssets, { types, bundles: bundle ? [bundle] : [], query: debounced }, debounced, 400), [activeAssets, types, bundle, debounced])
  const page = virtualizeFrostyAssets(results, offset, WINDOW)
  const indexed = (index?.progress ?? 0) >= 1
  const summary = realFiles ? gameDataSummary(realFiles) : null

  async function loadCatCatalogue() {
    if (!gamePath || !realFiles || catLoading || catAssets) return
    setCatLoading(true)
    try {
      const catFiles = realFiles.filter(file => {
        const base = (file.path.split(/[\\/]/).pop() ?? '').toLowerCase()
        return base.endsWith('.cat') || /^cat[^\/]*\.bin$/.test(base)
      })
      const assets: FrostyAsset[] = []
      let count = 0
      let bytes = 0
      const archives = new Set<number>()
      for (const file of catFiles.slice(0, 24)) {
        const raw = await native.readFrostyCatFile(gamePath, file.path)
        const parsed = parseFrostyCat(new Uint8Array(raw))
        if (parsed.ok) {
          assets.push(...catEntriesToAssets(file.path, parsed.entries))
          count += parsed.entries.length
          for (const entry of parsed.entries) {
            bytes += entry.size
            archives.add(entry.archiveIndex)
          }
        }
      }
      setCatAssets(assets)
      setCatStats({ count, bytes, archives: archives.size })
      setCatView(assets.length > 0)
    } catch { /* catalogue illisible — l'index fichiers reste */ }
    setCatLoading(false)
  }

  async function scanRealData() {
    if (!gamePath || scanning) return
    setScanning(true)
    try {
      const files = await native.scanFrostyGameData(gamePath)
      setRealFiles(files)
      setIndex(setFrostyIndexProgress({
        gameKey, frostyVersion, assets: gameFilesToAssetIndex(gameKey, frostyVersion, files), builtAt: Date.now(), progress: 1,
      }, 1))
    } catch { /* runtime indisponible — la démo reste */ }
    setScanning(false)
  }

  function toggleType(type: FrostyAssetType) {
    setTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    setOffset(0)
  }

  return <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><Search size={12} />Asset Browser<ZailonInfoPopover text="Index par jeu (cache : gameVersion + profileVersion + frostyVersion). Recherche debounced, liste virtualisée — jamais des centaines de milliers de lignes rendues (§14-18). Les assets s'ajoutent au projet, pas au jeu. L'index réel provient du scan des données du jeu (Data/)." /></p>
      <div className="flex flex-wrap items-center gap-2">
        {summary && <span className="rounded-md bg-emerald-300/[0.1] px-2 py-1 font-mono text-[9px] text-emerald-200/85">Réel ✓ {summary.count} fichiers · {formatScanBytes(summary.bytes)}</span>}
        {catStats && <span className="rounded-md bg-gold/10 px-2 py-1 font-mono text-[9px] text-gold/85">Catalogue {catStats.count} ressources · {formatScanBytes(catStats.bytes)} · {catStats.archives} cas</span>}
        {!summary && realFiles === null && <span className="font-mono text-[10px] text-white/35">démo</span>}
        {catAssets && <button type="button" onClick={() => setCatView(prev => !prev)} className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${catView ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/[0.08] text-white/45 hover:border-white/16'}`}>{catView ? 'Fichiers' : 'Catalogue (.cat)'}</button>}
        {runtimePath && gamePath && <button type="button" onClick={() => void scanRealData()} disabled={scanning || realFiles !== null} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 py-1 text-[10px] font-semibold text-white/55 hover:border-gold/30 hover:text-gold disabled:opacity-40"><Download size={10} />{scanning ? 'Scan…' : realFiles ? 'Indexé ✓' : 'Indexer le jeu'}</button>}
        {runtimePath && gamePath && realFiles && !catAssets && <button type="button" onClick={() => void loadCatCatalogue()} disabled={catLoading} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 py-1 text-[10px] font-semibold text-white/55 hover:border-gold/30 hover:text-gold disabled:opacity-40">{catLoading ? 'Chargement…' : 'Catalogue (.cat)'}</button>}
      </div>
    </div>
    {!indexed && <span className="font-mono text-[10px] text-gold/70">Indexation {Math.round((index?.progress ?? 0) * 100)} %</span>}

    {!indexed && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.round((index?.progress ?? 0) * 100)}%` }} />
    </div>}

    <div className="mt-3 flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3">
        <Search size={13} className="text-white/30" />
        <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un asset…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-white/72 outline-none" />
      </label>
      <div className="relative">
        <button type="button" onClick={() => setBundlesOpen(prev => !prev)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/58 hover:border-gold/30 hover:text-gold"><FolderOpen size={12} />{bundle ?? 'Bundles'}<ChevronDown size={11} /></button>
        {bundlesOpen && <div className="absolute right-0 z-30 mt-1 max-h-56 w-44 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#111414] p-1 shadow-2xl">
          <button type="button" onClick={() => { setBundle(undefined); setBundlesOpen(false) }} className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/[0.06]">Tous</button>
          {bundles.map(item => <button key={item} type="button" onClick={() => { setBundle(item); setBundlesOpen(false) }} className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-white/[0.06] ${bundle === item ? 'text-gold' : 'text-white/70'}`}>{item}</button>)}
        </div>}
      </div>
    </div>

    {/* Filtres par type avec compteurs */}
    <div className="mt-2 flex flex-wrap gap-1.5">
      {TYPE_LABELS.map(({ type, label }) => {
        const active = types.includes(type)
        return <button key={type} type="button" onClick={() => toggleType(type)} className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-colors ${active ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/[0.08] text-white/45 hover:border-white/16'}`}>
          {label} <span className="font-mono text-[9px] opacity-70">{counts[type]}</span>
        </button>
      })}
    </div>

    {history.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1">
      <History size={10} className="text-white/25" />
      {history.slice(0, 4).map(item => (
        <button key={item} type="button" onClick={() => setQuery(item)} className="rounded bg-white/[0.05] px-2 py-0.5 font-mono text-[9px] text-white/40 hover:text-gold">{item}</button>
      ))}
    </div>}

    {selected.length > 0 && <div className="mt-2 flex items-center justify-between rounded-lg border border-gold/20 bg-gold/[0.05] px-3 py-1.5">
      <span className="text-[10px] font-semibold text-gold/80">{selected.length} sélectionné(s)</span>
      <div className="flex items-center gap-2">
        {onBulkExport && <button type="button" onClick={() => onBulkExport(allAssets.filter(a => selected.includes(a.id)))} className="flex items-center gap-1 rounded-md bg-[var(--zailon-accent)] px-2 py-1 text-[9px] font-semibold text-[var(--zailon-accent-text)]"><Download size={9} />Bulk Export</button>}
        <button type="button" onClick={() => setSelected([])} className="text-[10px] text-white/45 hover:text-white">Effacer</button>
      </div>
    </div>}

    {/* Liste virtualisée (fenêtre) */}
    <div className="mt-3 space-y-1">
      {!indexed && page.items.length === 0 && <p className="py-4 text-center text-[11px] text-white/35">Indexation en cours…</p>}
      {indexed && page.items.length === 0 && <p className="py-4 text-center text-[11px] text-white/35">Aucun asset ne correspond.</p>}
      {page.items.map(asset => {
        const fav = favorites.includes(asset.id)
        const sel = selected.includes(asset.id)
        return <div key={asset.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${sel ? 'border-gold/30 bg-gold/[0.06]' : 'border-transparent hover:bg-white/[0.035]'}`}>
          <button type="button" onClick={() => setSelected(prev => toggleAssetSelection(prev, asset.id, 'toggle'))} className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${sel ? 'border-gold bg-gold/20 text-gold' : 'border-white/20 text-transparent hover:border-white/40'}`}><Check size={10} /></button>
          <button type="button" onClick={() => setSelected(prev => toggleAssetSelection(prev, asset.id, 'toggle'))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className={`font-mono text-[10px] ${asset.type === 'texture' ? 'text-sky-300/80' : asset.type === 'mesh' ? 'text-emerald-300/80' : asset.type === 'audio' ? 'text-violet-300/80' : asset.type === 'ebx' ? 'text-gold/85' : 'text-white/45'}`}>{asset.type.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-white/58">{asset.name}</span>
            <span className="hidden font-mono text-[9px] text-white/28 sm:block">{asset.resourceType}</span>
          </button>
          <button type="button" onClick={() => onToggleFavorite(asset.id)} title="Favori (local au projet)" className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${fav ? 'text-gold' : 'text-white/22 hover:text-white/55'}`}><Star size={11} fill={fav ? 'currentColor' : 'none'} /></button>
          {asset.type === 'ebx' && <button type="button" onClick={() => onOpenEbx(asset)} title="Éditer EBX" className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-white/30 hover:text-gold"><FileJson size={11} /></button>}
          <button type="button" onClick={() => onAddToProject(asset)} title="Ajouter au projet (modifié)" className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-white/30 hover:text-gold"><ChevronRight size={11} /></button>
        </div>
      })}
    </div>

    {/* Pagination virtuelle */}
    {page.total > WINDOW && <div className="mt-2 flex items-center justify-between">
      <span className="font-mono text-[9px] text-white/30">{page.total} résultats · fenêtre {offset + 1}–{Math.min(offset + WINDOW, page.total)}</span>
      <div className="flex gap-1.5">
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - WINDOW))} className="rounded border border-white/[0.09] px-2 py-1 text-[10px] text-white/55 disabled:opacity-30">←</button>
        <button type="button" disabled={offset + WINDOW >= page.total} onClick={() => setOffset(offset + WINDOW)} className="rounded border border-white/[0.09] px-2 py-1 text-[10px] text-white/55 disabled:opacity-30">→</button>
      </div>
    </div>}
  </section>
}

// ─────────────────────────────── Éditeur EBX ───────────────────────────────

/** Asset EBX de démonstration (alimenté par l'index — le bridge réel fournira les propriétés). */
function demoEbxAsset(asset: FrostyAsset): EbxAsset {
  const seed = asset.name.length
  const properties: EbxProperty[] = [
    { path: 'metadata.name', label: 'Nom', type: 'cstring', value: asset.name.split('/').pop() ?? 'asset', original: asset.name.split('/').pop() ?? 'asset' },
    { path: 'physics.mass', label: 'Masse', type: 'float32', value: 1200 + (seed % 500), original: 1200 + (seed % 500), min: 0, max: 20000 },
    { path: 'physics.maxSpeed', label: 'Vitesse max', type: 'int16', value: 180 + (seed % 60), original: 180 + (seed % 60), min: 0, max: 1000 },
    { path: 'visual.engine', label: 'Moteur', type: 'enum', value: 'v6', original: 'v6', enumValues: ['v4', 'v6', 'v8', 'electric'] },
    { path: 'visual.colors', label: 'Couleurs', type: 'array', value: ['noir', 'argent'], original: ['noir', 'argent'] },
    { path: 'paint.ref', label: 'Peinture', type: 'pointerref', value: { kind: 'pointerref', target: 'tex_paint', targetType: 'TextureAsset', targetName: 'vehicles/paint' }, original: { kind: 'pointerref', target: 'tex_paint', targetType: 'TextureAsset', targetName: 'vehicles/paint' } },
    { path: 'audio.engine', label: 'Son moteur', type: 'resourceref', value: { kind: 'resourceref', target: 'snd_v6' }, original: { kind: 'resourceref', target: 'snd_v6' } },
  ]
  return { id: asset.id, name: asset.name, resourceType: asset.resourceType, properties }
}

export function EbxEditorPanel({ asset, onBack, onSave }: {
  asset: FrostyAsset
  onBack: () => void
  onSave: (issues: number) => void
}) {
  const [ebx, setEbx] = useState<EbxAsset>(() => demoEbxAsset(asset))
  const [open, setOpen] = useState<string[]>([])
  const issues = useMemo(() => validateEbxAsset(ebx), [ebx])
  const diff = useMemo(() => diffEbxAsset(ebx), [ebx])
  const refs = pointerRefsOf(ebx)
  const outRefs = useMemo(() => assetReferences(ebx, [{ id: 'tex_paint', name: 'vehicles/paint' }, { id: 'snd_v6', name: 'audio/engine_v6' }]), [ebx])

  function update(path: string, value: EbxValue) {
    const result = setEbxProperty(ebx, path, value)
    setEbx(result.asset)
  }

  function toggleSection(path: string) {
    setOpen(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])
  }

  return <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
        <button type="button" onClick={onBack} className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] text-white/50 hover:border-gold/30 hover:text-gold">←</button>
        Éditeur EBX · {asset.name.split('/').pop()}
        <ZailonInfoPopover text="Propriétés typées (primitives, enums, structs, tableaux, références et PointerRef). Validation par type avant sauvegarde (§21), diff Original | Modified avec revert (§22), impact analysis des références (§100)." />
      </p>
      <button type="button" onClick={() => { onSave(issues.length); setEbx(revertEbxAsset(ebx)) }} disabled={issues.length > 0} className="flex items-center gap-1.5 rounded-lg bg-[var(--zailon-accent)] px-3 py-1.5 text-[10px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40"><Check size={11} />Sauvegarder</button>
    </div>

    {issues.length > 0 && <div className="mt-2 space-y-1 rounded-lg border border-rose-300/20 bg-rose-300/[0.05] px-3 py-2">
      {issues.slice(0, 3).map((issue, i) => <p key={i} className="text-[10px] text-rose-200/80">⚠ {issue.message} <span className="font-mono text-rose-200/50">({issue.path})</span></p>)}
    </div>}

    <div className="mt-3 space-y-1.5">
      {ebx.properties.map(property => {
        const sectionOpen = open.includes(property.path)
        const refActions = property.type === 'pointerref' ? pointerRefActions(property.value as Extract<EbxValue, { kind: 'pointerref' }>, ebx.name) : null
        return <div key={property.path} className="rounded-lg border border-white/[0.07] bg-black/15">
          <button type="button" onClick={() => toggleSection(property.path)} className="flex w-full items-center justify-between px-3 py-2">
            <span className="flex items-center gap-2 text-[11px] text-white/62">
              {refActions ? <ChevronDown size={11} className={sectionOpen ? 'rotate-180' : ''} /> : <span className="w-[11px]" />}
              <span className="font-mono text-[9px] uppercase text-white/30">{property.type}</span>
              {property.label}
            </span>
            <span className="font-mono text-[9px] text-white/28">{property.path}</span>
          </button>
          {sectionOpen && <div className="border-t border-white/[0.05] px-3 py-2">
            {property.type === 'pointerref' && refActions && typeof property.value === 'object' && property.value !== null
              ? <div className="space-y-1">
                <p className="font-mono text-[10px] text-gold/80">{refActions.goTo} <span className="text-white/35">({(property.value as { targetType?: string }).targetType ?? '—'})</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {[['Aller à l\'asset', 'goTo'], ['Copier la référence', 'copyReference'], ['Nouveau panneau', 'openInNewPanel']].map(([label, key]) => (
                    <button key={key} type="button" className="rounded border border-white/[0.09] px-2 py-1 text-[9px] text-white/55 hover:border-gold/30 hover:text-gold">{label}</button>
                  ))}
                </div>
              </div>
              : <PropertyEditor property={property} onUpdate={update} />}
          </div>}
        </div>
      })}
    </div>

    {/* Diff Original | Modified */}
    {diff.length > 0 && <div className="mt-3 rounded-lg border border-gold/20 bg-gold/[0.04] px-3 py-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gold/70">Diff · {diff.length} propriété(s) modifiée(s)</p>
      <div className="space-y-1">
        {diff.map(entry => (
          <div key={entry.path} className="flex items-center justify-between gap-2 font-mono text-[10px]">
            <span className="text-white/55">{entry.label}</span>
            <span className="flex items-center gap-1.5">
              <span className="text-rose-300/60 line-through">{String(entry.original)}</span>
              <ChevronRight size={9} className="text-white/30" />
              <span className="text-emerald-300/85">{String(entry.modified)}</span>
              <button type="button" onClick={() => setEbx(revertEbxProperty(ebx, entry.path))} className="ml-1 rounded border border-white/[0.09] px-1.5 py-0.5 text-[9px] text-white/50 hover:border-gold/30 hover:text-gold">Revert</button>
            </span>
          </div>
        ))}
      </div>
    </div>}

    {/* PointerRef + impact analysis */}
    {(refs.length > 0 || outRefs.length > 0) && <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-white/40">
      {refs.length > 0 && <span>{refs.length} PointerRef</span>}
      {outRefs.length > 0 && <span>Références : {outRefs.map(r => r.name).join(', ')}</span>}
    </div>}
  </section>
}

function PropertyEditor({ property, onUpdate }: { property: EbxProperty; onUpdate: (path: string, value: EbxValue) => void }) {
  const { type, path, value } = property
  if (type === 'bool') {
    return <label className="flex items-center gap-2 text-[11px] text-white/55">
      <input type="checkbox" checked={Boolean(value)} onChange={event => onUpdate(path, event.target.checked)} className="accent-[var(--zailon-accent)]" />
      Actif
    </label>
  }
  if (type === 'enum') {
    return <select value={String(value)} onChange={event => onUpdate(path, event.target.value)} className="w-full rounded-md border border-white/[0.09] bg-black/25 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/30">
      {(property.enumValues ?? []).map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  }
  if (type === 'array' || type === 'struct') {
    return <textarea value={JSON.stringify(value, null, 1)} onChange={event => {
      try { onUpdate(path, JSON.parse(event.target.value)) } catch { /* temporaire */ }
    }} rows={Math.min(5, JSON.stringify(value).length / 40 + 1)} className="w-full resize-none rounded-md border border-white/[0.09] bg-black/25 px-2 py-1.5 font-mono text-[10px] text-white/65 outline-none focus:border-gold/30" spellCheck={false} />
  }
  if (type === 'typeref' || type === 'resourceref' || type === 'fileref' || type === 'pointerref') {
    const ref = value as Extract<EbxValue, { kind: string }>
    return <p className="font-mono text-[10px] text-white/45">référence {ref.kind} → {ref.target ?? '—'}</p>
  }
  // numériques / texte
  if (type.startsWith('int') || type.startsWith('uint') || type.startsWith('float')) {
    return <input
      type="number"
      value={Number(value)}
      min={property.min}
      max={property.max}
      onChange={event => onUpdate(path, Number(event.target.value))}
      className="w-full rounded-md border border-white/[0.09] bg-black/25 px-2 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-gold/30"
    />
  }
  return <input value={String(value)} onChange={event => onUpdate(path, event.target.value)} className="w-full rounded-md border border-white/[0.09] bg-black/25 px-2 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-gold/30" />
}

// ─────────────────────────────── Plugin Manager ────────────────────────────

export function PluginManagerPanel({ onTriggerType }: { onTriggerType?: (type: FrostyAssetType) => void }) {
  const [registry, setRegistry] = useState<FrostyPluginRuntime[]>(() => frostyPluginRegistry())
  const stats = pluginStats(registry)

  return <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40"><RefreshCw size={12} />Plugins Frosty<ZailonInfoPopover text="Plugins internes de l'éditeur — jamais dans la page Add-ons (§42). Chargés à la demande par type d'asset (§43), désactivés après 2 crashs (§83), tous dans le Worker isolé." /></p>
    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
      <span className="rounded-md bg-white/[0.05] px-2 py-1 text-white/55">{stats.loaded} chargés</span>
      <span className="rounded-md bg-white/[0.05] px-2 py-1 text-white/40">{stats.dormant} dormants</span>
      {stats.disabled > 0 && <span className="rounded-md bg-rose-300/[0.1] px-2 py-1 text-rose-200/80">{stats.disabled} désactivés</span>}
      {stats.crashed > 0 && <span className="rounded-md bg-amber-300/[0.1] px-2 py-1 text-amber-200/80">{stats.crashed} crashés</span>}
    </div>
    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
      {registry.slice(0, 14).map(plugin => (
        <div key={plugin.name} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/12 px-2.5 py-1.5">
          <span className={`truncate font-mono text-[10px] ${plugin.state === 'disabled' ? 'text-rose-200/60 line-through' : plugin.state === 'loaded' ? 'text-gold/85' : 'text-white/55'}`}>{plugin.name}</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${plugin.state === 'loaded' ? 'bg-gold' : plugin.state === 'disabled' ? 'bg-rose-300/70' : plugin.state === 'crashed' ? 'bg-amber-300/80' : 'bg-white/18'}`} />
            {plugin.state === 'disabled' && <button type="button" onClick={() => setRegistry(prev => enablePlugin(prev, plugin.name))} title="Réactiver" className="text-[9px] text-white/45 hover:text-gold">Réactiver</button>}
          </span>
        </div>
      ))}
    </div>
    <div className="mt-3 flex flex-wrap gap-1.5">
      {(['texture', 'mesh', 'audio', 'ebx', 'res', 'chunk'] as FrostyAssetType[]).map(type => (
        <button key={type} type="button" onClick={() => { setRegistry(prev => loadPluginsForType(prev, type)); onTriggerType?.(type) }} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-white/50 hover:border-gold/30 hover:text-gold">Charger · {type}</button>
      ))}
      <button type="button" onClick={() => setRegistry(prev => pluginCrashed(prev, 'MeshSetPlugin'))} className="rounded-md border border-rose-300/20 px-2 py-1 text-[10px] text-rose-200/60 hover:border-rose-300/40">Simuler crash MeshSetPlugin</button>
    </div>
  </section>
}

// ─────────────────────────────── Command Palette éditeur (spec §72-73) ──────

export interface FrostyPaletteAction {
  id: string
  label: string
  detail: string
  shortcut?: string
  run: () => void
}

/** Petite palette de commandes propre à l'éditeur (Ctrl+K, spec §72). */
export function FrostyCommandPalette({ actions, onClose }: { actions: FrostyPaletteAction[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? actions.filter(action => (action.label + ' ' + action.detail).toLowerCase().includes(q)) : actions
  }, [actions, query])

  useEffect(() => { setActive(0) }, [query])

  function pick(index: number) {
    const action = results[index]
    if (!action) return
    action.run()
    onClose()
  }

  return <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-24 backdrop-blur-sm" onClick={onClose}>
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-[#111414] shadow-2xl" onClick={event => event.stopPropagation()}>
      <label className="flex items-center gap-2 border-b border-white/[0.07] px-4">
        <Search size={14} className="text-white/30" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, results.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
            if (event.key === 'Enter') pick(active)
          }}
          placeholder="Commande Frosty Editor…"
          className="w-full bg-transparent py-3 text-xs text-white/75 outline-none"
        />
        <span className="font-mono text-[9px] text-white/25">Ctrl+K</span>
      </label>
      <ul className="max-h-80 overflow-y-auto py-1">
        {results.length === 0 && <li className="px-4 py-6 text-center text-[11px] text-white/35">Aucune commande.</li>}
        {results.map((action, index) => (
          <li key={action.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(index)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left ${index === active ? 'bg-white/[0.06]' : ''}`}
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-white/78">{action.label}</span>
                <span className="block truncate text-[10px] text-white/38">{action.detail}</span>
              </span>
              {action.shortcut && <kbd className="shrink-0 rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[9px] text-white/40">{action.shortcut}</kbd>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  </div>
}

// ─────────────────────────────── Bulk Export ───────────────────────────────

export function BulkExportDialog({ assets, onClose }: { assets: FrostyAsset[]; onClose: () => void }) {
  const [types, setTypes] = useState<FrostyAssetType[]>(['texture', 'mesh', 'audio'])
  const [output, setOutput] = useState('G:/Exports/ZailonFrosty')
  const [run, setRun] = useState<BulkExportRun | null>(null)
  const plan = useMemo(() => planBulkExport({ assets, types, outputFolder: output }), [assets, types, output])
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  function start() {
    if (plan.assets.length === 0) return
    setRun(startBulkExport(plan))
    let current = 0
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const asset = plan.assets[current]
      if (!asset) {
        setRun(prev => prev ? finishBulkExport(prev) : prev)
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }
      setRun(prev => prev ? advanceBulkExport(prev, bulkExportFileName(asset), true) : prev)
      current += 1
    }, 90)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-white">Bulk Export</h3>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/50 hover:text-white"><X size={13} /></button>
      </div>
      <p className="mt-1 text-[11px] text-white/45">Export en masse des assets sélectionnés ({assets.length}) — textures DDS, meshes, audio EALayer3, en arrière-plan (§44-45).</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['texture', 'mesh', 'audio'] as FrostyAssetType[]).map(type => (
          <label key={type} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2 text-[11px] capitalize text-white/60">
            <input type="checkbox" checked={types.includes(type)} onChange={event => setTypes(prev => event.target.checked ? [...prev, type] : prev.filter(t => t !== type))} className="accent-[var(--zailon-accent)]" />
            {type}s
          </label>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Dossier de sortie</span>
        <input value={output} onChange={event => setOutput(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/[0.09] bg-black/25 px-3 py-2 font-mono text-[11px] text-white/70 outline-none focus:border-gold/30" />
      </label>
      {run ? (
        <div className="mt-4 space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-[var(--zailon-accent)] transition-all" style={{ width: `${Math.round(run.progress * 100)}%` }} />
          </div>
          <p className="font-mono text-[10px] text-white/45">{run.stage === 'done' ? '✓ Terminé' : run.stage === 'failed' ? '✕ Échec' : `Export… ${run.exported}/${run.total}`}</p>
          {run.stage === 'done' && <p className="text-[11px] text-emerald-300/80">{bulkExportSummary(run)}</p>}
          {run.stage === 'done' && <button type="button" onClick={onClose} className="mt-1 w-full rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Fermer</button>}
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] text-white/38">{plan.assets.length} assets · ex. {plan.assets[0] ? bulkExportFileName(plan.assets[0]) : '—'}</p>
          <button type="button" onClick={start} disabled={plan.assets.length === 0} className="flex items-center gap-1.5 rounded-lg bg-[var(--zailon-accent)] px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40"><Download size={12} />Exporter</button>
        </div>
      )}
    </section>
  </div>
}
