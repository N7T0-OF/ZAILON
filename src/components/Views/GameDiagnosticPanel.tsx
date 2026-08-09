import { Activity, AlertTriangle, CheckCircle2, ClipboardList, FileClock, FolderCheck, Gauge, Keyboard, Layers3, Loader2, RefreshCw, Rocket, Scale, Search, ShieldAlert, Wrench } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { inputDiagnosticRows } from '../../lib/inputBackends'
import { effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { compareFrameworkSets, fingerprintFrameworkSet } from '../../lib/lastKnownGood'
import { evaluateRed4extRepair, type Red4extRepairSummary } from '../../lib/frameworkValidator'
import { adapterFor, LAUNCH_BEHAVIOR_LABELS, SESSION_STATE_LABELS } from '../../lib/launchAdapters'
import { native, type ProfileDeploymentAudit, type QuickPanelStatus } from '../../lib/native'
import { pickPrioritySession } from '../../lib/sessionPriority'
import { useStore } from '../../store/useStore'
import type { Game, GameTestRun, Mod, Profile } from '../../types'
import { Toggle } from '../UI/Toggle'
import { formatClock, formatSeconds, formatTime, timeAgo } from '../../utils'

export interface GameHealth {
  activeMods: number
  errors: number
  warnings: number
  frameworks: string[]
  verdict: 'ok' | 'vigilance' | 'attention'
}

export function computeGameHealth(game: Game, profile: Profile, profileMods: Mod[]): GameHealth {
  const activeMods = profileMods.filter(mod => mod.enabled).length
  const errors = profileMods.filter(mod => mod.deploymentStatus === 'failed').length
  const warnings = profileMods.filter(mod => mod.deploymentStatus === 'warning' || (mod.diagnostics?.length || 0) > 0).length
  const frameworks = [...new Set(game.installedMods.map(mod => mod.framework).filter((value): value is string => Boolean(value)))]
  const verdict: GameHealth['verdict'] = errors > 0 ? 'attention' : warnings > 0 ? 'vigilance' : 'ok'
  return { activeMods, errors, warnings, frameworks, verdict }
}

const VERDICT_LABEL: Record<GameHealth['verdict'], string> = { ok: 'Bonne', vigilance: 'Vigilance', attention: 'À vérifier' }
const VERDICT_TONE: Record<GameHealth['verdict'], string> = {
  ok: 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-200',
  vigilance: 'border-amber-300/20 bg-amber-300/[0.05] text-amber-100',
  attention: 'border-red-300/20 bg-red-300/[0.05] text-red-200',
}

export function GameHealthBar({ game, profile, profileMods, onVerify }: { game: Game; profile: Profile; profileMods: Mod[]; onVerify: () => void }) {
  const health = computeGameHealth(game, profile, profileMods)
  return <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] px-4 py-2 text-[11px]">
    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${VERDICT_TONE[health.verdict]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />Santé : {VERDICT_LABEL[health.verdict]}
    </span>
    <Pill>{health.frameworks.length} framework(s)</Pill>
    <Pill>{health.activeMods} mods actifs</Pill>
    {health.errors > 0 && <Pill tone="red">{health.errors} erreur(s)</Pill>}
    {health.warnings > 0 && <Pill tone="amber">{health.warnings} avertissement(s)</Pill>}
    <Pill>Dernier lancement : {profile.lastSuccessfulLaunch ? timeAgo(profile.lastSuccessfulLaunch) : '—'}</Pill>
    <button type="button" onClick={onVerify} className="ml-auto flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-1.5 font-semibold text-gold hover:bg-gold/10"><Gauge size={12} />Vérifier</button>
  </div>
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'red' | 'amber' }) {
  return <span className={`rounded-full border px-2.5 py-1 text-white/45 ${tone === 'red' ? 'border-red-300/15 text-red-200/70' : tone === 'amber' ? 'border-amber-300/15 text-amber-100/70' : 'border-white/[0.07]'}`}>{children}</span>
}

function deploymentArguments(game: Game, profile: Profile, profileMods: Mod[]) {
  const enabledModIds = profileMods
    .filter(mod => mod.enabled)
    .map(mod => mod.stageId || (mod.storage === 'staged' ? mod.id : undefined))
    .filter((id): id is string => Boolean(id))
  const executableRoot = game.name.toLocaleLowerCase().includes('cyberpunk')
    && /[\\/]bin[\\/]x64(?:[\\/]|$)/i.test(game.execPath || '')
    ? game.execPath?.split(/[\\/]bin[\\/]x64/i)[0]
    : game.execPath?.replace(/[\\/][^\\/]+$/, '')
  return {
    enabledModIds,
    conflictRules: profile.conflictRules || [],
    gameRoot: game.installDirectory || executableRoot || undefined,
  }
}

export type SubSection = 'resume' | 'files' | 'mods' | 'frameworks' | 'conflicts' | 'deployment' | 'inputs' | 'performance' | 'logs' | 'test' | 'launch'

export interface ResolvedConflict {
  path: string
  owners: Array<{ id: string; name: string }>
  winner: { id: string; name: string }
}

const SUBSECTIONS: Array<{ id: SubSection; label: string }> = [
  { id: 'resume', label: 'Résumé' },
  { id: 'files', label: 'Fichiers' },
  { id: 'mods', label: 'Mods' },
  { id: 'frameworks', label: 'Frameworks' },
  { id: 'conflicts', label: 'Conflits' },
  { id: 'deployment', label: 'Déploiement' },
  { id: 'inputs', label: 'Entrées' },
  { id: 'performance', label: 'Performances' },
  { id: 'logs', label: 'Logs' },
  { id: 'test', label: 'Test' },
  { id: 'launch', label: 'Lancement' },
]

interface Props {
  game: Game
  profile: Profile
  profileMods: Mod[]
  onOpenConfiguration: () => void
  onRepairMo2?: () => void
  repairBusy?: boolean
  conflicts?: ResolvedConflict[]
  onSetWinner?: (path: string, winnerId: string) => void
  initialSection?: SubSection
}

export function GameDiagnosticPanel({ game, profile, profileMods, onOpenConfiguration, onRepairMo2, repairBusy = false, conflicts = [], onSetWinner, initialSection }: Props) {
  const [section, setSection] = useState<SubSection>(initialSection || 'resume')
  const [audit, setAudit] = useState<ProfileDeploymentAudit | undefined>()
  const [busy, setBusy] = useState(false)
  const [testRun, setTestRun] = useState<GameTestRun | undefined>()
  const [testing, setTesting] = useState(false)
  const recordGameTestRun = useStore(state => state.recordGameTestRun)
  const clearGameTestRuns = useStore(state => state.clearGameTestRuns)
  const createRestorePoint = useStore(state => state.createRestorePoint)
  const recordNotice = useStore(state => state.recordNotice)
  const health = computeGameHealth(game, profile, profileMods)
  const [repair, setRepair] = useState<Red4extRepairSummary | undefined>()
  const [repairing, setRepairing] = useState(false)

  /** Bouton « Réparer RED4ext » (spec §9-10) : snapshot → retrouver le paquet →
   * vérifier le core/les plugins → reconstruire la table virtuelle (audit) →
   * évaluer. JAMAIS de téléchargement automatique. */
  const repairRed4ext = async () => {
    setRepairing(true)
    try {
      createRestorePoint('Avant réparation RED4ext', 'auto')
      const input = deploymentArguments(game, profile, profileMods)
      const auditResult = await native.auditProfileDeployment(game.id, profile.id, input.enabledModIds, input.conflictRules, input.gameRoot)
      setAudit(auditResult)
      const summary = evaluateRed4extRepair({ activeMods: profileMods, virtualFiles: auditResult.virtualFiles, brokenReferences: auditResult.brokenReferences, deployable: auditResult.deployable })
      setRepair(summary)
      recordNotice(summary.actions[0] ?? 'Diagnostic RED4ext terminé.')
    } catch (error) {
      window.alert(`Réparation RED4ext impossible : ${String(error)}`)
    } finally {
      setRepairing(false)
    }
  }

  const runAudit = async () => {
    setBusy(true)
    try {
      const input = deploymentArguments(game, profile, profileMods)
      setAudit(await native.auditProfileDeployment(game.id, profile.id, input.enabledModIds, input.conflictRules, input.gameRoot))
    } catch (error) {
      setAudit(undefined)
      window.alert(`Audit du déploiement impossible : ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const clearTestHistory = () => {
    clearGameTestRuns(game.id)
    setTestRun(undefined)
  }

  const runTest = async () => {
    setTesting(true)
    try {
      const input = deploymentArguments(game, profile, profileMods)
      const [auditResult, integrity] = await Promise.all([
        native.auditProfileDeployment(game.id, profile.id, input.enabledModIds, input.conflictRules, input.gameRoot),
        native.isDesktop() ? native.profileIntegrity(game.id, profile.id) : undefined,
      ])
      const run: GameTestRun = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        profileId: profile.id,
        profileName: profile.name,
        deployable: auditResult.deployable,
        brokenReferences: auditResult.brokenReferences,
        conflicts: auditResult.conflicts,
        referencedPackages: auditResult.referencedPackages,
        virtualFileCount: auditResult.virtualFileCount,
        frameworkOk: auditResult.providers.filter(provider => provider.enabled && provider.runtimeVisible).length,
        frameworkTotal: auditResult.providers.length,
        integrityOk: integrity?.ok ?? true,
        integrityIssues: integrity?.issues ?? [],
        diagnostics: auditResult.diagnostics,
      }
      setTestRun(run)
      recordGameTestRun(game.id, run)
    } catch (error) {
      window.alert(`Test du déploiement impossible : ${String(error)}`)
    } finally {
      setTesting(false)
    }
  }

  const problemMods = profileMods.filter(mod => mod.deploymentStatus === 'failed' || mod.deploymentStatus === 'warning' || (mod.diagnostics?.length || 0) > 0)
  const frameworkCounts = [...new Set(game.installedMods.map(mod => mod.framework).filter((value): value is string => Boolean(value)))]
    .map(name => ({ name, count: game.installedMods.filter(mod => mod.framework === name).length }))
    .sort((left, right) => right.count - left.count)

  return <div className="min-h-0 flex-1 overflow-y-auto p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-gold/75"><ClipboardList size={14} /></span>
        <div>
          <h2 className="text-xs font-semibold text-white/80">Diagnostic — {game.name}</h2>
          <p className="text-[11px] text-white/34">Dépendances, intégrité, runtime et déploiement réunis en un seul endroit.</p>
        </div>
      </div>
      <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${VERDICT_TONE[health.verdict]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{VERDICT_LABEL[health.verdict]}</span>
    </div>

    <nav className="flex flex-wrap gap-1 border-b border-white/[0.05] pb-2">
      {SUBSECTIONS.map(item => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] ${section === item.id ? 'bg-gold/15 font-semibold text-gold' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/70'}`}>{item.label}</button>)}
    </nav>

    <div className="mt-4">
      {section === 'resume' && <div className="grid auto-rows-min gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Mods actifs" value={String(health.activeMods)} />
        <Metric label="Frameworks détectés" value={String(health.frameworks.length)} />
        <Metric label="Erreurs" value={String(health.errors)} tone={health.errors > 0 ? 'red' : undefined} />
        <Metric label="Avertissements" value={String(health.warnings)} tone={health.warnings > 0 ? 'amber' : undefined} />
        <Metric label="Dernier lancement" value={profile.lastSuccessfulLaunch ? timeAgo(profile.lastSuccessfulLaunch) : 'Jamais'} />
        <Metric label="Temps de jeu" value={formatTime(game.totalPlaytime)} />
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-white/30">Déploiement</p>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white/75">{audit ? (audit.deployable ? <><CheckCircle2 size={14} className="text-emerald-300" />Prêt</> : <><AlertTriangle size={14} className="text-amber-300" />Réparation nécessaire</>) : 'Non vérifié'}</div>
        </div>
        <button type="button" onClick={() => void runAudit()} disabled={busy || !native.isDesktop()} className="flex min-h-24 flex-col items-start justify-between rounded-xl border border-gold/20 bg-gold/[0.04] p-4 text-left hover:bg-gold/[0.07] disabled:opacity-40">
          <p className="text-[11px] uppercase tracking-widest text-gold/70">Vérification complète</p>
          <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-gold">{busy ? <><Loader2 size={13} className="animate-spin" />Analyse en cours…</> : <><RefreshCw size={13} />Lancer l’audit</>}</span>
        </button>
      </div>}

      {section === 'mods' && (problemMods.length
        ? <div className="space-y-2">{problemMods.map(mod => (
          <div key={mod.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-white/78">{mod.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${mod.deploymentStatus === 'failed' ? 'bg-red-300/10 text-red-200' : mod.deploymentStatus === 'warning' ? 'bg-amber-300/10 text-amber-100' : 'bg-white/[0.05] text-white/45'}`}>{mod.deploymentStatus || 'unknown'}</span>
              {!mod.enabled && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/38">inactif</span>}
            </div>
            {(mod.diagnostics?.length || 0) > 0 && <ul className="mt-2 space-y-1">{mod.diagnostics!.map((line, index) => <li key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-white/42"><ShieldAlert size={11} className="mt-0.5 shrink-0 text-amber-200/60" />{line}</li>)}</ul>}
          </div>
        ))}</div>
        : <EmptyState icon={CheckCircle2} title="Aucun mod signalé" detail="Aucun mod actif du profil n’est en erreur ou avec un avertissement de déploiement." />)}

      {section === 'files' && <VirtualFilesPanel game={game} profile={profile} mods={profileMods} />}

      {section === 'frameworks' && <div>
        {frameworkCounts.length
          ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{frameworkCounts.map(framework => (
            <div key={framework.name} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3">
              <span className="font-mono text-xs text-white/70">{framework.name}</span>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/45">{framework.count} mod(s)</span>
            </div>
          ))}</div>
          : <EmptyState icon={Layers3} title="Aucun framework détecté" detail="Lancez « Analyser le dossier Mods » depuis l’onglet Outils pour rafraîchir la détection." />}
        {audit && audit.providers.length > 0 && <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold text-white/68">Fournisseurs vérifiés par l’audit</p>
          <div className="mt-2 flex flex-wrap gap-2">{audit.providers.map(provider => (
            <span key={provider.frameworkId} className="flex items-center gap-1.5 rounded-full bg-white/[0.035] px-2.5 py-1 font-mono text-[11px] text-white/55">{provider.frameworkId}<span className={`h-1.5 w-1.5 rounded-full ${provider.enabled && provider.runtimeVisible ? 'bg-emerald-300' : 'bg-amber-300'}`} /></span>
          ))}</div>
        </div>}
        <FrameworkLastKnownGood gameId={game.id} profile={profile} profileMods={profileMods} />
        <Red4extRepairCard summary={repair} audit={audit} busy={repairing} onRepair={() => void repairRed4ext()} onRepairMo2={onRepairMo2} />
      </div>}

      {section === 'conflicts' && (conflicts.length
        ? <div><div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-amber-100/65">Deux mods ou plus modifient le même fichier. ZAILON n’en expose qu’un au jeu et explique ici la conséquence de votre choix.</div><div className="overflow-x-auto rounded-xl border border-white/[0.07]"><table className="w-full text-left text-xs"><thead className="bg-white/[0.03] text-white/42"><tr><th className="px-3 py-2">Chemin résolu</th><th className="px-3 py-2">Conséquence</th><th className="px-3 py-2">Utiliser</th></tr></thead><tbody>{conflicts.map(conflict => <tr key={conflict.path} className="border-t border-white/[0.06]"><td className="max-w-sm break-all px-3 py-2 font-mono text-white/52">{conflict.path}</td><td className="px-3 py-2 text-white/45"><p>{conflict.owners.length} mods fournissent ce fichier.</p><p className="mt-1 text-[11px] text-amber-100/55">« {conflict.winner.name} » remplacera la version de {conflict.owners.filter(owner => owner.id !== conflict.winner.id).map(owner => `« ${owner.name} »`).join(', ')}.</p></td><td className="px-3 py-2">{onSetWinner ? <select aria-label={`Choisir le mod utilisé pour ${conflict.path}`} value={conflict.winner.id} onChange={event => onSetWinner(conflict.path, event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-xs text-white/68">{conflict.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select> : <span className="text-white/55">{conflict.winner.name}</span>}</td></tr>)}</tbody></table></div></div>
        : <EmptyState icon={ShieldAlert} title="Aucun conflit de fichiers" detail="L’analyse compare les chemins relatifs réellement fournis par chaque mod actif." />)}

      {section === 'deployment' && <div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runAudit()} disabled={busy || !native.isDesktop()} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313] disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{busy ? 'Analyse en cours…' : (audit ? 'Relancer l’audit' : 'Lancer l’audit')}</button>
          {onRepairMo2 && <button type="button" onClick={onRepairMo2} disabled={repairBusy} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40">{repairBusy ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}{repairBusy ? 'Réparation en cours…' : 'Réparer l’import MO2 et le déploiement'}</button>}
        </div>
        {audit && <div className="mt-4 space-y-3">
          <div className={`rounded-xl border p-4 ${audit.deployable ? 'border-emerald-300/20 bg-emerald-300/[0.04]' : 'border-amber-300/20 bg-amber-300/[0.04]'}`}>
            <p className="flex items-center gap-2 text-sm font-semibold text-white/80">{audit.deployable ? <CheckCircle2 size={15} className="text-emerald-300" /> : <AlertTriangle size={15} className="text-amber-300" />}{audit.deployable ? 'Le profil peut être préparé.' : 'Une réparation est nécessaire.'}</p>
            <p className="mt-1 text-[11px] text-white/42">{audit.referencedPackages} paquet(s) actif(s) · {audit.accessiblePackages} accessible(s) · {audit.brokenReferences} référence(s) cassée(s) · {audit.manifestedFiles} fichier(s) manifesté(s) · {audit.virtualFileCount} gagnant(s) · {audit.conflicts} conflit(s).</p>
          </div>
          {audit.diagnostics.length > 0 && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[11px] font-semibold text-white/68">Diagnostics</p><ul className="mt-2 space-y-1">{audit.diagnostics.slice(0, 12).map((line, index) => <li key={index} className="text-[11px] leading-relaxed text-white/45">{line}</li>)}</ul></div>}
          {audit.packages.some(packageItem => packageItem.errors.length > 0) && <div className="rounded-xl border border-red-300/12 bg-red-300/[0.03] p-3"><p className="text-[11px] font-semibold text-red-200/70">Paquets en erreur</p><ul className="mt-2 space-y-1">{audit.packages.filter(packageItem => packageItem.errors.length > 0).map(packageItem => <li key={packageItem.packageId} className="text-[11px] leading-relaxed text-white/45"><span className="font-mono text-white/60">{packageItem.packageId}</span> — {packageItem.errors.join(' · ')}</li>)}</ul></div>}
        </div>}
        {!audit && !busy && <p className="mt-4 text-[11px] text-white/34">L’audit reconstruit la carte virtuelle en mémoire et contrôle les fournisseurs redscript, RED4ext et CET sans modifier aucun fichier.</p>}
      </div>}

      {section === 'inputs' && <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[11px] uppercase tracking-widest text-white/30">Disposition virtuelle</p>
            <p className="mt-2 text-sm font-semibold text-white/75">{LAYOUT_LABELS[effectiveLayout(game, profile.id)]}</p>
            <button type="button" onClick={onOpenConfiguration} className="mt-3 flex items-center gap-1.5 self-start rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold"><Keyboard size={12} />Configurer les commandes</button>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[11px] uppercase tracking-widest text-white/30">Aucune langue Windows</p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/42">La traduction de touches reste locale au jeu, jamais active sur le bureau, Discord ou ZAILON.</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[11px] font-semibold text-white/68">Backend d’application</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">{inputDiagnosticRows(game, effectiveLayout(game, profile.id)).map(row => <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1 text-[11px]"><dt className="text-white/34">{row.label}</dt><dd className={`text-right ${row.tone === 'warn' ? 'font-semibold text-amber-100/75' : row.tone === 'ok' ? 'text-emerald-200/70' : 'text-white/58'}`}>{row.value}</dd></div>)}</dl>
        </div>
      </div>}

      {section === 'performance' && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-[11px] font-semibold text-white/68">Profils de performance par jeu</p>
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-white/38">Pause des téléchargements et des scans pendant le jeu, priorité du processus, réduction de l’activité UI : prévus aux phases 2-4 de la refonte UX (voir docs/ux-refonte-architecture.md).</p>
      </div>}

      {section === 'logs' && <div className="space-y-2">
        <button type="button" onClick={() => void native.openUpdateLog()} disabled={!native.isDesktop()} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left hover:border-gold/25 disabled:opacity-40">
          <FileClock size={15} className="text-gold/75" />
          <span className="flex-1"><span className="block text-[11px] font-semibold text-white/72">Ouvrir le journal de mise à jour</span><span className="mt-0.5 block text-[11px] text-white/34">Journal JSONL local des sauvegardes et opérations de mise à jour.</span></span>
          <span className="text-white/30">→</span>
        </button>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold text-white/68">Historique des événements du jeu</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/34">La timeline par jeu (lancements, snapshots, installations) fait partie de la fusion « Activité » prévue en Phase 2.</p>
        </div>
      </div>}

      {section === 'test' && <TestEnvironmentPanel game={game} profile={profile} profileMods={profileMods} latestRun={testRun} running={testing} onRun={runTest} onClearHistory={clearTestHistory} onOpenConfiguration={onOpenConfiguration} />}
      {section === 'launch' && <LaunchSessionPanel game={game} />}
    </div>
  </div>
}

function TestEnvironmentPanel({ game, profile, profileMods, latestRun, running, onRun, onClearHistory, onOpenConfiguration }: { game: Game; profile: Profile; profileMods: Mod[]; latestRun?: GameTestRun; running: boolean; onRun: () => Promise<void>; onClearHistory: () => void; onOpenConfiguration: () => void }) {
  const run = latestRun || game.testRuns?.[0]
  const prerequisites = [
    { label: 'Dossier du jeu', value: game.installDirectory, ok: Boolean(game.installDirectory) },
    { label: 'Exécutable', value: game.execPath, ok: Boolean(game.execPath) },
    { label: 'Dossier Mods', value: game.modsPath, ok: Boolean(game.modsPath) },
    { label: 'Dossier Bypass / Loader', value: game.bypassPath, ok: Boolean(game.bypassPath) },
    { label: 'Chemins runtime additionnels', value: (game.runtimePaths || []).length ? `${(game.runtimePaths || []).length} chemin(s) configuré(s)` : undefined, ok: (game.runtimePaths || []).length > 0 },
  ]
  const frameworkTotal = game.testRuns?.[0]?.frameworkTotal ?? run?.frameworkTotal ?? 0
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/20 bg-gold/[0.06] text-gold"><FolderCheck size={15} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white/78">Environnement de test — {game.name}</p>
        <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-white/38">Vérifie le déploiement sans lancer le jeu : audit en lecture seule (aucun fichier modifié, rien à restaurer) + intégrité de l’état sur disque. Le résultat est enregistré dans l’historique du jeu.</p>
      </div>
      <button type="button" onClick={() => void onRun()} disabled={running} className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/10 disabled:opacity-40">{running ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} />}{running ? 'Test en cours…' : 'Tester le déploiement'}</button>
    </div>

    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-[11px] font-semibold text-white/68">Prérequis configurés</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{prerequisites.map(item => <li key={item.label} className="flex items-start gap-2 text-[11px]"><span className={`mt-0.5 ${item.ok ? 'text-emerald-300/80' : 'text-red-300/70'}`}>{item.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}</span><span className="min-w-0"><span className="block text-white/55">{item.label}</span><span className="block truncate text-[10px] text-white/30">{item.value || 'Non configuré'}</span></span></li>)}</ul>
      <button type="button" onClick={onOpenConfiguration} className="mt-3 text-[11px] font-semibold text-gold/80 hover:text-gold">Compléter la configuration →</button>
    </div>

    {run && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${run.deployable ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-200' : 'border-red-300/20 bg-red-300/[0.05] text-red-200'}`}>{run.deployable ? 'Déployable' : 'Non déployable'}</span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${run.integrityOk ? 'border-white/[0.08] text-white/45' : 'border-amber-300/20 bg-amber-300/[0.05] text-amber-100'}`}>Intégrité {run.integrityOk ? 'OK' : 'à vérifier'}</span>
        <span className="ml-auto text-[11px] text-white/30">Profil {run.profileName} · {formatClock(run.at)}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Paquets référencés" value={String(run.referencedPackages)} /><Metric label="Fichiers gagnants" value={String(run.virtualFileCount)} /><Metric label="Conflits résolus" value={String(run.conflicts)} /><Metric label="Références cassées" value={String(run.brokenReferences)} tone={run.brokenReferences > 0 ? 'red' : undefined} /></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2"><Metric label="Frameworks" value={`${run.frameworkOk} / ${run.frameworkTotal}`} /><Metric label="Diagnostics" value={String(run.diagnostics.length)} /></div>
      {run.integrityIssues.length > 0 && <ul className="mt-3 space-y-1 rounded-lg border border-amber-300/12 bg-amber-300/[0.03] p-3 text-[11px] text-amber-100/70">{run.integrityIssues.map((issue, index) => <li key={`${index}:${issue}`}>• {issue}</li>)}</ul>}
      {run.diagnostics.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-white/42">{run.diagnostics.map((item, index) => <li key={`${index}:${item}`}>• {item}</li>)}</ul>}
    </div>}

    {!run && <div className="rounded-xl border border-dashed border-white/[0.09] p-4 text-center text-[11px] text-white/34">Aucun test enregistré pour ce jeu. Lancez un premier test : l’audit ne modifie aucun fichier.</div>}

    {(game.testRuns?.length || 0) > 1 && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-white/68">Historique des tests (10 derniers)</p><button type="button" onClick={onClearHistory} className="text-[11px] font-semibold text-red-200/60 hover:text-red-200">Effacer l’historique</button></div>
      <ul className="mt-2 divide-y divide-white/[0.05]">{(game.testRuns || []).slice(1, 10).map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 py-2 text-[11px]"><span className={`h-1.5 w-1.5 rounded-full ${item.deployable ? 'bg-emerald-300/80' : 'bg-red-300/80'}`} /><span className="text-white/55">{item.deployable ? 'Déployable' : 'Non déployable'}</span><span className="text-white/28">Profil {item.profileName}</span><span className="text-white/28">{item.brokenReferences} cassée(s) · {item.conflicts} conflit(s)</span><span className="ml-auto text-white/26">{formatClock(item.at)}</span></li>)}</ul>
      {frameworkTotal > 0 && <p className="mt-2 text-[10px] text-white/26">L’environnement de test n’utilise ni injection ni modification de fichiers : il est sûr même avec Anti-Cheat (ex. NTE / ACE).</p>}
    </div>}
  </div>
}

function LaunchSessionPanel({ game }: { game: Game }) {
  const activeSession = useStore(state => state.gameSessions.find(session => session.gameId === game.id && session.state !== 'Ended' && session.state !== 'Failed'))
  const pastSessions = useStore(state => state.gameSessions.filter(session => session.gameId === game.id && (session.state === 'Ended' || session.state === 'Failed')).slice(0, 3))
  const attachGameSession = useStore(state => state.attachGameSession)
  const prepareAndWait = useStore(state => state.prepareAndWait)
  const endSession = useStore(state => state.endSession)
  const continueWaiting = useStore(state => state.continueWaiting)
  const selectedProfileId = useStore(state => state.selectedProfileId)
  const autoAttachGames = useStore(state => state.autoAttachGames || [])
  const setGameAutoAttach = useStore(state => state.setGameAutoAttach)
  const advancedMode = useStore(state => state.advancedMode)
  const profileId = selectedProfileId || game.profiles[0]?.id || ''
  const adapter = adapterFor(game)
  const now = Date.now()

  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Méthode" value={LAUNCH_BEHAVIOR_LABELS[adapter.launchBehavior]} />
      <Metric label="Launcher" value={adapter.launcherExecutable || '—'} />
      <Metric label="Fenêtre de rattachement" value={`${adapter.reattachWindowSeconds} s`} />
      <Metric label="Délai de grâce" value={`${adapter.endGraceSeconds} s`} />
    </div>

    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-white/68">Session {activeSession ? <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${activeSession.state === 'GameRunning' ? 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200' : activeSession.state === 'GameLost' ? 'border-red-300/25 bg-red-300/[0.08] text-red-200' : 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100'}`}>{SESSION_STATE_LABELS[activeSession.state]}</span> : '—'}</p>
        <label className="flex items-center gap-2 text-[11px] text-white/45"><Toggle size="sm" checked={autoAttachGames.includes(game.id)} onChange={() => setGameAutoAttach(game.id, !autoAttachGames.includes(game.id))} />Attacher automatiquement si détecté</label>
      </div>
      {activeSession
        ? <div className="mt-3 space-y-2 text-[11px]">
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1"><span className="text-white/34">Profil</span><span className="text-white/58">{game.profiles.find(item => item.id === activeSession.profileId)?.name || activeSession.profileId}</span></div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1"><span className="text-white/34">Source</span><span className="text-white/58">{activeSession.source === 'zailon' ? 'Lancé par ZAILON' : activeSession.source === 'manual' ? 'Lancé hors ZAILON' : activeSession.source === 'reattached' ? 'Réattaché' : 'Récupéré'}</span></div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1"><span className="text-white/34">Démarrage</span><span className="text-white/58">{formatClock(activeSession.startedAt)} · {formatSeconds(Math.floor((now - activeSession.startedAt) / 1000))}</span></div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1"><span className="text-white/34">Processus final</span><span className="text-white/58">{activeSession.finalProcess || '—'}{activeSession.confidence !== undefined ? ` (confiance ${activeSession.confidence} %)` : ''}</span></div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1"><span className="text-white/34">QWERTY</span><span className={activeSession.inputProfileActive ? 'text-emerald-200/75' : 'text-white/34'}>{activeSession.inputProfileActive ? 'Actif' : 'Inactif'}</span></div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1"><span className="text-white/34">Mods déployés</span><span className={activeSession.deploymentActive ? 'text-emerald-200/75' : 'text-white/34'}>{activeSession.deploymentActive ? 'Oui' : 'Non'}</span></div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => attachGameSession(game.id, activeSession.profileId)} className="rounded-lg border border-gold/25 px-3 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10">Attacher au jeu en cours</button>
            <button type="button" onClick={() => continueWaiting(game.id)} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06]">Continuer à attendre</button>
            <button type="button" onClick={() => endSession(game.id)} className="rounded-lg border border-red-300/20 px-3 py-1.5 text-[11px] text-red-200/75 hover:bg-red-300/[0.06]">Terminer la session</button>
          </div>
          <div className="mt-1 rounded-lg border border-white/[0.05] bg-black/15 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/30">Timeline</p>
            <ul className="mt-2 space-y-1 font-mono text-[10px] text-white/42">{activeSession.timeline.map((step, index) => <li key={`${index}:${step.stage}`}><span className="text-white/24">{formatClock(step.at)}</span> <span className="text-white/58">{step.stage}</span>{step.detail ? <span className="text-white/30"> — {step.detail}</span> : null}</li>)}</ul>
          </div>
        </div>
        : <div className="mt-3">
          <p className="text-[11px] leading-relaxed text-white/38">Aucune session active. Chaîne attendue : <span className="text-white/62">{adapter.launchChainStages.join(' → ')}</span>.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => prepareAndWait(game.id, profileId)} className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/10"><Rocket size={12} />Préparer et attendre le jeu</button>
            <button type="button" onClick={() => attachGameSession(game.id, profileId)} className="rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.06]">Attacher au jeu en cours</button>
          </div>
          <p className="mt-2 text-[10px] text-white/26">La détection automatique du processus final (launcher → jeu) est fournie par le backend natif Phase 6 ; en attendant, l'attachement manuel fonctionne dès maintenant.</p>
        </div>}
    </div>

    {advancedMode && <QuickPanelDiagnostic />}

    {pastSessions.length > 0 && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-[11px] font-semibold text-white/68">Sessions récentes</p>
      <ul className="mt-2 divide-y divide-white/[0.05]">{pastSessions.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 py-2 text-[11px]"><span className={`h-1.5 w-1.5 rounded-full ${item.state === 'Ended' ? 'bg-white/30' : 'bg-red-300/80'}`} /><span className="text-white/55">{SESSION_STATE_LABELS[item.state]}</span><span className="text-white/28">Profil {game.profiles.find(profile => profile.id === item.profileId)?.name || item.profileId}</span><span className="ml-auto text-white/26">{formatClock(item.startedAt)}</span></li>)}</ul>
    </div>}
  </div>
}

/** Last Known Good des frameworks (spec §41-42) : référence du dernier
 * lancement réussi, différences détectées, verrou anti-remplacement silencieux. */
/** Spec Quick Panel §22, §50 : diagnostic de la fenêtre native — affiché en
 * mode avancé uniquement. Chaque ligne reflète l'état NATIF interrogé à
 * l'instant (jamais une fausse activation) ; la session cible est la session
 * prioritaire (spec §15). */
function QuickPanelDiagnostic() {
  const [status, setStatus] = useState<QuickPanelStatus>()
  const sessions = useStore(state => state.gameSessions)
  const pinnedPriorityGameId = useStore(state => state.pinnedPriorityGameId)
  const foregroundGameId = useStore(state => state.foregroundGameId)
  const refresh = useCallback(() => {
    void native.quickPanel.status().then(setStatus).catch(() => undefined)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  const priorityGameId = pickPrioritySession(sessions, pinnedPriorityGameId)
  const priorityGame = useStore(state => state.games.find(item => item.id === priorityGameId))
  const foregroundGame = useStore(state => state.games.find(item => item.id === foregroundGameId))
  const rendererState = !status
    ? 'Inconnu'
    : !status.created
      ? 'Non créée'
      : status.visible && status.focused
        ? 'Prêt'
        : status.visible
          ? 'Visible (focus ailleurs)'
          : 'Créée (masquée)'
  const rows: Array<{ label: string; value: string; ok?: boolean }> = [
    { label: 'Window created', value: status?.created ? 'Oui' : 'Non', ok: status?.created },
    { label: 'Visible', value: status?.visible ? 'Oui' : 'Non', ok: status?.visible },
    { label: 'AlwaysOnTop', value: status?.alwaysOnTop ? 'Oui' : 'Non', ok: status?.alwaysOnTop },
    { label: 'Focused', value: status?.focused ? 'Oui' : 'Non' },
    { label: 'Target session', value: priorityGame?.name || '—' },
    { label: 'Foreground game', value: foregroundGame?.name || '—' },
    { label: 'Renderer state', value: rendererState },
  ]
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-semibold text-white/68">Quick Panel — diagnostic fenêtre</p>
      <button type="button" onClick={refresh} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold"><RefreshCw size={12} />Actualiser</button>
    </div>
    <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {rows.map(row => <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1">
        <span className="font-mono text-[11px] text-white/34">{row.label}</span>
        <span className={`text-[11px] ${row.ok === undefined ? 'text-white/58' : row.ok ? 'text-emerald-200/75' : 'text-amber-100/80'}`}>{row.value}</span>
      </div>)}
    </div>
    <p className="mt-2 text-[10px] leading-relaxed text-white/28">Mode avancé — état natif interrogé à l'instant. Le panneau cible la session prioritaire (spec §15) ; il se ferme à la perte de focus et est indisponible en plein écran exclusif (aucune injection).</p>
  </div>
}

function FrameworkLastKnownGood({ gameId, profile, profileMods }: { gameId: string; profile: Profile; profileMods: Mod[] }) {
  const lastKnownGoodFrameworks = useStore(state => state.lastKnownGoodFrameworks?.[gameId])
  const recordLastKnownGoodFrameworks = useStore(state => state.recordLastKnownGoodFrameworks)
  const setLockFrameworks = useStore(state => state.setLockFrameworks)
  const current = fingerprintFrameworkSet(profileMods)
  const changes = compareFrameworkSets(lastKnownGoodFrameworks, current)
  const hasReference = Boolean(lastKnownGoodFrameworks && Object.keys(lastKnownGoodFrameworks).length)
  const currentFrameworks = Object.keys(current)
  if (!currentFrameworks.length) return null
  return <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-semibold text-white/68">Last Known Good · frameworks</p>
      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${changes.length ? 'bg-amber-300/10 text-amber-100/75' : 'bg-emerald-300/10 text-emerald-200/70'}`}>{hasReference ? (changes.length ? `${changes.length} changement(s)` : 'À jour') : 'Aucune référence'}</span>
    </div>
    <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">Référence enregistrée quand le jeu tourne (processus final détecté). Si la configuration change avant un lancement, ZAILON avertit — et bloque si le profil est verrouillé.</p>
    {changes.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-amber-100/70">{changes.map(change => <li key={change.framework}>• {change.framework} — {change.kind === 'added' ? 'ajouté' : change.kind === 'removed' ? 'retiré' : `mis à jour${change.previousVersion && change.currentVersion && change.previousVersion !== change.currentVersion ? ` : ${change.previousVersion} → ${change.currentVersion}` : ''}`}</li>)}</ul>}
    {currentFrameworks.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{currentFrameworks.map(name => <span key={name} className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-white/50">{name}{current[name]?.version ? ` ${current[name]!.version}` : ''}</span>)}</div>}
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => recordLastKnownGoodFrameworks(gameId)} className="rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.05] hover:text-white">Enregistrer comme référence</button>
      <label className="flex items-center gap-2 text-[11px] text-white/55"><Toggle checked={Boolean(profile.lockFrameworks)} onChange={() => setLockFrameworks(gameId, profile.id, !profile.lockFrameworks)} />Verrouiller les frameworks</label>
    </div>
  </div>
}

const RED4EXT_VERDICT_LABEL: Record<Red4extRepairSummary['verdict'], string> = {
  ok: 'RED4ext opérationnel',
  'package-missing': 'Aucun mod RED4ext actif',
  'core-missing': 'Loader RED4ext manquant',
  'core-not-exposed': 'Core non exposé par la table virtuelle',
  'deployment-broken': 'Déploiement à réparer',
}

const RED4EXT_VERDICT_TONE: Record<Red4extRepairSummary['verdict'], string> = {
  ok: 'border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-200',
  'package-missing': 'border-amber-300/20 bg-amber-300/[0.04] text-amber-100',
  'core-missing': 'border-red-300/20 bg-red-300/[0.05] text-red-200',
  'core-not-exposed': 'border-amber-300/20 bg-amber-300/[0.04] text-amber-100',
  'deployment-broken': 'border-red-300/20 bg-red-300/[0.05] text-red-200',
}

/** Bouton « Réparer RED4ext » (spec §9) : diagnostic complet + actions — jamais
 * de téléchargement automatique (le bouton Outils ouvre la réparation MO2). */
function Red4extRepairCard({ summary, audit, busy, onRepair, onRepairMo2 }: { summary: Red4extRepairSummary | undefined; audit: ProfileDeploymentAudit | undefined; busy: boolean; onRepair: () => void; onRepairMo2?: () => void }) {
  const provider = audit?.providers.find(item => item.frameworkId.toLocaleLowerCase().includes('red4ext'))
  const stateRows: Array<{ label: string; value: 'ok' | 'missing' | 'unknown'; hint?: string }> = summary
    ? [
        { label: 'Installé', value: summary.packageFound && summary.coreInDeployment ? 'ok' : 'missing', hint: 'Le loader red4ext/red4ext.dll est fourni par un mod actif du profil.' },
        { label: 'Manifest', value: summary.red4extEntryCount > 0 ? 'ok' : 'missing', hint: `${summary.red4extEntryCount} entrée(s) red4ext/ déclarée(s) dans la carte.` },
        { label: 'Déployé', value: summary.coreInVirtualMap ? 'ok' : 'missing', hint: 'Le core est exposé par la table virtuelle (audit de déploiement).' },
        { label: 'Runtime visible', value: provider ? (provider.enabled && provider.runtimeVisible ? 'ok' : 'missing') : 'unknown', hint: provider ? (provider.enabled && provider.runtimeVisible ? 'La copie est visible par le jeu.' : 'Le fournisseur est présent mais la visibilité runtime n’est pas confirmée.') : 'Non vérifié tant que l’audit n’a pas tourné.' },
        { label: 'Chargé', value: 'unknown', hint: 'Non vérifié — ZAILON n’affiche jamais « chargé » sans le log du jeu.' },
      ]
    : []
  return <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-semibold text-white/68">Réparer RED4ext</p>
      <button type="button" onClick={onRepair} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313] disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}{busy ? 'Diagnostic en cours…' : 'Réparer'}</button>
    </div>
    <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">Snapshot + retrouver le paquet + vérifier le core et les plugins + reconstruire la table virtuelle (audit). ZAILON ne télécharge jamais une autre version sans confirmation.</p>
    {summary && <div className={`mt-3 rounded-xl border p-3 ${RED4EXT_VERDICT_TONE[summary.verdict]}`}>
      <p className="flex items-center gap-2 text-xs font-semibold">{summary.verdict === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{RED4EXT_VERDICT_LABEL[summary.verdict]}</p>
      <p className="mt-1 text-[11px] opacity-70">Core dans le profil : {summary.coreInDeployment ? '✓' : '✗'} · Core dans la table virtuelle : {summary.coreInVirtualMap ? '✓' : '✗'} · {summary.pluginCount} plugin(s) · {summary.red4extEntryCount} entrée(s) red4ext/ · {summary.brokenReferences} référence(s) cassée(s).</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{stateRows.map(row => (
        <div key={row.label} title={row.hint} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${row.value === 'ok' ? 'border-emerald-300/15 bg-emerald-300/[0.03]' : row.value === 'missing' ? 'border-red-300/12 bg-red-300/[0.02]' : 'border-amber-300/14 bg-amber-300/[0.02]'}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.value === 'ok' ? 'bg-emerald-300' : row.value === 'missing' ? 'bg-red-300' : 'bg-amber-300'}`} />
          <span className="text-white/62">{row.label}</span>
          <span className={`ml-auto font-semibold ${row.value === 'ok' ? 'text-emerald-200/85' : row.value === 'missing' ? 'text-red-200/70' : 'text-amber-100/75'}`}>{row.value === 'ok' ? '✓' : row.value === 'missing' ? '✗' : 'Non vérifié'}</span>
        </div>
      ))}</div>
      <ul className="mt-2 space-y-1 text-[11px] opacity-80">{summary.actions.map((action, index) => <li key={index}>• {action}</li>)}</ul>
      {summary.verdict === 'deployment-broken' && onRepairMo2 && <button type="button" onClick={onRepairMo2} className="mt-2 rounded-lg border border-white/[0.12] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/[0.05]">Réparer le déploiement (import MO2)</button>}
    </div>}
  </div>
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' }) {
  return <div className={`rounded-xl border bg-white/[0.02] p-4 ${tone === 'red' ? 'border-red-300/15' : tone === 'amber' ? 'border-amber-300/15' : 'border-white/[0.07]'}`}>
    <p className="text-[11px] uppercase tracking-widest text-white/30">{label}</p>
    <p className={`mt-2 break-all text-lg font-semibold ${tone === 'red' ? 'text-red-200' : tone === 'amber' ? 'text-amber-100' : 'text-white/75'}`}>{value}</p>
  </div>
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-emerald-300/70"><Icon size={17} /></div>
    <h3 className="mt-3 text-xs font-semibold text-white/66">{title}</h3>
    <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-white/36">{detail}</p>
  </div>
}

function profileDeploymentInput(game: Game, profile: Profile, mods: Mod[]) {
  const enabledModIds = mods
    .filter(mod => mod.enabled)
    .map(mod => mod.stageId || profile.modStates[mod.id]?.packageId || (mod.storage === 'staged' ? mod.id : undefined))
    .filter((id): id is string => Boolean(id))
  const executableRoot = game.name.toLocaleLowerCase().includes('cyberpunk')
    && /[\\/]bin[\\/]x64(?:[\\/]|$)/i.test(game.execPath || '')
    ? game.execPath?.split(/[\\/]bin[\\/]x64/i)[0]
    : game.execPath?.replace(/[\\/][^\\/]+$/, '')
  return {
    enabledModIds,
    conflictRules: profile.conflictRules || [],
    gameRoot: game.installDirectory || executableRoot || undefined,
  }
}

function VirtualFilesPanel({ game, profile, mods }: { game: Game; profile: Profile; mods: Mod[] }) {
  const [audit, setAudit] = useState<ProfileDeploymentAudit>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const enabledKey = mods.filter(mod => mod.enabled).map(mod => `${mod.id}:${mod.priority}`).join('|')
  const rulesKey = JSON.stringify(profile.conflictRules || [])
  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const input = profileDeploymentInput(game, profile, mods)
      setAudit(await native.auditProfileDeployment(game.id, profile.id, input.enabledModIds, input.conflictRules, input.gameRoot))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [game.id, game.installDirectory, game.execPath, profile.id, enabledKey, rulesKey])
  useEffect(() => { void load() }, [load])

  const byPackageId = useMemo(() => new Map(mods.map(mod => [mod.stageId || profile.modStates[mod.id]?.packageId || mod.id, mod])), [mods, profile.modStates])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = (audit?.virtualFiles || []).filter(file => {
    if (!normalizedQuery) return true
    const winner = byPackageId.get(file.packageId)
    return file.gameRelativePath.toLocaleLowerCase().includes(normalizedQuery)
      || file.packageId.toLocaleLowerCase().includes(normalizedQuery)
      || winner?.name.toLocaleLowerCase().includes(normalizedQuery)
  })
  const rendered = filtered.slice(0, 500)

  // Spec RuntimeSessionV3 §45 : « Comparer avec la racine attendue ». Pour chaque
  // fournisseur de framework (RED4ext, redscript, TweakXL, ArchiveXL…), le
  // nombre de fichiers PHYSIQUEMENT présents (provider.files) est comparé au
  // nombre de fichiers réellement PROJETÉS dans la racine du jeu (virtualFiles)
  // — un framework existant mais mal exposé apparaît ici, pas comme « absent ».
  const [compareOpen, setCompareOpen] = useState(false)
  const compareRows = useMemo(() => {
    if (!audit) return { providers: [] as Array<{ frameworkId: string; packageId: string; enabled: boolean; runtimeVisible: boolean; expected: number; projected: number; missing: number; roots: string[] }>, roots: [] as Array<{ root: string; files: number; packages: number }> }
    const providers = (audit.providers || [])
      .map(provider => {
        const projectedFiles = audit.virtualFiles.filter(file => file.packageId === provider.packageId)
        const roots = [...new Set(projectedFiles
          .map(file => file.gameRelativePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0])
          .filter(Boolean))].sort()
        return {
          frameworkId: provider.frameworkId,
          packageId: provider.packageId,
          enabled: provider.enabled,
          runtimeVisible: provider.runtimeVisible,
          expected: provider.files.length,
          projected: projectedFiles.length,
          missing: Math.max(0, provider.files.length - projectedFiles.length),
          roots,
        }
      })
      .sort((left, right) => left.frameworkId.localeCompare(right.frameworkId))
    const rootsMap = new Map<string, { files: number; packages: Set<string> }>()
    for (const file of audit.virtualFiles) {
      const root = file.gameRelativePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0] || '?'
      const entry = rootsMap.get(root) ?? { files: 0, packages: new Set<string>() }
      entry.files += 1
      entry.packages.add(file.packageId)
      rootsMap.set(root, entry)
    }
    const roots = [...rootsMap.entries()]
      .map(([root, entry]) => ({ root, files: entry.files, packages: entry.packages.size }))
      .sort((left, right) => left.root.localeCompare(right.root))
    return { providers, roots }
  }, [audit])

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-3">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/78">Ce que le jeu voit réellement</h2><p className="mt-1 text-[11px] text-white/38">Carte finale calculée depuis les paquets immuables, l’ordre et les règles du profil « {profile.name} ».</p></div>
      <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/15 px-2.5"><Search size={12} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Chemin, mod ou paquet" className="w-52 bg-transparent py-2 text-xs text-white/68 outline-none" /></label>
      <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55 disabled:opacity-35"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Actualiser</button>
      <button onClick={() => setCompareOpen(open => !open)} disabled={!audit} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55 hover:border-gold/25 hover:text-gold disabled:opacity-35"><Scale size={13} />{compareOpen ? 'Masquer la comparaison' : 'Comparer avec la racine attendue'}</button>
    </header>
    {loading && !audit ? <div className="flex flex-1 items-center justify-center text-xs text-white/38">Construction de la carte virtuelle…</div> : error ? <div className="m-4 rounded-xl border border-red-300/15 bg-red-300/[0.04] p-4 text-xs text-red-100/70">{error}</div> : audit && <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-4"><Metric label="Paquets actifs" value={String(audit.referencedPackages)} /><Metric label="Fichiers gagnants" value={String(audit.virtualFileCount)} /><Metric label="Conflits résolus" value={String(audit.conflicts)} /><Metric label="Références cassées" value={String(audit.brokenReferences)} /></div>
      {compareOpen && <div className="mb-3 space-y-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold text-white/68">Frameworks — attendu vs projeté</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/34">Un framework physiquement présent mais mal exposé (racine virtuelle incorrecte) apparaît ici en « manquant », jamais comme « absent ».</p>
          {compareRows.providers.length === 0
            ? <p className="mt-2 text-[11px] text-white/30">Aucun fournisseur de framework détecté dans ce profil.</p>
            : <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{compareRows.providers.map(provider => (
              <div key={`${provider.packageId}:${provider.frameworkId}`} className="rounded-lg border border-white/[0.06] bg-black/15 p-2.5">
                <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-white/72">{provider.frameworkId}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${provider.enabled && provider.runtimeVisible ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-100/80'}`}>{provider.enabled && provider.runtimeVisible ? 'Runtime ✓' : 'Prévu'}</span></div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{provider.packageId}</p>
                <p className="mt-1.5 text-[10px] text-white/38">Projeté vers : {provider.roots.length ? provider.roots.join(' › ') : '—'}</p>
                <p className={`mt-1 text-[11px] font-semibold ${provider.missing === 0 ? 'text-emerald-200/85' : 'text-amber-100/85'}`}>{provider.projected} / {provider.expected} fichiers visibles{provider.missing > 0 ? ` · ${provider.missing} non exposés` : ''}</p>
              </div>
            ))}</div>}
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold text-white/68">Racines projetées du jeu</p>
          {compareRows.roots.length === 0
            ? <p className="mt-2 text-[11px] text-white/30">Aucun fichier projeté.</p>
            : <div className="mt-2 flex flex-wrap gap-2">{compareRows.roots.map(root => <span key={root.root} className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/15 px-2.5 py-1 text-[11px]"><span className="font-mono text-white/62">{root.root}/</span><span className="text-white/34">{root.files} fichier(s) · {root.packages} paquet(s)</span></span>)}</div>}
        </div>
      </div>}
      <div className={`mb-3 rounded-xl border p-3 text-xs ${audit.deployable ? 'border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-100/68' : 'border-amber-300/18 bg-amber-300/[0.04] text-amber-100/70'}`}>{audit.deployable ? 'Le profil est cohérent et peut être préparé. La colonne « runtime » devient confirmée seulement pendant un lancement réel.' : 'Le profil contient une anomalie bloquante. Consultez les preuves ci-dessous avant de jouer.'}</div>
      {audit.packages.some(item => !item.deployable) && <div className="mb-3 space-y-1">{audit.packages.filter(item => !item.deployable).map(item => <div key={item.packageId} className="rounded-lg border border-red-300/12 bg-red-300/[0.035] px-3 py-2 text-[11px] text-red-100/65"><strong>{byPackageId.get(item.packageId)?.name || item.packageId}</strong> — {item.errors.join(' · ') || 'Paquet non déployable.'}</div>)}</div>}
      <div className="overflow-x-auto rounded-xl border border-white/[0.07]"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 bg-[#121515] text-white/42"><tr><th className="px-3 py-2">Chemin exposé</th><th className="px-3 py-2">Mod gagnant</th><th className="px-3 py-2">Remplace</th><th className="px-3 py-2">Décision</th><th className="px-3 py-2">État</th></tr></thead><tbody>{rendered.map(file => {
        const winner = byPackageId.get(file.packageId)
        const runtimeVisible = winner?.deploymentStatus === 'runtime-visible' || winner?.deploymentStatus === 'loaded-by-game'
        return <tr key={`${file.gameRelativePath}:${file.packageId}`} className="border-t border-white/[0.055]"><td className="max-w-md break-all px-3 py-2 font-mono text-white/62">{file.gameRelativePath}<details className="mt-1 text-[11px] text-white/26"><summary className="cursor-pointer">Détails techniques</summary><p className="mt-1 break-all">SHA-256 {file.hash}</p><p className="break-all">{file.sourcePhysicalPath}</p></details></td><td className="px-3 py-2"><span className="font-semibold text-white/68">{winner?.name || file.packageId}</span><span className="mt-1 block text-[11px] text-white/30">{winner?.version ? `v${winner.version}` : file.packageId}</span></td><td className="px-3 py-2 text-white/42">{file.overriddenPackageIds.length ? file.overriddenPackageIds.map(id => byPackageId.get(id)?.name || id).join(', ') : 'Aucun autre mod'}</td><td className="px-3 py-2 text-white/45">{file.winnerReason}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[11px] ${runtimeVisible ? 'bg-emerald-300/10 text-emerald-200' : 'bg-sky-300/10 text-sky-200'}`}>{runtimeVisible ? 'Visible runtime' : 'Prévu'}</span></td></tr>
      })}</tbody></table></div>
      {filtered.length > rendered.length && <p className="mt-2 text-[11px] text-white/34">{rendered.length} résultat(s) affiché(s) sur {filtered.length}. Affinez la recherche pour préserver les performances.</p>}
      {audit.diagnostics.length > 0 && <section className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><h3 className="text-xs font-semibold text-white/62">Diagnostics</h3><ul className="mt-2 space-y-1 text-[11px] text-white/42">{audit.diagnostics.map((item, index) => <li key={`${index}:${item}`}>• {item}</li>)}</ul></section>}
    </div>}
  </div>
}
