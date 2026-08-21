import { AlertTriangle, Archive, Check, Clipboard, FileArchive, FileUp, Loader2, QrCode, Share2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildProfileShareManifest, computeShareStats, countFrameworkMods, nextProfileName } from '../../lib/profileShare'
import { decodeProfileCode, encodeProfileCode, summarizeProfileCode } from '../../lib/profileShareCode'
import { native, pickProfileArchive, saveProfileArchive } from '../../lib/native'
import { appVersion, resolveProfileMods, useStore } from '../../store/useStore'
import type { Game, Profile, ProfileArchiveManifest } from '../../types'
import { ZailonSwitch } from './ZailonSwitch'

function formatBytes(size: number): string {
  if (size <= 0) return 'inconnue'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`
}

interface ImportPreview {
  manifest: ProfileArchiveManifest
  embeddedFiles: number
  warnings: string[]
  archivePath?: string
  fromCode: boolean
}

interface ProfileShareDialogProps {
  game: Game
  profile: Profile
  initialTab?: 'export' | 'import'
  onClose: () => void
}

export function ProfileShareDialog({ game, profile, initialTab = 'export', onClose }: ProfileShareDialogProps) {
  const importProfileManifest = useStore(state => state.importProfileManifest)
  const scanMods = useStore(state => state.scanMods)
  const [tab, setTab] = useState<'export' | 'import'>(initialTab)
  const [mode, setMode] = useState<'light' | 'complete'>('light')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  // Export
  const mods = useMemo(() => resolveProfileMods(game, profile), [game, profile])
  const stats = useMemo(() => computeShareStats(mods, mode), [mods, mode])
  const [copied, setCopied] = useState(false)
  const [exportCode, setExportCode] = useState<string>()

  // Import
  const [importCode, setImportCode] = useState('')
  const [preview, setPreview] = useState<ImportPreview>()
  const [extractFiles, setExtractFiles] = useState(true)

  const manifest = useMemo(() => buildProfileShareManifest({
    game,
    profile,
    mods,
    mode,
    appVersion,
  }), [game, profile, mods, mode])

  const runExport = async (destination: string) => {
    const sources = mode === 'complete'
      ? mods.flatMap(mod => mod.path ? [{ id: mod.id, name: mod.name, path: mod.path }] : [])
      : []
    await native.exportProfile(destination, manifest, mode === 'complete', sources)
  }

  const exportToFile = async () => {
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      const destination = await saveProfileArchive(`${game.name}-${profile.name}`)
      if (!destination) return
      await runExport(destination)
      setNotice(`Profil exporté (${mode === 'complete' ? 'hors ligne' : 'léger'}).`)
    } catch (caught) {
      setError(String(caught))
    } finally {
      setBusy(false)
    }
  }

  const copyCode = () => {
    setBusy(true); setError(undefined)
    try {
      const code = encodeProfileCode(manifest)
      void navigator.clipboard?.writeText(code).catch(() => undefined)
      setExportCode(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (caught) {
      setError(String(caught))
    } finally {
      setBusy(false)
    }
  }

  const pickArchive = async () => {
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      const path = await pickProfileArchive()
      if (!path) return
      const result = await native.previewProfileImport(path)
      setPreview({ manifest: result.manifest, embeddedFiles: result.embeddedFiles, warnings: result.warnings, archivePath: result.archivePath, fromCode: false })
      setImportCode('')
    } catch (caught) {
      setError(String(caught))
    } finally {
      setBusy(false)
    }
  }

  const parseCode = (text: string) => {
    setImportCode(text)
    setError(undefined); setNotice(undefined)
    const manifest = decodeProfileCode(text)
    if (manifest) {
      const frameworkCount = countFrameworkMods(manifest.mods)
      setPreview({ manifest, embeddedFiles: 0, warnings: frameworkCount ? [`${frameworkCount} framework(s) déclaré(s) dans le profil.`] : [], fromCode: true })
    } else {
      setPreview(undefined)
    }
  }

  const confirmImport = async () => {
    if (!preview) return
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      const name = nextProfileName(game.profiles.map(item => item.name), preview.manifest.profile.name)
      importProfileManifest(preview.manifest, name)
      if (preview.embeddedFiles > 0 && extractFiles && game.modsPath && preview.archivePath) {
        try {
          await native.extractProfileArchive(preview.archivePath, game.modsPath)
          await scanMods(game.id)
        } catch (caught) {
          setNotice(`Profil « ${name} » créé, mais l'extraction des fichiers intégrés a échoué : ${String(caught)}`)
          onClose()
          return
        }
      }
      setNotice(`Profil « ${name} » créé.`)
      onClose()
    } catch (caught) {
      setError(String(caught))
    } finally {
      setBusy(false)
    }
  }

  const isForeignGame = preview && preview.manifest.game.name !== game.name

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/76 p-3 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-share-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101116] shadow-[0_30px_100px_rgba(0,0,0,0.72)]"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Share2 size={16} className="text-gold" />
            <h2 id="profile-share-title" className="text-sm font-semibold text-white/90">Partager le profil</h2>
            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/45">{game.name} · {profile.name}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button>
        </header>

        <div className="flex gap-1 border-b border-white/[0.07] px-5 pt-3">
          {(['export', 'import'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setError(undefined); setNotice(undefined) }}
              className={`rounded-t-lg px-3.5 py-2 text-[11px] font-semibold transition-colors ${tab === key ? 'bg-white/[0.05] text-gold' : 'text-white/40 hover:text-white/70'}`}
            >
              {key === 'export' ? 'Exporter' : 'Importer'}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {tab === 'export' && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode('light')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${mode === 'light' ? 'border-gold/45 bg-gold/[0.07]' : 'border-white/[0.08] bg-white/[0.02] hover:border-gold/25'}`}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85"><FileArchive size={14} className="text-gold/80" />Léger</span>
                  <span className="text-[11px] leading-relaxed text-white/42">Configuration, liste des mods, versions, sources, ordre et réglages. Les mods sont retéléchargés depuis leurs sources à l'import. Taille faible.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('complete')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${mode === 'complete' ? 'border-gold/45 bg-gold/[0.07]' : 'border-white/[0.08] bg-white/[0.02] hover:border-gold/25'}`}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85"><Archive size={14} className="text-gold/80" />Hors ligne</span>
                  <span className="text-[11px] leading-relaxed text-white/42">Contient aussi les paquets de mods présents localement. Import possible sans compte ni Internet, mais peut être très lourd.</span>
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]">
                  <span className="text-white/45">{stats.totalMods} mods · {stats.frameworkCount} frameworks</span>
                  <span className="text-white/45">Sources : {stats.withSource}</span>
                  {mode === 'complete' && <span className="text-white/45">Taille estimée : <span className="font-semibold text-white/75">{formatBytes(stats.estimatedBytes)}</span></span>}
                  <span className="flex items-center gap-1.5 text-white/45">Reproductibilité : <span className={`font-semibold ${stats.reproducibility >= 100 ? 'text-emerald-300/90' : 'text-amber-300/90'}`}>{stats.reproducibility} %</span></span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${stats.reproducibility >= 100 ? 'bg-emerald-400/80' : 'bg-amber-400/80'}`} style={{ width: `${stats.reproducibility}%` }} />
                </div>
              </div>

              {stats.localWithoutSource > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300/90" />
                  <p className="text-[11px] leading-relaxed text-amber-100/75">
                    {stats.localWithoutSource} mod{stats.localWithoutSource > 1 ? 's' : ''} local{stats.localWithoutSource > 1 ? 'aux' : ''} sans source ne pourront pas être retéléchargés à l&apos;import.
                    {mode === 'complete' ? ' Ils seront inclus dans l&apos;archive.' : ' Passez en mode Hors ligne pour les inclure.'}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {mode === 'light' && (
                  <button type="button" onClick={copyCode} disabled={busy} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3.5 py-2 text-[11px] font-semibold text-white/85 hover:bg-white/[0.1] disabled:opacity-50">
                    {copied ? <Check size={13} className="text-emerald-300" /> : <Clipboard size={13} />}
                    {copied ? 'Code copié' : 'Copier un code de profil'}
                  </button>
                )}
                <button type="button" onClick={() => void exportToFile()} disabled={busy} className="flex items-center gap-2 rounded-lg bg-gold px-3.5 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:brightness-110 disabled:opacity-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                  Exporter un fichier .zailon-profile
                </button>
              </div>

              {exportCode && mode === 'light' && (
                <div className="rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70"><QrCode size={13} className="text-gold/80" />Code de profil prêt</p>
                  <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-white/45">{summarizeProfileCode(exportCode, 90)}</p>
                  <p className="mt-1.5 text-[10px] text-white/35">Collez-le dans « Importer » d'un autre ZAILON. Aucune donnée personnelle ni chemin absolu n'est inclus.</p>
                </div>
              )}
            </>
          )}

          {tab === 'import' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void pickArchive()} disabled={busy} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3.5 py-2 text-[11px] font-semibold text-white/85 hover:bg-white/[0.1] disabled:opacity-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                  Choisir un fichier .zailon-profile
                </button>
                <span className="text-[11px] text-white/35">ou collez un code :</span>
              </div>

              <textarea
                value={importCode}
                onChange={event => parseCode(event.target.value)}
                placeholder="ZAILON-PROFILE-V1:…"
                rows={3}
                spellCheck={false}
                className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/25 px-3.5 py-2.5 font-mono text-[11px] text-white/70 placeholder:text-white/25 focus:border-gold/40 focus:outline-none"
              />

              {isForeignGame && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300/90" />
                  <p className="text-[11px] leading-relaxed text-amber-100/75">Ce profil provient de « {preview?.manifest.game.name} » — il sera importé dans « {game.name} ».</p>
                </div>
              )}

              {preview && (
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-black/15 p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    <span className="font-semibold text-white/85">{preview.manifest.profile.name}</span>
                    <span className="text-white/45">{preview.manifest.mods.length} mods</span>
                    <span className="text-white/45">{preview.manifest.exportMode === 'complete' ? 'Hors ligne' : 'Léger'}</span>
                    {preview.embeddedFiles > 0 && <span className="text-white/45">{preview.embeddedFiles} fichier(s) intégré(s)</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.manifest.mods.slice(0, 12).map(mod => (
                      <span key={mod.id || mod.name} className="max-w-44 truncate rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/50" title={mod.name}>{mod.name}</span>
                    ))}
                    {preview.manifest.mods.length > 12 && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/40">+{preview.manifest.mods.length - 12}</span>}
                  </div>
                  {[...preview.warnings].map(warning => (
                    <p key={warning} className="flex items-start gap-1.5 text-[11px] text-amber-200/70"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300/80" />{warning}</p>
                  ))}
                  {preview.embeddedFiles > 0 && game.modsPath && (
                    <label className="flex items-center gap-2 text-[11px] text-white/60">
                      <ZailonSwitch size="compact" checked={extractFiles} onChange={setExtractFiles} />
                      Extraire aussi les fichiers intégrés dans le dossier Mods
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => void confirmImport()}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-3.5 py-2.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Créer un nouveau profil
                  </button>
                </div>
              )}
            </>
          )}

          {notice && <p className="rounded-lg bg-emerald-400/[0.08] px-3 py-2 text-[11px] text-emerald-200/85">{notice}</p>}
          {error && <p className="rounded-lg bg-red-400/[0.08] px-3 py-2 text-[11px] text-red-200/85">{error}</p>}
        </div>

        <footer className="border-t border-white/[0.07] px-5 py-3">
          <p className="text-[10px] leading-relaxed text-white/32">
            Gratuit et sans compte. Jamais de clés API, de jetons ou de chemins personnels (§45-46). L'import crée toujours un nouveau profil, sans écraser les existants (§37).
          </p>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
