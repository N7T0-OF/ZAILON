import { isTauri } from '@tauri-apps/api/core'
import { Effect, EffectState, getCurrentWindow } from '@tauri-apps/api/window'
import type { LiquidGlassMode, LiquidGlassSettings, WindowEffectsDiagnostic } from '../types'

export interface WindowEffectsState {
  mode: LiquidGlassMode
  settings: LiquidGlassSettings
  energySaver: boolean
  focused: boolean
}

export interface WindowMaterialCapabilities {
  platform: 'windows' | 'macos' | 'linux' | 'web'
  nativeDynamicMaterial: boolean
  supportedEffects: string[]
  requiresTransparentWindow: boolean
}

export interface WindowMaterialBackend {
  capabilities(): WindowMaterialCapabilities
  enable(state: WindowEffectsState): Promise<WindowEffectsDiagnostic>
  update(state: WindowEffectsState): Promise<WindowEffectsDiagnostic>
  disable(reason?: string): Promise<WindowEffectsDiagnostic>
  runtimeStatus(): WindowEffectsDiagnostic
  apply(state: WindowEffectsState): Promise<WindowEffectsDiagnostic>
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

function platform(): WindowMaterialCapabilities['platform'] {
  if (!isTauri()) return 'web'
  const agent = navigator.userAgent.toLocaleLowerCase()
  if (agent.includes('windows')) return 'windows'
  if (agent.includes('macintosh') || agent.includes('mac os')) return 'macos'
  return 'linux'
}

function applyCss(state: WindowEffectsState) {
  const root = document.documentElement
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const settings = resolvedLiquidGlass(state.mode, state.settings)
  const active = state.mode !== 'off' && !state.energySaver
  const focusFactor = !state.focused && settings.reduceWhenUnfocused ? 0.72 : 1
  root.dataset.liquidGlassActive = String(active)
  root.dataset.windowFocused = String(state.focused)
  root.dataset.effectsMotion = String(active && settings.animations && !reducedMotion)
  root.style.setProperty('--liquid-opacity', String(Math.min(1, settings.opacity / focusFactor)))
  root.style.setProperty('--liquid-blur', `${Math.round(settings.blur * focusFactor)}px`)
  root.style.setProperty('--liquid-tint', String(settings.darkTint))
  root.style.setProperty('--liquid-saturation', String(settings.saturation))
  root.style.setProperty('--liquid-border', String(settings.border))
  root.style.setProperty('--liquid-reflection', String(settings.reflection * focusFactor))
  root.style.setProperty('--liquid-shadow', String(settings.shadow))
  return active
}

class NativeWindowMaterialBackend implements WindowMaterialBackend {
  private status: WindowEffectsDiagnostic = {
    backend: 'Opaque', nativeAvailable: false, active: false, dynamicBackdropVerified: false,
    reason: 'Effet désactivé par préférence.',
  }

  capabilities(): WindowMaterialCapabilities {
    const current = platform()
    return {
      platform: current,
      nativeDynamicMaterial: current === 'windows' || current === 'macos',
      supportedEffects: current === 'windows' ? ['Mica', 'Acrylic'] : current === 'macos' ? ['Vibrancy'] : current === 'linux' ? ['Compositor-dependent'] : ['CSS preview'],
      requiresTransparentWindow: current === 'windows' || current === 'macos',
    }
  }

  runtimeStatus() { return this.status }

  async disable(reason = 'Effet désactivé par préférence.'): Promise<WindowEffectsDiagnostic> {
    if (isTauri()) await getCurrentWindow().clearEffects().catch(() => undefined)
    this.status = { backend: 'Opaque', nativeAvailable: this.capabilities().nativeDynamicMaterial, active: false, dynamicBackdropVerified: false, reason }
    document.documentElement.dataset.windowMaterialBackend = this.status.backend
    return this.status
  }

  async enable(state: WindowEffectsState): Promise<WindowEffectsDiagnostic> {
    const current = this.capabilities()
    if (!isTauri()) {
      this.status = { backend: 'SimulatedCss', nativeAvailable: false, active: true, dynamicBackdropVerified: false, reason: 'Aperçu CSS : les matériaux natifs exigent l’application de bureau.' }
      return this.status
    }
    if (current.platform === 'linux') {
      this.status = { backend: 'LinuxCompositor', nativeAvailable: false, active: true, dynamicBackdropVerified: false, reason: 'Repli CSS actif. Sous Linux, le flou externe dépend du compositeur et n’est pas déclaré comme vérifié.' }
      return this.status
    }
    try {
      if (current.platform === 'windows') {
        const effect = state.mode === 'intense' ? Effect.Acrylic : Effect.Mica
        await getCurrentWindow().setEffects({ effects: [effect], color: effect === Effect.Acrylic ? [13, 16, 16, 178] : undefined })
        this.status = { backend: 'WindowsNative', nativeAvailable: true, active: true, dynamicBackdropVerified: false, reason: `${effect === Effect.Mica ? 'Mica' : 'Acrylic'} demandé à Windows avec l’API native Tauri. La réaction au fond externe reste à confirmer par le test guidé.` }
      } else {
        await getCurrentWindow().setEffects({ effects: [Effect.HudWindow], state: EffectState.FollowsWindowActiveState, radius: 18 })
        this.status = { backend: 'MacOSNative', nativeAvailable: true, active: true, dynamicBackdropVerified: false, reason: 'Vibrancy macOS demandé avec l’API native Tauri. La réaction au fond externe reste à confirmer par le test guidé.' }
      }
    } catch (error) {
      this.status = { backend: 'SimulatedCss', nativeAvailable: current.nativeDynamicMaterial, active: true, dynamicBackdropVerified: false, reason: `Repli CSS après refus du matériau natif : ${error instanceof Error ? error.message : String(error)}` }
    }
    document.documentElement.dataset.windowMaterialBackend = this.status.backend
    return this.status
  }

  async update(state: WindowEffectsState) { return this.enable(state) }

  async apply(state: WindowEffectsState): Promise<WindowEffectsDiagnostic> {
    const active = applyCss(state)
    if (!active) return this.disable(state.energySaver ? 'Préférence conservée, effet suspendu par l’économiseur ZAILON.' : undefined)
    if (!state.settings.preferNative) {
      await this.disable('Matériau natif désactivé par préférence ; simulation CSS active.')
      this.status = { backend: 'SimulatedCss', nativeAvailable: this.capabilities().nativeDynamicMaterial, active: true, dynamicBackdropVerified: false, reason: 'Simulation CSS active à la demande de l’utilisateur.' }
      return this.status
    }
    return this.update(state)
  }
}

export const windowEffectsBackend: WindowMaterialBackend = new NativeWindowMaterialBackend()
