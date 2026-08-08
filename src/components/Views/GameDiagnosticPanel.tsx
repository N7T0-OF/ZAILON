import { Activity, AlertTriangle, CheckCircle2, ClipboardList, FileClock, Gauge, Keyboard, Layers3, Loader2, RefreshCw, Rocket, ShieldAlert, Wrench } from 'lucide-react'
import { useState } from 'react'
import { effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { native, type ProfileDeploymentAudit } from '../../lib/native'
import type { Game, Mod, Profile } from '../../types'
import { formatTime, timeAgo } from '../../utils'

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

type SubSection = 'resume' | 'mods' | 'frameworks' | 'deployment' | 'inputs' | 'performance' | 'logs'

const SUBSECTIONS: Array<{ id: SubSection; label: string }> = [
  { id: 'resume', label: 'Résumé' },
  { id: 'mods', label: 'Mods' },
  { id: 'frameworks', label: 'Frameworks' },
  { id: 'deployment', label: 'Déploiement' },
  { id: 'inputs', label: 'Entrées' },
  { id: 'performance', label: 'Performances' },
  { id: 'logs', label: 'Logs' },
]

interface Props {
  game: Game
  profile: Profile
  profileMods: Mod[]
  onOpenConfiguration: () => void
  onOpenTools: () => void
}

export function GameDiagnosticPanel({ game, profile, profileMods, onOpenConfiguration, onOpenTools }: Props) {
  const [section, setSection] = useState<SubSection>('resume')
  const [audit, setAudit] = useState<ProfileDeploymentAudit | undefined>()
  const [busy, setBusy] = useState(false)
  const health = computeGameHealth(game, profile, profileMods)

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
      </div>}

      {section === 'deployment' && <div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runAudit()} disabled={busy || !native.isDesktop()} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313] disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{busy ? 'Analyse en cours…' : (audit ? 'Relancer l’audit' : 'Lancer l’audit')}</button>
          <button type="button" onClick={onOpenTools} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold"><Wrench size={12} />Outils de réparation</button>
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

      {section === 'inputs' && <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-white/30">Disposition virtuelle</p>
          <p className="mt-2 text-sm font-semibold text-white/75">{LAYOUT_LABELS[effectiveLayout(game, profile.id)]}</p>
          <button type="button" onClick={onOpenConfiguration} className="mt-3 flex items-center gap-1.5 self-start rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold"><Keyboard size={12} />Configurer les commandes</button>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-white/30">Aucune langue Windows</p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/42">La traduction de touches reste locale au jeu, jamais active sur le bureau, Discord ou ZAILON.</p>
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
    </div>
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
