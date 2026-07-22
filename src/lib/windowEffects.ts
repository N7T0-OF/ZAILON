import type { LiquidGlassMode, LiquidGlassSettings } from '../types'

export interface WindowEffectsState {
  mode: LiquidGlassMode
  settings: LiquidGlassSettings
  energySaver: boolean
  focused: boolean
}

export interface WindowEffectsDiagnostic {
  backend: 'SimulatedCss'
  nativeAvailable: false
  active: boolean
  reason: string
}

export interface WindowEffectsBackend {
  apply(state: WindowEffectsState): WindowEffectsDiagnostic
}

const PRESETS: Record<Exclude<LiquidGlassMode, 'custom'>, Partial<LiquidGlassSettings>> = {
  off: { opacity: 1, blur: 0, darkTint: 0.74, saturation: 1, border: 0.06, reflection: 0, shadow: 0.35, animations: false },
  light: { opacity: 0.94, blur: 10, darkTint: 0.66, saturation: 1.02, border: 0.09, reflection: 0.03, shadow: 0.4, animations: true },
  normal: { opacity: 0.86, blur: 18, darkTint: 0.58, saturation: 1.08, border: 0.12, reflection: 0.08, shadow: 0.5, animations: true },
  intense: { opacity: 0.72, blur: 30, darkTint: 0.48, saturation: 1.18, border: 0.18, reflection: 0.14, shadow: 0.62, animations: true },
}

export function resolvedLiquidGlass(mode: LiquidGlassMode, custom: LiquidGlassSettings): LiquidGlassSettings {
  return mode === 'custom' ? custom : { ...custom, ...PRESETS[mode] }
}

class SimulatedCssWindowEffectsBackend implements WindowEffectsBackend {
  apply({ mode, settings: custom, energySaver, focused }: WindowEffectsState): WindowEffectsDiagnostic {
    const root = document.documentElement
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const settings = resolvedLiquidGlass(mode, custom)
    const active = mode !== 'off' && !energySaver
    const focusFactor = !focused && settings.reduceWhenUnfocused ? 0.72 : 1
    root.dataset.liquidGlassActive = String(active)
    root.dataset.windowFocused = String(focused)
    root.dataset.effectsMotion = String(active && settings.animations && !reducedMotion)
    root.style.setProperty('--liquid-opacity', String(Math.min(1, settings.opacity / focusFactor)))
    root.style.setProperty('--liquid-blur', `${Math.round(settings.blur * focusFactor)}px`)
    root.style.setProperty('--liquid-tint', String(settings.darkTint))
    root.style.setProperty('--liquid-saturation', String(settings.saturation))
    root.style.setProperty('--liquid-border', String(settings.border))
    root.style.setProperty('--liquid-reflection', String(settings.reflection * focusFactor))
    root.style.setProperty('--liquid-shadow', String(settings.shadow))
    return {
      backend: 'SimulatedCss',
      nativeAvailable: false,
      active,
      reason: energySaver
        ? 'Préférence conservée, effet suspendu par l’économiseur ZAILON.'
        : active
          ? 'Fallback CSS sûr : aucune injection DWM ni modification système.'
          : 'Effet désactivé par préférence.',
    }
  }
}

export const windowEffectsBackend: WindowEffectsBackend = new SimulatedCssWindowEffectsBackend()
