import { useEffect, useState } from 'react'
import { CheckCircle2, Cpu, FolderCog, Loader2, Sparkles, X } from 'lucide-react'
import { native, type FiveMEnvironment } from '../lib/native'
import { DEFAULT_FIVE_M_COPY_OPTIONS, fiveMCopyActive, fiveMInitLabel, fiveMMissingItems, fiveMProfileInitState, nextCleanFiveMProfileName, type FiveMCopyOptions } from '../lib/fivemProfile'
import { useStore } from '../store/useStore'
import { ZailonInfoPopover } from './UI/ZailonInfoPopover'
import { ZailonSwitch } from './UI/ZailonSwitch'

interface Props {
  gameId: string
  gameName: string
  installRoot: string
  onClose: () => void
}

const COPY_FIELDS: Array<{ key: keyof FiveMCopyOptions; label: string }> = [
  { key: 'copyConfig', label: 'Configuration courante (citizenfx.ini)' },
  { key: 'copyMods', label: 'Mods' },
  { key: 'copyReshade', label: 'ReShade' },
  { key: 'copyPlugins', label: 'Plugins' },
  { key: 'copyGraphics', label: 'Paramètres graphiques' },
]

export function FiveMInstallAssistant({ gameId, gameName, installRoot, onClose }: Props) {
  const createFiveMProfile = useStore(state => state.createFiveMProfile)
  const existingNames = useStore(state => state.games.find(game => game.id === gameId)?.profiles.map(profile => profile.name) ?? [])
  const [env, setEnv] = useState<FiveMEnvironment | null>(null)
  const [name, setName] = useState<string>('')
  const [copyOptions, setCopyOptions] = useState<FiveMCopyOptions>(DEFAULT_FIVE_M_COPY_OPTIONS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!installRoot) return
    void (async () => {
      try {
        const detected = await native.detectFiveMEnvironment(installRoot)
        setEnv(detected)
        setName(nextCleanFiveMProfileName(existingNames))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installRoot])

  const initState = env ? fiveMProfileInitState({ mods: env.folders.mods, citizen: env.folders.citizen, plugins: env.folders.plugins, hasCitizenFxIni: env.hasCitizenFxIni }) : null
  const missing = env ? fiveMMissingItems({ mods: env.folders.mods, citizen: env.folders.citizen, plugins: env.folders.plugins, hasCitizenFxIni: env.hasCitizenFxIni }) : []

  const create = () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      createFiveMProfile(gameId, name, copyOptions)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/78"><Sparkles size={14} className="text-gold" />Assistant FiveM — {gameName}</p>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-red-300/15 bg-red-300/[0.04] px-3 py-2 text-[11px] text-red-200/75">{error}</p>}

          {!env ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-white/38"><Loader2 size={14} className="animate-spin" />Détection de l'environnement FiveM…</div>
          ) : (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/60">Détection <ZailonInfoPopover text="FiveM.app, CitizenFX.ini, dossiers mods/citizen/plugins et chemin GTA V — lecture seule, jamais codé en dur." /></p>
                <ul className="space-y-1 text-[10.5px]">
                  <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-300/80" /><span className="text-white/60">FiveM.app : <span className="font-mono text-white/80">{env.appData || `${installRoot}/FiveM.app`}</span></span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={12} className={env.gtaVPath ? 'text-emerald-300/80' : 'text-white/25'} /><span className="text-white/60">GTA V : <span className="font-mono text-white/80">{env.gtaVPath ?? 'non détecté'}</span></span></li>
                  <li className="flex items-center gap-2"><Cpu size={12} className="text-sky-300/70" /><span className="text-white/60">mods/ {env.folders.mods ? '✓' : '✕'} · citizen/ {env.folders.citizen ? '✓' : '✕'} · plugins/ {env.folders.plugins ? '✓' : '✕'} · citizenfx.ini {env.hasCitizenFxIni ? '✓' : '✕'}</span></li>
                </ul>
                {initState && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-1.5 text-[10.5px] text-white/50">
                    <FolderCog size={12} className="mt-0.5 shrink-0 text-amber-200/70" />
                    <span><b>{fiveMInitLabel(initState)}</b>{missing.length ? ` — manquant : ${missing.join(', ')}` : ''} · FiveM génère lui-même sa structure au premier lancement.</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/35">Nom du profil</span>
                  <input value={name} onChange={event => setName(event.target.value)} className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[12px] text-white/85 outline-none focus:border-gold/50" placeholder="FiveM — Clean" />
                </label>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-white/60">À copier depuis l'installation actuelle</p>
                  <div className="space-y-1.5">
                    {COPY_FIELDS.map(field => (
                      <label key={field.key} className="flex cursor-pointer items-center justify-between gap-3 text-[11px] text-white/65">
                        <span>{field.label}</span>
                        <ZailonSwitch checked={copyOptions[field.key]} onChange={checked => setCopyOptions(prev => ({ ...prev, [field.key]: checked }))} />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-white/30">Décochez tout pour un profil « propre » — l'environnement reste celui détecté, ZAILON n'y écrit qu'à la demande (mods/plugins/ReShade).</p>
                </div>
              </div>

              <button type="button" onClick={create} disabled={busy || !name.trim()} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}Créer le profil{!fiveMCopyActive(copyOptions) ? ' (propre)' : ''}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
