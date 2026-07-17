import { ImagePlus, RotateCcw, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Game, GameResources } from '../types'
import { GameResourceKind, native, pickGameResource, resourceUrl } from '../lib/native'

type ResourceKey = 'coverPath' | 'logoPath' | 'iconPath' | 'backgroundPath' | 'bannerPath' | 'videoPath'

const resources: Array<{ kind: GameResourceKind; key: ResourceKey; label: string; hint: string }> = [
  { kind: 'cover', key: 'coverPath', label: 'Jaquette', hint: 'Image principale de la carte' },
  { kind: 'logo', key: 'logoPath', label: 'Logo', hint: 'Logo affiché sur l’accueil' },
  { kind: 'icon', key: 'iconPath', label: 'Icône', hint: 'Petite icône de bibliothèque' },
  { kind: 'background', key: 'backgroundPath', label: 'Arrière-plan', hint: 'Fond de la page d’accueil' },
  { kind: 'banner', key: 'bannerPath', label: 'Bannière', hint: 'Bannière de carte' },
  { kind: 'video', key: 'videoPath', label: 'Vidéo', hint: 'MP4 ou WebM local' },
]

interface GameResourcesDialogProps {
  game: Game
  onClose: () => void
  onChange: (resources: Partial<GameResources>) => void
}

export function GameResourcesDialog({ game, onClose, onChange }: GameResourcesDialogProps) {
  const [activeSlot, setActiveSlot] = useState<(typeof resources)[number]>(resources[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const assign = async (slot: (typeof resources)[number], sourcePath?: string | null) => {
    if (!sourcePath) return
    setBusy(true)
    setError(undefined)
    try {
      const localPath = await native.storeGameResource(game.id, slot.kind, sourcePath)
      onChange({ [slot.key]: localPath })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const browse = async (slot: (typeof resources)[number]) => {
    setActiveSlot(slot)
    await assign(slot, await pickGameResource(slot.kind))
  }

  const reset = async (slot: (typeof resources)[number]) => {
    const stored = game.resources?.[slot.key]
    if (stored && native.isDesktop()) {
      try { await native.removeGameResource(game.id, stored) } catch { /* The resource may already have been removed. */ }
    }
    onChange({ [slot.key]: undefined })
  }

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    void getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type === 'drop') void assign(activeSlot, event.payload.paths[0])
    }).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [activeSlot, game.id])

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-300 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="game-resources-title">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><h2 id="game-resources-title" className="font-display text-sm font-bold text-white">Identité visuelle — {game.name}</h2><p className="mt-0.5 text-[10px] text-white/40">Les fichiers sont copiés dans les données locales de ZAILON. Sélectionnez une case, puis déposez un fichier ou parcourez votre disque.</p></div><button onClick={onClose} disabled={busy} aria-label="Fermer" className="rounded p-1 text-white/40 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"><X size={16} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <p className="mb-3 rounded border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {resources.map(slot => {
            const path = game.resources?.[slot.key]
            const isActive = slot.key === activeSlot.key
            return <article key={slot.key} onClick={() => setActiveSlot(slot)} className={`rounded-lg border p-3 transition-colors ${isActive ? 'border-gold/35 bg-gold/[0.045]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
              <div className="flex gap-3"><ResourcePreview path={path} isVideo={slot.kind === 'video'} /><div className="min-w-0 flex-1"><h3 className="text-xs font-semibold text-white/85">{slot.label}</h3><p className="mt-0.5 text-[10px] text-white/38">{slot.hint}</p><p className="mt-1.5 truncate font-mono text-[8px] text-white/28" title={path}>{path ? 'Copié localement' : 'Image du fournisseur ou aucune ressource'}</p></div></div>
              <div className="mt-3 flex gap-1.5"><button onClick={event => { event.stopPropagation(); void browse(slot) }} disabled={busy} className="flex items-center gap-1 rounded border border-white/[0.1] px-2 py-1 text-[9px] text-white/65 hover:bg-white/[0.08] disabled:opacity-40"><Upload size={10} /> Parcourir</button>{path && <button onClick={event => { event.stopPropagation(); void reset(slot) }} disabled={busy} className="flex items-center gap-1 rounded px-2 py-1 text-[9px] text-white/40 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><RotateCcw size={10} /> Restaurer</button>}</div>
            </article>
          })}
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-gold/25 bg-gold/[0.025] p-3 text-center text-[10px] text-white/45"><ImagePlus size={15} className="mx-auto mb-1 text-gold/70" />Case active : <span className="text-gold">{activeSlot.label}</span>. Déposez un fichier compatible sur la fenêtre pour l’importer dans cette case.</div>
        <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2"><PositionControl label="Position de la jaquette" x={game.resources?.coverPositionX ?? 50} y={game.resources?.coverPositionY ?? 50} zoom={game.resources?.coverZoom ?? 100} onChange={patch => onChange(patch)} fields={['coverPositionX', 'coverPositionY', 'coverZoom']} /><PositionControl label="Position de l’arrière-plan" x={game.resources?.backgroundPositionX ?? 50} y={game.resources?.backgroundPositionY ?? 50} zoom={game.resources?.backgroundZoom ?? 100} onChange={patch => onChange(patch)} fields={['backgroundPositionX', 'backgroundPositionY', 'backgroundZoom']} /></div>
      </div>
      <footer className="flex justify-end border-t border-white/[0.07] px-4 py-3"><button onClick={onClose} disabled={busy} className="rounded bg-gold px-3 py-1.5 text-[10px] font-semibold text-ink-400 hover:bg-gold-bright disabled:opacity-40">Terminer</button></footer>
    </section>
  </div>
}

function ResourcePreview({ path, isVideo }: { path?: string; isVideo: boolean }) {
  if (!path) return <div className="flex h-12 w-12 flex-none items-center justify-center rounded border border-white/[0.08] bg-white/[0.03] text-white/25"><ImagePlus size={16} /></div>
  if (isVideo) return <video src={resourceUrl(path)} className="h-12 w-12 flex-none rounded border border-white/[0.08] object-cover" muted />
  return <img src={resourceUrl(path)} alt="" className="h-12 w-12 flex-none rounded border border-white/[0.08] object-cover" />
}

function PositionControl({ label, x, y, zoom, onChange, fields }: { label: string; x: number; y: number; zoom: number; onChange: (resources: Partial<GameResources>) => void; fields: [keyof GameResources, keyof GameResources, keyof GameResources] }) {
  const [xField, yField, zoomField] = fields
  const sliders: Array<{ label: string; value: number; field: keyof GameResources; min: number; max: number }> = [{ label: 'X', value: x, field: xField, min: 0, max: 100 }, { label: 'Y', value: y, field: yField, min: 0, max: 100 }, { label: 'Zoom', value: zoom, field: zoomField, min: 50, max: 150 }]
  return <div><p className="mb-2 text-[9px] font-mono uppercase tracking-widest text-white/35">{label}</p>{sliders.map(slider => <label key={slider.label} className="mb-1.5 flex items-center gap-2 text-[9px] text-white/45"><span className="w-7">{slider.label}</span><input type="range" min={slider.min} max={slider.max} value={slider.value} onChange={event => onChange({ [slider.field]: Number(event.target.value) })} className="h-1 flex-1 accent-gold" /><span className="w-6 text-right font-mono text-white/35">{slider.value}</span></label>)}</div>
}
