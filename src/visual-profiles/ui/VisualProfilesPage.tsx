import { AlertTriangle, BookOpenCheck, Check, Copy, Download, Gauge, GitCompareArrows, Heart, History, Monitor, Play, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { ZailonInfoPopover } from '../../components/UI/ZailonInfoPopover'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { native } from '../../lib/native'
import { createVisualProfile } from '../application/profile'
import { getVisualShortcutConfig, setVisualShortcutConfig, type VisualShortcutConfig } from '../application/shortcuts'
import { VISUAL_PRESETS } from '../domain/presets'
import type { VisualApplyResult, VisualBackendReport, VisualDisplayTarget, VisualProfile, VisualProfileHistoryItem, VisualSettings } from '../domain/types'
import { NEUTRAL_SETTINGS } from '../domain/types'
import { pickVisualProfileFile, saveVisualProfileFile, visualBackend } from '../infrastructure/nativeBackend'
import { BeforeAfterPreview } from './BeforeAfterPreview'
import { CalibrationWizard } from './CalibrationWizard'
import { MonitorSelector } from './MonitorSelector'
import { VisualProfileEditor } from './VisualProfileEditor'

const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

export function VisualProfilesPage() {
  const [profiles, setProfiles] = useState<VisualProfile[]>([])
  const [profile, setProfile] = useState<VisualProfile>(() => createVisualProfile('Neutre'))
  const [report, setReport] = useState<VisualBackendReport>()
  const [history, setHistory] = useState<VisualProfileHistoryItem[]>([])
  const [status, setStatus] = useState('Chargement du backend…')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<VisualApplyResult>()
  const [seconds, setSeconds] = useState(15)
  const [wizard, setWizard] = useState(false)
  const [liveScreenPreview, setLiveScreenPreview] = useState(false)
  const [shortcuts, setShortcuts] = useState<VisualShortcutConfig>(() => getVisualShortcutConfig())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [compare, setCompare] = useState<{ fileName: string; updatedAt: number; settings?: VisualSettings }>()

  const refresh = useCallback(async (preferredId?: string) => {
    if (!native.isDesktop()) {
      setStatus('Aperçu uniquement dans le navigateur. Ouvrez l’application ZAILON pour piloter Windows.')
      return
    }
    try {
      const [nextProfiles, nextReport] = await Promise.all([visualBackend.list(), visualBackend.backendReport()])
      setProfiles(nextProfiles)
      setReport(nextReport)
      const selected = nextProfiles.find(item => item.id === (preferredId || nextReport.activeProfileId))
        || nextProfiles[0]
      if (selected) setProfile(selected)
      else setProfile(createVisualProfile('Neutre', NEUTRAL_SETTINGS, nextReport.displays[0]?.id))
      setStatus(nextReport.diagnostics[0] || 'Backend prêt.')
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!native.isDesktop() || !profiles.some(item => item.id === profile.id)) {
      setHistory([])
      return
    }
    void visualBackend.history(profile.id).then(setHistory).catch(() => setHistory([]))
  }, [profile.id, profiles])

  useEffect(() => {
    if (!confirmation?.confirmationRequired || !confirmation.confirmationToken) return
    setSeconds(confirmation.confirmationSeconds)
    const timer = window.setInterval(() => {
      setSeconds(value => {
        if (value <= 1) {
          window.clearInterval(timer)
          setConfirmation(undefined)
          setStatus('Les réglages extrêmes ont été restaurés automatiquement.')
          void refresh(profile.id)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [confirmation, profile.id, refresh])

  useEffect(() => {
    if (!liveScreenPreview || !native.isDesktop() || profile.backendId === 'preview-only') return
    const timer = window.setTimeout(() => {
      void visualBackend.preview(profile, profile.monitorId).then(result => {
        setStatus(result.applied ? 'Aperçu en direct actif. L’état sûr précédent reste disponible.' : 'Aperçu local uniquement avec ce backend.')
      }).catch(reason => {
        setStatus(messageOf(reason))
        setLiveScreenPreview(false)
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [liveScreenPreview, profile])

  const backend = report?.backends.find(item => item.id === profile.backendId)
  const display = report?.displays.find(item => item.id === profile.monitorId) || report?.displays[0]
  const supportedSettings = backend?.supportsLivePreview && backend.available ? backend.supportedSettings : []
  const saved = profiles.some(item => item.id === profile.id)

  const persist = async (next = profile) => {
    await visualBackend.save(next)
    await refresh(next.id)
  }

  const apply = async () => {
    setBusy(true)
    try {
      await visualBackend.save(profile)
      const result = await visualBackend.apply(profile.id, profile.monitorId)
      setConfirmation(result.confirmationRequired ? result : undefined)
      setStatus(result.applied
        ? `Aperçu en direct actif · ${result.appliedSettings.join(', ')}`
        : `Aperçu local actif · ${result.previewOnlySettings.join(', ')}`)
      await refresh(profile.id)
    } catch (reason) {
      setStatus(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    setBusy(true)
    try {
      const result = await visualBackend.restore(profile.monitorId)
      setConfirmation(undefined)
      setStatus(`${result.restored} écran(s) restauré(s). ${result.diagnostics.join(' ')}`)
      await refresh(profile.id)
    } catch (reason) {
      setStatus(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async () => {
    const copy = createVisualProfile(`${profile.name} — copie`, profile.settings, profile.monitorId)
    copy.backendId = profile.backendId
    copy.description = profile.description
    await persist(copy)
  }

  const remove = async () => {
    if (!saved || !window.confirm(`Supprimer le profil visuel « ${profile.name} » ? Une copie sera conservée dans la corbeille locale ZAILON.`)) return
    if (report?.activeProfileId === profile.id) await visualBackend.restore()
    await visualBackend.delete(profile.id)
    await refresh()
  }

  const importProfile = async () => {
    const path = await pickVisualProfileFile()
    if (!path) return
    try {
      const imported = await visualBackend.import(path)
      await refresh(imported.id)
      setStatus(`Profil « ${imported.name} » importé et validé.`)
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }

  const exportProfile = async () => {
    if (!saved) await visualBackend.save(profile)
    const path = await saveVisualProfileFile(profile.name)
    if (!path) return
    try {
      const exported = await visualBackend.export(profile.id, path)
      setStatus(`Profil déclaratif exporté : ${exported}`)
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }

  const confirm = async () => {
    if (!confirmation?.confirmationToken) return
    await visualBackend.confirm(confirmation.confirmationToken)
    setConfirmation(undefined)
    setStatus('Réglages conservés comme état actif.')
  }

  const updateShortcuts = (next: VisualShortcutConfig) => {
    setShortcuts(next)
    setVisualShortcutConfig(next)
  }

  const restoreHistoryVersion = async (item: VisualProfileHistoryItem) => {
    try {
      const restored = await visualBackend.restoreVersion(profile.id, item.fileName)
      setProfile(restored)
      setHistoryOpen(false)
      setStatus('Ancienne version restaurée.')
      await refresh(profile.id)
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }

  const compareHistoryVersion = async (item: VisualProfileHistoryItem) => {
    try {
      const version = await visualBackend.readVersion(profile.id, item.fileName)
      setCompare({ fileName: item.fileName, updatedAt: item.updatedAt, settings: version.settings })
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }

  const deleteHistoryVersion = async (item: VisualProfileHistoryItem) => {
    if (!window.confirm('Supprimer cette version de l’historique ? Elle partira dans la corbeille ZAILON.')) return
    try {
      await visualBackend.deleteVersion(profile.id, item.fileName)
      setHistory(await visualBackend.history(profile.id))
      setStatus('Version supprimée de l’historique.')
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }

  const indicators = [
    ['Backend', backend?.name || report?.activeBackendId || 'aperçu'],
    ['Écran', display?.name || 'non détecté'],
    ['Profil actif', report?.activeProfileId ? profiles.find(item => item.id === report.activeProfileId)?.name || report.activeProfileId : 'aucun'],
    ['HDR', display?.hdrEnabled === true ? 'actif' : display?.hdrEnabled === false ? 'désactivé' : 'inconnu'],
    ['Mode', 'système'],
    ['Restauration', backend?.supportsAutomaticRestore ? 'active' : 'aperçu'],
  ]

  return <div className="h-full overflow-y-auto p-4 sm:p-6">
    <header className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/62">Affichage local · gratuit · hors ligne</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Visual Profiles</h1><p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/42">Ajustez les couleurs et la lisibilité de votre écran sans modifier les fichiers du jeu. Aucun code n’est injecté dans un processus de jeu.</p></div>
      <button type="button" onClick={() => setWizard(true)} className="flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-xs text-white/62 hover:border-gold/25 hover:text-gold"><BookOpenCheck size={14} />Calibrer mon écran</button>
    </header>

    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{indicators.map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.065] bg-white/[0.018] px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-white/28">{label}</p><p className="mt-1 truncate text-xs font-semibold text-white/68" title={value}>{value}</p></div>)}</div>

    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy || !native.isDesktop()} onClick={() => void apply()} className="flex items-center gap-2 rounded-lg bg-gold px-3.5 py-2 text-xs font-semibold text-[var(--zailon-accent-text)] disabled:opacity-35"><Play size={14} />Appliquer</button>
      <button type="button" disabled={busy || !native.isDesktop()} onClick={() => void restore()} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62 disabled:opacity-35"><X size={14} />Désactiver</button>
      <button type="button" onClick={() => setProfile(item => ({ ...item, settings: { ...NEUTRAL_SETTINGS } }))} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62"><RotateCcw size={14} />Réinitialiser</button>
      <button type="button" disabled={!native.isDesktop()} onClick={() => void persist()} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62"><Save size={14} />Enregistrer</button>
      <button type="button" disabled={!native.isDesktop()} onClick={() => void duplicate()} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62"><Copy size={14} />Dupliquer</button>
      <button type="button" disabled={!native.isDesktop()} onClick={() => void importProfile()} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62"><Upload size={14} />Importer</button>
      <button type="button" disabled={!native.isDesktop()} onClick={() => void exportProfile()} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62"><Download size={14} />Exporter</button>
      <button type="button" disabled={!native.isDesktop() || profile.backendId === 'preview-only'} onClick={() => {
        const next = !liveScreenPreview
        setLiveScreenPreview(next)
        if (!next) void restore()
      }} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:opacity-30 ${liveScreenPreview ? 'border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100/72' : 'border-white/[0.1] text-white/62'}`}><Monitor size={14} />Aperçu écran en direct : {liveScreenPreview ? 'actif' : 'inactif'}</button>
    </div>

    <div className={`mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${status.toLowerCase().includes('erreur') || status.toLowerCase().includes('refuse') ? 'border-red-300/15 bg-red-300/[0.03] text-red-100/65' : 'border-gold/12 bg-gold/[0.025] text-white/48'}`}>{status}</div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2"><SlidersHorizontal size={15} className="text-gold" /><h2 className="text-sm font-bold text-white/78">Profil et réglages</h2>
            <select value={profile.id} onChange={event => {
              const selected = profiles.find(item => item.id === event.target.value)
              if (!selected) return
              if (report?.activeProfileId && report.activeProfileId !== selected.id) {
                void visualBackend.restore().finally(() => setProfile(selected))
              } else setProfile(selected)
            }} className="ml-auto min-w-44 rounded-lg border border-white/[0.08] bg-[#111515] px-2.5 py-2 text-xs text-white/65"><option value={profile.id}>{saved ? profile.name : 'Nouveau profil'}</option>{profiles.filter(item => item.id !== profile.id).map(item => <option key={item.id} value={item.id}>{item.favorite ? '★ ' : ''}{item.name}</option>)}</select>
            <button type="button" title={profile.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => setProfile(item => ({ ...item, favorite: !item.favorite }))} className={`rounded-lg border p-2 ${profile.favorite ? 'border-rose-300/20 bg-rose-300/[0.05] text-rose-200' : 'border-white/[0.08] text-white/35'}`}><Heart size={13} fill={profile.favorite ? 'currentColor' : 'none'} /></button>
            <button type="button" onClick={() => setProfile(createVisualProfile('Nouveau profil', NEUTRAL_SETTINGS, display?.id))} className="rounded-lg border border-gold/18 px-2.5 py-2 text-xs text-gold/72">Nouveau</button>
            <button type="button" disabled={!saved} onClick={() => void remove()} className="rounded-lg border border-red-300/12 px-2.5 py-2 text-xs text-red-200/55 disabled:opacity-25">Supprimer</button>
          </div>
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-white/38">Nom<input value={profile.name} onChange={event => setProfile(item => ({ ...item, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-white/72 outline-none focus:border-gold/30" /></label>
            <label className="text-[11px] text-white/38">Backend<select value={profile.backendId} onChange={event => setProfile(item => ({ ...item, backendId: event.target.value as VisualProfile['backendId'] }))} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#111515] px-3 py-2 text-xs text-white/72">{report?.backends.map(item => <option key={item.id} value={item.id}>{item.name}{item.available ? '' : ' — indisponible'}</option>) || <option value="preview-only">Aperçu uniquement</option>}</select></label>
          </div>
          <label className="mb-4 block text-[11px] text-white/38">Description<textarea value={profile.description} onChange={event => setProfile(item => ({ ...item, description: event.target.value }))} className="mt-1 min-h-16 w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs leading-relaxed text-white/65 outline-none focus:border-gold/30" /></label>
          <div className="mb-4"><p className="mb-2 text-xs font-semibold text-white/65">Presets gratuits</p><div className="flex flex-wrap gap-1.5">{VISUAL_PRESETS.map(preset => <button key={preset.id} type="button" onClick={() => setProfile(item => ({ ...item, settings: { ...preset.settings }, name: saved ? item.name : preset.name, description: preset.description }))} className={`rounded-full border px-2.5 py-1.5 text-[11px] ${preset.category === 'rust' ? 'border-amber-300/12 text-amber-100/48' : preset.category === 'accessibility' ? 'border-sky-300/12 text-sky-100/50' : 'border-white/[0.08] text-white/48'} hover:border-gold/28 hover:text-gold`}>{preset.name}</button>)}</div></div>
          <VisualProfileEditor value={profile.settings} onChange={settings => setProfile(item => ({ ...item, settings }))} supportedSettings={supportedSettings} />
        </section>
      </div>
      <div className="space-y-4">
        <BeforeAfterPreview settings={profile.settings} />
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4"><div className="mb-3 flex items-center gap-2"><Monitor size={15} className="text-gold" /><h2 className="text-sm font-bold text-white/78">Écran ciblé</h2></div><MonitorSelector displays={report?.displays || []} value={profile.monitorId || display?.id} onChange={monitorId => setProfile(item => ({ ...item, monitorId }))} />{display?.hdrEnabled !== false && <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.03] p-2.5 text-[11px] leading-relaxed text-amber-100/62">Le gamma système est désactivé lorsque HDR est actif ou inconnu. Utilisez l’étalonnage HDR officiel de Windows.</p>}<div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => void visualBackend.openWindowsSettings('hdr')} className="rounded-lg border border-white/[0.08] px-2 py-2 text-[11px] text-white/52">Étalonnage HDR</button><button type="button" onClick={() => void visualBackend.openWindowsSettings('color-management')} className="rounded-lg border border-white/[0.08] px-2 py-2 text-[11px] text-white/52">Gestion ICC</button></div></section>
        <ShortcutSettings value={shortcuts} onChange={updateShortcuts} />
        <DiagnosticSection backend={backend} report={report} display={display} historyCount={history.length} onOpenHistory={() => setHistoryOpen(true)} onTest={() => void apply().then(() => window.setTimeout(() => void restore(), 2500))} onRestore={() => void restore()} />
      </div>
    </div>

    {historyOpen && <HistoryDialog profileName={profile.name} history={history} onClose={() => setHistoryOpen(false)} onRestore={item => void restoreHistoryVersion(item)} onCompare={item => void compareHistoryVersion(item)} onDelete={item => void deleteHistoryVersion(item)} />}
    {compare?.settings && <CompareVersionDialog profileName={profile.name} updatedAt={compare.updatedAt} versionSettings={compare.settings} currentSettings={profile.settings} onClose={() => setCompare(undefined)} />}

    {confirmation && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/78 p-5 backdrop-blur-md"><section className="w-full max-w-md rounded-2xl border border-amber-300/20 bg-[#111515] p-5 text-center shadow-2xl"><AlertTriangle size={30} className="mx-auto text-amber-200/75" /><h2 className="mt-3 text-lg font-bold text-white">Conserver ces réglages ?</h2><p className="mt-2 text-4xl font-black tabular-nums text-gold">{seconds}</p><p className="mt-2 text-xs leading-relaxed text-white/45">Sans validation, ZAILON restaure automatiquement le dernier état sûr.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => void confirm()} className="flex items-center justify-center gap-2 rounded-lg bg-gold py-2.5 text-xs font-semibold text-[var(--zailon-accent-text)]"><Check size={14} />Conserver</button><button type="button" onClick={() => void restore()} className="rounded-lg border border-white/[0.1] py-2.5 text-xs text-white/65">Restaurer</button></div></section></div>}
    {wizard && <CalibrationWizard onClose={() => setWizard(false)} />}
  </div>
}

/** Cellule d'état compacte du diagnostic (spec §1, §3) : les états utiles
 * restent VISIBLES, seule la documentation technique part dans la bulle ⓘ. */
function DiagnosticState({ label, value, detail, warning, onClick }: {
  label: string
  value: string
  detail?: string
  warning?: boolean
  onClick?: () => void
}) {
  return <button type="button" disabled={!onClick} onClick={onClick} title={detail} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${onClick ? 'border-gold/18 bg-gold/[0.035] hover:border-gold/35' : 'border-white/[0.065] bg-white/[0.018]'}`}>
    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/28">{label}{warning && <AlertTriangle size={9} className="shrink-0 text-amber-200/70" />}</p>
    <p className="mt-1 truncate text-xs font-semibold text-white/68">{value}</p>
    {detail && <p className="mt-0.5 truncate text-[10px] text-white/30">{detail}</p>}
  </button>
}

const DIAGNOSTIC_LIMITATIONS = [
  'Microsoft déconseille cette API pour la calibration générale.',
  'Le pilote ou Windows peut remplacer la rampe à tout moment.',
  'Application interdite lorsque HDR est actif ou inconnu.',
  'Le contrôle réellement distinct par écran n’est pas garanti par le pilote.',
  'Mode affichage système : aucune DLL injectée et aucun fichier de jeu modifié.',
  'ICC est détecté en lecture seule.',
  'HDR utilise l’outil officiel Windows.',
  'DDC/CI reste désactivé tant que l’autorisation matérielle n’a pas été validée.',
]

/** Diagnostic visuel compact (spec §1-3) : grille d'états + boutons, la
 * documentation technique est dans une bulle ⓘ (hover + clic + clavier). */
function DiagnosticSection({ backend, report, display, historyCount, onOpenHistory, onTest, onRestore }: {
  backend?: VisualBackendReport['backends'][number]
  report?: VisualBackendReport
  display?: VisualDisplayTarget
  historyCount: number
  onOpenHistory: () => void
  onTest: () => void
  onRestore: () => void
}) {
  const hdrValue = display?.hdrEnabled === true ? 'Actif' : display?.hdrEnabled === false ? 'Désactivé' : 'Inconnu'
  const icc = display?.iccProfile
  const restored = Boolean(report?.lastRestoration)
  const bubbleLines = [
    ...DIAGNOSTIC_LIMITATIONS,
    ...(backend?.limitations ?? []),
    ...(report?.diagnostics ?? []),
  ]
  return <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
    <div className="flex items-center gap-2">
      <Gauge size={15} className="text-gold" />
      <h2 className="text-sm font-bold text-white/78">Diagnostic visuel</h2>
      <span className="ml-auto"><ZailonInfoPopover wide text="" ><span className="block max-h-48 overflow-y-auto space-y-1.5 pr-1">{bubbleLines.map(line => <span key={line} className="block">• {line}</span>)}</span></ZailonInfoPopover></span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <DiagnosticState label="Backend" value={backend?.name || report?.activeBackendId || 'aperçu'} />
      <DiagnosticState label="HDR" value={hdrValue} detail="L’étalonnage gamma est désactivé si HDR est actif ou inconnu." />
      <DiagnosticState label="ICC" value={icc ? 'Détecté' : 'Aucun'} detail={icc || undefined} />
      <DiagnosticState label="Restauration" value={restored ? 'Confirmée' : 'Non confirmée'} warning={!restored} detail={report?.lastRestoration ? `Dernière : ${report.lastRestoration}` : 'Aucune restauration enregistrée'} />
      <DiagnosticState label="Historique" value={`${historyCount} version(s)`} onClick={historyCount ? onOpenHistory : undefined} detail="Ouvrir l’historique du profil (restaurer, comparer, supprimer)." />
      <DiagnosticState label="Profil actif" value={report?.activeProfileId || 'aucun'} />
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={!native.isDesktop()} onClick={onTest} className="flex items-center gap-2 rounded-lg border border-emerald-300/14 px-3 py-2 text-xs text-emerald-100/60"><ShieldCheck size={14} />Tester</button>
      <button type="button" disabled={!native.isDesktop()} onClick={onRestore} className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/62"><RotateCcw size={14} />Restaurer</button>
    </div>
  </section>
}

/** Fenêtre Historique (spec §4) : toutes les versions, actions Restaurer /
 * Comparer / Supprimer. La liste est plafonnée à 50 versions côté natif. */
function HistoryDialog({ profileName, history, onClose, onRestore, onCompare, onDelete }: {
  profileName: string
  history: VisualProfileHistoryItem[]
  onClose: () => void
  onRestore: (item: VisualProfileHistoryItem) => void
  onCompare: (item: VisualProfileHistoryItem) => void
  onDelete: (item: VisualProfileHistoryItem) => void
}) {
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/78 p-5 backdrop-blur-md">
    <section className="max-h-[84vh] w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[#111515] shadow-2xl">
      <header className="flex items-center gap-2 border-b border-white/[0.07] p-4"><History size={15} className="text-gold" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/82">Historique · {profileName}</h2><p className="mt-0.5 text-[11px] text-white/34">{history.length} version(s) · plafonné à 50 automatiquement</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={15} /></button></header>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto p-4">
        {history.length === 0
          ? <p className="py-8 text-center text-xs text-white/35">Aucune version enregistrée. Enregistrez le profil pour créer un point d’historique.</p>
          : history.map(item => <div key={item.fileName} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
            <span className="min-w-0 flex-1 text-xs font-medium text-white/62">{new Date(item.updatedAt * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <button type="button" onClick={() => onRestore(item)} className="flex items-center gap-1.5 rounded-lg border border-gold/20 px-2.5 py-1.5 text-[11px] font-semibold text-gold"><RotateCcw size={11} />Restaurer</button>
            <button type="button" onClick={() => onCompare(item)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[11px] text-white/55 hover:bg-white/[0.05]"><GitCompareArrows size={11} />Comparer</button>
            <button type="button" onClick={() => onDelete(item)} title="Supprimer cette version (corbeille ZAILON)" className="rounded-lg p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={12} /></button>
          </div>)}
        </div>
      <footer className="flex justify-end border-t border-white/[0.07] p-3"><button onClick={onClose} className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/55">Fermer</button></footer>
    </section>
  </div>
}

const COMPARE_SETTING_LABELS: Array<{ key: keyof VisualSettings; label: string }> = [
  ['saturation', 'Saturation'], ['vibrance', 'Vibrance'], ['brightness', 'Luminosité'], ['contrast', 'Contraste'],
  ['gamma', 'Gamma'], ['temperature', 'Température'], ['red', 'Rouge'], ['green', 'Vert'], ['blue', 'Bleu'],
  ['shadows', 'Ombres'], ['highlights', 'Hautes lumières'], ['sharpness', 'Netteté'],
].map(([key, label]) => ({ key: key as keyof VisualSettings, label }))

/** Comparaison d'une version d'historique avec le profil actuel (spec §4). */
function CompareVersionDialog({ profileName, updatedAt, versionSettings, currentSettings, onClose }: {
  profileName: string
  updatedAt: number
  versionSettings: VisualSettings
  currentSettings: VisualSettings
  onClose: () => void
}) {
  const fmt = (value: number, key: keyof VisualSettings) => key === 'temperature' ? `${Math.round(value)} K` : Number(value.toFixed(2)).toString()
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/78 p-5 backdrop-blur-md">
    <section className="max-h-[84vh] w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-[#111515] shadow-2xl">
      <header className="flex items-center gap-2 border-b border-white/[0.07] p-4"><GitCompareArrows size={15} className="text-gold" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/82">Comparer · {profileName}</h2><p className="mt-0.5 text-[11px] text-white/34">Version du {new Date(updatedAt * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} vs profil actuel</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={15} /></button></header>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto p-4">
        {COMPARE_SETTING_LABELS.map(({ key, label }) => {
          const before = versionSettings[key]
          const after = currentSettings[key]
          const changed = before !== after
          return <div key={key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${changed ? 'border-gold/20 bg-gold/[0.035]' : 'border-white/[0.05] bg-white/[0.01]'}`}>
            <span className="flex-1 text-[11px] text-white/55">{label}</span>
            <span className={`font-mono text-[11px] ${changed ? 'text-amber-100/80' : 'text-white/35'}`}>{fmt(before, key)}</span>
            <span className="text-white/25">→</span>
            <span className={`font-mono text-[11px] ${changed ? 'text-gold' : 'text-white/35'}`}>{fmt(after, key)}</span>
          </div>
        })}
      </div>
      <footer className="flex justify-end border-t border-white/[0.07] p-3"><button onClick={onClose} className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/55">Fermer</button></footer>
    </section>
  </div>
}

function ShortcutSettings({ value, onChange }: { value: VisualShortcutConfig; onChange: (value: VisualShortcutConfig) => void }) {
  const fields: Array<[keyof Omit<VisualShortcutConfig, 'enabled'>, string]> = [['restore', 'Restauration immédiate'], ['toggle', 'Activer / désactiver'], ['previous', 'Profil précédent'], ['next', 'Profil suivant']]
  return <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
    <div className="flex items-center gap-2"><SlidersHorizontal size={15} className="text-gold" /><h2 className="text-sm font-bold text-white/78">Raccourcis d’urgence</h2><button type="button" onClick={() => onChange({ ...value, enabled: !value.enabled })} className={`ml-auto h-5 w-9 rounded-full p-0.5 transition-colors ${value.enabled ? 'bg-gold' : 'bg-white/15'}`} aria-pressed={value.enabled}><span className={`block h-4 w-4 rounded-full bg-[#101313] transition-transform ${value.enabled ? 'translate-x-4' : ''}`} /></button></div>
    <div className="mt-3 space-y-2">{fields.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[11px] text-white/42"><span className="flex-1">{label}</span><input value={value[key]} disabled={!value.enabled} onChange={event => onChange({ ...value, [key]: event.target.value })} className="w-36 rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1.5 font-mono text-[11px] text-white/62 outline-none disabled:opacity-30" /></label>)}</div>
  </section>
}
