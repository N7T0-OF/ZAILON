import { Check, ImagePlus, Info, Move, RotateCcw, Save, Search, Trash2, Upload, X, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Game, GameResources } from '../types'
import { ArtworkCandidate, GameResourceKind, native, pickGameResource, resourceUrl } from '../lib/native'
import { artworkProvidersWithState, artworkSearchPlan, dedupeArtworkCandidates, resultSourceLabels } from '../lib/artworkRegistry'
import { parseYouTubeUrl, youtubeThumbnailUrl } from '../lib/youtubeUrl'
import { PIPELINE_STAGES, type YoutubeResolveStatus } from '../lib/backgroundMediaCache'
import { addonCapabilities, hasCapability } from '../lib/addonGating'
import { ZailonSwitch } from './UI/ZailonSwitch'
import { useStore } from '../store/useStore'

type ResourceKey = 'coverPath' | 'logoPath' | 'iconPath' | 'backgroundPath' | 'bannerPath' | 'videoPath'
type ResourceSlot = { kind: GameResourceKind; key: ResourceKey; label: string; hint: string; ratio: string }

const resources: ResourceSlot[] = [
  { kind: 'cover', key: 'coverPath', label: 'Jaquette', hint: 'Carte de la bibliothèque', ratio: '16 / 10' },
  { kind: 'banner', key: 'bannerPath', label: 'Bannière', hint: 'Héros large du jeu', ratio: '16 / 7' },
  { kind: 'background', key: 'backgroundPath', label: 'Arrière-plan', hint: 'Fond de la page d’accueil', ratio: '16 / 9' },
  { kind: 'logo', key: 'logoPath', label: 'Logo', hint: 'Titre transparent du jeu', ratio: '3 / 1' },
  { kind: 'icon', key: 'iconPath', label: 'Icône', hint: 'Repère compact', ratio: '1 / 1' },
  { kind: 'video', key: 'videoPath', label: 'Vidéo', hint: 'Boucle MP4 ou WebM locale', ratio: '16 / 9' },
]

const transformFields = {
  cover: { x: 'coverPositionX', y: 'coverPositionY', zoom: 'coverZoom', fit: 'coverFit' },
  banner: { x: 'bannerPositionX', y: 'bannerPositionY', zoom: 'bannerZoom', fit: 'bannerFit' },
  background: { x: 'backgroundPositionX', y: 'backgroundPositionY', zoom: 'backgroundZoom', fit: 'backgroundFit' },
} as const

interface GameResourcesDialogProps {
  game: Game
  onClose: () => void
  onChange: (resources: Partial<GameResources>) => void
}

export function GameResourcesDialog({ game, onClose, onChange }: GameResourcesDialogProps) {
  return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/76 p-3 backdrop-blur-sm">
    <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101116] shadow-[0_30px_100px_rgba(0,0,0,0.72)]" role="dialog" aria-modal="true" aria-labelledby="game-resources-title">
      <GameAppearanceEditor game={game} title={game.name} onSave={value => { onChange(value); onClose() }} onCancel={onClose} />
    </section>
  </div>, document.body)
}

export function GameAppearanceEditor({ game, onSave, onCancel, embedded = false, title }: {
  game: Game
  onSave: (resources: GameResources) => void
  onCancel?: () => void
  embedded?: boolean
  title?: string
}) {
  const initial = useRef<GameResources>({ ...game.resources })
  const stagedPaths = useRef(new Set<string>())
  const [draft, setDraft] = useState<GameResources>({ ...game.resources })
  const [activeSlot, setActiveSlot] = useState<ResourceSlot>(resources[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [artworkCandidates, setArtworkCandidates] = useState<ArtworkCandidate[]>([])
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkCandidate>()
  const [unavailableSources, setUnavailableSources] = useState<Array<{ id: string; label: string; reason: string }>>([])
  const artworkSteamGridDbKey = useStore(state => state.artworkSteamGridDbKey)
  const artworkIgdbClientId = useStore(state => state.artworkIgdbClientId)
  const artworkIgdbClientSecret = useStore(state => state.artworkIgdbClientSecret)
  const artworkSourceMode = useStore(state => state.artworkSourceMode)
  const setArtworkSourceMode = useStore(state => state.setArtworkSourceMode)
  // Spec Add-ons §25 : sans l'add-on Artwork+, seule la recherche d'illustrations
  // minimaliste (locale / Steam) reste — les sources SteamGridDB/IGDB n'apparaissent
  // pas et le natif ne peut pas être interrogé.
  const artworkEnabled = hasCapability(addonCapabilities(useStore(state => state.addons)), 'artwork.plus')
  const activePath = draft[activeSlot.key]
  const fields = transformFields[activeSlot.kind as keyof typeof transformFields]

  useEffect(() => {
    initial.current = { ...game.resources }
    setDraft({ ...game.resources })
    setArtworkCandidates([])
    setSelectedArtwork(undefined)
    setUnavailableSources([])
    stagedPaths.current.clear()
  }, [game.id])

  const removeStored = async (path: string) => {
    if (!native.isDesktop()) return
    try { await native.removeGameResource(game.id, path) } catch { /* déjà retiré ou ressource externe */ }
  }

  const assign = async (slot: ResourceSlot, sourcePath?: string | null) => {
    if (!sourcePath) return
    setBusy(true)
    setError(undefined)
    try {
      const localPath = await native.storeGameResource(game.id, slot.kind, sourcePath)
      const previous = draft[slot.key]
      if (previous && stagedPaths.current.delete(previous)) await removeStored(previous)
      stagedPaths.current.add(localPath)
      setDraft(current => ({ ...current, [slot.key]: localPath }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const browse = async () => {
    const selected = await pickGameResource(activeSlot.kind)
    setSelectedArtwork(undefined)
    setArtworkCandidates([])
    await assign(activeSlot, selected)
  }

  const searchArtwork = async () => {
    if (activeSlot.kind === 'video') return
    setBusy(true)
    setError(undefined)
    setSelectedArtwork(undefined)
    setArtworkCandidates([])
    setUnavailableSources([])
    try {
      const config = { steamgriddbApiKey: artworkSteamGridDbKey, igdbClientId: artworkIgdbClientId, igdbClientSecret: artworkIgdbClientSecret }
      const plan = artworkSearchPlan(artworkSourceMode, config, activeSlot.kind)
      let merged: ArtworkCandidate[] = []
      let lastError: string | undefined
      for (const attempt of plan.attempts) {
        try {
          const candidates = await native.searchGameArtwork(game.name, game.provider || game.platform, game.providerGameId, activeSlot.kind, attempt.apiKeys)
          merged = merged.concat(candidates)
          // Mode automatique : première source fiable gagne, sans blocage si une autre échoue.
          if (candidates.length > 0) break
        } catch (reason) {
          lastError = reason instanceof Error ? reason.message : String(reason)
        }
      }
      const deduped = dedupeArtworkCandidates(merged)
      if (deduped.length === 0) {
        setError(lastError ?? 'Aucune source n’a fourni d’image pour cet emplacement.')
        setUnavailableSources(plan.skipped)
        return
      }
      setArtworkCandidates(deduped)
      setSelectedArtwork(deduped[0])
      setUnavailableSources(plan.skipped)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const useSelectedArtwork = async () => {
    if (!selectedArtwork || activeSlot.kind === 'video') return
    setBusy(true)
    setError(undefined)
    try {
      const localPath = await native.cacheRemoteGameResource(game.id, activeSlot.kind, selectedArtwork.url)
      const previous = draft[activeSlot.key]
      if (previous && stagedPaths.current.delete(previous)) await removeStored(previous)
      stagedPaths.current.add(localPath)
      setDraft(current => ({ ...current, [activeSlot.key]: localPath }))
      setSelectedArtwork(undefined)
      setArtworkCandidates([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const removeActive = async () => {
    if (!activePath) return
    if (stagedPaths.current.delete(activePath)) await removeStored(activePath)
    setDraft(current => ({ ...current, [activeSlot.key]: undefined }))
  }

  const restoreDefaults = async () => {
    for (const path of stagedPaths.current) await removeStored(path)
    stagedPaths.current.clear()
    setDraft({})
  }

  const cancel = async () => {
    setBusy(true)
    for (const path of stagedPaths.current) await removeStored(path)
    stagedPaths.current.clear()
    setBusy(false)
    if (onCancel) onCancel()
    else setDraft({ ...initial.current })
  }

  useEffect(() => {
    if (embedded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) void cancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [embedded, busy, draft])

  const save = async () => {
    setBusy(true)
    setError(undefined)
    try {
      onSave({ ...draft })
      for (const slot of resources) {
        const previous = initial.current[slot.key]
        const next = draft[slot.key]
        if (previous && previous !== next) await removeStored(previous)
      }
      initial.current = { ...draft }
      stagedPaths.current.clear()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    void getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type === 'drop') void assign(activeSlot, event.payload.paths[0])
    }).then(listener => { unlisten = listener }).catch(reason => setError(String(reason)))
    return () => unlisten?.()
  }, [activeSlot, game.id, draft])

  const previewStyle = useMemo(() => {
    if (!fields) return undefined
    const x = Number(draft[fields.x] ?? 50)
    const y = Number(draft[fields.y] ?? 50)
    const zoom = Number(draft[fields.zoom] ?? 100)
    const fit = draft[fields.fit] ?? 'cover'
    return { objectPosition: `${x}% ${y}%`, objectFit: fit, transform: `scale(${zoom / 100})` } as const
  }, [draft, fields])

  const previewSource = selectedArtwork?.url || resourceUrl(activePath)

  return <div className={`flex min-h-0 flex-1 flex-col ${embedded ? 'rounded-xl border border-white/[0.07] bg-white/[0.012]' : ''}`}>
    {!embedded && <header className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.065] px-4 py-3"><div><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/55">Apparence du jeu</p><h2 id="game-resources-title" className="mt-0.5 font-display text-lg font-bold text-white">{title || game.name}</h2></div><button type="button" onClick={() => void cancel()} disabled={busy} aria-label="Fermer" className="rounded-lg p-1.5 text-white/38 hover:bg-white/[0.07] hover:text-white disabled:opacity-30"><X size={16} /></button></header>}
    {error && <p className="mx-4 mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{error}</p>}
    <HeroMediaStrip game={game} />
    <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[180px_minmax(280px,1fr)_220px]">
      <nav className="border-b border-white/[0.06] p-2 lg:border-b-0 lg:border-r" aria-label="Ressources visuelles">
        <div className="grid grid-cols-3 gap-1 lg:grid-cols-1">
          {resources.map(slot => {
            const path = draft[slot.key]
            return <button type="button" key={slot.key} onClick={() => { setActiveSlot(slot); setArtworkCandidates([]); setSelectedArtwork(undefined); setUnavailableSources([]) }} className={`flex min-w-0 items-center gap-2 rounded-lg p-2 text-left transition-colors ${slot.key === activeSlot.key ? 'bg-white/[0.075] text-white' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/66'}`}>
              <ResourceThumb path={path} isVideo={slot.kind === 'video'} />
              <span className="hidden min-w-0 flex-1 lg:block"><span className="block truncate text-[11px] font-medium">{slot.label}</span><span className="mt-0.5 block truncate text-[11px] text-white/28">{path ? 'Personnalisé' : 'Par défaut'}</span></span>
            </button>
          })}
        </div>
      </nav>

      <main className="flex min-h-[330px] min-w-0 flex-col p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white/80">{activeSlot.label}</h3><p className="mt-0.5 text-[11px] text-white/32">{activeSlot.hint}</p></div><span className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] uppercase text-white/25">{activeSlot.kind === 'video' ? 'MP4 · WEBM' : 'PNG · JPG · WEBP · AVIF · SVG'}</span></div>
        {activeSlot.kind !== 'video' && artworkEnabled && <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-white/38">Source de recherche</span><div className="flex gap-0.5 rounded-lg border border-white/[0.07] p-0.5">{(['automatic', 'all'] as const).map(mode => <button key={mode} type="button" onClick={() => setArtworkSourceMode(mode)} className={`rounded-md px-2.5 py-1 text-[11px] ${artworkSourceMode === mode ? 'bg-white/[0.09] text-white/80' : 'text-white/35 hover:text-white/60'}`}>{mode === 'automatic' ? 'Automatique' : 'Toutes les sources'}</button>)}</div></div>
          <div className="flex flex-wrap gap-1.5" aria-label="Sources d’illustrations">{artworkProvidersWithState({ steamgriddbApiKey: artworkSteamGridDbKey, igdbClientId: artworkIgdbClientId, igdbClientSecret: artworkIgdbClientSecret }).map(provider => { const available = provider.state === 'available'; return <span key={provider.id} title={`${provider.label} — ${provider.reason({ steamgriddbApiKey: artworkSteamGridDbKey, igdbClientId: artworkIgdbClientId, igdbClientSecret: artworkIgdbClientSecret })}`} className={`rounded-full border px-2.5 py-1 text-[11px] ${available ? 'border-gold/28 bg-gold/[0.07] font-semibold text-gold/78' : 'cursor-not-allowed border-white/[0.06] text-white/22'}`}>{provider.label}{!available && ' ⓘ'}</span> })}</div>
        </div>}
        <div className="relative mt-3 flex min-h-52 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.075] bg-[linear-gradient(45deg,rgba(255,255,255,.022)_25%,transparent_25%,transparent_75%,rgba(255,255,255,.022)_75%),linear-gradient(45deg,rgba(255,255,255,.022)_25%,transparent_25%,transparent_75%,rgba(255,255,255,.022)_75%)] bg-[length:18px_18px] bg-[position:0_0,9px_9px]" style={{ aspectRatio: activeSlot.ratio }}>
          {previewSource ? activeSlot.kind === 'video' ? <video src={previewSource} controls muted loop className="h-full w-full object-cover" /> : <img src={previewSource} alt={`Aperçu ${activeSlot.label}`} className="h-full w-full" style={previewStyle} /> : <div className="text-center text-white/24"><ImagePlus size={27} className="mx-auto" /><p className="mt-2 text-[11px]">Aucune ressource locale</p><p className="mt-1 text-[11px] text-white/18">Déposez un fichier ou utilisez Parcourir</p></div>}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
          <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/45 px-1.5 py-1 font-mono text-[11px] text-white/42 backdrop-blur">{selectedArtwork ? `APERÇU · ${selectedArtwork.sourceLabel}` : 'APERÇU ZAILON'}</span>
        </div>
        {artworkCandidates.length > 0 && <div className="mt-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-white/55">Résultats · {resultSourceLabels(artworkCandidates).join(', ') || 'aucune source'} · confirmation requise</p><span className="text-[11px] text-white/30">{artworkCandidates.length} image(s)</span></div><div className="flex gap-2 overflow-x-auto pb-1">{artworkCandidates.map(candidate => <button key={candidate.id} type="button" onClick={() => setSelectedArtwork(candidate)} className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border ${selectedArtwork?.id === candidate.id ? 'border-gold/70 ring-1 ring-gold/30' : 'border-white/[0.08]'}`}><img src={candidate.url} alt={`${candidate.sourceLabel} pour ${candidate.gameName}`} loading="lazy" className="h-full w-full object-cover" />{selectedArtwork?.id === candidate.id && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-black"><Check size={11} /></span>}</button>)}</div>{unavailableSources.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-white/30"><Info size={11} className="mt-0.5 shrink-0" /><span>{unavailableSources.length} source(s) indisponible(s) : {unavailableSources.map(source => source.label).join(', ')} — {unavailableSources[0].reason}</span></p>}{selectedArtwork && <p className="mt-2 text-[11px] leading-relaxed text-white/34">{selectedArtwork.gameName} · {selectedArtwork.sourceLabel}. {selectedArtwork.attribution}</p>}</div>}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void browse()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-white/88 disabled:opacity-40"><Upload size={11} /> {activePath ? 'Remplacer localement' : 'Parcourir'}</button>{activeSlot.kind !== 'video' && artworkEnabled && <button type="button" onClick={() => void searchArtwork()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-gold/22 bg-gold/[0.05] px-3 py-1.5 text-[11px] font-semibold text-gold/80 hover:bg-gold/[0.09] disabled:opacity-40"><Search size={12} />Rechercher automatiquement</button>}{selectedArtwork && <button type="button" onClick={() => void useSelectedArtwork()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-40"><Check size={12} />Utiliser cette image</button>}{activePath && <button type="button" onClick={() => void removeActive()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] text-white/48 hover:bg-white/[0.055] hover:text-white"><Trash2 size={10} /> Retirer</button>}</div>
      </main>

      <aside className="border-t border-white/[0.06] p-4 lg:border-l lg:border-t-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/27">Ajustements</p>
        {fields ? <PositionControls draft={draft} fields={fields} onChange={(field, value) => setDraft(current => ({ ...current, [field]: value }))} /> : <p className="mt-3 text-[11px] leading-relaxed text-white/28">Ce type de ressource conserve ses proportions automatiquement. Les contrôles de position concernent les jaquettes, bannières et arrière-plans.</p>}
        <div className="mt-5 rounded-lg border border-dashed border-gold/18 bg-gold/[0.018] p-3 text-[11px] leading-relaxed text-white/33"><ImagePlus size={13} className="mb-2 text-gold/60" />La ressource déposée est copiée dans les données locales de ZAILON. Annuler supprime les nouveaux fichiers temporaires.</div>
      </aside>
    </div>

    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/[0.065] px-4 py-3">
      <button type="button" onClick={() => void restoreDefaults()} disabled={busy} className="flex items-center gap-1.5 text-[11px] text-white/36 hover:text-white disabled:opacity-30"><RotateCcw size={11} /> Restaurer toutes les valeurs</button>
      <div className="flex gap-2"><button type="button" onClick={() => void cancel()} disabled={busy} className="rounded-lg px-3 py-1.5 text-[11px] text-white/45 hover:bg-white/[0.05] hover:text-white disabled:opacity-30">Annuler</button><button type="button" onClick={() => void save()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[11px] font-semibold text-[#0a0b0e] hover:bg-gold-bright disabled:opacity-40"><Save size={11} /> Enregistrer</button></div>
    </footer>
  </div>
}

function ResourceThumb({ path, isVideo }: { path?: string; isVideo: boolean }) {
  if (!path) return <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.025] text-white/20"><ImagePlus size={12} /></span>
  if (isVideo) return <video src={resourceUrl(path)} className="h-8 w-8 flex-none rounded-md border border-white/[0.07] object-cover" muted />
  return <img src={resourceUrl(path)} alt="" className="h-8 w-8 flex-none rounded-md border border-white/[0.07] object-cover" />
}

function PositionControls({ draft, fields, onChange }: {
  draft: GameResources
  fields: { readonly x: keyof GameResources; readonly y: keyof GameResources; readonly zoom: keyof GameResources; readonly fit: keyof GameResources }
  onChange: (field: keyof GameResources, value: number | 'cover' | 'contain') => void
}) {
  const sliders = [
    { icon: Move, label: 'Horizontal', field: fields.x, value: Number(draft[fields.x] ?? 50), min: 0, max: 100 },
    { icon: Move, label: 'Vertical', field: fields.y, value: Number(draft[fields.y] ?? 50), min: 0, max: 100 },
    { icon: ZoomIn, label: 'Zoom', field: fields.zoom, value: Number(draft[fields.zoom] ?? 100), min: 50, max: 170 },
  ]
  return <div className="mt-3 space-y-3">
    {sliders.map(({ icon: Icon, label, field, value, min, max }) => <label key={label} className="block"><span className="mb-1.5 flex items-center justify-between text-[11px] text-white/38"><span className="flex items-center gap-1"><Icon size={9} />{label}</span><span className="font-mono text-white/28">{value}%</span></span><input type="range" min={min} max={max} value={value} onChange={event => onChange(field, Number(event.target.value))} className="h-1 w-full accent-gold" /></label>)}
    <div><p className="mb-1.5 text-[11px] text-white/38">Remplissage</p><div className="grid grid-cols-2 gap-1">{(['cover', 'contain'] as const).map(fit => <button type="button" key={fit} onClick={() => onChange(fields.fit, fit)} className={`rounded-md border py-1.5 text-[11px] ${draft[fields.fit] === fit || (!draft[fields.fit] && fit === 'cover') ? 'border-gold/28 bg-gold/[0.07] text-gold' : 'border-white/[0.07] text-white/34 hover:bg-white/[0.035]'}`}>{fit === 'cover' ? 'Remplir' : 'Contenir'}</button>)}</div></div>
  </div>
}

/** Bloc « Fond de l'Accueil » (spec Accueil §3, §6-7) : type de fond par jeu +
 * lien YouTube collable directement, persisté par jeu (setGameBackgroundMedia). */
function HeroMediaStrip({ game }: { game: Game }) {
  const setGameBackgroundMedia = useStore(state => state.setGameBackgroundMedia)
  const backgroundMediaSettings = useStore(state => state.backgroundMediaSettings)
  const setBackgroundMediaSettings = useStore(state => state.setBackgroundMediaSettings)
  const [urlDraft, setUrlDraft] = useState('')
  const [feedback, setFeedback] = useState<'idle' | 'valid' | 'invalid'>('idle')
  const [resolving, setResolving] = useState(false)
  const [resolveStatus, setResolveStatus] = useState<YoutubeResolveStatus>('idle')
  const media = game.backgroundMedia
  const type = media?.type
  // Spec « Fix vidéo YouTube » : résolution locale (yt-dlp) puis lecture du
  // fichier en cache ; repli lecteur embarqué si yt-dlp est absent.
  const applyYouTube = async () => {
    const parsed = parseYouTubeUrl(urlDraft)
    if (!parsed) { setFeedback('invalid'); return }
    setFeedback('idle')
    setResolving(true)
    setResolveStatus('validating')
    try {
      if (!native.isDesktop()) {
        setGameBackgroundMedia(game.id, { type: 'youtube', youtubeUrl: urlDraft.trim(), youtubeVideoId: parsed.videoId, startSeconds: parsed.startSeconds })
        setFeedback('valid')
        return
      }
      const result = await native.resolveYoutubeVideo(urlDraft.trim(), parsed.videoId)
      if (result.status === 'cached' && result.videoPath) {
        setResolveStatus('cached')
        setGameBackgroundMedia(game.id, { type: 'video', localPath: result.videoPath, youtubeUrl: urlDraft.trim(), youtubeVideoId: parsed.videoId, startSeconds: parsed.startSeconds })
        setFeedback('valid')
      } else if (result.status === 'ytdlp_missing') {
        setResolveStatus('ytdlp_missing')
        setGameBackgroundMedia(game.id, { type: 'youtube', youtubeUrl: urlDraft.trim(), youtubeVideoId: parsed.videoId, startSeconds: parsed.startSeconds })
        setFeedback('valid')
      } else {
        setResolveStatus('failed')
        setFeedback('invalid')
      }
    } catch {
      setResolveStatus('failed')
      setFeedback('invalid')
    } finally {
      setResolving(false)
    }
  }
  const thumb = media?.youtubeVideoId ? youtubeThumbnailUrl(media.youtubeVideoId) : undefined
  return (
    <div className="mx-4 mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-white/55">Fond de l'Accueil</p>
        <div className="flex gap-1">
          {([['image', 'Image'], ['video', 'Vidéo locale'], ['youtube', 'YouTube']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setGameBackgroundMedia(game.id, { type: id }); setFeedback('idle') }} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${type === id ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/[0.09] text-white/45 hover:text-white/70'}`}>{label}</button>
          ))}
        </div>
      </div>
      {type === 'youtube' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {thumb && <img src={thumb} alt="" className="h-10 w-16 flex-none rounded border border-white/[0.08] object-cover" />}
          <input type="url" value={urlDraft} onChange={event => { setUrlDraft(event.target.value); setFeedback('idle') }} placeholder="https://youtube.com/watch?v=…" className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/25 px-3 py-1.5 text-[11px] text-white/80 placeholder-white/25 outline-none focus:border-gold/40" />
          <button type="button" onClick={() => void applyYouTube()} disabled={resolving} className="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90 disabled:cursor-wait disabled:opacity-55">{resolving ? 'Téléchargement…' : <span><Check size={11} className="mr-1 inline" />Utiliser comme fond</span>}</button>
        </div>
      )}
      {type === 'video' && <p className="mt-2 text-[11px] text-white/38">{media?.localPath ? 'Vidéo locale en cache — lecture hors-ligne, jamais re-téléchargée à chaque lancement.' : 'Sélectionnez le slot « Vidéo » ci-contre pour choisir un fichier MP4 ou WebM local.'}</p>}
      {type === 'image' && <p className="mt-2 text-[11px] text-white/38">Image fixe — choisissez une jaquette, bannière ou arrière-plan ci-contre.</p>}
      {resolving && <div className="mt-2 space-y-1 rounded-lg border border-white/[0.06] bg-black/15 p-2">{PIPELINE_STAGES.map(stage => <p key={stage.id} className="flex items-center gap-2 text-[10px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-gold/70 animate-pulse" />{stage.label}</p>)}</div>}
      {feedback === 'valid' && resolveStatus === 'cached' && <p className="mt-1.5 text-[11px] text-emerald-300/85">✓ Téléchargée et mise en cache — lecture locale hors-ligne.</p>}
      {feedback === 'valid' && resolveStatus === 'ytdlp_missing' && <p className="mt-1.5 text-[11px] text-amber-200/80">yt-dlp introuvable — repli sur le lecteur YouTube embarqué.</p>}
      {feedback === 'valid' && resolveStatus !== 'cached' && resolveStatus !== 'ytdlp_missing' && <p className="mt-1.5 text-[11px] text-emerald-300/85">Vidéo enregistrée.</p>}
      {feedback === 'invalid' && <p className="mt-1.5 text-[11px] text-red-300/85">{resolveStatus === 'failed' ? 'Téléchargement échoué — vérifiez le lien.' : 'Lien non pris en charge. Accepté : youtube.com/watch, youtu.be, shorts.'}</p>}
      {media?.youtubeVideoId && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-300/14 bg-emerald-300/[0.04] px-2.5 py-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-300/20 text-emerald-300"><Check size={9} /></span>
          <p className="min-w-0 flex-1 truncate text-[11px] text-emerald-100/75">Fond actuel : <span className="font-semibold text-emerald-100">YouTube ✓</span></p>
          <button
            type="button"
            onClick={() => setGameBackgroundMedia(game.id, { type: 'image', youtubeVideoId: undefined, youtubeUrl: undefined, startSeconds: undefined })}
            className="rounded-md border border-white/[0.09] px-2 py-1 text-[10px] text-white/45 hover:border-red-300/30 hover:text-red-200"
          >Retirer la vidéo</button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
        <div>
          <p className="text-[11px] font-medium text-white/60">Toujours démarrer muet</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/32">Chaque lancement commence 🔇, quelle que soit l'intention persistée — le volume du jeu est restauré quand vous réactivez le son. Le volume réglé sur l'Accueil reste mémorisé par jeu.</p>
        </div>
        <ZailonSwitch
          size="compact"
          checked={backgroundMediaSettings.bgAlwaysMuted}
          onChange={enabled => setBackgroundMediaSettings({ bgAlwaysMuted: enabled })}
          aria-label="Toujours démarrer muet"
        />
      </div>
    </div>
  )
}
