import { useEffect, useState } from 'react'
import { Download, ExternalLink, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react'
import { native, type FrostyInstallation } from '../lib/native'
import { useStore } from '../store/useStore'
import { ZailonInfoPopover } from './UI/ZailonInfoPopover'

interface Props {
  gameId: string
  gameName: string
  extraPaths: string[]
  onClose: () => void
}

export function FrostyImportDialog({ gameId, gameName, extraPaths, onClose }: Props) {
  const importFrostyInstallation = useStore(state => state.importFrostyInstallation)
  const [installation, setInstallation] = useState<FrostyInstallation | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detect = async () => {
    setBusy(true)
    setError(null)
    try {
      setInstallation(await native.detectFrostyInstallation(extraPaths))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void detect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const import_ = async () => {
    setImporting(true)
    setError(null)
    try {
      await importFrostyInstallation(gameId, extraPaths)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/78"><FolderOpen size={14} className="text-gold" />Import Frosty — {gameName}</p>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-red-300/15 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/75">{error}</p>}

          {!installation ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-white/38"><Loader2 size={14} className="animate-spin" />Détection de l'installation Frosty…</div>
          ) : !installation.exists ? (
            <div className="space-y-3 py-4 text-center">
              <FolderOpen size={26} className="mx-auto text-white/30" />
              <p className="mx-auto max-w-sm text-[11px] leading-relaxed text-white/38">Aucun dossier de mods Frosty contenant des <code className="text-white/60">.fbmod</code> détecté. Vérifiez le dossier de mods configuré dans Frosty Mod Manager, puis re-détectez.</p>
              <button type="button" onClick={() => void detect()} disabled={busy} className="mx-auto flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.05] disabled:opacity-40">{busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Re-détecter</button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/60">Installation détectée <ZailonInfoPopover text="ZAILON liste les mods .fbmod du dossier de mods Frosty et crée un profil de RÉFÉRENCES — aucune copie, aucun lien recréé. Gérer/activer les mods reste à faire dans Frosty Mod Manager." /></p>
                <ul className="space-y-1 text-[10.5px]">
                  <li className="text-white/55">{installation.mods.length} mod(s) · {(installation.totalBytes / 1048576).toFixed(1)} Mo</li>
                  {installation.modsDir && <li className="truncate text-white/45" title={installation.modsDir}>Dossier : <span className="font-mono">{installation.modsDir}</span></li>}
                </ul>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 text-[11px] font-semibold text-white/60">Mods .fbmod</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {installation.mods.slice(0, 40).map(mod => (
                    <li key={mod.path} className="flex items-center gap-2 text-[10.5px]">
                      <span className="min-w-0 flex-1 truncate font-mono text-white/60" title={mod.name}>{mod.name}</span>
                      <span className="shrink-0 text-white/30">{(mod.size / 1048576).toFixed(1)} Mo</span>
                    </li>
                  ))}
                </ul>
                {installation.mods.length > 40 && <p className="mt-1 text-[10px] text-white/28">… {installation.mods.length - 40} autre(s) mod(s)</p>}
              </div>

              <p className="flex items-start gap-1.5 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-amber-100/70"><ExternalLink size={13} className="mt-0.5 shrink-0" /><span>ZAILON importe les .fbmod en références — il ne pilote pas Frosty et ne purge jamais ses mods. L'ordre de chargement et l'activation se gèrent dans Frosty Mod Manager.</span></p>

              <button type="button" onClick={() => void import_()} disabled={importing} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">{importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Importer dans un profil « Frosty — {installation.modsDir ? (installation.modsDir.split(/[\\/]/).filter(Boolean).pop() || 'Frosty') : 'Frosty'} »</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
