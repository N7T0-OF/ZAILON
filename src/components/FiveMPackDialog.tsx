import { useState } from 'react'
import { AlertTriangle, Boxes, FileArchive, FolderInput, Loader2, ShieldAlert, X } from 'lucide-react'
import { native, pickPackFile } from '../lib/native'
import { planFiveMPack, type PackPlan } from '../lib/fivemPack'
import { ZailonInfoPopover } from './UI/ZailonInfoPopover'

interface Props {
  gameName: string
  onClose: () => void
}

const KIND_LABEL: Record<string, string> = {
  mods: 'mods/',
  citizen: 'citizen/',
  plugins: 'plugins/',
  'reshade-shaders': 'reshade-shaders/',
  'reshade-config': 'ReShade (preset)',
  gtav: 'GTA V (exclu)',
  unknown: 'Inconnu',
}

export function FiveMPackDialog({ gameName, onClose }: Props) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [plan, setPlan] = useState<PackPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choose = async () => {
    setBusy(true)
    setError(null)
    try {
      const path = await pickPackFile()
      if (!path) return
      const candidates = await native.scanModImport([path], gameName)
      const files = candidates.flatMap(candidate => candidate.files)
      if (!files.length) {
        setError('Aucun fichier détecté dans cette archive.')
        return
      }
      setFileName(path.split(/[\\/]/).pop() || path)
      setPlan(planFiveMPack(files))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/78"><Boxes size={14} className="text-gold" />Pack graphique FiveM</p>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-red-300/15 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/75">{error}</p>}

          {!plan ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <FileArchive size={26} className="text-white/30" />
              <p className="max-w-sm text-[11px] leading-relaxed text-white/38">Choisissez un pack <code className="text-white/60">.zip</code> / <code className="text-white/60">.rar</code> / <code className="text-white/60">.7z</code>. ZAILON l'analyse <b>sans rien installer</b> et classe son contenu (FiveM / ReShade / GTA V / inconnu).</p>
              <button type="button" onClick={() => void choose()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />}Choisir un pack</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70"><FileArchive size={13} className="text-white/40" />{fileName}</p>
                <button type="button" onClick={() => void choose()} disabled={busy} className="text-[11px] text-gold hover:underline">Re-analyser</button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['mods', plan.summary.mods],
                  ['citizen', plan.summary.citizen],
                  ['plugins', plan.summary.plugins],
                  ['ReShade', plan.summary.reshadeShaders + plan.summary.reshadeConfig],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-white/75">{count}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/60">Structure détectée <ZailonInfoPopover text="Correspondance automatique des chemins : mods/, citizen/, plugins/, reshade-shaders/ et presets ReShade. Les fichiers GTA V sont exclus — jamais copiés dans FiveM." /></p>
                <ul className="space-y-1">
                  {plan.entries.slice(0, 12).map(entry => (
                    <li key={entry.source} className="flex items-center gap-2 text-[10.5px]">
                      <span className="shrink-0 font-mono text-white/35">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-white/60" title={entry.source}>{entry.source}</span>
                      {entry.sensitive && <ShieldAlert size={11} className="shrink-0 text-amber-200/70" />}
                    </li>
                  ))}
                </ul>
                {plan.entries.length > 12 && <p className="mt-1 text-[10px] text-white/28">… {plan.entries.length - 12} autre(s) entrée(s)</p>}
              </div>

              {(plan.summary.gtav > 0 || plan.summary.unknown > 0 || plan.sensitive.length > 0) && (
                <div className="space-y-2">
                  {plan.summary.gtav > 0 && (
                    <p className="flex items-start gap-1.5 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/70"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>Ce pack contient <b>{plan.summary.gtav}</b> fichier(s) GTA V — ils ne seront <b>pas</b> copiés dans FiveM.</span></p>
                  )}
                  {plan.summary.unknown > 0 && (
                    <p className="flex items-start gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] text-white/55"><Boxes size={13} className="mt-0.5 shrink-0 text-white/40" /><span><b>{plan.summary.unknown}</b> fichier(s) non reconnu(s) — à valider avant installation.</span></p>
                  )}
                  {plan.sensitive.length > 0 && (
                    <p className="flex items-start gap-1.5 rounded-lg border border-red-300/12 bg-red-300/[0.03] px-3 py-2 text-[11px] text-red-200/70"><ShieldAlert size={13} className="mt-0.5 shrink-0" /><span><b>{plan.sensitive.length}</b> fichier(s) sensible(s) (<code className="text-white/60">.exe</code>/<code className="text-white/60">.dll</code>/<code className="text-white/60">.asi</code>) — jamais exécuté(s) automatiquement.</span></p>
                  )}
                </div>
              )}

              <p className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-[10px] leading-relaxed text-white/35">Analyse et plan d'installation — l'application réelle (copie par profil + manifeste `zailon-manifest.json` + rollback) arrive avec le backend d'installation dédié.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
