import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileStack, Loader2, RefreshCw, X } from 'lucide-react'
import { native, type VortexInstance } from '../lib/native'
import { useStore } from '../store/useStore'
import { ZailonInfoPopover } from './UI/ZailonInfoPopover'

interface Props {
  gameId: string
  gameName: string
  gameRoot: string
  onClose: () => void
}

export function VortexImportDialog({ gameId, gameName, gameRoot, onClose }: Props) {
  const importVortexDeployment = useStore(state => state.importVortexDeployment)
  const [instance, setInstance] = useState<VortexInstance | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detect = async () => {
    setBusy(true)
    setError(null)
    try {
      setInstance(await native.detectVortexInstance(gameRoot))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void detect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameRoot])

  const import_ = async () => {
    setImporting(true)
    setError(null)
    try {
      await importVortexDeployment(gameId, gameRoot)
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
          <p className="flex items-center gap-2 text-xs font-semibold text-white/78"><Download size={14} className="text-gold" />Import Vortex — {gameName}</p>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-red-300/15 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/75">{error}</p>}

          {!instance ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-white/38"><Loader2 size={14} className="animate-spin" />Détection du déploiement Vortex…</div>
          ) : !instance.exists ? (
            <div className="space-y-3 py-4 text-center">
              <FileStack size={26} className="mx-auto text-white/30" />
              <p className="max-w-sm mx-auto text-[11px] leading-relaxed text-white/38">Aucun <code className="text-white/60">vortex.deployment.json</code> détecté dans ce jeu. Vortex doit avoir déployé ses mods une première fois.</p>
              <button type="button" onClick={() => void detect()} disabled={busy} className="mx-auto flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.05] disabled:opacity-40">{busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Re-détecter</button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/60">Déploiement détecté <ZailonInfoPopover text="Vortex a déjà déployé ses mods (hardlink/symlink/move) dans le dossier du jeu. ZAILON crée un profil de RÉFÉRENCES — aucune copie, aucun lien recréé." /></p>
                <ul className="space-y-1 text-[10.5px]">
                  <li className="text-white/55">Instance : <span className="font-mono text-white/80">{instance.instance}</span></li>
                  <li className="text-white/55">{instance.mods.length} mod(s) · {instance.fileCount} fichier(s) déployé(s)</li>
                  {instance.modsDir && <li className="truncate text-white/45" title={instance.modsDir}>Staging : <span className="font-mono">{instance.modsDir}</span></li>}
                </ul>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 text-[11px] font-semibold text-white/60">Mods actifs</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {instance.mods.slice(0, 40).map(mod => (
                    <li key={mod.name} className="flex items-center gap-2 text-[10.5px]">
                      <span className="min-w-0 flex-1 truncate font-mono text-white/60" title={mod.name}>{mod.name}</span>
                      <span className="shrink-0 text-white/30">{mod.fileCount} fichier(s)</span>
                    </li>
                  ))}
                </ul>
                {instance.mods.length > 40 && <p className="mt-1 text-[10px] text-white/28">… {instance.mods.length - 40} autre(s) mod(s)</p>}
              </div>

              <p className="flex items-start gap-1.5 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-amber-100/70"><ExternalLink size={13} className="mt-0.5 shrink-0" /><span>ZAILON importe l'état du déploiement en références — il ne pilote pas Vortex et ne purge jamais ses liens. Gérer les mods reste à faire dans Vortex.</span></p>

              <button type="button" onClick={() => void import_()} disabled={importing} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">{importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Importer dans un profil « Vortex — {instance.instance} »</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
