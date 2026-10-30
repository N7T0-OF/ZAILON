import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, FileText, FolderOpen, Gamepad2, Loader2, Network, RefreshCw, ShieldCheck } from 'lucide-react'
import { native, pickExecutable, type Open77LaunchResult, type Open77Report } from '../../lib/native'
import { resolveGameInstallation } from '../../lib/installations'
import { resolveProfileMods } from '../../store/useStore'
import type { Game, Profile } from '../../types'

interface Props {
  game: Game
  profile: Profile
  open: boolean
  onToggle: () => void
}

function cyberpunkRoot(game: Game, profile: Profile): string {
  const installation = resolveGameInstallation(game, profile)
  if (installation.rootPath) return installation.rootPath
  if (game.installDirectory) return game.installDirectory
  const executable = installation.executablePath || game.execPath || ''
  return executable.replace(/[\\/]bin[\\/]x64[\\/]Cyberpunk2077\.exe$/i, '')
}

function compactHash(hash?: string | null): string {
  return hash ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : '—'
}

export function Open77Panel({ game, profile, open, onToggle }: Props) {
  const storageKey = `zailon:open77-launcher:${game.id}`
  const root = useMemo(() => cyberpunkRoot(game, profile), [game, profile])
  const zailonPaths = useMemo(() => resolveProfileMods(game, profile)
    .filter(mod => mod.enabled)
    .flatMap(mod => mod.files || []), [game, profile])
  const [launcherPath, setLauncherPath] = useState(() => localStorage.getItem(storageKey) || '')
  const [report, setReport] = useState<Open77Report | null>(null)
  const [result, setResult] = useState<Open77LaunchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const inspect = useCallback(async (preferredPath = launcherPath) => {
    if (!native.isDesktop() || !root) return
    setBusy(true)
    setError(undefined)
    try {
      const next = await native.open77Inspect(preferredPath || null, root, zailonPaths)
      setReport(next)
      if (next.launcherPath) {
        setLauncherPath(next.launcherPath)
        localStorage.setItem(storageKey, next.launcherPath)
      }
    } catch (reason) {
      setError(String(reason))
      setReport(null)
    } finally {
      setBusy(false)
    }
  }, [launcherPath, root, storageKey, zailonPaths])

  useEffect(() => {
    void inspect()
  // Une nouvelle identité de jeu/profil déclenche une inspection ; inspect est
  // volontairement exclu pour éviter une boucle quand l'auto-détection remplit
  // le chemin du launcher.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, profile.id, root])

  const chooseLauncher = async () => {
    const selected = await pickExecutable()
    if (!selected) return
    setLauncherPath(selected)
    localStorage.setItem(storageKey, selected)
    await inspect(selected)
  }

  const launch = async (mode: 'home' | 'mods' | 'detect') => {
    if (!report?.launcherPath) return
    setBusy(true)
    setError(undefined)
    setResult(null)
    try {
      const next = await native.open77Launch(report.launcherPath, report.gameRoot, mode)
      setResult(next)
      if (mode !== 'detect') window.setTimeout(() => { void inspect(report.launcherPath || '') }, 1200)
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(report?.supported && report.launcherPath && report.gameExecutablePath)
  const conflicts = report?.projectionEntries.filter(entry => entry.conflictsWithZailon) || []

  return <section className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.018]">
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/18 bg-cyan-300/[0.05] text-cyan-200/75"><Network size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-white/80">OPEN//77</span>
        <span className="mt-0.5 block text-[11px] text-white/34">Passerelle Cyberpunk multijoueur · séparation des propriétaires de fichiers</span>
      </span>
      <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${report?.conflictCount ? 'bg-red-300/10 text-red-200/80' : ready ? 'bg-emerald-300/10 text-emerald-200/80' : 'bg-amber-300/10 text-amber-100/80'}`}>{report?.conflictCount ? `${report.conflictCount} conflit(s)` : ready ? 'Détecté' : 'À configurer'}</span>
      <ChevronDown size={13} className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div className="space-y-3 border-t border-cyan-300/10 px-4 pb-4 pt-3">
      <p className="text-[11px] leading-relaxed text-white/48">ZAILON utilise uniquement l’exécutable officiel et son journal local. Il ne copie pas OPEN//77, ne lit aucun identifiant et ne touche pas à sa session. Le launcher officiel reste seul responsable de l’authentification, du build compatible, des serveurs et de ses paquets.</p>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Status label="Launcher" ok={Boolean(report?.launcherPath)} value={report?.launcherPath || 'Non détecté'} />
        <Status label="Cyberpunk" ok={Boolean(report?.gameExecutablePath)} value={report?.gameExecutablePath || root || 'Chemin absent'} />
        <Status label="Projection OPEN//77" ok={Boolean(report?.statePath)} neutral={!report?.statePath} value={report?.statePath ? `${report.presentFiles}/${report.projectionEntries.length} fichier(s) présent(s)` : 'Pas encore appliquée'} />
        <Status label="Chemins partagés" ok={report?.conflictCount === 0} neutral={!report} value={report ? `${report.conflictCount} conflit(s) avec ${profile.name}` : 'Analyse en attente'} />
      </div>

      {report?.projectionEntries.length ? <div className="rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
        <p className="text-[11px] font-semibold text-white/68">Propriété réelle observée</p>
        <p className="mt-1 text-[11px] text-white/45">Stack : {report.stackFiles} · Monde : {report.worldFiles} · Autres : {report.otherFiles} · Absents : {report.missingFiles}</p>
      </div> : null}

      {report?.blockers.map((message, index) => <p key={`blocker-${index}`} className="flex items-start gap-2 rounded-lg border border-red-300/20 bg-red-300/[0.05] px-3 py-2 text-[11px] text-red-100/80"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-300/90" />{message}</p>)}
      {report?.warnings.map((message, index) => <p key={`warning-${index}`} className="flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/75"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300/85" />{message}</p>)}
      {error && <p className="rounded-lg border border-red-300/20 bg-red-300/[0.05] px-3 py-2 text-[11px] text-red-100/80">{error}</p>}

      {conflicts.length > 0 && <div className="rounded-lg border border-red-300/18 bg-black/15 px-3 py-2">
        <p className="text-[11px] font-semibold text-red-100/80">Fichiers revendiqués par les deux gestionnaires</p>
        <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-red-100/60">{conflicts.slice(0, 12).map(entry => <li key={entry.path}>{entry.path} · {entry.layer}</li>)}</ul>
        {conflicts.length > 12 && <p className="mt-1 text-[11px] text-white/35">+ {conflicts.length - 12} autre(s)</p>}
        <p className="mt-2 text-[11px] text-white/45">Ouvrez l’écran Mods d’OPEN//77 pour restaurer ou désactiver son jeu de fichiers, ou désactivez les mêmes paquets dans le profil ZAILON. ZAILON n’écrase jamais ce conflit automatiquement.</p>
      </div>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void inspect()} disabled={busy || !root} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/65 hover:border-cyan-300/30 hover:text-cyan-100 disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Analyser</button>
        <button type="button" onClick={() => void chooseLauncher()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/65 hover:border-cyan-300/30 hover:text-cyan-100 disabled:opacity-40"><FolderOpen size={13} />Choisir Open77Launcher.exe</button>
        <button type="button" onClick={() => void launch('detect')} disabled={busy || !ready} title="Lance --detect-only : détection et hash locaux, sans réseau ni modification" className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/65 hover:border-cyan-300/30 hover:text-cyan-100 disabled:opacity-40"><ShieldCheck size={13} />Diagnostic officiel hors réseau</button>
        <button type="button" onClick={() => void launch('mods')} disabled={busy || !ready} className="flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.05] px-3 py-2 text-[11px] font-semibold text-cyan-100/80 hover:bg-cyan-300/10 disabled:opacity-40"><Gamepad2 size={13} />Ouvrir les Mods OPEN//77</button>
        <button type="button" onClick={() => void launch('home')} disabled={busy || !ready} className="flex items-center gap-1.5 rounded-lg bg-cyan-200 px-3 py-2 text-[11px] font-bold text-[#071414] hover:bg-white disabled:opacity-40"><Network size={13} />Ouvrir OPEN//77</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
        <span title={report?.launcherSha256 || ''}>Launcher SHA-256 : <span className="font-mono text-white/50">{compactHash(report?.launcherSha256)}</span></span>
        <span title={report?.gameExecutableSha256 || ''}>Jeu SHA-256 : <span className="font-mono text-white/50">{compactHash(report?.gameExecutableSha256)}</span></span>
        {report?.logPath && <button type="button" onClick={() => void native.openPath(report.logPath!)} className="flex items-center gap-1 text-white/45 hover:text-cyan-100"><FileText size={11} />Ouvrir launcher.log</button>}
        <button type="button" onClick={() => void native.openExternalUrl(report?.docsUrl || 'https://open2077.net/docs/launcher')} className="flex items-center gap-1 text-white/45 hover:text-cyan-100"><ExternalLink size={11} />Documentation officielle</button>
      </div>

      {result && <pre className={`max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 font-mono text-[11px] leading-relaxed ${result.exitCode && result.exitCode !== 0 ? 'border-red-300/20 bg-red-300/[0.04] text-red-100/75' : 'border-emerald-300/15 bg-emerald-300/[0.03] text-emerald-100/70'}`}>{result.output || `OPEN//77 ouvert (PID ${result.processId || '—'}).`}</pre>}
    </div>}
  </section>
}

function Status({ label, value, ok, neutral = false }: { label: string; value: string; ok: boolean; neutral?: boolean }) {
  return <div className="min-w-0 rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/35">{neutral ? <span className="h-2.5 w-2.5 rounded-full border border-white/25" /> : ok ? <CheckCircle2 size={11} className="text-emerald-300/80" /> : <AlertTriangle size={11} className="text-amber-300/85" />}{label}</p>
    <p className="mt-1 truncate text-[11px] text-white/60" title={value}>{value}</p>
  </div>
}
