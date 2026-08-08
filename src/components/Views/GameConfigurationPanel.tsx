import { Archive, ChevronDown, FileArchive, Gamepad2, History, Keyboard, Layers3, MonitorDown, Palette, Plus, Rocket, ShieldCheck, Trash2, Upload, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { effectiveLayout, LAYOUT_LABELS } from '../../lib/keyboardPresets'
import { native, pickFolder } from '../../lib/native'
import { resolveProfileMods, useStore } from '../../store/useStore'
import type { Game, GameResources, ModRuntimePathType, Profile } from '../../types'
import { formatTime } from '../../utils'
import { GameAppearanceEditor } from '../GameResourcesDialog'
import { GameKeyboardPanel } from './GameKeyboardPanel'
import { Toggle } from '../UI/Toggle'
import { InfoBubble } from '../UI/InfoBubble'

const RUNTIME_TYPE_LABELS: Array<[ModRuntimePathType, string]> = [
  ['loader', 'Loader'],
  ['bypass', 'Signature bypass'],
  ['plugins', 'Plugin folder'],
  ['scripts', 'Script folder'],
  ['custom', 'Custom'],
]

const formatBytes = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(size >= 100 * 1024 * 1024 ? 0 : 1)} Mo`
  : `${Math.max(1, Math.round(size / 1024))} Ko`

const DEFAULT_OPEN = ['lancement', 'apparence']

interface Props {
  game: Game
  profile: Profile
  onBrowseExecutable: () => void
  onBrowseModsFolder: () => void
  onExportProfile: (complete: boolean) => void
  onImportProfile: () => void
  onSaveResources: (resources: Partial<GameResources>) => void
  onOpenVisuals: () => void
}

export function GameConfigurationPanel({ game, profile, onBrowseExecutable, onBrowseModsFolder, onExportProfile, onImportProfile, onSaveResources, onOpenVisuals }: Props) {
  const setGamePath = useStore(state => state.setGamePath)
  const setModsPath = useStore(state => state.setModsPath)
  const reduceExplanations = useStore(state => state.reduceExplanations)
  const setGameBypassPath = useStore(state => state.setGameBypassPath)
  const addGameRuntimePath = useStore(state => state.addGameRuntimePath)
  const updateGameRuntimePath = useStore(state => state.updateGameRuntimePath)
  const removeGameRuntimePath = useStore(state => state.removeGameRuntimePath)
  const restorePoints = useStore(state => state.restorePoints)
  const autoRestorePoints = useStore(state => state.autoRestorePoints)
  const setAutoRestorePoints = useStore(state => state.setAutoRestorePoints)
  const createRestorePoint = useStore(state => state.createRestorePoint)
  const restoreRestorePoint = useStore(state => state.restoreRestorePoint)
  const deleteRestorePoint = useStore(state => state.deleteRestorePoint)
  const storageKey = `zailon:config-open:${game.id}`
  const [open, setOpen] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as string[] | null
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_OPEN
    } catch { return DEFAULT_OPEN }
  })
  const [visualName, setVisualName] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(open))
  }, [open, storageKey])

  useEffect(() => {
    if (!native.isDesktop()) return
    let cancelled = false
    Promise.all([native.visualProfiles.association(game.id, profile.id), native.visualProfiles.list()])
      .then(([associationId, profiles]) => {
        if (cancelled) return
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
        <Field label="Exécutable du jeu" value={game.execPath || ''} placeholder="Sélectionnez l’exécutable" onChange={value => void setGamePath(game.id, value)} onBrowse={onBrowseExecutable} />
        <Field label="Dossier Mods" value={game.modsPath || ''} placeholder="Sélectionnez le dossier Mods" onChange={value => setModsPath(game.id, value)} onBrowse={onBrowseModsFolder} />
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2"><span className="text-[11px] text-white/45">Dossier Bypass / Loader</span><InfoBubble text="Certains jeux nécessitent un loader, un bypass de signature ou un dossier intermédiaire pour charger les mods (ex. Ultimate ASI Loader, dossier Paks). Laissez vide si le jeu n’en utilise pas." /></div>
          <div className="mt-1.5 flex gap-2">
            <input value={game.bypassPath || ''} onChange={event => setGameBypassPath(game.id, event.target.value)} placeholder="Optionnel — dossier du loader ou bypass" className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/72 outline-none focus:border-gold/30" />
            <button type="button" onClick={async () => { const path = await pickFolder(`Choisir le dossier Bypass / Loader — ${game.name}`); if (path) setGameBypassPath(game.id, path) }} className="rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold">Choisir</button>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="text-[11px] text-white/45">Chemins additionnels</span><InfoBubble text="Certains jeux ont une structure inhabituelle : plusieurs dossiers utiles au runtime (plugin folder, dossier de scripts, signature bypass…). Ajoutez-les ici pour éviter de recoder ZAILON pour chaque jeu." /></div>
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
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-white/68">Raccourci de lancement sécurisé</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/34">Crée un raccourci bureau ZAILON lié à ce jeu et au profil « {profile.name} ». Le lien contient uniquement leurs identifiants internes.</p>
            </div>
            <button type="button" onClick={() => void native.createDesktopShortcut(game.id, profile.id, game.name, game.resources?.iconPath || game.execPath).then(path => window.alert(`Raccourci créé :\n${path}`)).catch(error => window.alert(String(error)))} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313]"><MonitorDown size={14} />Créer sur le bureau</button>
          </div>
        </div>
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
      </ConfigCard>

      <ConfigCard id="commandes" title="Commandes" icon={Keyboard} badge={`${LAYOUT_LABELS[effectiveLayout(game, profile.id)]}`} open={open.includes('commandes')} onToggle={() => toggle('commandes')}>
        <GameKeyboardPanel game={game} profile={profile} embedded />
      </ConfigCard>

      <ConfigCard id="sauvegardes" title="Sauvegardes" icon={FileArchive} badge={`${points.length} point(s) de restauration`} open={open.includes('sauvegardes')} onToggle={() => toggle('sauvegardes')}>
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void onExportProfile(false)} className="flex flex-col items-start gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left hover:border-gold/25">
            <FileArchive size={15} className="text-gold/75" />
            <span className="mt-1 text-[11px] font-semibold text-white/72">Exporter un profil léger</span>
            <span className="text-[11px] leading-relaxed text-white/34">Archive de partage : métadonnées, liens, versions, ordre et réglages. Aucun fichier déployé dans le jeu.</span>
          </button>
          <button type="button" onClick={() => void onExportProfile(true)} className="flex flex-col items-start gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left hover:border-gold/25">
            <Archive size={15} className="text-gold/75" />
            <span className="mt-1 text-[11px] font-semibold text-white/72">Exporter un profil complet</span>
            <span className="text-[11px] leading-relaxed text-white/34">Jusqu’à {formatBytes(profileMods.reduce((sum, mod) => sum + (mod.sizeBytes || 0), 0))} avant compression. Déploiement uniquement avec Jouer.</span>
          </button>
          <button type="button" onClick={() => void onImportProfile()} className="flex flex-col items-start gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left hover:border-gold/25">
            <Upload size={15} className="text-gold/75" />
            <span className="mt-1 text-[11px] font-semibold text-white/72">Importer un profil</span>
            <span className="text-[11px] leading-relaxed text-white/34">Valide l’archive et affiche un aperçu avant création d’un nouveau profil.</span>
          </button>
        </div>
        <div className="mt-3 border-t border-white/[0.05] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-white/68">Points de restauration</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-white/45"><Toggle size="sm" checked={autoRestorePoints} onChange={() => setAutoRestorePoints(!autoRestorePoints)} />Auto avant lancement</label>
              <button type="button" onClick={() => createRestorePoint(`Manuel · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313]"><History size={13} />Créer un point</button>
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

      <ConfigCard id="performances" title="Performances" icon={Gamepad2} badge="À venir" open={open.includes('performances')} onToggle={() => toggle('performances')}>
        <p className="text-[11px] leading-relaxed text-white/38">Profils de performance par jeu (Équilibré / Performance / Qualité), pause des téléchargements et scans pendant le jeu, priorité du processus : prévus aux phases 2-4 de la refonte UX.</p>
      </ConfigCard>
    </div>
  </div>
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return <span className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/15 px-2.5 py-1 text-white/45"><span className="text-white/30">{label}</span><span className="font-semibold text-gold">{value}</span></span>
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

function Field({ label, value, placeholder, onChange, onBrowse }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onBrowse: () => void }) {
  return <label className="block">
    <span className="text-[11px] text-white/45">{label}</span>
    <div className="mt-1.5 flex gap-2">
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/72 outline-none focus:border-gold/30" />
      <button type="button" onClick={onBrowse} className="rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold">Parcourir</button>
    </div>
  </label>
}
