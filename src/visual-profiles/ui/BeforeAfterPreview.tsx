import { ImagePlus, ScanLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { resourceUrl } from '../../lib/native'
import type { VisualSettings } from '../domain/types'
import { pickVisualPreviewImage } from '../infrastructure/nativeBackend'

const SCENES = [
  { id: 'forest', label: 'Forêt', className: 'from-[#081b14] via-[#2c583a] to-[#d1a869]' },
  { id: 'desert', label: 'Désert', className: 'from-[#352114] via-[#c1743c] to-[#f1d3a0]' },
  { id: 'night', label: 'Nuit', className: 'from-[#02040b] via-[#142349] to-[#854fa2]' },
  { id: 'snow', label: 'Neige', className: 'from-[#263a4d] via-[#b8d4de] to-[#f4f8f8]' },
  { id: 'interior', label: 'Intérieur', className: 'from-[#110c09] via-[#473225] to-[#c39560]' },
  { id: 'skin', label: 'Peaux', className: 'from-[#4d241d] via-[#bc795f] to-[#f1c2a3]' },
  { id: 'gradients', label: 'Dégradés', className: 'from-[#161542] via-[#d3426c] to-[#f6d863]' },
  { id: 'calibration', label: 'Mire', className: 'from-black via-white to-black' },
] as const

export function BeforeAfterPreview({ settings }: { settings: VisualSettings }) {
  const [position, setPosition] = useState(50)
  const [scene, setScene] = useState<(typeof SCENES)[number]['id']>('forest')
  const [holdOriginal, setHoldOriginal] = useState(false)
  const [image, setImage] = useState<string>()
  const selected = SCENES.find(item => item.id === scene) || SCENES[0]
  const adjustedStyle = useMemo(() => ({
    filter: `saturate(${Math.max(0, settings.saturation + settings.vibrance * 0.35)}) brightness(${Math.max(0.4, 1 + settings.brightness)}) contrast(${settings.contrast})`,
  }), [settings])
  const visual = (adjusted: boolean) => <div className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${selected.className}`} style={adjusted ? adjustedStyle : undefined}>
    {image && <img src={resourceUrl(image)} className="h-full w-full object-cover" alt="Aperçu fourni par l’utilisateur" />}
    {!image && <>
      <div className="absolute left-[8%] top-[12%] h-28 w-28 rounded-full bg-white/35 blur-2xl" />
      <div className="absolute bottom-0 left-0 right-0 h-[42%] bg-black/35" />
      <div className="absolute bottom-[18%] left-[12%] h-20 w-32 rounded-t-[50%] bg-black/55" />
      <div className="absolute bottom-[18%] right-[14%] h-28 w-16 rounded-t-full bg-white/25" />
      <div className="absolute inset-x-[7%] bottom-[7%] grid grid-cols-8 gap-1">{['#fff','#ddd','#999','#555','#222','#e45454','#50a9df','#77c768'].map(color => <span key={color} className="h-3 rounded-sm" style={{ backgroundColor: color }} />)}</div>
    </>}
    {adjusted && <div className="absolute inset-0 mix-blend-color" style={{ backgroundColor: settings.temperature < 6500 ? `rgba(255,105,20,${(6500 - settings.temperature) / 22000})` : `rgba(70,145,255,${(settings.temperature - 6500) / 22000})` }} />}
  </div>

  return <section className="rounded-2xl border border-white/[0.07] bg-black/15 p-3">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-white/75"><ScanLine size={15} className="text-gold" />Avant / Après</div>
      <select value={scene} onChange={event => { setScene(event.target.value as typeof scene); setImage(undefined) }} className="ml-auto rounded-lg border border-white/[0.08] bg-[#111515] px-2 py-1.5 text-xs text-white/62">{SCENES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <button type="button" onClick={() => void pickVisualPreviewImage().then(path => path && setImage(path))} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-white/55 hover:text-white"><ImagePlus size={13} />Image locale</button>
    </div>
    <div className="relative aspect-[16/8] min-h-48 overflow-hidden rounded-xl border border-white/[0.08]">
      {visual(false)}
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: holdOriginal ? '100%' : `${position}%` }}>{visual(true)}</div>
      {!holdOriginal && <div className="absolute inset-y-0 w-px bg-white/90 shadow-[0_0_12px_white]" style={{ left: `${position}%` }} />}
      <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/75">APRÈS</span>
      <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/75">AVANT</span>
    </div>
    <input type="range" min={0} max={100} value={position} onChange={event => setPosition(Number(event.target.value))} className="mt-3 w-full accent-[var(--zailon-accent)]" aria-label="Position du comparateur avant après" />
    <button type="button" onPointerDown={() => setHoldOriginal(true)} onPointerUp={() => setHoldOriginal(false)} onPointerLeave={() => setHoldOriginal(false)} className="mt-2 w-full rounded-lg border border-white/[0.08] py-2 text-xs text-white/55 hover:bg-white/[0.04]">Maintenir pour voir l’original</button>
    <p className="mt-2 text-[11px] leading-relaxed text-white/32">Aperçu ZAILON local : aucune capture automatique du jeu et aucune analyse du contenu affiché.</p>
  </section>
}
