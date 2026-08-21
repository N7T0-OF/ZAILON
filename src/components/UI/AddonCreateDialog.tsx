import { CheckCircle2, FileArchive, FolderOpen, Import, Loader2, RefreshCw, Wand2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ADDON_CATEGORY_LABELS, ADDON_PERMISSIONS, validateAddonManifest, type AddonCategory, type AddonPermission } from '../../lib/addons'
import { buildAddonManifest, suggestAddonId, suggestedExportName } from '../../lib/addonCreator'
import { native, pickFolder, saveAddonArchive, type AddonAnalyzeResult } from '../../lib/native'

/**
 * Créateur d'addon (spec « Refonte — système addons » §14) : le développeur
 * remplit un formulaire (nom, auteur, version, type, jeux, icône, fichiers),
 * ZAILON génère un manifest TOUJOURS valide, le teste, puis exporte
 * `<id>-<version>.zip` — le même fichier que l'importeur accepte. 100 % hors
 * ligne : aucun compte, aucun serveur. Le manifest ne décrit que des fichiers.
 */

interface Props {
  onClose: () => void
}

const COMMON_PERMISSIONS: AddonPermission[] = ['game.read', 'game.launch', 'mods.read', 'mods.write', 'network', 'settings']

export function AddonCreateDialog({ onClose }: Props) {
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [category, setCategory] = useState<AddonCategory>('modding')
  const [description, setDescription] = useState('')
  const [games, setGames] = useState('')
  const [permissions, setPermissions] = useState<AddonPermission[]>(['game.read'])

  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AddonAnalyzeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)

  // Suggestion d'ID tant que l'utilisateur ne l'a pas éditée.
  useEffect(() => {
    if (idTouched) return
    setId(suggestAddonId(name || 'addon', author || 'community'))
  }, [name, author, idTouched])

  const manifest = useMemo(() => {
    if (!name.trim() || !author.trim() || !id.trim()) return null
    return buildAddonManifest({
      id: id.trim(),
      name,
      author,
      version,
      description,
      category,
      permissions,
      games: games.split(',').map(game => game.trim()).filter(Boolean),
    })
  }, [id, name, author, version, description, category, permissions, games])

  const manifestValid = useMemo(() => {
    if (!manifest) return false
    const validation = validateAddonManifest(JSON.parse(JSON.stringify(manifest)) as unknown)
    return validation.ok
  }, [manifest])

  const analyze = async (path: string) => {
    setBusy(true)
    setError(null)
    setExported(null)
    try {
      setSourcePath(path)
      setAnalysis(await native.addonAnalyze(path))
    } catch (reason) {
      setSourcePath(null)
      setAnalysis(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
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
        const path = event.payload.paths[0]
        if (path) void analyze(path)
      }
    }).then(listener => {
      if (disposed) listener()
      else unlisten = listener
    }).catch(() => undefined)
    return () => { disposed = true; unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const browseFolder = async () => {
    const path = await pickFolder('Sélectionnez le dossier de l’addon (contenant les fichiers à exporter)')
    if (path) void analyze(path)
  }

  const exportZip = async () => {
    if (!manifest || !sourcePath) return
    setBusy(true)
    setError(null)
    setExported(null)
    try {
      const destination = await saveAddonArchive(suggestedExportName(manifest.id, manifest.version))
      if (!destination) return
      const result = await native.addonExportZip(sourcePath, destination, JSON.stringify(manifest, null, 2))
      setExported(`Addon exporté : ${result.outputPath} (${result.entryCount} fichiers).`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const togglePermission = (permission: AddonPermission) => {
    setPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission])
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl thin-scroll">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-white">Créer un addon</h2>
            <p className="mt-1 text-[11px] text-white/42">Remplissez le formulaire — ZAILON génère un manifest valide, le teste et exporte <code className="font-mono">id-version.zip</code>. 100 % hors ligne, aucun code exécuté.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Nom</span>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="Mon Addon" className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-white/75 outline-none focus:border-gold/30" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Auteur</span>
            <input value={author} onChange={event => setAuthor(event.target.value)} placeholder="Votre nom" className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-white/75 outline-none focus:border-gold/30" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Version</span>
            <input value={version} onChange={event => setVersion(event.target.value)} placeholder="1.0.0" className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-xs text-white/75 outline-none focus:border-gold/30" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/30">ID (immuable)</span>
            <input value={id} onChange={event => { setIdTouched(true); setId(event.target.value) }} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-xs text-white/75 outline-none focus:border-gold/30" spellCheck={false} />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Catégorie</span>
            <select value={category} onChange={event => setCategory(event.target.value as AddonCategory)} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-white/75 outline-none focus:border-gold/30">
              {Object.entries(ADDON_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Jeux (IDs, séparés par des virgules)</span>
            <input value={games} onChange={event => setGames(event.target.value)} placeholder="neverness-to-everness" className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-xs text-white/75 outline-none focus:border-gold/30" spellCheck={false} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Description</span>
            <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Que fait cet addon ?" className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-white/75 outline-none focus:border-gold/30" />
          </label>
        </div>

        <div className="mt-3">
          <span className="text-[10px] uppercase tracking-widest text-white/30">Permissions (le manifest ne décrit que des fichiers — jamais de code)</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {COMMON_PERMISSIONS.map(permission => (
              <button key={permission} type="button" onClick={() => togglePermission(permission)} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${permissions.includes(permission) ? 'border-gold/35 bg-gold/10 text-gold' : 'border-white/[0.08] text-white/38 hover:border-white/20 hover:text-white/60'}`}>{permission}</button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="text-[10px] uppercase tracking-widest text-white/30">Fichiers de l'addon (dossier source)</span>
          <div
            className={`mt-1.5 flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-5 text-center transition-colors ${dragActive ? 'border-gold/50 bg-gold/[0.05]' : 'border-white/[0.12] bg-black/15'}`}
          >
            <p className="text-[11px] text-white/55">{sourcePath ? `Dossier : ${sourcePath}` : 'Glissez votre dossier ici'}</p>
            {analysis && (
              <p className="text-[10px] text-white/38">{analysis.entryCount} fichier(s) · {analysis.pakCount} .pak · {analysis.utocCount} .utoc · {analysis.ucasCount} .ucas</p>
            )}
            <button type="button" onClick={() => void browseFolder()} className="mt-1 flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] text-white/62 hover:border-gold/25 hover:text-gold"><FolderOpen size={12} />Choisir un dossier</button>
          </div>
        </div>

        {busy && <p className="mt-3 flex items-center gap-2 text-[11px] text-white/55"><Loader2 size={13} className="animate-spin text-gold" />Analyse / export…</p>}
        {error && <p className="mt-3 rounded-lg border border-red-300/18 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/70">{error}</p>}
        {exported && <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-300/18 bg-emerald-300/[0.04] px-3 py-2 text-[11px] text-emerald-100/80"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-300/90" />{exported}</p>}

        {manifest && manifestValid && (
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-100/85"><CheckCircle2 size={13} className="text-emerald-300/90" />Manifest valide — prêt à exporter</p>
              <p className="font-mono text-[10px] text-white/35">{suggestedExportName(manifest.id, manifest.version)}</p>
            </div>
            <pre className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-[10px] leading-relaxed text-white/50 thin-scroll">{JSON.stringify(manifest, null, 2)}</pre>
          </div>
        )}

        <footer className="mt-4 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] text-white/32"><Wand2 size={11} className="text-gold/60" />Créer → tester → exporter → partager → importer.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Annuler</button>
            <button type="button" onClick={() => void exportZip()} disabled={!manifestValid || !sourcePath || busy} title={!sourcePath ? 'Choisissez d’abord le dossier des fichiers' : manifestValid ? 'Exporter l’addon en .zip' : 'Remplissez le formulaire'} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"><FileArchive size={13} />Exporter addon .zip</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
