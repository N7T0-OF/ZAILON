import { AlertTriangle, Archive, Bookmark, CheckCircle2, ChevronDown, Copy, FileArchive, FolderOpen, Gamepad2, HardDrive, History, Keyboard, Layers3, Loader2, MonitorDown, Package, Plus, RefreshCw, Rocket, Settings2, ShieldCheck, Snowflake, Trash2, Upload, Wand2, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { effectiveInputProfile, effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { adapterFor, isLauncherBased, LAUNCH_BEHAVIOR_LABELS } from '../../lib/launchAdapters'
import { pickPrioritySession } from '../../lib/sessionPriority'
import { countActiveMods } from '../../lib/profileState'
import {
  ANIMATION_POLICY_LABELS,
  DOWNLOAD_POLICY_LABELS,
  effectivePerformance,
  GAME_PROCESS_PRIORITIES,
  GAME_PROCESS_PRIORITY_LABELS,
  PERFORMANCE_PRESETS,
  policiesForMode,
  QUICK_PANEL_POLICY_LABELS,
  SCAN_POLICY_LABELS,
  ZAILON_PRIORITY_LABELS,
  type AnimationPolicy,
  type DownloadPolicy,
  type GameProcessPriority,
  type PerformanceMode,
  type QuickPanelPolicy,
  type ScanPolicy,
  type ZailonPerformancePolicies,
  type ZailonPriorityPolicy,
} from '../../lib/performanceProfiles'
import { native, pickExecutable, pickFolder, type ShortcutCreationResult } from '../../lib/native'
import { shortcutPlanFor } from '../../lib/shortcuts'
import { resolveGameInstallation, shortPathName } from '../../lib/installations'
import { ProfileShareDialog } from '../UI/ProfileShareDialog'
import { detectModBackend, frostyBackendStatus } from '../../lib/modBackends'
import { frostyOverhaulConflict, frostyPluginConfigKey, FROSTY_STRATEGY_LABELS } from '../../lib/frosty'
import {
  classifyReShadeCompatibility,
  COMPATIBILITY_LABELS,
  GRAPHICS_API_LABELS,
  resolveReShadeSessionStrategy,
  resolveReShadeTarget,
} from '../../lib/reshade'
import { addonCapabilities, hasCapability } from '../../lib/addonGating'
import { resolveProfileMods, useStore } from '../../store/useStore'
import type { Game, GamePreset, ModRuntimePathType, Profile } from '../../types'

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
import { formatClock, formatTime } from '../../utils'
import { GameKeyboardPanel } from './GameKeyboardPanel'
import { ZailonSwitch } from '../UI/ZailonSwitch'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'

const RUNTIME_TYPE_LABELS: Array<[ModRuntimePathType, string]> = [
  ['loader', 'Loader'],
  ['bypass', 'Signature bypass'],
  ['plugins', 'Plugin folder'],
  ['scripts', 'Script folder'],
  ['custom', 'Custom'],
]

// Spec correctifs §3 : sections réduites par défaut, sauf les essentielles
// à la première configuration. Seul « Lancement » (exécutable + dossier mods)
// est ouvert ; « Apparence » et toutes les sections secondaires (Presets,
// Sauvegardes, Compatibilité, Performances…) démarrent repliées. L'état
// ouvert/fermé est mémorisé PAR JEU via localStorage (storageKey ci-dessous).
const DEFAULT_OPEN = ['lancement']

interface Props {
  game: Game
  profile: Profile
  onBrowseExecutable: () => void
  onBrowseModsFolder: () => void
}

export function GameConfigurationPanel({ game, profile, onBrowseExecutable, onBrowseModsFolder }: Props) {
  const setGamePath = useStore(state => state.setGamePath)
  const setModsPath = useStore(state => state.setModsPath)
  const addInstallation = useStore(state => state.addInstallation)
  const updateInstallation = useStore(state => state.updateInstallation)
  const removeInstallation = useStore(state => state.removeInstallation)
  const setProfileInstallation = useStore(state => state.setProfileInstallation)
  const reduceExplanations = useStore(state => state.reduceExplanations)
  const advancedMode = useStore(state => state.advancedMode)
  const performanceMode = useStore(state => state.performanceModes[game.id] ?? state.globalPerformanceMode)
  const performanceCustom = useStore(state => state.performanceCustom[game.id])
  const setPerformanceMode = useStore(state => state.setPerformanceMode)
  const setPerformanceCustom = useStore(state => state.setPerformanceCustom)
  const gameSessions = useStore(state => state.gameSessions)
  const pinnedPriorityGameId = useStore(state => state.pinnedPriorityGameId)
  const foregroundGameId = useStore(state => state.foregroundGameId)
  const setGameBypassPath = useStore(state => state.setGameBypassPath)
  const addGameRuntimePath = useStore(state => state.addGameRuntimePath)
  const updateGameRuntimePath = useStore(state => state.updateGameRuntimePath)
  const removeGameRuntimePath = useStore(state => state.removeGameRuntimePath)
  const saveGamePreset = useStore(state => state.saveGamePreset)
  const deleteGamePreset = useStore(state => state.deleteGamePreset)
  const applyGamePreset = useStore(state => state.applyGamePreset)
  const restorePoints = useStore(state => state.restorePoints)
  const autoRestorePoints = useStore(state => state.autoRestorePoints)
  const setAutoRestorePoints = useStore(state => state.setAutoRestorePoints)
  const createRestorePoint = useStore(state => state.createRestorePoint)
  const restoreRestorePoint = useStore(state => state.restoreRestorePoint)
  const deleteRestorePoint = useStore(state => state.deleteRestorePoint)
  const storageKey = `zailon:config-open:${game.id}`
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTab, setShareTab] = useState<'export' | 'import'>('export')
  const [shortcutBusy, setShortcutBusy] = useState(false)
  const [shortcutResult, setShortcutResult] = useState<ShortcutCreationResult | null>(null)
  const [open, setOpen] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as string[] | null
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_OPEN
    } catch { return DEFAULT_OPEN }
  })
  const [visualName, setVisualName] = useState<string | null>(null)
  const [currentVisualId, setCurrentVisualId] = useState<string | undefined>()
  const [visualProfiles, setVisualProfiles] = useState<Array<{ id: string; name: string }>>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Gating réel (spec Add-ons §12-15) : blocs Frosty/ReShade uniquement si les
  // add-ons correspondants sont installés et activés.
  const installedAddons = useStore(state => state.addons)
  const capabilities = useMemo(() => addonCapabilities(installedAddons), [installedAddons])
  const hasFrostyCap = hasCapability(capabilities, 'frosty.backend')
  const hasReShadeCap = hasCapability(capabilities, 'reshade.manager')
  const hasNteCap = hasCapability(capabilities, 'nte.modloader')
  const hasPerformancePlus = hasCapability(capabilities, 'performance.plus')
  const frostyEligible = detectModBackend({ execPath: game.execPath, gameName: game.name, nteAllowed: hasNteCap }) === 'frosty'
  const reshadeEligible = resolveReShadeTarget(game).confidence >= 0.6
  const setView = useStore(state => state.setView)
  const openAddons = () => setView('addons')

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(open))
  }, [open, storageKey])

  useEffect(() => {
    if (!native.isDesktop()) return
    let cancelled = false
    Promise.all([native.visualProfiles.association(game.id, profile.id), native.visualProfiles.list()])
      .then(([associationId, profiles]) => {
        if (cancelled) return
        setVisualProfiles(profiles.map(item => ({ id: item.id, name: item.name })))
        setCurrentVisualId(associationId || undefined)
        const matched = associationId
          ? profiles.find(item => item.id === associationId)
          : profiles.find(item => item.gameAssociations.some(assoc => assoc.gameId === game.id && (!assoc.profileId || assoc.profileId === profile.id)))
        setVisualName(matched?.name || null)
      })
      .catch(() => { if (!cancelled) setVisualName(null) })
    return () => { cancelled = true }
  }, [game.id, profile.id])

  const toggle = (id: string) => setOpen(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  // Spec « Passe de correction » §4 : création en UN clic, sans micro-fenêtre.
  // Jeu sélectionné + profil actif → .lnk via ZAILON (chaîne conservée), icône
  // résolue côté natif. Vérification post-création affichée en ligne.
  const createShortcut = async () => {
    setShortcutBusy(true)
    setShortcutResult(null)
    try {
      const entry = shortcutPlanFor(game, 'current', profile.id)[0]
      if (!entry) throw new Error('Aucun profil disponible')
      const result = await native.createDesktopShortcut(game.id, entry.profileId, entry.displayName, {
        iconPath: game.resources?.iconPath,
        execPath: game.execPath,
        mode: 'zailon',
      })
      setShortcutResult(result)
    } catch (reason) {
      setShortcutResult({ path: String(reason), mode: 'zailon', verified: false, message: String(reason) })
    } finally {
      setShortcutBusy(false)
    }
  }
  const profileMods = resolveProfileMods(game, profile)
  const frameworks = [...new Set(game.installedMods.map(mod => mod.framework).filter((value): value is string => Boolean(value)))]
  const points = restorePoints.filter(item => item.gameId === game.id).sort((left, right) => right.createdAt - left.createdAt)



  const comparePoint = (point: typeof points[number]) => {
    const current = {
      profiles: game.profiles.length,
      modStates: game.profiles.reduce((sum, item) => sum + Object.keys(item.modStates).length, 0),
      keyboards: game.keyboardProfiles?.length || 0,
    }
    const saved = {
      profiles: point.profiles.length,
      modStates: point.profiles.reduce((sum, item) => sum + Object.keys(item.modStates).length, 0),
      keyboards: point.keyboardProfiles?.length || 0,
    }
    window.alert([
      `Comparaison avec « ${point.label} »`, '',
      `Profils : ${saved.profiles} → ${current.profiles}`,
      `Références de mods : ${saved.modStates} → ${current.modStates}`,
      `Profils d’entrée : ${saved.keyboards} → ${current.keyboards}`,
    ].join('\n'))
  }

  return <div className="min-h-0 flex-1 overflow-y-auto p-4">
    <section className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-gold/75"><Rocket size={16} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-white/80">Configuration de {game.name}</h2>
          {!reduceExplanations && <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-white/38">Réglages propres à ce jeu, regroupés ici. Les Paramètres globaux restent dans le menu Paramètres de ZAILON.</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <SummaryPill label="Clavier" value={LAYOUT_LABELS[effectiveLayout(game, profile.id)]} />
        <SummaryPill label="Profil visuel" value={visualName || '—'} />
        <SummaryPill label="Profils de mods" value={String(game.profiles.length)} />
        <SummaryPill label="Mods actifs" value={`${countActiveMods(profileMods)}`} />
        <SummaryPill label="Temps de jeu" value={formatTime(game.totalPlaytime)} />
      </div>
    </section>

    <div className="space-y-3">
      <ConfigCard id="lancement" title="Lancement" icon={Rocket} badge={`${game.execPath ? 'Exécutable configuré' : 'À configurer'}`} open={open.includes('lancement')} onToggle={() => toggle('lancement')}>
        <Field label="Exécutable du jeu" value={game.execPath || ''} placeholder="Sélectionnez l’exécutable" onChange={value => void setGamePath(game.id, value)} onBrowse={onBrowseExecutable} onOpen={game.execPath ? () => void native.openPath(game.execPath!) : undefined} />
        <Field label="Dossier Mods" value={game.modsPath || ''} placeholder="Sélectionnez le dossier Mods" onChange={value => setModsPath(game.id, value)} onBrowse={onBrowseModsFolder} onOpen={game.modsPath ? () => void native.openPath(game.modsPath!) : undefined} />
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <button type="button" onClick={() => setAdvancedOpen(open => !open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left" aria-expanded={advancedOpen || advancedMode}>
            <span className="flex items-center gap-2 text-[11px] font-semibold text-white/60"><Settings2 size={12} />Avancé</span>
            <span className="flex items-center gap-2 text-[11px] text-white/30">{advancedMode ? 'Toujours visible (mode avancé)' : 'Détails techniques'}<ChevronDown size={12} className={`transition-transform ${advancedOpen || advancedMode ? 'rotate-180' : ''}`} /></span>
          </button>
          {(advancedOpen || advancedMode) && <div className="space-y-3 border-t border-white/[0.05] px-3 pb-3 pt-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2"><span className="text-[11px] text-white/45">Dossier Bypass / Loader</span><ZailonInfoPopover text="Certains jeux nécessitent un loader, un bypass de signature ou un dossier intermédiaire pour charger les mods (ex. Ultimate ASI Loader, dossier Paks). Laissez vide si le jeu n’en utilise pas." /></div>
              <div className="mt-1.5 flex gap-2">
                <input value={game.bypassPath || ''} onChange={event => setGameBypassPath(game.id, event.target.value)} placeholder="Optionnel — dossier du loader ou bypass" className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/72 outline-none focus:border-gold/30" />
                <button type="button" onClick={async () => { const path = await pickFolder(`Choisir le dossier Bypass / Loader — ${game.name}`); if (path) setGameBypassPath(game.id, path) }} className="rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold">Choisir</button>
                {game.bypassPath && <button type="button" onClick={() => void native.openPath(game.bypassPath!)} title="Ouvrir le dossier Bypass dans l’Explorateur" className="rounded-lg border border-white/[0.09] bg-white/[0.025] p-2 text-white/45 hover:border-gold/25 hover:text-gold"><FolderOpen size={13} /></button>}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="text-[11px] text-white/45">Chemins additionnels</span><ZailonInfoPopover text="Certains jeux ont une structure inhabituelle : plusieurs dossiers utiles au runtime (plugin folder, dossier de scripts, signature bypass…). Ajoutez-les ici pour éviter de recoder ZAILON pour chaque jeu." /></div>
                <button type="button" onClick={() => addGameRuntimePath(game.id, { name: '', path: '', type: 'loader' })} className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-2.5 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10"><Plus size={12} />Ajouter</button>
              </div>
              {(game.runtimePaths || []).map((entry, index) => (
                <div key={index} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto]">
                  <input value={entry.name} onChange={event => updateGameRuntimePath(game.id, index, { name: event.target.value })} placeholder="Nom (ex. ASI Loader)" className="min-w-0 rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[11px] text-white/70 outline-none focus:border-gold/30" />
                  <input value={entry.path} onChange={event => updateGameRuntimePath(game.id, index, { path: event.target.value })} placeholder="Chemin" className="min-w-0 rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[11px] text-white/70 outline-none focus:border-gold/30" />
                  <select value={entry.type} onChange={event => updateGameRuntimePath(game.id, index, { type: event.target.value as ModRuntimePathType })} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-2 text-[11px] text-white/68">{RUNTIME_TYPE_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <button type="button" onClick={() => removeGameRuntimePath(game.id, index)} title="Retirer ce chemin" className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={12} /></button>
                </div>
              ))}
              {(game.runtimePaths || []).length === 0 && <p className="mt-2 text-[11px] text-white/32">Aucun chemin additionnel. La plupart des jeux n’en ont pas besoin.</p>}
            </div>
          </div>}
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-white/68">Raccourci de lancement sécurisé</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/34">Crée en un clic un raccourci bureau ZAILON lié à ce jeu et au profil actif « {profile.name} ». Le .lnk lance la chaîne ZAILON (profil, mods, clavier, visuel) — icône résolue automatiquement.</p>
            </div>
            <button type="button" onClick={() => void createShortcut()} disabled={shortcutBusy} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90 disabled:cursor-wait disabled:opacity-55">{shortcutBusy ? <Loader2 size={14} className="animate-spin" /> : <MonitorDown size={14} />}Créer sur le bureau</button>
          </div>
          {shortcutResult && <p className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${shortcutResult.verified ? 'border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-100/75' : 'border-red-300/15 bg-red-300/[0.04] text-red-200/80'}`}>{shortcutResult.verified ? `✓ Raccourci créé et vérifié : ${shortcutResult.path}` : `Échec de la création — ${shortcutResult.message || shortcutResult.path}`}{shortcutResult.mode === 'direct' ? ' (cible directe : l’exécutable du jeu)' : ''}</p>}
        </div>
        <LaunchChainTest game={game} />
      </ConfigCard>

      {/* Spec « Profils multi-installation » §6-16, §60-64 : un jeu = une carte,
       * plusieurs installations physiques ; chaque profil choisit la sienne
       * (onglet Profils → « Installation utilisée »). */}
      <ConfigCard id="installations" title="Installations" icon={HardDrive} badge={`${(game.installations || []).length} installation(s)`} open={open.includes('installations')} onToggle={() => toggle('installations')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-[11px] leading-relaxed text-white/40">Plusieurs copies/variantes du même jeu (FiveM Default/Drift, version Steam vs standalone, édition moddée…). Un seul jeu dans la Bibliothèque — chaque profil référence l’installation à utiliser, le lancement bascule automatiquement (exécutable, racine, dossier mods).<ZailonInfoPopover text="L'installation « Principal » est créée automatiquement depuis l'exécutable configuré. Le changement de profil change l'installation cible — le tracking et les statistiques distinguent chaque variante." /></p>
          <button type="button" onClick={async () => {
            const execPath = await pickExecutable()
            if (!execPath) return
            const parent = execPath.replace(/[\\/][^\\/]+$/, '')
            addInstallation(game.id, {
              name: shortPathName(parent) || `Installation ${(game.installations || []).length + 1}`,
              executablePath: execPath,
              rootPath: parent,
              platform: game.platform,
            })
          }} className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/10"><Plus size={13} />Ajouter une installation</button>
        </div>
        {(game.installations || []).length === 0
          ? <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-white/32">Aucune installation — configurez un exécutable dans « Lancement » pour créer « Principal ».</p>
          : <ul className="space-y-2">{(game.installations || []).map(installation => {
            const isPrincipal = installation.id === 'principal'
            const usedByProfiles = game.profiles.filter(profile => profile.installationId === installation.id)
            return <li key={installation.id} className={`rounded-xl border p-3 ${resolveGameInstallation(game, profile).installation?.id === installation.id ? 'border-gold/20 bg-gold/[0.03]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <input value={installation.name} onChange={event => updateInstallation(game.id, installation.id, { name: event.target.value })} className="min-w-36 flex-1 bg-transparent text-xs font-semibold text-white/78 outline-none" />
                {isPrincipal && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold text-white/38">Principal</span>}
                <span className="ml-auto font-mono text-[10px] text-white/28">{usedByProfiles.length ? `${usedByProfiles.map(item => item.name).join(', ')}` : 'aucun profil'}</span>
                {!isPrincipal && <button type="button" onClick={() => removeInstallation(game.id, installation.id)} title="Retirer cette installation (les profils retombent sur Principal)" className="rounded-lg p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={12} /></button>}
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-white/34" title={installation.executablePath || installation.rootPath}>{installation.executablePath || installation.rootPath || 'Chemin non défini'}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-[10px] text-white/36">Exécutable
                  <input value={installation.executablePath || ''} onChange={event => updateInstallation(game.id, installation.id, { executablePath: event.target.value })} placeholder="C:\Jeux\FiveM\FiveM.exe" className="mt-1 block w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1.5 text-[10px] text-white/64 outline-none focus:border-gold/30" />
                </label>
                <label className="text-[10px] text-white/36">Racine du jeu
                  <input value={installation.rootPath || ''} onChange={event => updateInstallation(game.id, installation.id, { rootPath: event.target.value })} placeholder="C:\Jeux\FiveM" className="mt-1 block w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1.5 text-[10px] text-white/64 outline-none focus:border-gold/30" />
                </label>
              </div>
            </li>
          })}</ul>}
      </ConfigCard>

      <ConfigCard id="commandes" title="Commandes" icon={Keyboard} badge={`${LAYOUT_LABELS[effectiveLayout(game, profile.id)]}`} open={open.includes('commandes')} onToggle={() => toggle('commandes')}>
        <GameKeyboardPanel game={game} profile={profile} embedded />
      </ConfigCard>

      <ConfigCard id="presets" title="Presets" icon={Bookmark} badge={`${(game.presets || []).length} preset(s)`} open={open.includes('presets')} onToggle={() => toggle('presets')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-[11px] leading-relaxed text-white/38">Un preset regroupe un profil de mods, une disposition clavier et un profil visuel : appliquez toute la configuration d’un clic, sans dupliquer les fichiers.</p>
          <button type="button" onClick={() => {
            const now = Date.now()
            const inputProfile = effectiveInputProfile(game, profile.id)
            const preset: GamePreset = {
              id: createId(),
              name: `Preset · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
              profileId: profile.id,
              keyboardProfileId: inputProfile?.id,
              visualProfileId: currentVisualId,
              createdAt: now,
              updatedAt: now,
            }
            saveGamePreset(game.id, preset)
          }} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Plus size={12} />Créer depuis l’état actuel</button>
        </div>
        {(game.presets || []).length === 0
          ? <p className="mt-3 text-[11px] text-white/34">Aucun preset. Créez-en un depuis la configuration actuelle (profil « {profile.name} », clavier et visuel associés).</p>
          : <ul className="mt-3 space-y-2">{(game.presets || []).map(preset => {
            const inputProfile = game.keyboardProfiles?.find(item => item.id === preset.keyboardProfileId)
            const visualProfile = visualProfiles.find(item => item.id === preset.visualProfileId)
            return <li key={preset.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white/78">{preset.name}</span>
                <span className="mt-0.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/45">{game.profiles.find(item => item.id === preset.profileId)?.name || 'Profil supprimé'}</span>
                  {inputProfile && <span className="rounded-full bg-white/[0.035] px-2 py-0.5 font-mono text-[10px] text-white/45">{inputProfile.layout.toUpperCase()}</span>}
                  {visualProfile && <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/45">Visuel · {visualProfile.name}</span>}
                  {!inputProfile && !visualProfile && <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/32">Sans clavier ni visuel</span>}
                </span>
              </span>
              <button type="button" onClick={() => void applyGamePreset(game.id, preset.id)} className="rounded-lg border border-gold/25 px-2.5 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10">Appliquer</button>
              <button type="button" onClick={() => { const now = Date.now(); saveGamePreset(game.id, { ...preset, id: createId(), name: `${preset.name} (copie)`, createdAt: now, updatedAt: now }) }} title="Dupliquer ce preset" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Copy size={13} /></button>
              <button type="button" onClick={() => deleteGamePreset(game.id, preset.id)} title="Supprimer ce preset" className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={13} /></button>
            </li>
          })}</ul>}
      </ConfigCard>

      <ConfigCard id="sauvegardes" title="Sauvegardes" icon={FileArchive} badge={`${points.length} point(s) de restauration`} open={open.includes('sauvegardes')} onToggle={() => toggle('sauvegardes')}>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => { setShareTab('export'); setShareOpen(true) }} className="flex flex-col items-start gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left hover:border-gold/25">
            <FileArchive size={15} className="text-gold/75" />
            <span className="mt-1 text-[11px] font-semibold text-white/72">Exporter un profil</span>
            <span className="text-[11px] leading-relaxed text-white/34">Léger (code ou fichier) ou hors ligne. Reproductibilité, taille estimée, chemins neutralisés.</span>
          </button>
          <button type="button" onClick={() => { setShareTab('import'); setShareOpen(true) }} className="flex flex-col items-start gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left hover:border-gold/25">
            <Upload size={15} className="text-gold/75" />
            <span className="mt-1 text-[11px] font-semibold text-white/72">Importer un profil</span>
            <span className="text-[11px] leading-relaxed text-white/34">Fichier .zailon-profile ou code collé. Aperçu avant création d’un nouveau profil, sans écrasement.</span>
          </button>
        </div>
        <div className="mt-3 border-t border-white/[0.05] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-white/68">Points de restauration</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-white/45"><ZailonSwitch size="compact" checked={autoRestorePoints} onChange={setAutoRestorePoints} />Auto avant lancement</label>
              <button type="button" onClick={() => createRestorePoint(`Manuel · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><History size={13} />Créer un point</button>
            </div>
          </div>
          {points.length === 0
            ? <p className="mt-2 text-[11px] text-white/34">Aucun point de restauration pour ce jeu. Un point sauvegarde profils, ordre, versions, touches et apparence sans dupliquer les paquets.</p>
            : <ul className="mt-2 space-y-1.5">{points.map(point => (
              <li key={point.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white/72">{point.label}</span>
                  <span className="mt-0.5 block text-[10px] text-white/34">{new Date(point.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {new Date(point.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {point.profiles.length} profil(s) · {point.keyboardLayout ? LAYOUT_LABELS[point.keyboardLayout] : '—'}</span>
                </span>
                {point.source === 'auto' && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] text-white/38">Auto</span>}
                <button type="button" onClick={() => comparePoint(point)} className="rounded-lg px-2 py-1 text-[11px] text-white/42 hover:bg-white/[0.06] hover:text-white/75">Comparer</button>
                <button type="button" onClick={() => { if (window.confirm(`Restaurer le point « ${point.label} » ?\n\nLes profils, touches et apparence actuels seront remplacés par cet instantané.`)) restoreRestorePoint(game.id, point.id) }} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-gold hover:bg-gold/10">Restaurer</button>
                <button type="button" onClick={() => deleteRestorePoint(game.id, point.id)} title="Supprimer ce point" className="rounded-lg p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={12} /></button>
              </li>
            ))}</ul>}
        </div>
      </ConfigCard>

      <ConfigCard id="compatibilite" title="Compatibilité" icon={Layers3} badge={frameworks.length ? `${frameworks.length} framework(s) détecté(s)` : 'Aucun framework détecté'} open={open.includes('compatibilite')} onToggle={() => toggle('compatibilite')}>
        {frameworks.length
          ? <div className="flex flex-wrap gap-2">{frameworks.map(framework => <span key={framework} className="rounded-full bg-white/[0.035] px-2.5 py-1 font-mono text-[11px] text-white/55">{framework}</span>)}</div>
          : <p className="text-[11px] leading-relaxed text-white/38">Aucun framework identifié dans le dossier Mods. Lancez « Analyser le dossier Mods » depuis l’onglet Outils pour rafraîchir.</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-white/34">Détection d’overlays, de gestionnaires concurrents (ex. MO2) et de configuration particulière : à venir (Phase 2 de la refonte UX).</p>
      </ConfigCard>

      {/* Gating réel (spec Add-ons §12-15, §74) : Frosty et ReShade n'existent
          que si leurs add-ons sont installés et activés. Sans add-on, un jeu
          éligible propose simplement « Ajouter à ZAILON » (spec §36, §38). */}
      {hasFrostyCap
        ? <FrostyConfigCard game={game} profile={profile} />
        : frostyEligible
          ? <AddonAvailableCard icon={<Snowflake size={14} />} addonName="Frosty Support" description="Support Frosty pour les jeux Frostbite compatibles (NFS 2015, Battlefield…) : .fbmod, runtimes, ordre de chargement et lancement." onInstall={openAddons} />
          : null}

      {hasReShadeCap
        ? <ReShadeConfigCard game={game} profile={profile} />
        : reshadeEligible
          ? <AddonAvailableCard icon={<Wand2 size={14} />} addonName="ReShade Manager" description="Installation ReShade, mises à jour, presets et shaders pour ce jeu — sans clé API." onInstall={openAddons} />
          : null}

      <ConfigCard id="performances" title="Performances" icon={Gamepad2} badge={modeLabel(performanceMode)} open={open.includes('performances')} onToggle={() => toggle('performances')}>
        <PerformanceSettings
          game={game}
          mode={performanceMode}
          custom={performanceCustom}
          sessions={gameSessions}
          priorityGameId={pickPrioritySession(gameSessions, pinnedPriorityGameId, foregroundGameId)}
          onMode={mode => setPerformanceMode(game.id, mode)}
          onCustom={policies => setPerformanceCustom(game.id, policies)}
        />
      </ConfigCard>
    </div>
    {shareOpen && <ProfileShareDialog game={game} profile={profile} initialTab={shareTab} onClose={() => setShareOpen(false)} />}
  </div>
}

function LaunchChainTest({ game }: { game: Game }) {
  const adapter = adapterFor(game)
  const launcherBased = isLauncherBased(adapter)
  const [testedAt, setTestedAt] = useState<number>()
  const execName = game.execPath?.split(/[\\/]/).pop()?.toLocaleLowerCase()
  const knownCandidates = [
    ...(adapter.launcherExecutable ? [adapter.launcherExecutable] : []),
    ...(adapter.launcherExecutableCandidates || []),
    ...adapter.gameExecutableCandidates,
  ]
  const matchesKnown = execName
    ? knownCandidates.some(candidate => execName === candidate?.toLocaleLowerCase())
    : false
  // Un exécutable inconnu mais situé DANS l'installation reste un stage
  // candidat valide (spec #28) : la corrélation par chemin suffit pour
  // continuer la chaîne — un nom d'exe nouveau ne bloque jamais la session.
  const insideInstall = Boolean(game.execPath && game.installDirectory && game.execPath.toLocaleLowerCase().startsWith(game.installDirectory.toLocaleLowerCase()))
  const checks = [
    { label: 'Exécutable du jeu configuré', ok: Boolean(game.execPath), detail: game.execPath || 'Choisissez l’exécutable (launcher ou jeu final).' },
    { label: 'Dossier du jeu configuré', ok: Boolean(game.installDirectory), detail: game.installDirectory || 'Indiquez le dossier d’installation pour rattacher les processus par chemin.' },
    { label: 'Dossier Mods configuré', ok: Boolean(game.modsPath), detail: game.modsPath || 'Requis pour préparer les mods avant le launcher.' },
    { label: 'Candidats du jeu final connus', ok: !launcherBased || adapter.gameExecutableCandidates.length > 0, detail: launcherBased ? (adapter.gameExecutableCandidates.join(', ') || 'Aucun candidat — le rattachement automatique sera impossible.') : 'Processus direct : le jeu final est l’exécutable configuré.' },
    { label: launcherBased ? 'Exécutable cohérent avec la chaîne' : 'Exécutable reconnu', ok: launcherBased ? (matchesKnown || insideInstall) : matchesKnown, detail: matchesKnown ? (execName || '') : launcherBased && insideInstall ? `${execName || '—'} est un exécutable inconnu mais situé dans l'installation — la chaîne continue automatiquement (détection par chemin et corrélation temporelle).` : launcherBased ? `${execName || '—'} est hors de l'installation — vérifiez le chemin de l'exécutable.` : 'Aucune signature connue — la détection automatique par chemin reste active.' },
  ]
  const required = checks.filter(item => item.label !== 'Exécutable reconnu')
  const ok = required.every(item => item.ok)
  const chain = launcherBased ? adapter.launchChainStages.join(' → ') : 'ZAILON → ' + (execName || 'jeu')

  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-white/68"><Rocket size={12} className="text-gold/75" />Chaîne de lancement <span className="rounded-full bg-white/[0.035] px-2 py-0.5 font-mono text-[10px] text-white/38">{LAUNCH_BEHAVIOR_LABELS[adapter.launchBehavior]}</span></p>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-white/40">{chain}{adapter.launcherExecutable ? ` · launcher ${adapter.launcherExecutable}` : ''}</p>
      </div>
      <button type="button" onClick={() => setTestedAt(Date.now())} className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/10"><ShieldCheck size={12} />Tester la chaîne</button>
    </div>
    <ul className="mt-3 space-y-1.5">{checks.map(item => <li key={item.label} className="flex items-start gap-2 text-[11px]"><span className={`mt-0.5 shrink-0 ${item.ok ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>{item.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}</span><span className="min-w-0"><span className={`block ${item.ok ? 'text-white/60' : 'text-amber-100/80'}`}>{item.label}</span><span className="block truncate text-[10px] text-white/28">{item.detail}</span></span></li>)}</ul>
    {testedAt && <p className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${ok ? 'border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-100/70' : 'border-amber-300/15 bg-amber-300/[0.04] text-amber-100/75'}`}>{ok ? `Chaîne compatible — vérifié à ${formatClock(testedAt)}. Le test est en lecture seule : aucun fichier n’est modifié, aucun processus lancé.` : `Chaîne incomplète — vérifié à ${formatClock(testedAt)}. Corrigez les points ci-dessus avant de lancer.`}</p>}
    <p className="mt-2 text-[10px] leading-relaxed text-white/26">Le test vérifie uniquement la configuration (aucun lancement). La détection réelle du processus final (launcher → jeu) est fournie par le backend natif : processus, fenêtres et preuve Steam — sans attachement manuel.</p>
  </div>
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return <span className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/15 px-2.5 py-1 text-white/45"><span className="text-white/30">{label}</span><span className="font-semibold text-gold">{value}</span></span>
}

const MODE_OPTIONS: Array<{ id: PerformanceMode; label: string }> = [
  { id: 'auto', label: 'Automatique' },
  { id: 'balanced', label: 'Équilibré' },
  { id: 'performance', label: 'Performance' },
  { id: 'quality', label: 'Qualité' },
  { id: 'custom', label: 'Personnalisé' },
]

const modeLabel = (mode: PerformanceMode) => mode === 'custom' ? 'Personnalisé' : PERFORMANCE_PRESETS[mode].label

const DOWNLOAD_OPTIONS: Array<{ id: DownloadPolicy; label: string }> = [
  { id: 'normal', label: 'Normaux' }, { id: 'limited', label: 'Limités' }, { id: 'paused', label: 'En pause' },
]
const SCAN_OPTIONS: Array<{ id: ScanPolicy; label: string }> = [
  { id: 'normal', label: 'Normaux' }, { id: 'reduced', label: 'Réduits' }, { id: 'paused', label: 'En pause' },
]
const ANIMATION_OPTIONS: Array<{ id: AnimationPolicy; label: string }> = [
  { id: 'normal', label: 'Normales' }, { id: 'reduced', label: 'Réduites' }, { id: 'off', label: 'Désactivées' },
]
const QUICK_PANEL_OPTIONS: Array<{ id: QuickPanelPolicy; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'minimal', label: 'Minimal' },
]
const ZAILON_PRIORITY_OPTIONS: Array<{ id: ZailonPriorityPolicy; label: string }> = [
  { id: 'normal', label: 'Normale' }, { id: 'low', label: 'Basse' },
]

/** Réglages Performance par jeu (spec §5-10, §23-24, §27) — distinction
 * claire Performance ZAILON vs Performance du jeu. */
function PerformanceSettings({ game, mode, custom, sessions, priorityGameId, onMode, onCustom }: {
  game: Game
  mode: PerformanceMode
  custom?: Partial<ZailonPerformancePolicies>
  sessions: Array<{ gameId: string; state: string }>
  priorityGameId?: string
  onMode: (mode: PerformanceMode) => void
  onCustom: (policies: Partial<ZailonPerformancePolicies>) => void
}) {
  const hasPerformancePlus = hasCapability(addonCapabilities(useStore(state => state.addons)), 'performance.plus')
  const preset = mode === 'custom' ? undefined : PERFORMANCE_PRESETS[mode]
  const zailon = policiesForMode(mode, custom)
  const effective = effectivePerformance(
    { [game.id]: mode },
    { [game.id]: custom },
    sessions,
    priorityGameId,
  )
  const isActive = sessions.some(session => session.gameId === game.id && session.state !== 'Ended' && session.state !== 'Failed' && session.state !== 'GameLost')

  const customSelect = <T extends string>(label: string, value: T, options: Array<{ id: T; label: string }>, onChange: (value: T) => void) => (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value as T)} className="rounded border border-white/[0.08] bg-[#111515] px-2 py-1.5 text-[11px] text-white/70">{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </label>
  )

  return <div className="space-y-3">
    <label className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[11px] text-white/60"><strong className="text-white/76">Mode de performance</strong><ZailonInfoPopover text="La manière dont ZAILON se comporte autour du jeu : téléchargements, scans, animations, priorité. Ne modifie jamais les réglages graphiques du jeu sans adaptateur spécifique." /></span>
      <select value={mode} onChange={event => onMode(event.target.value as PerformanceMode)} className="rounded-lg border border-white/[0.08] bg-[#111515] px-2.5 py-2 text-[11px] text-white/72">{MODE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </label>
    {preset && <p className="rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/40">{preset.description}</p>}
    {isActive && <p className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2 text-[11px] text-emerald-100/70">Session en cours : {modeLabel(mode)} appliqué — les politiques effectives ci-dessous sont actives.</p>}

    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-white/68"><Settings2 size={12} className="text-gold/70" />Performance ZAILON</p>
      <div className="space-y-1.5">
        {mode === 'custom'
          ? <>
            {customSelect<DownloadPolicy>('Téléchargements pendant le jeu', zailon.downloads, DOWNLOAD_OPTIONS, value => onCustom({ downloads: value }))}
            {customSelect<ScanPolicy>('Scans', zailon.scans, SCAN_OPTIONS, value => onCustom({ scans: value }))}
            {customSelect<AnimationPolicy>('Animations ZAILON', zailon.animations, ANIMATION_OPTIONS, value => onCustom({ animations: value }))}
            {customSelect<QuickPanelPolicy>('Quick Panel', zailon.quickPanel, QUICK_PANEL_OPTIONS, value => onCustom({ quickPanel: value }))}
            {customSelect<ZailonPriorityPolicy>('Priorité ZAILON', zailon.zailonPriority, ZAILON_PRIORITY_OPTIONS, value => onCustom({ zailonPriority: value }))}
          </>
          : <div className="grid gap-1.5 sm:grid-cols-2">
            <span className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">Téléchargements<span className="font-semibold text-white/72">{DOWNLOAD_POLICY_LABELS[zailon.downloads]}</span></span>
            <span className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">Scans<span className="font-semibold text-white/72">{SCAN_POLICY_LABELS[zailon.scans]}</span></span>
            <span className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">Animations ZAILON<span className="font-semibold text-white/72">{ANIMATION_POLICY_LABELS[zailon.animations]}</span></span>
            <span className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">Quick Panel<span className="font-semibold text-white/72">{QUICK_PANEL_POLICY_LABELS[zailon.quickPanel]}</span></span>
            <span className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">Priorité ZAILON<span className="font-semibold text-white/72">{ZAILON_PRIORITY_LABELS[zailon.zailonPriority]}</span></span>
          </div>}
      </div>
    </div>

    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-white/68"><Gamepad2 size={12} className="text-gold/70" />Performance du jeu</p>
      <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">
        <span className="flex items-center gap-2"><span>Priorité du processus</span><ZailonInfoPopover text="Automatique : Windows gère normalement. Jamais « Temps réel » — il peut rendre Windows instable. La priorité revient à l’état précédent à la fermeture du jeu." /></span>
        <select value={mode === 'custom' ? 'auto' : PERFORMANCE_PRESETS[mode].game.processPriority} disabled className="rounded border border-white/[0.08] bg-[#111515] px-2 py-1.5 text-[11px] text-white/70">{GAME_PROCESS_PRIORITIES.map(priority => <option key={priority} value={priority}>{GAME_PROCESS_PRIORITY_LABELS[priority]}</option>)}</select>
      </label>
      <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-white/45">{hasPerformancePlus ? 'Priorité réellement appliquée au processus au lancement (add-on Performance+).' : 'Priorité non appliquée à l’OS — installez l’add-on Performance+ pour l’appliquer au lancement.'}{' '}Jamais « Temps réel ».</p>
      <p className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-white/45">
        <span>Limite d’images par seconde</span><span className="font-semibold text-white/60">Backends natifs à venir <ZailonInfoPopover text="Le contrôle FPS utilisera uniquement des méthodes officielles (paramètre natif du jeu, API du pilote) — jamais d’injection. Les jeux protégés (anti-cheat) resteront limités aux réglages officiels." /></span>
      </p>
    </div>

    <div className="rounded-xl border border-gold/15 bg-gold/[0.03] p-3">
      <p className="text-[11px] font-semibold text-white/70">Configuration effective</p>
      <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
        <span className="flex items-center justify-between text-[11px] text-white/48">Mode<span className="font-semibold text-gold">{MODE_OPTIONS.find(option => option.id === mode)?.label}</span></span>
        <span className="flex items-center justify-between text-[11px] text-white/48">Téléchargements<span className="font-semibold text-white/70">{DOWNLOAD_POLICY_LABELS[effective.downloads]}</span></span>
        <span className="flex items-center justify-between text-[11px] text-white/48">Scans<span className="font-semibold text-white/70">{SCAN_POLICY_LABELS[effective.scans]}</span></span>
        <span className="flex items-center justify-between text-[11px] text-white/48">Animations<span className="font-semibold text-white/70">{ANIMATION_POLICY_LABELS[effective.animations]}</span></span>
        <span className="flex items-center justify-between text-[11px] text-white/48">Priorité du jeu<span className="font-semibold text-white/70">{GAME_PROCESS_PRIORITY_LABELS[effective.gameProcessPriority]}</span></span>
      </div>
    </div>
  </div>
}

function ConfigCard({ id, title, icon: Icon, badge, open, onToggle, children }: { id: string; title: string; icon: LucideIcon; badge?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/[0.07] bg-white/[0.018]">
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-gold/75"><Icon size={14} /></span>
      <span className="flex-1 text-xs font-semibold text-white/80">{title}</span>
      {badge && <span className="max-w-56 truncate rounded-full bg-white/[0.035] px-2.5 py-1 font-mono text-[10px] text-white/38">{badge}</span>}
      <ChevronDown size={14} className={`text-white/35 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="space-y-3 border-t border-white/[0.05] px-4 pb-4 pt-3">{children}</div>}
  </section>
}

function Field({ label, value, placeholder, onChange, onBrowse, onOpen }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onBrowse: () => void; onOpen?: () => void }) {
  return <label className="block">
    <span className="text-[11px] text-white/45">{label}</span>
    <div className="mt-1.5 flex gap-2">
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/72 outline-none focus:border-gold/30" />
      {onOpen && <button type="button" onClick={onOpen} title="Ouvrir dans l’Explorateur" className="rounded-lg border border-white/[0.09] bg-white/[0.025] p-2 text-white/45 hover:border-gold/25 hover:text-gold"><FolderOpen size={13} /></button>}
      <button type="button" onClick={onBrowse} className="rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold">Parcourir</button>
    </div>
  </label>
}

function FrostyConfigCard({ game, profile }: { game: Game; profile: Profile }) {
  const capabilities = addonCapabilities(useStore(state => state.addons))
  const hasEditor = hasCapability(capabilities, 'frosty.editor')
  const hasNteCap = hasCapability(capabilities, 'nte.modloader')
  const setView = useStore(state => state.setView)
  const setFrostyContextGame = useStore(state => state.setFrostyContextGame)
  const [open, setOpen] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`zailon:config-open:${game.id}`) || 'null') as string[] | null
      return Array.isArray(saved) && saved.includes('frosty')
    } catch { return false }
  })
  const toggle = () => {
    setOpen(current => {
      const next = !current
      try {
        const saved = JSON.parse(localStorage.getItem(`zailon:config-open:${game.id}`) || 'null') as string[] | null
        const list = Array.isArray(saved) ? saved : []
        const updated = next ? [...new Set([...list, 'frosty'])] : list.filter(item => item !== 'frosty')
        localStorage.setItem(`zailon:config-open:${game.id}`, JSON.stringify(updated))
      } catch { /* persistance best-effort */ }
      return next
    })
  }
  // Activation persistante et transactionnelle (spec « Fix Frosty — activation
  // persistante » §1) : l'état vit dans le store (par jeu + profil), jamais dans
  // un useState local qui retombe à false à chaque montage. Une activation qui
  // créerait un conflit est refusée (rollback + notification).
  const frostyPluginConfig = useStore(state => state.frostyPluginConfig)
  const setFrostyPluginConfig = useStore(state => state.setFrostyPluginConfig)
  const pluginKey = frostyPluginConfigKey(game.id, profile.id)
  const pluginConfig = frostyPluginConfig[pluginKey] ?? { datapathFix: false, launchPlatformPlugin: false }
  const datapathFix = pluginConfig.datapathFix
  const launchPlatformPlugin = pluginConfig.launchPlatformPlugin
  const setDatapathFix = (value: boolean) => setFrostyPluginConfig(game.id, profile.id, { datapathFix: value })
  const setLaunchPlatformPlugin = (value: boolean) => setFrostyPluginConfig(game.id, profile.id, { launchPlatformPlugin: value })
  const [tested, setTested] = useState<string>()
  const profileMods = resolveProfileMods(game, profile)
  const platform = game.platform === 'steam' ? 'steam' as const : game.platform === 'epic' ? 'epic' as const : 'ea-app' as const
  const status = useMemo(() => frostyBackendStatus({
    gameId: game.id,
    execPath: game.execPath,
    platform,
    datapathFix,
    launchPlatformPlugin,
  }), [game.id, game.execPath, platform, datapathFix, launchPlatformPlugin])
  const isFrosty = detectModBackend({ execPath: game.execPath, gameName: game.name, nteAllowed: hasNteCap }) === 'frosty'
  const overhaulAlert = useMemo(() => frostyOverhaulConflict(profileMods.map(mod => mod.name)), [profileMods])
  const runTest = () => {
    const checks: string[] = []
    checks.push(status.adapterFound ? `Adaptateur : ${status.preferredRuntime ? `Frosty ${status.preferredRuntime} recommandé` : 'détecté'}` : 'Aucun adaptateur Frosty')
    checks.push(`Support : ${status.supportLevel}`)
    checks.push(`Plateforme : ${platform} → ${status.strategyLabel ? FROSTY_STRATEGY_LABELS[status.strategyLabel as keyof typeof FROSTY_STRATEGY_LABELS] : '—'}`)
    checks.push(status.versionAlert ? `⚠ ${status.versionAlert}` : 'Version runtime : OK (préférée)')
    checks.push(status.pluginConflict ? '⚠ Conflit de plugins (DatapathFix + LaunchPlatformPlugin)' : 'Plugins : aucun conflit')
    checks.push(overhaulAlert ? `⚠ ${overhaulAlert}` : 'Overhauls : aucun conflit déclaré')
    setTested(checks.join('\n'))
  }
  if (!isFrosty && !status.adapterFound) return null
  return (
    <ConfigCard id="frosty" title="Frosty" icon={Wrench} badge={status.adapterFound ? `Frosty ${status.preferredRuntime || '—'}` : 'À configurer'} open={open} onToggle={toggle}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
          <p className="text-[11px] font-semibold text-white/68">Backend</p>
          <p className="mt-1 text-[11px] text-white/45">{status.adapterFound ? `Frosty ${status.preferredRuntime || ''} — pipeline de patch de ressources Frostbite` : 'Non configuré'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
          <p className="text-[11px] font-semibold text-white/68">Compatibilité plateforme</p>
          <p className="mt-1 text-[11px] text-white/45">{platform} · {status.strategyLabel ? FROSTY_STRATEGY_LABELS[status.strategyLabel as keyof typeof FROSTY_STRATEGY_LABELS] : '—'}</p>
        </div>
      </div>
      {status.versionAlert && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-100/80"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300/90" />{status.versionAlert}</p>
      )}
      {status.pluginConflict && (
        <p className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-red-300/25 bg-red-400/[0.06] px-3 py-2 text-[11px] text-red-100/85">
          <span className="flex items-start gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-300/90" />Conflit Frosty détecté : DatapathFix et LaunchPlatformPlugin ne doivent pas être actifs ensemble.</span>
          <button type="button" onClick={() => setLaunchPlatformPlugin(false)} className="shrink-0 rounded-lg border border-red-300/30 px-2.5 py-1 font-semibold text-red-200 hover:bg-red-400/10">Corriger</button>
        </p>
      )}
      {overhaulAlert && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-100/80"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300/90" />{overhaulAlert}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-white/55"><ZailonSwitch size="compact" checked={datapathFix} onChange={setDatapathFix} />DatapathFix</label>
        <label className="flex items-center gap-2 text-[11px] text-white/55"><ZailonSwitch size="compact" checked={launchPlatformPlugin} onChange={setLaunchPlatformPlugin} />Launch Platform Plugin</label>
        <button type="button" onClick={runTest} className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold"><ShieldCheck size={13} />Tester le profil</button>
      </div>
      {tested && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/55">{tested}</pre>}
      {hasEditor
        ? <button type="button" onClick={() => { setFrostyContextGame(game.id); setView('frosty') }} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-[11px] font-semibold text-gold hover:border-gold/45 hover:bg-gold/10"><Wrench size={13} />Création de mods — éditer avec Frosty</button>
        : <button type="button" onClick={() => setView('addons')} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/55 hover:border-gold/30 hover:text-gold"><Package size={13} />Module disponible — ajouter Frosty Editor</button>}
      <p className="mt-2 text-[10px] text-white/30">Le backend Frosty n&apos;est jamais initialisé au démarrage de ZAILON — seulement à l&apos;ouverture de ce jeu, à l&apos;import d&apos;un .fbmod ou au lancement.</p>
    </ConfigCard>
  )
}

// ───────────────────────────── ReShade (spec §1-115) ─────────────────────────

const RESHADE_OFFICIAL_URL = 'https://reshade.me/'

interface ReShadeLocalRecord {
  /** Version déclarée (installation adoptée manuellement) — jamais inventée. */
  installedVersion?: string
  installStartedAt?: number
  autoUpdate: boolean
  versionLock: boolean
  safeMode: boolean
}

const readReShadeRecord = (gameId: string): ReShadeLocalRecord => {
  try {
    const parsed = JSON.parse(localStorage.getItem(`zailon:reshade:${gameId}`) || 'null') as Partial<ReShadeLocalRecord> | null
    return {
      installedVersion: typeof parsed?.installedVersion === 'string' ? parsed.installedVersion : undefined,
      installStartedAt: typeof parsed?.installStartedAt === 'number' ? parsed.installStartedAt : undefined,
      autoUpdate: parsed?.autoUpdate ?? true,
      versionLock: parsed?.versionLock ?? false,
      safeMode: parsed?.safeMode ?? false,
    }
  } catch {
    return { autoUpdate: true, versionLock: false, safeMode: false }
  }
}

const writeReShadeRecord = (gameId: string, record: ReShadeLocalRecord) => {
  try { localStorage.setItem(`zailon:reshade:${gameId}`, JSON.stringify(record)) } catch { /* best-effort */ }
}

function ReShadeConfigCard({ game, profile }: { game: Game; profile: Profile }) {
  const setProfileReshade = useStore(state => state.setProfileReshade)
  const [open, setOpen] = useState(() => Boolean(readReShadeRecord(game.id).installStartedAt))
  const [record, setRecord] = useState<ReShadeLocalRecord>(() => readReShadeRecord(game.id))
  const [checked, setChecked] = useState<string>()

  const target = useMemo(() => resolveReShadeTarget(game), [game])
  const compatibility = useMemo(() => classifyReShadeCompatibility(game, game.categories || []), [game])
  const strategy = resolveReShadeSessionStrategy(profile.reshade, record.safeMode)
  const installed = Boolean(record.installedVersion)

  const updateRecord = (patch: Partial<ReShadeLocalRecord>) => {
    setRecord(current => {
      const next = { ...current, ...patch }
      writeReShadeRecord(game.id, next)
      return next
    })
  }

  const setProfileEnabled = (enabled: boolean) => {
    const current = profile.reshade ?? { enabled: false, shaderDependencies: [] }
    setProfileReshade(game.id, profile.id, { ...current, enabled })
  }

  const openOfficialSource = () => {
    updateRecord({ installStartedAt: Date.now() })
    setOpen(true)
    void native.openExternalUrl(RESHADE_OFFICIAL_URL)
  }

  const runCheck = () => {
    const checks: string[] = []
    checks.push(`Cible : ${target.executableName || '—'} · ${GRAPHICS_API_LABELS[target.graphicsApi]} · confiance ${Math.round(target.confidence * 100)} %`)
    checks.push(target.confidence < 0.55 ? `⚠ ${target.reason}` : target.reason)
    checks.push(`Compatibilité : ${COMPATIBILITY_LABELS[compatibility.level]}`)
    checks.push(compatibility.autoInstallSafe ? 'Installation automatique autorisée pour ce jeu.' : '⚠ Installation automatique non autorisée — à valider (§60).')
    checks.push(`Stratégie de session : ${strategy.kind === 'Disabled' ? strategy.reason : `preset ${strategy.presetId || 'par défaut'}`}`)
    setChecked(checks.join('\n'))
  }

  return (
    <ConfigCard
      id="reshade"
      title="ReShade"
      icon={Wand2}
      badge={installed ? `v${record.installedVersion} installé` : record.installStartedAt ? 'Téléchargement lancé' : 'Non installé'}
      open={open}
      onToggle={() => setOpen(current => !current)}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
          <p className="text-[11px] font-semibold text-white/68">Exécutable cible</p>
          <p className="mt-1 text-[11px] text-white/45">{target.executableName || '—'} · {GRAPHICS_API_LABELS[target.graphicsApi]}</p>
          {target.confidence < 0.55 && <p className="mt-1 text-[10px] text-amber-100/65">⚠ {target.reason}</p>}
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
          <p className="text-[11px] font-semibold text-white/68">Compatibilité</p>
          <p className="mt-1 text-[11px] text-white/45">{COMPATIBILITY_LABELS[compatibility.level]}</p>
          {compatibility.detectedAntiCheats.length > 0 && <p className="mt-1 text-[10px] text-red-200/70">{compatibility.detectedAntiCheats.join(', ')} détecté</p>}
        </div>
      </div>

      {!compatibility.autoInstallSafe && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-red-300/25 bg-red-400/[0.06] px-3 py-2 text-[11px] text-red-100/85"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-300/90" />{compatibility.reason}</p>
      )}

      {record.safeMode && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-100/80"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-amber-300/90" />Démarrer sans ReShade actif — le jeu sera lancé sans ReShade pour cette session (§106-107).</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!installed ? (
          <button type="button" onClick={openOfficialSource} className="flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Wand2 size={13} />Installer depuis reshade.me</button>
        ) : (
          <>
            <button type="button" onClick={openOfficialSource} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold"><RefreshCw size={13} />Mettre à jour</button>
            <button type="button" onClick={() => updateRecord({ installedVersion: undefined })} className="flex items-center gap-1.5 rounded-lg border border-red-300/15 px-3 py-2 text-[11px] font-semibold text-red-200/65 hover:bg-red-400/10"><Trash2 size={13} />Désinstaller</button>
          </>
        )}
        <button type="button" onClick={runCheck} className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:border-gold/30 hover:text-gold"><ShieldCheck size={13} />Vérifier</button>
      </div>
      {!installed && !compatibility.autoInstallSafe && (
        <p className="mt-2 text-[10px] text-white/34">Téléchargement depuis la source officielle uniquement — le setup officiel gère DirectX/OpenGL et le layer Vulkan (§7, §9). Le pipeline de téléchargement natif arrivera dans une prochaine mise à jour.</p>
      )}
      {checked && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/55">{checked}</pre>}

      <div className="mt-3 space-y-2">
        <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/60">
          <span>ReShade activé pour ce profil ({profile.name})</span>
          <ZailonSwitch size="compact" checked={profile.reshade?.enabled ?? false} onChange={setProfileEnabled} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/60">
          <span>Mises à jour automatiques</span>
          <ZailonSwitch size="compact" checked={record.autoUpdate} onChange={value => updateRecord({ autoUpdate: value })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/60">
          <span className="flex items-center gap-2">Verrouiller la version {record.versionLock && <span className="text-gold">🔒</span>}</span>
          <ZailonSwitch size="compact" checked={record.versionLock} onChange={value => updateRecord({ versionLock: value })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/60">
          <span className="flex items-center gap-2">Démarrer sans ReShade (diagnostic)</span>
          <ZailonSwitch size="compact" checked={record.safeMode} onChange={value => updateRecord({ safeMode: value })} />
        </label>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-white/30">Le runtime ReShade est partagé par installation de jeu ; l&apos;activation, le preset et le verrou de version sont propres à chaque profil (§36). Jamais de mise à jour pendant qu&apos;un jeu tourne (§14).</p>
    </ConfigCard>
  )
}

/** Carte « Module disponible » (spec Add-ons §36, §38) : l'add-on manquant est
 * proposé en un clic depuis la configuration du jeu, sans téléchargement auto. */
function AddonAvailableCard({ icon, addonName, description, onInstall }: { icon: ReactNode; addonName: string; description: string; onInstall: () => void }) {
  return <section className="rounded-xl border border-dashed border-gold/22 bg-gold/[0.018]">
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/20 bg-gold/[0.06] text-gold/80">{icon}</span>
      <span className="flex-1 text-xs font-semibold text-white/80">{addonName}</span>
      <span className="rounded-full bg-gold/10 px-2.5 py-1 font-mono text-[10px] text-gold/80">Module disponible</span>
    </button>
    <div className="space-y-3 border-t border-gold/10 px-4 pb-4 pt-3">
      <p className="text-[11px] leading-relaxed text-white/42">{description}</p>
      <button type="button" onClick={onInstall} className="flex items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/[0.05] px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/10"><Plus size={13} />Ajouter à ZAILON</button>
    </div>
  </section>
}
