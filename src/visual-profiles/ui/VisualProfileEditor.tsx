import { RotateCcw } from 'lucide-react'
import type { VisualSettings } from '../domain/types'
import { NEUTRAL_SETTINGS } from '../domain/types'

interface SettingDefinition {
  key: keyof VisualSettings
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

const SETTINGS: SettingDefinition[] = [
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01 },
  { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, step: 0.01 },
  { key: 'brightness', label: 'Luminosité', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'contrast', label: 'Contraste', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'gamma', label: 'Gamma', min: 0.5, max: 2.5, step: 0.01 },
  { key: 'temperature', label: 'Température', min: 2500, max: 10000, step: 50, unit: 'K' },
  { key: 'red', label: 'Rouge', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'green', label: 'Vert', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'blue', label: 'Bleu', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'shadows', label: 'Ombres', min: -1, max: 1, step: 0.01 },
  { key: 'highlights', label: 'Hautes lumières', min: -1, max: 1, step: 0.01 },
  { key: 'sharpness', label: 'Netteté', min: 0, max: 1, step: 0.01 },
]

export function VisualProfileEditor({
  value,
  onChange,
  supportedSettings,
}: {
  value: VisualSettings
  onChange: (settings: VisualSettings) => void
  supportedSettings: string[]
}) {
  const update = (key: keyof VisualSettings, next: number) => onChange({ ...value, [key]: next })

  return <div className="grid gap-x-5 gap-y-3 xl:grid-cols-2">
    {SETTINGS.map(setting => {
      const current = value[setting.key]
      const supported = supportedSettings.includes(setting.key)
      const changed = current !== NEUTRAL_SETTINGS[setting.key]
      return <div key={setting.key} className="rounded-xl border border-white/[0.065] bg-white/[0.018] p-3" onDoubleClick={() => update(setting.key, NEUTRAL_SETTINGS[setting.key])}>
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor={`visual-${setting.key}`} className="text-xs font-semibold text-white/72">{setting.label}</label>
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${supported ? 'bg-emerald-300/[0.08] text-emerald-100/62' : 'bg-amber-300/[0.07] text-amber-100/56'}`}>{supported ? 'écran réel' : 'aperçu'}</span>
          {changed && <span className="text-[11px] text-gold/60">modifié</span>}
          <button type="button" className="ml-auto rounded-md p-1 text-white/30 hover:bg-white/[0.06] hover:text-white" title="Réinitialiser ce réglage" onClick={() => update(setting.key, NEUTRAL_SETTINGS[setting.key])}><RotateCcw size={13} /></button>
        </div>
        <div className="flex items-center gap-3">
          <input
            id={`visual-${setting.key}`}
            type="range"
            min={setting.min}
            max={setting.max}
            step={setting.step}
            value={current}
            onChange={event => update(setting.key, Number(event.target.value))}
            className="h-1.5 min-w-0 flex-1 accent-[var(--zailon-accent)]"
            aria-label={setting.label}
          />
          <div className="flex w-24 items-center rounded-lg border border-white/[0.08] bg-black/20 px-2">
            <input
              type="number"
              min={setting.min}
              max={setting.max}
              step={setting.step}
              value={current}
              onChange={event => update(setting.key, Number(event.target.value))}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-right text-xs text-white/72 outline-none"
              aria-label={`${setting.label}, valeur précise`}
            />
            {setting.unit && <span className="ml-1 text-[11px] text-white/35">{setting.unit}</span>}
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-white/30">Défaut : {NEUTRAL_SETTINGS[setting.key]}{setting.unit ? ` ${setting.unit}` : ''} · double-clic pour réinitialiser</p>
      </div>
    })}
  </div>
}
