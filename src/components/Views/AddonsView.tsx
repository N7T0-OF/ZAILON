import { BookOpen, Download, Import, Package, Power, RefreshCw, Search, Trash2, Wand2, X, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  ADDON_API_VERSION,
  ADDON_CATEGORY_LABELS,
  ADDON_PERMISSION_LABELS,
  checkAddonCompatibility,
  estimateInstalledSize,
  formatAddonSize,
  OFFICIAL_ADDON_CATALOG,
  parseAddonCatalog,
  planAddonUninstall,
  resolveAddonDependencies,
  validateAddonManifest,
  ZAILON_CURRENT_VERSION,
  type AddonCategory,
  type AddonCatalogEntry,
  type AddonPermission,
  type InstalledAddon,
  type ZailonAddonManifest,
} from '../../lib/addons'
import { native } from '../../lib/native'
import { useStore } from '../../store/useStore'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'
import { ZailonSwitch } from '../UI/ZailonSwitch'

const ADDON_DOCS_URL = 'https://github.com/N7T0-OF/ZAILON/tree/main/docs/addon-development'

const FILTERS: Array<{ id: 'all' | 'installed' | AddonCategory; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'installed', label: 'Installés' },
  { id: 'game-support', label: 'Jeux' },
  { id: 'modding', label: 'Modding' },
  { id: 'visual', label: 'Visuel' },
  { id: 'appearance', label: 'Apparence' },
  { id: 'sources', label: 'Sources' },
  { id: 'utilities', label: 'Utilitaires' },
]

const CATEGORY_ICON = (category: AddonCategory) => category === 'game-support' ? Wand2 : category === 'modding' ? Package : category === 'visual' ? Zap : category === 'appearance' ? Power : category === 'sources' ? Import : BookOpen

interface CatalogRow {
  entry: AddonCatalogEntry
  installed?: InstalledAddon
}

export function AddonsView() {
  const addons = useStore(state => state.addons)
  const installAddon = useStore(state => state.installAddon)
  const uninstallAddon = useStore(state => state.uninstallAddon)
  const setAddonEnabled = useStore(state => state.setAddonEnabled)
  const importAddonManifest = useStore(state => state.importAddonManifest)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [confirming, setConfirming] = useState<CatalogRow>()
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string>()
  const [removing, setRemoving] = useState<CatalogRow>()

  const parsed = useMemo(() => parseAddonCatalog(OFFICIAL_ADDON_CATALOG), [])
  const catalogRows: CatalogRow[] = useMemo(() => {
    const byId = new Map(addons.map(item => [item.manifest.id, item]))
    const rows: CatalogRow[] = (parsed.catalog?.addons || []).map(entry => ({ entry, installed: byId.get(entry.id) }))
    // Add-ons locaux/communautaires absents du catalogue.
    for (const item of addons) {
      if (!rows.some(row => row.entry.id === item.manifest.id)) {
        rows.push({ entry: catalogEntryFromInstalled(item), installed: item })
      }
    }
    return rows
  }, [addons, parsed])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return catalogRows.filter(row => {
      if (filter === 'installed' && !row.installed) return false
      if (filter !== 'all' && filter !== 'installed' && row.entry.category !== filter) return false
      if (!normalized) return true
      const haystack = `${row.entry.name} ${row.entry.description} ${row.entry.id}`.toLocaleLowerCase()
      return haystack.includes(normalized)
    })
  }, [catalogRows, filter, query])

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
        <p className="mt-1 max-w-2xl text-xs text-white/42">Installations optionnelles : compatibilité jeux, frameworks, visuel, sources et utilitaires. Jamais chargés au démarrage — un add-on défectueux ne bloque jamais ZAILON.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void native.openExternalUrl(ADDON_DOCS_URL)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/62 hover:bg-white/[0.05]"><BookOpen size={13} />Documentation</button>
        <button type="button" onClick={startImport} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold"><Import size={13} />Importer un add-on</button>
      </div>
    </header>

    <section className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un add-on…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-white/72 outline-none" /></label>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(item => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-lg px-3 py-1.5 text-[11px] ${filter === item.id ? 'bg-gold/15 font-semibold text-gold' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/70'}`}>{item.label}</button>)}
      </div>
    </section>

    <div className="mt-4 flex items-center justify-between text-[11px] text-white/34">
      <span>{visible.length} add-on(s) · {addons.length} installé(s)</span>
      <span className="flex items-center gap-1.5"><ZailonInfoPopover text="Le catalogue officiel est mis en cache — ZAILON fonctionne sans connexion. Les add-ons installés continuent de fonctionner hors ligne (spec §6)." /></span>
    </div>

    {visible.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(row => <AddonCard
        key={row.entry.id}
        row={row}
        installedCount={addons.length}
        onInstall={() => confirm(row)}
        onEnable={value => setAddonEnabled(row.entry.id, value)}
        onRemove={() => remove(row)}
      />)}
    </div> : <section className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/28"><Package size={19} /></div>
      <h2 className="mt-3 text-sm font-semibold text-white/66">Aucun add-on trouvé</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/36">Modifiez la recherche ou les filtres — ou importez un add-on communautaire (.zailon-addon).</p>
    </section>}

    <p className="mt-5 max-w-3xl text-[10px] leading-relaxed text-white/26">Les add-ons officiels sont gérés avec les mêmes permissions que les add-ons communautaires. Aucun compte, aucune marketplace : les add-ons communautaires s'importent localement depuis GitHub, un site ou Discord (§7-8).</p>

    {confirming && <AddonInstallDialog
      row={confirming}
      installedIds={addons.map(item => item.manifest.id)}
      catalogEntries={catalogRows.map(item => item.entry)}
      onClose={() => setConfirming(undefined)}
      onInstall={(manifest, source) => { installAddon(manifest, source); setConfirming(undefined) }}
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
        <textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder="{ &quot;schema&quot;: 1, &quot;id&quot;: &quot;community.author.example&quot;, ... }" rows={9} className="mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-white/70 outline-none focus:border-gold/30" spellCheck={false} />
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
    size: 0,
    download: '',
    sha256: '',
    minZailonVersion: item.manifest.minZailonVersion,
    maxZailonVersion: item.manifest.maxZailonVersion,
    permissions: item.manifest.permissions,
    description: item.manifest.description,
    dependencies: item.manifest.dependencies,
    official: false,
  }
}

function AddonCard({ row, installedCount, onInstall, onEnable, onRemove }: {
  row: CatalogRow
  installedCount: number
  onInstall: () => void
  onEnable: (value: boolean) => void
  onRemove: () => void
}) {
  const { entry, installed } = row
  const Icon = CATEGORY_ICON(entry.category)
  const updateAvailable = Boolean(installed && entry.official && entry.version !== installed.manifest.version)
  const compatibility = checkAddonCompatibility(entry, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds: [] })
  const incompatible = !compatibility.ok && !installed
  const installedSize = installed ? estimateInstalledSize(entry.size || 1_000_000) : 0

  return <article className={`flex flex-col rounded-xl border bg-white/[0.018] p-4 transition-colors ${installed ? 'border-gold/14' : 'border-white/[0.07] hover:border-white/15'} ${installed && !installed.enabled ? 'opacity-75' : ''}`}>
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gold/80"><Icon size={17} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="truncate text-sm font-semibold text-white/84">{entry.name}</h2>
          {entry.official ? <span className="rounded-full bg-gold/12 px-2 py-0.5 text-[10px] font-semibold text-gold">Officiel ✓</span> : <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/42">Local</span>}
          {installed && !installed.enabled && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/42">Désactivé</span>}
        </div>
        <p className="mt-1 text-[10px] font-mono text-white/28" title={entry.id}>{entry.id}</p>
      </div>
    </div>
    <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-white/42">{entry.description}</p>
    <div className="mt-2 flex flex-wrap gap-1">
      <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">{ADDON_CATEGORY_LABELS[entry.category]}</span>
      <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">v{entry.version}</span>
      {entry.size > 0 && <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">{formatAddonSize(entry.size)} téléchargement{installed ? ` · ~${formatAddonSize(installedSize)} installé` : ''}</span>}
      {entry.permissions.length > 0 && <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/38">{entry.permissions.length} permission(s)</span>}
    </div>
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
      ) : (
        <button type="button" onClick={onInstall} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--zailon-accent)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] transition-colors hover:bg-white"><Download size={12} />Installer</button>
      )}
    </div>
    <p className="mt-2 text-[10px] text-white/24">{installedCount > 0 && installed ? 'Désinstaller retire le code ; les données utilisateur sont conservées (§17).' : 'Installation atomique avec vérification et rollback (§15, §65).'}</p>
  </article>
}

function AddonInstallDialog({ row, installedIds, catalogEntries, onClose, onInstall }: {
  row: CatalogRow
  installedIds: string[]
  catalogEntries: AddonCatalogEntry[]
  onClose: () => void
  onInstall: (manifest: ZailonAddonManifest, source: 'official' | 'community') => void
}) {
  const { entry } = row
  const catalogById = new Map(catalogEntries.map(item => [item.id, item]))
  const dependencyPlan = resolveAddonDependencies(entry.id, catalogById, new Set(installedIds))
  const compatibility = checkAddonCompatibility(entry, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds })
  const [deps, setDeps] = useState(entry.dependencies?.length ? true : false)

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

  const install = () => {
    if (deps) {
      for (const depId of dependencyPlan.toInstall) {
        const dep = catalogById.get(depId)
        if (dep) onInstall(manifestFor(dep), 'official')
      }
    }
    onInstall(manifestFor(entry), entry.official ? 'official' : 'community')
  }

  return <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gold/80"><Download size={17} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-white">{entry.name}</h2>
          <p className="mt-0.5 font-mono text-[10px] text-white/30">{entry.id} · v{entry.version}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/48">{entry.description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Annuler" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button>
      </div>

      {!compatibility.ok && <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-100/80">{compatibility.reasons.join(' ')}</div>}

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
        <p className="text-[11px] font-semibold text-white/68">Ce module demande :</p>
        <ul className="mt-2 space-y-1.5">{entry.permissions.map(permission => <li key={permission} className="flex items-start gap-2 text-[11px] text-white/55"><span className="mt-0.5 text-emerald-300/80">✓</span>{ADDON_PERMISSION_LABELS[permission] || permission}</li>)}</ul>
      </div>

      {(dependencyPlan.toInstall.length > 0 || dependencyPlan.missing.length > 0) && (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
          <p className="text-[11px] font-semibold text-white/68">Dépendances</p>
          {dependencyPlan.toInstall.length > 0 && <label className="mt-2 flex items-center gap-2 text-[11px] text-white/60"><input type="checkbox" checked={deps} onChange={event => setDeps(event.target.checked)} className="h-3.5 w-3.5 accent-[var(--zailon-accent)]" />Installer aussi : {dependencyPlan.toInstall.map(id => catalogById.get(id)?.name || id).join(', ')}</label>}
          {dependencyPlan.missing.length > 0 && <p className="mt-1.5 text-[10px] text-amber-100/70">Dépendances introuvables : {dependencyPlan.missing.join(', ')}</p>}
        </div>
      )}

      {entry.size > 0 && <p className="mt-3 text-[11px] text-white/42">{formatAddonSize(entry.size)} à télécharger · ~{formatAddonSize(estimateInstalledSize(entry.size))} installé · vérification SHA-256 puis installation atomique.</p>}

      <footer className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Annuler</button><button type="button" onClick={install} disabled={!compatibility.ok && dependencyPlan.missing.length === 0} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-35"><Download size={13} />Installer</button></footer>
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
