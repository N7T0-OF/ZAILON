import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import { native, type CitizenFxRead, type CitizenFxWrite, type FiveMEnvironment } from '../lib/native'
import { parseCitizenFx, removeReShade5Id, setReShade5Id } from '../lib/citizenfx'

interface Props {
  /** Racine de l'installation FiveM (dossier contenant FiveM.exe / FiveM.app). */
  installRoot: string
  onClose: () => void
}

/** Petite ligne de diagnostic ✓/✕/⚠ (spec « Support FiveM avancé » §12). */
function DiagRow({ label, ok, warning, detail }: { label: string; ok?: boolean; warning?: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {ok
        ? <CheckCircle2 size={13} className="shrink-0 text-emerald-300/80" />
        : warning
          ? <AlertTriangle size={13} className="shrink-0 text-amber-200/80" />
          : <X size={13} className="shrink-0 text-red-300/70" />}
      <span className="text-white/60">{label}</span>
      {detail && <span className="ml-auto max-w-[55%] truncate font-mono text-[10px] text-white/32" title={detail}>{detail}</span>}
    </div>
  )
}

export function FiveMReShadeDialog({ installRoot, onClose }: Props) {
  const [env, setEnv] = useState<FiveMEnvironment | null>(null)
  const [read, setRead] = useState<CitizenFxRead | null>(null)
  const [idDraft, setIdDraft] = useState('')
  const [saved, setSaved] = useState<CitizenFxWrite | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState<string | undefined>()

  const citizenfxPath = env?.appData ? `${env.appData}/citizenfx.ini` : undefined
  const currentId = read?.exists ? parseCitizenFx(read.text).reshade5Id : undefined

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setBusy(true)
      setError(null)
      try {
        const detected = await native.detectFiveMEnvironment(installRoot)
        if (cancelled) return
        setEnv(detected)
        const path = manualPath || (detected.appData ? `${detected.appData}/citizenfx.ini` : undefined)
        if (path) {
          const file = await native.readCitizenFx(path)
          if (cancelled) return
          setRead(file)
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [installRoot, manualPath])

  // Aperçu avant/après via la lib pure (jamais d'écriture avant validation).
  const preview = useMemo(() => {
    if (!read?.exists || read.text.length === 0) return null
    return { before: read.text, after: idDraft.trim() ? setReShade5Id(read.text, idDraft) : read.text }
  }, [read, idDraft])

  const save = async (text: string) => {
    if (!citizenfxPath) return
    setBusy(true)
    setError(null)
    try {
      const result = await native.writeCitizenFx(citizenfxPath, text)
      setSaved(result)
      setRead({ path: citizenfxPath, exists: true, text })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const removeLine = async () => {
    if (!read?.exists) return
    const cleaned = removeReShade5Id(read.text)
    if (cleaned !== read.text) await save(cleaned)
    else setIdDraft('')
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/78"><ShieldCheck size={14} className="text-gold" />ReShade FiveM · Intégration</p>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-red-300/15 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/75">{error}</p>}
          {saved && <p className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-[11px] text-emerald-200/80">✓ Écriture réussie{saved.backupPath ? ` — backup : ${saved.backupPath}` : ''}</p>}

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}Diagnostic FiveM</p>
            {!env ? (
              <p className="text-[11px] text-white/35">Détection en cours…</p>
            ) : (
              <div className="space-y-1.5">
                <DiagRow label="FiveM.app détecté" ok={Boolean(env.appData)} detail={env.appData || undefined} />
                <DiagRow label="CitizenFX.ini détecté" ok={env.hasCitizenFxIni} detail={env.hasCitizenFxIni ? citizenfxPath : undefined} />
                <DiagRow label="Dossiers mods / citizen / plugins" ok={env.folders.mods || env.folders.citizen || env.folders.plugins} detail={`${env.folders.mods ? 'mods ' : ''}${env.folders.citizen ? 'citizen ' : ''}${env.folders.plugins ? 'plugins' : ''}`.trim() || 'aucun'} />
                <DiagRow label="GTA V détecté" ok={Boolean(env.gtaVPath)} detail={env.gtaVPath || undefined} />
                <DiagRow label="ID ReShade5 configuré" ok={Boolean(currentId)} warning={Boolean(env.hasCitizenFxIni && !currentId)} detail={currentId ? `ID:${currentId}` : env.hasCitizenFxIni ? 'absent' : undefined} />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Assistant ID (spec §7-9)</p>
            <p className="mb-2 text-[10px] leading-relaxed text-white/35">
              Lancez FiveM → F8 → repérez l'identifiant affiché → collez-le ici. ZAILON modifie <b>uniquement</b> la ligne <code className="text-white/60">ReShade5</code> de <code className="text-white/60">[Addons]</code>, en préservant tout le reste.
            </p>
            <div className="flex items-center gap-2">
              <input
                value={idDraft}
                onChange={event => setIdDraft(event.target.value)}
                placeholder="ID FiveM (ex. 0d1dd633)"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[11px] text-white/75 outline-none focus:border-gold/30"
              />
              <button type="button" onClick={() => { if (preview) void save(preview.after) }} disabled={busy || !idDraft.trim() || !citizenfxPath} className="rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-30">Enregistrer</button>
              <button type="button" onClick={() => void removeLine()} disabled={busy || !currentId} title="Retirer la ligne ReShade5 ajoutée par ZAILON" className="rounded-lg border border-red-300/15 px-3 py-2 text-[11px] text-red-200/65 hover:bg-red-300/[0.05] disabled:opacity-30"><Trash2 size={12} /></button>
            </div>
            {preview && preview.after !== preview.before && (
              <div className="mt-3 grid gap-2">
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2">
                  <p className="mb-1 text-[9px] uppercase tracking-wider text-white/30">Avant</p>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[9.5px] leading-relaxed text-white/45">{preview.before}</pre>
                </div>
                <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.03] p-2">
                  <p className="mb-1 text-[9px] uppercase tracking-wider text-emerald-200/50">Après</p>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[9.5px] leading-relaxed text-emerald-100/70">{preview.after}</pre>
                </div>
              </div>
            )}
            {!read?.exists && <p className="mt-2 text-[10px] text-amber-100/60">CitizenFX.ini introuvable — le fichier sera créé avec la section [Addons] lors de l'enregistrement.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
