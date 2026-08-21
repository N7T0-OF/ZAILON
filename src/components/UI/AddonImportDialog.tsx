import { AlertTriangle, CheckCircle2, ClipboardPaste, FolderOpen, Import, Loader2, Package, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ADDON_API_VERSION, checkAddonCompatibility, formatAddonSize, validateAddonManifest, ZAILON_CURRENT_VERSION, type ZailonAddonManifest } from '../../lib/addons'
import { native, pickAddonFile, pickFolder, type AddonAnalyzeResult } from '../../lib/native'
import { useStore } from '../../store/useStore'

/**
 * Importeur d'addons (spec « Refonte — système addons ») : le développeur
 * glisse un `.zip` (`.zailon-addon`), un dossier ou un `manifest.json`, ou
 * colle un manifest JSON. L'analyse (natif) lit la source SANS rien installer
 * ni exécuter — l'aperçu (nom/version/auteur, fichiers, PAK/UTOC/UCAS,
 * problèmes de sécurité) précède toujours l'installation, qui reste
 * transactionnelle (staging → swap → rollback). Aucun code contenu dans
 * l'addon n'est jamais exécuté : le manifest ne décrit que des fichiers.
 */

interface Props {
  onClose: () => void
}

type Mode = 'drop' | 'paste'

/** Problèmes bloquants : l'installation est refusée (Zip Slip, symlinks,
 * archives imbriquées, manifest manquant). Les autres issues sont des
 * avertissements. */
const BLOCKING_ISSUE_MARKERS = ['Zip Slip', 'Lien symbolique', 'Archive imbriquée', 'introuvable', 'trop volumineux', 'Trop de fichiers']

export function AddonImportDialog({ onClose }: Props) {
  const addons = useStore(state => state.addons)
  const installAddon = useStore(state => state.installAddon)

  const [mode, setMode] = useState<Mode>('drop')
  const [dragActive, setDragActive] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AddonAnalyzeResult | null>(null)
  const [manifest, setManifest] = useState<ZailonAddonManifest | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  const analyze = async (path: string) => {
    setBusy(true)
    setAnalysisError(null)
    setAnalysis(null)
    setManifest(null)
    try {
      const result = await native.addonAnalyze(path)
      setSource(path)
      setAnalysis(result)
      if (result.manifestText) {
        try {
          const validation = validateAddonManifest(JSON.parse(result.manifestText) as unknown)
          if (validation.ok && validation.manifest) setManifest(validation.manifest)
        } catch { /* le manifest invalide reste visible dans les issues */ }
      }
    } catch (error) {
      setSource(null)
      setAnalysisError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // Drag & drop depuis l'Explorateur (spec §1) : on prend la première source.
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

  const browseFile = async () => {
    const path = await pickAddonFile()
    if (path) void analyze(path)
  }
  const browseFolder = async () => {
    const path = await pickFolder('Sélectionnez le dossier de l’addon (contenant manifest.json)')
    if (path) void analyze(path)
  }

  const blockingIssues = analysis?.issues.filter(issue => BLOCKING_ISSUE_MARKERS.some(marker => issue.includes(marker))) ?? []
  const warnings = analysis?.issues.filter(issue => !BLOCKING_ISSUE_MARKERS.some(marker => issue.includes(marker))) ?? []

  const runPasteInstall = () => {
    let json: unknown
    try { json = JSON.parse(pasteText) } catch { setPasteError('Manifest JSON invalide.'); return }
    const validation = validateAddonManifest(json)
    if (!validation.ok || !validation.manifest) { setPasteError(validation.error || 'Manifest invalide.'); return }
    const compatibility = checkAddonCompatibility(validation.manifest, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds: addons.map(item => item.manifest.id) })
    if (!compatibility.ok) { setPasteError(compatibility.reasons.join(' ')); return }
    installAddon(validation.manifest, 'community')
    onClose()
  }

  const performInstall = async () => {
    if (!manifest) return
    setBusy(true)
    setAnalysisError(null)
    try {
      const compatibility = checkAddonCompatibility(manifest, { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: ADDON_API_VERSION, installedIds: addons.map(item => item.manifest.id) })
      if (!compatibility.ok) { setAnalysisError(compatibility.reasons.join(' ')); return }
      if (source && analysis) {
        const installDir = await native.addonInstallDir()
        const targetDir = `${installDir}/${manifest.id}`
        // Installation transactionnelle : staging → swap atomique → rollback.
        if (analysis.kind === 'zip') await native.addonInstallStaged(source, targetDir)
        else await native.addonInstallFolder(source, targetDir)
      }
      installAddon(manifest, 'community')
      onClose()
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const canInstall = Boolean(manifest) && blockingIssues.length === 0 && !busy

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-white">Ajouter un addon</h2>
            <p className="mt-1 text-[11px] text-white/42">ZIP · dossier · manifest.json — ou collez un manifest JSON. L'analyse précède toujours l'installation, et aucun code de l'addon n'est exécuté.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button>
        </div>

        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={() => setMode('drop')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold ${mode === 'drop' ? 'bg-gold/15 text-gold' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/70'}`}><Upload size={13} />Glisser / parcourir</button>
          <button type="button" onClick={() => setMode('paste')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold ${mode === 'paste' ? 'bg-gold/15 text-gold' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/70'}`}><ClipboardPaste size={13} />Coller un manifest JSON</button>
        </div>

        {mode === 'drop' && (
          <>
            <div
              className={`mt-3 flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${dragActive ? 'border-gold/50 bg-gold/[0.05]' : 'border-white/[0.12] bg-black/15'}`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/28"><Package size={19} /></div>
              <p className="text-xs font-semibold text-white/70">Glissez votre addon ici</p>
              <p className="text-[11px] text-white/38">ZIP · dossier · manifest.json</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => void browseFile()} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] text-white/62 hover:border-gold/25 hover:text-gold"><Upload size={12} className="mr-1 inline" />Parcourir (ZIP)</button>
                <button type="button" onClick={() => void browseFolder()} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] text-white/62 hover:border-gold/25 hover:text-gold"><FolderOpen size={12} className="mr-1 inline" />Importer un dossier</button>
              </div>
            </div>

            {busy && <p className="mt-3 flex items-center gap-2 text-[11px] text-white/55"><Loader2 size={13} className="animate-spin text-gold" />Analyse de l'addon…</p>}

            {analysisError && <p className="mt-3 rounded-lg border border-red-300/18 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/70">{analysisError}</p>}

            {analysis && !busy && (
              <div className="mt-3 space-y-2">
                {/* Aperçu avant installation (spec §2) : ce que l'addon DÉCLARE. */}
                <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                  {manifest ? (
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-gold/80"><Package size={16} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white/80">{manifest.name}</p>
                        <p className="mt-0.5 text-[10px] text-white/38">{manifest.version} · {manifest.author} · {manifest.id}</p>
                        {manifest.description && <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">{manifest.description}</p>}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-100/75">manifest.json invalide ou absent — vérifiez les problèmes ci-dessous.</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] text-white/45">{analysis.kind === 'zip' ? 'ZIP' : 'Dossier'} · {analysis.entryCount} fichier(s) · {formatAddonSize(analysis.totalSize)}</span>
                    {analysis.pakCount > 0 && <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.04] px-2 py-0.5 text-[10px] text-emerald-100/80">{analysis.pakCount} .pak</span>}
                    {analysis.utocCount > 0 && <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.04] px-2 py-0.5 text-[10px] text-sky-100/80">{analysis.utocCount} .utoc</span>}
                    {analysis.ucasCount > 0 && <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.04] px-2 py-0.5 text-[10px] text-sky-100/80">{analysis.ucasCount} .ucas</span>}
                    {analysis.hasIcon && <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] text-white/45">icône</span>}
                    {analysis.hasReadme && <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] text-white/45">README</span>}
                    {analysis.hasLicense && <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] text-white/45">licence</span>}
                  </div>
                </div>

                {blockingIssues.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-red-300/18 bg-red-300/[0.04] px-3 py-2">
                    {blockingIssues.map(issue => <p key={issue} className="flex items-start gap-2 text-[11px] text-red-200/75"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-300/90" />{issue}</p>)}
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2">
                    {warnings.map(issue => <p key={issue} className="flex items-start gap-2 text-[11px] text-amber-100/75"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300/90" />{issue}</p>)}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {mode === 'paste' && (
          <>
            <textarea value={pasteText} onChange={event => setPasteText(event.target.value)} placeholder={'{ "schemaVersion": 1, "id": "community.author.example", "name": "…", "version": "1.0.0", "author": "…" }'} rows={9} className="mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-white/70 outline-none focus:border-gold/30" spellCheck={false} />
            {pasteError && <p className="mt-2 rounded-lg border border-red-300/18 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/70">{pasteError}</p>}
            <footer className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Annuler</button>
              <button type="button" onClick={runPasteInstall} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Import size={13} />Valider et installer</button>
            </footer>
          </>
        )}

        {mode === 'drop' && (
          <footer className="mt-4 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] text-white/32"><CheckCircle2 size={11} className="text-emerald-300/70" />Aucun code exécuté — le manifest ne décrit que des fichiers.</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Annuler</button>
              <button type="button" onClick={() => void performInstall()} disabled={!canInstall} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"><Import size={13} />Installer</button>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}
