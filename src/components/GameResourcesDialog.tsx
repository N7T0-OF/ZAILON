import { ImagePlus, Move, RotateCcw, Save, Trash2, Upload, X, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Game, GameResources } from '../types'
import { GameResourceKind, native, pickGameResource, resourceUrl } from '../lib/native'

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
  const activePath = draft[activeSlot.key]
  const fields = transformFields[activeSlot.kind as keyof typeof transformFields]

  useEffect(() => {
    initial.current = { ...game.resources }
    setDraft({ ...game.resources })
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
    await assign(activeSlot, selected)
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

  return <div className={`flex min-h-0 flex-1 flex-col ${embedded ? 'rounded-xl border border-white/[0.07] bg-white/[0.012]' : ''}`}>
    {!embedded && <header className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.065] px-4 py-3"><div><p className="font-mono text-[7px] uppercase tracking-[0.22em] text-gold/55">Apparence du jeu</p><h2 id="game-resources-title" className="mt-0.5 font-display text-lg font-bold text-white">{title || game.name}</h2></div><button type="button" onClick={() => void cancel()} disabled={busy} aria-label="Fermer" className="rounded-lg p-1.5 text-white/38 hover:bg-white/[0.07] hover:text-white disabled:opacity-30"><X size={16} /></button></header>}
    {error && <p className="mx-4 mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-200">{error}</p>}
    <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[180px_minmax(280px,1fr)_220px]">
      <nav className="border-b border-white/[0.06] p-2 lg:border-b-0 lg:border-r" aria-label="Ressources visuelles">
        <div className="grid grid-cols-3 gap-1 lg:grid-cols-1">
          {resources.map(slot => {
            const path = draft[slot.key]
            return <button type="button" key={slot.key} onClick={() => setActiveSlot(slot)} className={`flex min-w-0 items-center gap-2 rounded-lg p-2 text-left transition-colors ${slot.key === activeSlot.key ? 'bg-white/[0.075] text-white' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/66'}`}>
              <ResourceThumb path={path} isVideo={slot.kind === 'video'} />
              <span className="hidden min-w-0 flex-1 lg:block"><span className="block truncate text-[10px] font-medium">{slot.label}</span><span className="mt-0.5 block truncate text-[8px] text-white/28">{path ? 'Personnalisé' : 'Par défaut'}</span></span>
            </button>
          })}
        </div>
      </nav>

      <main className="flex min-h-[330px] min-w-0 flex-col p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white/80">{activeSlot.label}</h3><p className="mt-0.5 text-[9px] text-white/32">{activeSlot.hint}</p></div><span className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[7px] uppercase text-white/25">{activeSlot.kind === 'video' ? 'MP4 · WEBM' : 'PNG · JPG · WEBP · AVIF · SVG'}</span></div>
        <div className="relative mt-3 flex min-h-52 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.075] bg-[linear-gradient(45deg,rgba(255,255,255,.022)_25%,transparent_25%,transparent_75%,rgba(255,255,255,.022)_75%),linear-gradient(45deg,rgba(255,255,255,.022)_25%,transparent_25%,transparent_75%,rgba(255,255,255,.022)_75%)] bg-[length:18px_18px] bg-[position:0_0,9px_9px]" style={{ aspectRatio: activeSlot.ratio }}>
          {activePath ? activeSlot.kind === 'video' ? <video src={resourceUrl(activePath)} controls muted loop className="h-full w-full object-cover" /> : <img src={resourceUrl(activePath)} alt={`Aperçu ${activeSlot.label}`} className="h-full w-full" style={previewStyle} /> : <div className="text-center text-white/24"><ImagePlus size={27} className="mx-auto" /><p className="mt-2 text-[10px]">Aucune ressource locale</p><p className="mt-1 text-[8px] text-white/18">Déposez un fichier ou utilisez Parcourir</p></div>}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
          <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/45 px-1.5 py-1 font-mono text-[7px] text-white/42 backdrop-blur">APERÇU ZAILON</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void browse()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[9px] font-semibold text-black hover:bg-white/88 disabled:opacity-40"><Upload size={11} /> {activePath ? 'Remplacer' : 'Parcourir'}</button>{activePath && <button type="button" onClick={() => void removeActive()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[9px] text-white/48 hover:bg-white/[0.055] hover:text-white"><Trash2 size={10} /> Retirer</button>}</div>
      </main>

      <aside className="border-t border-white/[0.06] p-4 lg:border-l lg:border-t-0">
        <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-white/27">Ajustements</p>
        {fields ? <PositionControls draft={draft} fields={fields} onChange={(field, value) => setDraft(current => ({ ...current, [field]: value }))} /> : <p className="mt-3 text-[9px] leading-relaxed text-white/28">Ce type de ressource conserve ses proportions automatiquement. Les contrôles de position concernent les jaquettes, bannières et arrière-plans.</p>}
        <div className="mt-5 rounded-lg border border-dashed border-gold/18 bg-gold/[0.018] p-3 text-[9px] leading-relaxed text-white/33"><ImagePlus size={13} className="mb-2 text-gold/60" />La ressource déposée est copiée dans les données locales de ZAILON. Annuler supprime les nouveaux fichiers temporaires.</div>
      </aside>
    </div>

    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/[0.065] px-4 py-3">
      <button type="button" onClick={() => void restoreDefaults()} disabled={busy} className="flex items-center gap-1.5 text-[9px] text-white/36 hover:text-white disabled:opacity-30"><RotateCcw size={11} /> Restaurer toutes les valeurs</button>
      <div className="flex gap-2"><button type="button" onClick={() => void cancel()} disabled={busy} className="rounded-lg px-3 py-1.5 text-[9px] text-white/45 hover:bg-white/[0.05] hover:text-white disabled:opacity-30">Annuler</button><button type="button" onClick={() => void save()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[9px] font-semibold text-[#0a0b0e] hover:bg-gold-bright disabled:opacity-40"><Save size={11} /> Enregistrer</button></div>
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
    {sliders.map(({ icon: Icon, label, field, value, min, max }) => <label key={label} className="block"><span className="mb-1.5 flex items-center justify-between text-[8px] text-white/38"><span className="flex items-center gap-1"><Icon size={9} />{label}</span><span className="font-mono text-white/28">{value}%</span></span><input type="range" min={min} max={max} value={value} onChange={event => onChange(field, Number(event.target.value))} className="h-1 w-full accent-gold" /></label>)}
    <div><p className="mb-1.5 text-[8px] text-white/38">Remplissage</p><div className="grid grid-cols-2 gap-1">{(['cover', 'contain'] as const).map(fit => <button type="button" key={fit} onClick={() => onChange(fields.fit, fit)} className={`rounded-md border py-1.5 text-[8px] ${draft[fields.fit] === fit || (!draft[fields.fit] && fit === 'cover') ? 'border-gold/28 bg-gold/[0.07] text-gold' : 'border-white/[0.07] text-white/34 hover:bg-white/[0.035]'}`}>{fit === 'cover' ? 'Remplir' : 'Contenir'}</button>)}</div></div>
  </div>
}
