import { AlertTriangle, Archive, Bookmark, CheckCircle2, ChevronDown, Copy, FileArchive, FolderOpen, Gamepad2, History, Keyboard, Layers3, MonitorDown, Palette, Plus, Rocket, Settings2, ShieldCheck, Trash2, Upload, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { effectiveInputProfile, effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { adapterFor, isLauncherBased, LAUNCH_BEHAVIOR_LABELS } from '../../lib/launchAdapters'
import { pickPrioritySession } from '../../lib/sessionPriority'
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
import { native, pickFolder } from '../../lib/native'
import { ProfileShareDialog } from '../UI/ProfileShareDialog'
import { describeBackgroundMedia, resolveMediaType } from '../../lib/backgroundMedia'
import { parseYouTubeUrl, youtubeThumbnailUrl } from '../../lib/youtubeUrl'
import { resourceUrl } from '../../lib/native'
import { resolveProfileMods, useStore } from '../../store/useStore'
import type { Game, GamePreset, GameResources, ModRuntimePathType, Profile } from '../../types'

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
import { formatClock, formatTime } from '../../utils'
import { GameAppearanceEditor } from '../GameResourcesDialog'
import { GameKeyboardPanel } from './GameKeyboardPanel'
import { ZailonSwitch } from '../UI/ZailonSwitch'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'
import { BackgroundMediaLayer } from '../UI/BackgroundMediaLayer'

const RUNTIME_TYPE_LABELS: Array<[ModRuntimePathType, string]> = [
  ['loader', 'Loader'],
  ['bypass', 'Signature bypass'],
  ['plugins', 'Plugin folder'],
  ['scripts', 'Script folder'],
  ['custom', 'Custom'],
]

const DEFAULT_OPEN = ['lancement', 'apparence']

interface Props {
  game: Game
  profile: Profile
  onBrowseExecutable: () => void
  onBrowseModsFolder: () => void
  onSaveResources: (resources: Partial<GameResources>) => void
  onOpenVisuals: () => void
}

export function GameConfigurationPanel({ game, profile, onBrowseExecutable, onBrowseModsFolder, onSaveResources, onOpenVisuals }: Props) {
  const setGamePath = useStore(state => state.setGamePath)
  const setModsPath = useStore(state => state.setModsPath)
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
        <SummaryPill label="Mods actifs" value={`${profileMods.filter(mod => mod.enabled).length}`} />
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
              <p className="mt-1 text-[11px] leading-relaxed text-white/34">Crée un raccourci bureau ZAILON lié à ce jeu et au profil « {profile.name} ». Le lien contient uniquement leurs identifiants internes.</p>
            </div>
            <button type="button" onClick={() => void native.createDesktopShortcut(game.id, profile.id, game.name, game.resources?.iconPath, game.execPath).then(path => window.alert(`Raccourci créé :\n${path}`)).catch(error => window.alert(String(error)))} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><MonitorDown size={14} />Créer sur le bureau</button>
          </div>
        </div>
        <LaunchChainTest game={game} />
      </ConfigCard>

      <ConfigCard id="apparence" title="Apparence" icon={Palette} badge={visualName ? `Profil visuel : ${visualName}` : undefined} open={open.includes('apparence')} onToggle={() => toggle('apparence')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div>
            <p className="text-[11px] font-semibold text-white/68">Profil visuel</p>
            <p className="mt-1 text-[11px] text-white/34">Le moteur Visual Profiles reste indépendant ; son réglage est accessible ici.</p>
          </div>
          <button type="button" onClick={onOpenVisuals} className="rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold">{visualName ? `Modifier « ${visualName} »` : 'Modifier le profil visuel'}</button>
        </div>
        <GameAppearanceEditor game={game} embedded onSave={onSaveResources} />
        <BackgroundPicker game={game} />
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

function BackgroundPicker({ game }: { game: Game }) {
  const setGameBackgroundMedia = useStore(state => state.setGameBackgroundMedia)
  const backgroundMediaSettings = useStore(state => state.backgroundMediaSettings)
  const [urlDraft, setUrlDraft] = useState('')
  const [urlFeedback, setUrlFeedback] = useState<'idle' | 'valid' | 'invalid'>('idle')
  const [previewOpen, setPreviewOpen] = useState(false)

  const media = game.backgroundMedia
  const localVideoUrl = resourceUrl(game.resources?.videoPath)
  const heroUrl = resourceUrl(game.resources?.backgroundPath || game.resources?.bannerPath || game.resources?.coverPath) || game.backgroundArt
  const effectiveType = resolveMediaType(media, backgroundMediaSettings, Boolean(localVideoUrl))
  const description = describeBackgroundMedia(media, Boolean(localVideoUrl))
  const thumb = media?.youtubeVideoId ? youtubeThumbnailUrl(media.youtubeVideoId) : heroUrl

  const applyType = (type: 'auto' | 'image' | 'video' | 'youtube') => {
    setGameBackgroundMedia(game.id, { type })
    setUrlFeedback('idle')
  }

  const applyYouTube = () => {
    const parsed = parseYouTubeUrl(urlDraft)
    if (!parsed) { setUrlFeedback('invalid'); return }
    setGameBackgroundMedia(game.id, { type: 'youtube', youtubeUrl: urlDraft.trim(), youtubeVideoId: parsed.videoId, startSeconds: parsed.startSeconds })
    setUrlFeedback('valid')
  }

  const previewMedia = media?.type === 'youtube' && media.youtubeVideoId
    ? media
    : media?.type === 'video' || (media?.type === 'auto' && (media.youtubeVideoId || localVideoUrl))
      ? media
      : undefined

  return <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-28 flex-none overflow-hidden rounded-lg border border-white/[0.08] bg-black/30">
          {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-white/25">Aucun fond</div>}
          {effectiveType === 'youtube' && <span className="absolute right-1 top-1 rounded bg-red-600/90 px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-white">YouTube</span>}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-white/72">Fond de l’Accueil</p>
          <p className="mt-0.5 text-[11px] text-white/38">{description}</p>
        </div>
      </div>
      {effectiveType !== 'none' && (
        <button type="button" onClick={() => setPreviewOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/10"><Rocket size={12} />Aperçu</button>
      )}
    </div>

    <div className="mt-3 flex flex-wrap gap-1.5">
      {(['auto', 'image', 'video', 'youtube'] as const).map(type => (
        <button
          key={type}
          type="button"
          onClick={() => applyType(type)}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${media?.type === type ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/[0.09] text-white/48 hover:bg-white/[0.05] hover:text-white/75'}`}
        >
          {type === 'auto' ? 'Automatique' : type === 'image' ? 'Image' : type === 'video' ? 'Vidéo locale' : 'YouTube'}
        </button>
      ))}
    </div>

    {(media?.type === 'youtube' || media?.type === 'auto') && (
      <div className="mt-3">
        <label className="text-[11px] font-medium text-white/55">Lien YouTube</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={event => { setUrlDraft(event.target.value); setUrlFeedback('idle') }}
            placeholder="https://youtube.com/watch?v=…"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/25 px-3 py-2 text-[11px] text-white/80 placeholder-white/25 outline-none focus:border-gold/40"
          />
          <button type="button" onClick={applyYouTube} className="rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90">Utiliser comme fond</button>
        </div>
        {urlFeedback === 'valid' && <p className="mt-1.5 text-[11px] text-emerald-300/85">Vidéo enregistrée — lecteur intégré, aucun téléchargement.</p>}
        {urlFeedback === 'invalid' && <p className="mt-1.5 text-[11px] text-red-300/85">Lien non pris en charge. Actuellement : YouTube (watch, youtu.be, shorts).</p>}
        <ZailonInfoPopover text="Aucune clé API demandée : seul l’identifiant de la vidéo est utilisé, la vidéo reste diffusée par YouTube et démarre toujours muette. La lecture est suspendue quand ZAILON est en arrière-plan ou qu’un jeu démarre." />
      </div>
    )}

    {previewOpen && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
          <div className="relative aspect-video overflow-hidden bg-black">
            {previewMedia
              ? <BackgroundMediaLayer playerKey={`preview-${game.id}`} priority="preview" media={previewMedia} localVideoUrl={localVideoUrl} fallbackImageUrl={heroUrl} paused={false} settings={backgroundMediaSettings} />
              : <div className="flex h-full items-center justify-center text-[11px] text-white/35">Sélectionnez une vidéo locale ou un lien YouTube pour prévisualiser.</div>}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
            <p className="text-[11px] text-white/45">Aperçu muet — le Hero se met en pause pendant l’aperçu.</p>
            <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]">Fermer</button>
          </div>
        </div>
      </div>
    )}
  </div>
}
