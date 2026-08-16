import { BookOpen, Download, Import, Link2, Loader2, Lock, Package, Power, RefreshCw, Search, ShieldCheck, Trash2, Wand2, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  ADDON_API_VERSION,
  ADDON_CATEGORY_LABELS,
  ADDON_PERMISSION_LABELS,
  ADDON_INSTALL_PHASES,
  addonCatalogStats,
  catalogAddonAvailability,
  checkAddonCompatibility,
  estimateInstalledSize,
  formatAddonSize,
  OFFICIAL_ADDON_CATALOG,
  OFFICIAL_ADDON_REPOSITORY_URL,
  planAddonUninstall,
  resolveAddonDependencies,
  validateAddonManifest,
  ZAILON_CURRENT_VERSION,
  type AddonCatalog,
  type AddonCatalogEntry,
  type AddonPermission,
  type InstalledAddon,
  type ZailonAddonManifest,
} from '../../lib/addons'
import { ADDON_INSTALL_INITIAL_STATE, addonInstallReducer, addonSignaturePolicy, addonStorageReport, describeAddonDownloadError, fetchAddonCatalog, hasAddonSignature, hasRealSha256, mirrorAddonUrl, type CatalogFetchResult } from '../../lib/addonsInstall'
import { native } from '../../lib/native'
import { useStore } from '../../store/useStore'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'
import { ZailonSwitch } from '../UI/ZailonSwitch'

// Documentation développeur (spec §30) : dans le même repository que le
// catalogue, sous docs/addon-development.
const ADDON_DOCS_URL = 'https://github.com/N7T0-OF/ZAILON/tree/main/zailon-addons/docs/addon-development'
// v2 : le cache v1 contenait des URLs `latest/download` fragiles (spec §3, §33)
// — invalidation forcée au changement de schéma du catalogue.
// v4 : invalide le cache v3 (schema 1, chemins `release`/URL de release) —
// sans bump, l'ancien catalogue avec les URL de release serait servi au lieu
// du schema 2 (chemins `package`) (spec §47).
const CATALOG_CACHE_KEY = 'zailon:addon-catalog:v4'

// Filtres de statut (spec §65) : la disponibilité vient du catalogue
// (package + SHA-256), jamais d'un texte écrit à la main (§47-49).
type AddonStatusFilter = 'disponibles' | 'dev' | 'updates'
type AddonFilter = 'all' | 'installed' | AddonStatusFilter | AddonCatalog['addons'][number]['category']
const FILTERS: Array<{ id: AddonFilter; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'installed', label: 'Installés' },
  { id: 'disponibles', label: 'Disponibles' },
  { id: 'updates', label: 'Mises à jour' },
  { id: 'dev', label: 'En développement' },
  { id: 'game-support', label: 'Jeux' },
  { id: 'modding', label: 'Modding' },
  { id: 'visual', label: 'Visuel' },
  { id: 'appearance', label: 'Apparence' },
  { id: 'sources', label: 'Sources' },
  { id: 'utilities', label: 'Utilitaires' },
]

const CATEGORY_ICON = (category: AddonCatalog['addons'][number]['category']) => category === 'game-support' ? Wand2 : category === 'modding' ? Package : category === 'visual' ? Zap : category === 'appearance' ? Power : category === 'sources' ? Import : BookOpen

interface CatalogRow {
  entry: AddonCatalogEntry
  installed?: InstalledAddon
}

const timeAgoShort = (at: number) => {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 60) return `il y a ${seconds} s`
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`
  return `il y a ${Math.floor(seconds / 3600)} h`
}

/** Carte de synthèse cliquable — « N disponibles · N installés · N mises à
 * jour » (spec §45) : le clic active le filtre correspondant. */
function StatCard({ label, value, active, accent, onClick }: {
  label: string
  value: number
  active?: boolean
  accent: string
  onClick: () => void
}) {
  return <button type="button" onClick={onClick} className={`group flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-gold/30 bg-gold/[0.07]' : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15'}`}>
    <span className="min-w-0">
      <span className={`block font-display text-xl font-bold leading-none ${accent}`}>{value}</span>
      <span className="mt-1 block truncate text-[11px] text-white/42">{label}</span>
    </span>
    {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />}
  </button>
}

const readCatalogCache = (): AddonCatalog | undefined => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null')
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.addons)) return parsed as AddonCatalog
  } catch { /* cache best-effort */ }
  return undefined
}

const writeCatalogCache = (catalog: AddonCatalog) => {
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)) } catch { /* best-effort */ }
}

const fetchCatalogJson = async (url: string) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Catalogue inaccessible (${response.status}).`)
  return response.json() as unknown
}

export function AddonsView() {
  const addons = useStore(state => state.addons)
  const installAddon = useStore(state => state.installAddon)
  const uninstallAddon = useStore(state => state.uninstallAddon)
  const setAddonEnabled = useStore(state => state.setAddonEnabled)
  const importAddonManifest = useStore(state => state.importAddonManifest)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [catalog, setCatalog] = useState<AddonCatalog>(OFFICIAL_ADDON_CATALOG)
  const [catalogState, setCatalogState] = useState<CatalogFetchResult>()
  const [syncing, setSyncing] = useState(false)
  const [confirming, setConfirming] = useState<CatalogRow>()
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string>()
  const [removing, setRemoving] = useState<CatalogRow>()

  // Ouverture d'Add-ons : cache frais (6 h) sinon réseau (spec §45 — jamais
  // au boot, uniquement à l'ouverture). Le bouton « Actualiser » force la
  // revalidation (§34).
  const syncCatalog = async (force = false) => {
    setSyncing(true)
    try {
      const result = await fetchAddonCatalog({ fallback: OFFICIAL_ADDON_CATALOG, fetchJson: fetchCatalogJson, readCache: readCatalogCache, writeCache: writeCatalogCache, force })
      setCatalog(result.catalog)
      setCatalogState(result)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { void syncCatalog() }, [])

  const catalogRows: CatalogRow[] = useMemo(() => {
    const byId = new Map(addons.map(item => [item.manifest.id, item]))
    const rows: CatalogRow[] = catalog.addons.map(entry => ({ entry, installed: byId.get(entry.id) }))
    for (const item of addons) {
      if (!rows.some(row => row.entry.id === item.manifest.id)) {
        rows.push({ entry: catalogEntryFromInstalled(item), installed: item })
      }
    }
    return rows
  }, [addons, catalog])

  // Noms humains des dépendances pour les cartes (spec §52-53).
  const catalogNameById = useMemo(() => new Map(catalog.addons.map(entry => [entry.id, entry.name])), [catalog])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return catalogRows.filter(row => {
      if (filter === 'installed' && !row.installed) return false
      if (filter === 'disponibles' && (row.installed || !catalogAddonAvailability(row.entry).installable)) return false
      if (filter === 'updates' && !(row.installed && row.entry.official && row.entry.version !== row.installed.manifest.version)) return false
      if (filter === 'dev' && (row.installed || catalogAddonAvailability(row.entry).status !== 'development')) return false
      if (filter !== 'all' && filter !== 'installed' && filter !== 'disponibles' && filter !== 'updates' && filter !== 'dev' && row.entry.category !== filter) return false
      if (!normalized) return true
      const haystack = `${row.entry.name} ${row.entry.description} ${row.entry.id}`.toLocaleLowerCase()
      return haystack.includes(normalized)
    })
  }, [catalogRows, filter, query])

  const storage = useMemo(() => {
    const knownSizes: Record<string, number> = {}
    for (const entry of catalog.addons) knownSizes[entry.id] = entry.downloadSize || 0
    return addonStorageReport(addons, { knownSizes })
  }, [addons, catalog])

  // Synthèse « N disponibles · N installés · N mises à jour » (spec §45) —
  // chaque statut vient du catalogue (package réel), jamais d'un texte écrit.
  const stats = useMemo(() => addonCatalogStats(catalogRows), [catalogRows])

  const confirm = (row: CatalogRow) => setConfirming(row)
  const remove = (row: CatalogRow) => setRemoving(row)

  const startImport = () => {
    setImportText('')
    setImportError(undefined)
    setImporting(true)
  }
  const runImport = () => {
    let json: unknown
    try { json = JSON.parse(importText) } catch { setImportError('Manifest JSON invalide.'); return }
    const result = validateAddonManifest(json)
    if (!result.ok || !result.manifest) { setImportError(result.error || 'Manifest invalide.'); return }
    const compatibility = checkAddonCompatibility(result.manifest, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds: addons.map(item => item.manifest.id) })
    if (!compatibility.ok) { setImportError(compatibility.reasons.join(' ')); return }
    const outcome = importAddonManifest(result.manifest)
    if (!outcome.ok) { setImportError(outcome.error || 'Import impossible.'); return }
    setImporting(false)
  }

  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Core léger · Add-ons à la demande</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Add-ons</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/42">Ajoutez uniquement les fonctions dont vous avez besoin.<ZailonInfoPopover text="Optionnel, chargé à la demande, fonctionne hors ligne et isolé — aucun compte ni marketplace. Un add-on non installé n'apparaît nulle part et ne tourne pas. Un add-on défectueux ne bloque jamais ZAILON." /></p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void native.openExternalUrl(ADDON_DOCS_URL)} title="Créer un add-on — documentation développeur" aria-label="Créer un add-on" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.09] text-white/62 hover:bg-white/[0.05] hover:text-white"><BookOpen size={14} /></button>
        <button type="button" onClick={() => void syncCatalog(true)} disabled={syncing} title="Actualiser le catalogue officiel" className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold disabled:opacity-40"><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />Catalogue</button>
        <button type="button" onClick={startImport} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold"><Import size={13} />Importer un add-on</button>
      </div>
    </header>

    <section className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un add-on…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-white/72 outline-none" /></label>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(item => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-lg px-3 py-1.5 text-[11px] ${filter === item.id ? 'bg-gold/15 font-semibold text-gold' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/70'}`}>{item.label}</button>)}
      </div>
    </section>

    <section className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Disponibles" value={stats.disponibles} active={filter === 'disponibles'} accent="text-emerald-200/90" onClick={() => setFilter('disponibles')} />
      <StatCard label="Installés" value={stats.installes} active={filter === 'installed'} accent="text-gold" onClick={() => setFilter('installed')} />
      <StatCard label="Mises à jour" value={stats.updates} active={filter === 'updates'} accent="text-sky-200/90" onClick={() => setFilter('updates')} />
      <StatCard label="En développement" value={stats.dev} active={filter === 'dev'} accent="text-white/60" onClick={() => setFilter('dev')} />
    </section>

    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/34">
      <span>{visible.length} affiché(s) · {formatAddonSize(storage.totalBytes)} installés</span>
      <span className="flex items-center gap-1.5">
        {catalogState?.source === 'remote' && <span className="text-emerald-200/70">Catalogue officiel à jour{catalogState.fetchedAt ? ` · ${timeAgoShort(catalogState.fetchedAt)}` : ''}</span>}
        {catalogState?.source === 'cache' && <span>Catalogue en cache{catalogState.fetchedAt ? ` · ${timeAgoShort(catalogState.fetchedAt)}` : ''}</span>}
        {catalogState?.source === 'fallback' && <span>Hors ligne — catalogue de référence</span>}
        <ZailonInfoPopover text="Le catalogue officiel est mis en cache — ZAILON fonctionne sans connexion. Les add-ons installés continuent de fonctionner hors ligne (spec §6). Un add-on n'a de bouton Installer que si le catalogue référence un package réel (chemin `package` + SHA-256 officiel, spec §5) — téléchargé directement depuis le repository statique, jamais via GitHub Releases. Installation : HTTPS → vérification SHA-256 → extraction → échange atomique → vérification de santé, avec rollback (§14-15, §35, §65)." />
      </span>
    </div>

    {visible.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(row => <AddonCard
        key={row.entry.id}
        row={row}
        nameById={catalogNameById}
        offline={catalogState?.source === 'fallback'}
        onInstall={() => confirm(row)}
        onEnable={value => setAddonEnabled(row.entry.id, value)}
        onRemove={() => remove(row)}
      />)}
    </div> : <section className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/28"><Package size={19} /></div>
      <h2 className="mt-3 text-sm font-semibold text-white/66">Aucun add-on trouvé</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/36">Modifiez la recherche ou les filtres — ou importez un add-on communautaire (.zailon-addon).</p>
    </section>}

    <p className="mt-5 max-w-3xl text-[10px] leading-relaxed text-white/26">Les add-ons officiels sont gérés avec les mêmes permissions que les add-ons communautaires. Aucun compte, aucune marketplace : les add-ons communautaires s'importent localement depuis GitHub ou un site (§7-8).</p>

    {confirming && <AddonInstallDialog
      row={confirming}
      installedIds={addons.map(item => item.manifest.id)}
      catalogEntries={catalogRows.map(item => item.entry)}
      onClose={() => setConfirming(undefined)}
      onInstalled={manifest => { installAddon(manifest, 'official'); setConfirming(undefined) }}
      onImportLocal={() => { setConfirming(undefined); startImport() }}
    />}
    {removing && <AddonRemoveDialog
      row={removing}
      dependents={planAddonUninstall(removing.entry.id, addons).dependents}
      onClose={() => setRemoving(undefined)}
      onConfirm={() => { const plan = uninstallAddon(removing.entry.id); if (plan.dependents.length === 0) setRemoving(undefined) }}
    />}
    {importing && <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setImporting(false) }}>
      <section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-display text-base font-bold text-white">Importer un add-on</h2><p className="mt-1 text-[11px] text-white/42">Collez le manifest JSON d'un add-on communautaire (.zailon-addon). Les permissions seront affichées avant l'installation.</p></div><button type="button" onClick={() => setImporting(false)} aria-label="Fermer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button></div>
        <textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder={'{ "schema": 1, "id": "community.author.example", ... }'} rows={9} className="mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-white/70 outline-none focus:border-gold/30" spellCheck={false} />
        {importError && <p className="mt-2 rounded-lg border border-red-300/18 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/70">{importError}</p>}
        <footer className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setImporting(false)} className="px-3 py-2 text-[11px] text-white/45">Annuler</button><button type="button" onClick={runImport} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Import size={13} />Valider et installer</button></footer>
      </section>
    </div>}
  </div>
}

function catalogEntryFromInstalled(item: InstalledAddon): AddonCatalogEntry {
  return {
    id: item.manifest.id,
    name: item.manifest.name,
    version: item.manifest.version,
    category: item.manifest.category,
    package: null,
    sha256: '',
    minZailonVersion: item.manifest.minZailonVersion,
    maxZailonVersion: item.manifest.maxZailonVersion,
    permissions: item.manifest.permissions,
    description: item.manifest.description,
    dependencies: item.manifest.dependencies,
    official: false,
  }
}

function AddonCard({ row, nameById, offline = false, onInstall, onEnable, onRemove }: {
  row: CatalogRow
  /** Nom humain par id d'add-on — dépendances affichées lisiblement (§52-53). */
  nameById: Map<string, string>
  /** Hors connexion : catalogue de référence servi, aucun téléchargement (§22). */
  offline?: boolean
  onInstall: () => void
  onEnable: (value: boolean) => void
  onRemove: () => void
}) {
  const { entry, installed } = row
  const Icon = CATEGORY_ICON(entry.category)
  const updateAvailable = Boolean(installed && entry.official && entry.version !== installed.manifest.version)
  const compatibility = checkAddonCompatibility(entry, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds: [] })
  const incompatible = !compatibility.ok && !installed
  const installedSize = installed ? estimateInstalledSize(entry.downloadSize || 1_000_000) : 0
  // Disponibilité réelle (spec §5, §49) : le bouton Installer n'existe que si
  // le catalogue référence un package réel — jamais pour un add-on en
  // développement. Hors ligne : pas de téléchargement possible (§22). Un
  // add-on INCOMPATIBLE (ex. version ZAILON insuffisante, spec §2) ne montre
  // jamais Installer : refus AVANT tout téléchargement.
  const availability = catalogAddonAvailability(entry)
  const installableNow = availability.installable && !offline && compatibility.ok

  return <article className={`flex flex-col rounded-xl border bg-white/[0.018] p-4 transition-colors ${installed ? 'border-gold/14' : 'border-white/[0.07] hover:border-white/15'} ${installed && !installed.enabled ? 'opacity-75' : ''}`}>
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gold/80"><Icon size={17} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="truncate font-display text-base font-bold text-white">{entry.name}</h2>
          {entry.official ? <span className="rounded-full bg-gold/12 px-2 py-0.5 text-[10px] font-semibold text-gold">Officiel ✓</span> : <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/42">Local</span>}
          {installed ? (
            updateAvailable
              ? <span className="rounded-full bg-emerald-300/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-200/80">Màj disponible</span>
              : <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/42">Installé</span>
          ) : availability.installable
            ? offline
              ? <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/42">Hors connexion</span>
              : <span className="rounded-full bg-emerald-300/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-200/80">Disponible</span>
            : availability.status === 'error'
              ? <span className="rounded-full bg-red-300/12 px-2 py-0.5 text-[10px] font-semibold text-red-200/80">Erreur</span>
              : <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/42">En développement</span>}
          {installed && !installed.enabled && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/42">Désactivé</span>}
        </div>
        <p className="mt-1 text-[10px] font-mono text-white/28" title={entry.id}>{entry.id}</p>
      </div>
    </div>
    <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-white/42">{entry.description}</p>
    <div className="mt-2 flex flex-wrap gap-1">
      <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">{ADDON_CATEGORY_LABELS[entry.category]}</span>
      <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">v{entry.version}</span>
      {entry.downloadSize ? <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">{formatAddonSize(entry.downloadSize)} téléchargement{installed ? ` · ~${formatAddonSize(installedSize)} installé` : ''}</span> : null}
      {entry.permissions.length > 0 && <PermissionsButton permissions={entry.permissions} />}
      {entry.dependencies?.length ? <span className="flex items-center gap-1 rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/46"><Link2 size={10} className="text-white/30" />Nécessite {entry.dependencies.map(id => nameById.get(id) || id).join(', ')}<ZailonInfoPopover text={entry.dependencies.map(id => `${nameById.get(id) || id} (${id})`).join(' · ')} /></span> : null}
    </div>
    {installed && (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/34">
        <span className="rounded bg-white/[0.03] px-1.5 py-0.5 font-mono">API v{installed.manifest.minAddonApiVersion || '1'}</span>
        {(installed.manifest.events?.length || 0) > 0 && <span className="rounded bg-white/[0.03] px-1.5 py-0.5">{installed.manifest.events!.length} événement(s)</span>}
        <span className="rounded bg-white/[0.03] px-1.5 py-0.5">lazy ✓</span>
      </div>
    )}
    {incompatible && <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-2.5 py-1.5 text-[10px] text-amber-100/75">{compatibility.reasons[0]}</p>}
    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
      {installed ? (
        <>
          <label className="flex items-center gap-2 text-[11px] text-white/50"><ZailonSwitch size="compact" checked={installed.enabled} onChange={onEnable} />{installed.enabled ? 'Actif' : 'Inactif'}</label>
          <div className="flex items-center gap-1.5">
            {updateAvailable && <span className="rounded bg-emerald-300/12 px-2 py-1 text-[10px] font-semibold text-emerald-200/80">Màj v{entry.version}</span>}
            <button type="button" onClick={onRemove} className="flex items-center gap-1.5 rounded-lg border border-red-300/15 px-3 py-1.5 text-[11px] font-semibold text-red-200/65 hover:bg-red-400/10"><Trash2 size={12} />Désinstaller</button>
          </div>
        </>
      ) : installableNow ? (
        <button type="button" onClick={onInstall} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--zailon-accent)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] transition-colors hover:bg-white"><Download size={12} />Installer</button>
      ) : availability.status === 'error' ? (
        <div className="ml-auto flex items-center gap-1.5">
          <ZailonInfoPopover text={availability.reason ?? 'Le catalogue référence un package incohérent — actualisez-le.'} />
          <button type="button" disabled className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-red-300/15 px-3.5 py-1.5 text-[11px] font-semibold text-red-200/45 opacity-60"><Package size={12} />Erreur</button>
        </div>
      ) : offline && availability.installable ? (
        <div className="ml-auto flex items-center gap-1.5">
          <ZailonInfoPopover text="Hors connexion — le package n'est pas dans le cache local. Réessayez avec une connexion Internet." />
          <button type="button" disabled className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/[0.08] px-3.5 py-1.5 text-[11px] font-semibold text-white/25 opacity-60"><Package size={12} />Hors connexion</button>
        </div>
      ) : (
        <div className="ml-auto flex items-center gap-1.5">
          <ZailonInfoPopover text={availability.reason ?? 'En développement — aucun package construit pour cette version.'} />
          <button type="button" disabled className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/[0.08] px-3.5 py-1.5 text-[11px] font-semibold text-white/25 opacity-60"><Package size={12} />En développement</button>
        </div>
      )}
    </div>
  </article>
}

function AddonInstallDialog({ row, installedIds, catalogEntries, onClose, onInstalled, onImportLocal }: {
  row: CatalogRow
  installedIds: string[]
  catalogEntries: AddonCatalogEntry[]
  onClose: () => void
  onInstalled: (manifest: ZailonAddonManifest) => void
  /** Bascule vers « Importer un add-on » (fallback manuel, spec §23-24). */
  onImportLocal: () => void
}) {
  const { entry } = row
  const catalogById = new Map(catalogEntries.map(item => [item.id, item]))
  const dependencyPlan = resolveAddonDependencies(entry.id, catalogById, new Set(installedIds))
  const signaturePolicy = addonSignaturePolicy(entry)
  const compatibility = checkAddonCompatibility(entry, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds })
  // Garde absolue (spec §5, §49) : jamais d'installation sans package réel.
  const availability = catalogAddonAvailability(entry)
  const [deps, setDeps] = useState(entry.dependencies?.length ? true : false)
  const [run, setRun] = useState<{ state: ReturnType<typeof addonInstallReducer> | undefined; error?: string }>({ state: undefined })
  // Machine d'état du pipeline partagée entre `installOne` (dépendances puis
  // add-on) et `startInstall` — réinitialisée à chaque lancement.
  let state: ReturnType<typeof addonInstallReducer> = ADDON_INSTALL_INITIAL_STATE
  const [lastError, setLastError] = useState<ReturnType<typeof describeAddonDownloadError>>()

  const manifestFor = (item: AddonCatalogEntry): ZailonAddonManifest => ({
    schema: 1,
    id: item.id,
    name: item.name,
    version: item.version,
    author: 'ZAILON',
    description: item.description,
    category: item.category,
    minZailonVersion: item.minZailonVersion,
    maxZailonVersion: item.maxZailonVersion,
    permissions: item.permissions,
    dependencies: item.dependencies,
    optionalDependencies: item.optionalDependencies,
  })

  const phaseLabel = (phase: string) => {
    const labels: Record<string, string> = {
      download: 'Téléchargement (HTTPS)…',
      verify: 'Vérification SHA-256…',
      staging: 'Extraction en staging…',
      swap: 'Échange atomique…',
      health: 'Vérification de santé…',
      cleanup: 'Nettoyage…',
    }
    return labels[phase] || phase
  }

  // Téléchargement HTTPS avec repli miroir (spec §7) : si l'URL principale
  // échoue ou sert un contenu invalide (page d'erreur HTML/JSON), on tente
  // une fois le miroir CDN (jsDelivr) avant de déclarer l'échec.
  const downloadWithMirror = async (downloadUrl: string, cachePath: string) => {
    try {
      await native.addonDownload(downloadUrl, cachePath, () => undefined)
    } catch (primaryError) {
      const mirror = mirrorAddonUrl(downloadUrl)
      if (!mirror) throw primaryError
      await native.addonDownload(mirror, cachePath, () => undefined)
    }
  }

  // Pipeline complet pour UN add-on (spec §3) : téléchargement → HTTP/ZIP validé
  // (Rust) → SHA-256 → signature → staging → swap atomique → santé. Réutilisé
  // pour les dépendances puis pour l'add-on lui-même (§5).
  const installOne = async (target: AddonCatalogEntry): Promise<void> => {
    const targetAvailability = catalogAddonAvailability(target)
    if (!targetAvailability.installable || !targetAvailability.downloadUrl) throw new Error('Package indisponible.')
    const installDir = await native.addonInstallDir()
    const cacheDir = installDir.replace(/installed[\\/]*$/, 'cache')
    const cachePath = `${cacheDir}/${target.id.replace(/\./g, '-')}.zailon-addon`
    const targetDir = `${installDir}/${target.id}`

    state = addonInstallReducer(state, { type: 'phase', phase: 'download', message: phaseLabel('download') })
    setRun({ state })
    await downloadWithMirror(targetAvailability.downloadUrl, cachePath)
    state = addonInstallReducer(state, { type: 'phase', phase: 'verify', message: phaseLabel('verify') })
    setRun({ state })

    // SHA-256 — sautée uniquement si le catalogue ne fournit pas encore le
    // hash réel ('catalog').
    if (target.sha256 && target.sha256 !== 'catalog') {
      const valid = await native.addonVerifySha256(cachePath, target.sha256)
      if (!valid) throw new Error('SHA-256 incorrect — installation refusée.')
    }

    // Signature Ed25519 : vérifiée quand elle est déclarée (jamais exigée
    // seule — spec §17-20).
    const targetPolicy = addonSignaturePolicy(target)
    if (targetPolicy.required && !hasAddonSignature(target)) throw new Error(targetPolicy.reason)
    if (hasAddonSignature(target)) {
      state = addonInstallReducer(state, { type: 'phase', phase: 'verify', message: 'Vérification de la signature Ed25519…' })
      setRun({ state })
      const signed = await native.addonVerifySignature(cachePath, target.signature!, target.signaturePublicKey!)
      if (!signed) throw new Error('Signature Ed25519 invalide — installation refusée.')
    }

    // Extraction en staging + swap atomique avec rollback (Rust).
    state = addonInstallReducer(state, { type: 'phase', phase: 'staging', message: phaseLabel('staging') })
    setRun({ state })
    state = addonInstallReducer(state, { type: 'phase', phase: 'swap', message: phaseLabel('swap') })
    setRun({ state })
    await native.addonInstallStaged(cachePath, targetDir)

    // Vérification de santé (spec §66) : manifest + compatibilité.
    state = addonInstallReducer(state, { type: 'phase', phase: 'health', message: phaseLabel('health') })
    setRun({ state })
    const targetManifest = manifestFor(target)
    const health = checkAddonCompatibility(targetManifest, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds: [...installedIds, targetManifest.id] })
    if (!health.ok) throw new Error(`Vérification de santé : ${health.reasons.join(' ')}`)
  }

  const startInstall = async () => {
    const manifest = manifestFor(entry)
    if (!availability.installable || !availability.downloadUrl) return
    // Refus AVANT téléchargement (spec §2) : version ZAILON insuffisante ou
    // autre incompatibilité → jamais de réseau, jamais d'extraction.
    if (!compatibility.ok) {
      setRun({ state: { status: 'failed', phase: 'download', progress: 0, message: `Installation refusée avant téléchargement : ${compatibility.reasons.join(' ')}` } })
      return
    }
    state = ADDON_INSTALL_INITIAL_STATE
    setRun({ state })
    try {
      // 0. Dépendances d'abord (spec §5, §31-33) : Frosty Support AVANT Frosty
      // Editor — chaque dépendance est installée via le même pipeline complet.
      if (deps) {
        for (const dependencyId of dependencyPlan.toInstall) {
          const dependency = catalogById.get(dependencyId)
          if (!dependency) continue
          state = addonInstallReducer(state, { type: 'phase', phase: 'download', message: `Dépendance : ${dependency.name}…` })
          setRun({ state })
          await installOne(dependency)
          useStore.getState().installAddon(manifestFor(dependency), 'official')
        }
      }
      // 1-4. L'add-on lui-même (même pipeline).
      await installOne(entry)
      state = addonInstallReducer(state, { type: 'done' })
      setRun({ state })
      onInstalled(manifest)
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : String(reason)
      // Classement (spec §23, §40-41) : 404 = package absent (jamais de retry) ;
      // 403/429 = GitHub limité ; archive invalide = HTML/JSON/ZIP cassé ;
      // sinon erreur réseau. Détails techniques ⓘ.
      const info = describeAddonDownloadError(raw)
      state = addonInstallReducer(state, { type: 'failed', message: `${info.title}. ${info.detail || ''}` })
      setRun({ state })
      setLastError(info)
    }
  }

  const running = run.state?.status === 'running'
  const finished = run.state?.status === 'done' || run.state?.status === 'failed' || run.state?.status === 'rolled_back'

  return <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !running) onClose() }}>
    <section className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gold/80"><Download size={17} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-white">{entry.name}</h2>
          <p className="mt-0.5 font-mono text-[10px] text-white/30">{entry.id} · v{entry.version}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/48">{entry.description}</p>
        </div>
        {!running && <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button>}
      </div>

      {!compatibility.ok && !running && <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-100/80">{compatibility.reasons.join(' ')}</div>}

      {!availability.installable && !running && (
        <div className={`mt-3 rounded-xl border px-4 py-3 ${availability.status === 'error' ? 'border-red-300/20 bg-red-300/[0.04]' : 'border-amber-300/20 bg-amber-300/[0.05]'}`}>
          <p className={`flex items-center gap-1.5 text-[11px] font-semibold ${availability.status === 'error' ? 'text-red-200/85' : 'text-amber-100/85'}`}><Package size={13} />{availability.status === 'error' ? 'Erreur' : 'En développement'}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/55">{availability.reason} Le bouton Installer n'est jamais proposé pour un add-on dont aucun package n'est construit (spec §5, §49).</p>
          <footer className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onImportLocal} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white/65 hover:bg-white/[0.05]"><Import size={12} />Importer manuellement</button>
            <button type="button" onClick={onClose} className="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Fermer</button>
          </footer>
        </div>
      )}

      {availability.installable && !run.state && (
        <>
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
            <p className="text-[11px] font-semibold text-white/68">Ce module demande :</p>
            <ul className="mt-2 space-y-1.5">{entry.permissions.map(permission => <li key={permission} className="flex items-start gap-2 text-[11px] text-white/55"><span className="mt-0.5 text-emerald-300/80">✓</span>{ADDON_PERMISSION_LABELS[permission as AddonPermission] || permission}</li>)}</ul>
          </div>

          {(dependencyPlan.toInstall.length > 0 || dependencyPlan.missing.length > 0) && (
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
              {/* Spec §5 : dépendance lisible — « Nécessite Frosty Support ⓘ », pas une phrase d'ids. */}
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/68"><Link2 size={12} className="text-gold/70" />Nécessite {dependencyPlan.toInstall.map(id => catalogById.get(id)?.name || id).join(', ')}{dependencyPlan.missing.length > 0 ? ` + ${dependencyPlan.missing.length} introuvable(s)` : ''}</p>
              {dependencyPlan.toInstall.length > 0 && <label className="mt-2 flex items-center gap-2 text-[11px] text-white/60"><ZailonSwitch size="compact" checked={deps} onChange={setDeps} /><strong className="text-white/75">Installer les dépendances</strong> — {dependencyPlan.toInstall.map(id => catalogById.get(id)?.name || id).join(', ')} d'abord, puis cet add-on.</label>}
              {dependencyPlan.missing.length > 0 && <p className="mt-1.5 text-[10px] text-amber-100/70">Dépendances introuvables dans le catalogue : {dependencyPlan.missing.join(', ')} — installation impossible tant qu'elles ne sont pas publiées.</p>}
            </div>
          )}

          {/* Spec §17-24 : la confiance ne bloque plus l'absence de signature —
              l'add-on officiel avec SHA-256 réel est installable. La signature
              reste VÉRIFIÉE quand elle est déclarée. Affichage : Intégrité ✓ /
              Signature. */}
          <div className="mt-3 grid gap-1.5 rounded-lg border border-white/[0.06] bg-black/15 p-3 text-[11px]">
            <p className="flex items-center gap-1.5 text-emerald-100/75"><ShieldCheck size={12} />Intégrité {hasRealSha256(entry) ? 'SHA-256 ✓' : 'à la première synchronisation'}</p>
            <p className={`flex items-center gap-1.5 ${hasAddonSignature(entry) ? 'text-emerald-100/75' : 'text-white/38'}`}><Lock size={12} />Signature {hasAddonSignature(entry) ? 'Ed25519 déclarée — vérifiée à l’installation' : 'non utilisée (recommandée, pas obligatoire — v1)'}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/34">{signaturePolicy.reason}</p>
          </div>

          {entry.downloadSize ? <p className="mt-3 text-[11px] text-white/42">{formatAddonSize(entry.downloadSize)} à télécharger · ~{formatAddonSize(estimateInstalledSize(entry.downloadSize))} installé · vérification SHA-256, signature et installation atomique.</p> : null}

          <footer className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Annuler</button><button type="button" onClick={() => { void startInstall() }} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Download size={13} />{deps && dependencyPlan.toInstall.length > 0 ? 'Installer avec les dépendances' : 'Installer'}</button></footer>
        </>
      )}

      {running && run.state && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-white/70">{run.state.message}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-gold transition-all duration-300" style={{ width: `${Math.round(run.state.progress * 100)}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-1">{ADDON_INSTALL_PHASES.map(phase => <span key={phase} className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${phase === run.state!.phase ? 'bg-gold/15 text-gold' : 'text-white/25'}`}>{phase}</span>)}</div>
        </div>
      )}

      {finished && run.state && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${run.state.status === 'done' ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100/80' : 'border-red-300/18 bg-red-300/[0.04] text-red-200/75'}`}>
          {run.state.status === 'done' ? `${entry.name} installé avec succès.` : run.state.message}
        </div>
      )}

      {finished && run.state?.status === 'done' && <footer className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Terminé</button></footer>}
      {finished && run.state?.status !== 'done' && (
        <footer className="mt-4 flex flex-wrap justify-end gap-2">
          {run.state?.status === 'failed' && (
            <>
              {lastError?.retryable && <button type="button" onClick={() => void startInstall()} className="rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.05]">Réessayer</button>}
              <button type="button" onClick={onImportLocal} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.05]"><Import size={12} />Importer manuellement</button>
              {entry.package && <button type="button" onClick={() => void native.openExternalUrl(`${OFFICIAL_ADDON_REPOSITORY_URL}${entry.package}`)} className="rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.05]">Voir le package</button>}
            </>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.12] px-4 py-2 text-[11px] font-semibold text-white/70">Fermer</button>
        </footer>
      )}
    </section>
  </div>
}

function AddonRemoveDialog({ row, dependents, onClose, onConfirm }: {
  row: CatalogRow
  dependents: string[]
  onClose: () => void
  onConfirm: () => void
}) {
  const blocked = dependents.length > 0
  return <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--zailon-danger-muted)] text-[var(--zailon-danger)]"><Trash2 size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-white">Désinstaller {row.entry.name} ?</h2>
          {blocked
            ? <p className="mt-1.5 text-[11px] leading-relaxed text-red-200/80"><strong>{dependents.length} add-on(s)</strong> dépendent de {row.entry.name} : {dependents.join(', ')}. Désinstallez-les d'abord — jamais de dépendance fantôme (§33).</p>
            : <p className="mt-1.5 text-[11px] leading-relaxed text-white/48">Le code de l'add-on sera retiré. <strong className="text-white/70">Les données utilisateur sont conservées</strong> (presets, profils, configuration) — vous pourrez réinstaller sans tout refaire (§17).</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Annuler" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button>
      </div>
      <footer className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Annuler</button><button type="button" disabled={blocked} onClick={onConfirm} className="flex items-center gap-1.5 rounded-lg bg-[var(--zailon-danger)] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-35"><Trash2 size={13} />Désinstaller</button></footer>
    </section>
  </div>
}

/** Badge 🔐 compact avec popover de permissions (spec §39) — les permissions ne
 * s'affichent qu'au clic, jamais sur la carte. */
function PermissionsButton({ permissions }: { permissions: AddonPermission[] }) {
  const [open, setOpen] = useState(false)
  return <span className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} title="Voir les permissions" className="flex items-center gap-1 rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/50 hover:bg-white/[0.07] hover:text-white"><Lock size={10} />{permissions.length}</button>
    {open && <>
      <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      <span className="absolute bottom-full left-0 z-20 mb-1.5 w-64 rounded-xl border border-white/[0.1] bg-[#121617] p-3 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Permissions</p>
        <ul className="mt-2 space-y-1">{permissions.map(permission => <li key={permission} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-white/58"><span className="mt-0.5 text-emerald-300/80">✓</span>{ADDON_PERMISSION_LABELS[permission as AddonPermission] || permission}</li>)}</ul>
      </span>
    </>}
  </span>
}
