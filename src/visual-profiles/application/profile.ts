import type { VisualProfile, VisualSettings } from '../domain/types'
import { NEUTRAL_SETTINGS } from '../domain/types'

export const createVisualProfile = (
  name = 'Nouveau profil',
  settings: VisualSettings = NEUTRAL_SETTINGS,
  monitorId?: string,
): VisualProfile => {
  const now = Math.floor(Date.now() / 1000)
  return {
    formatVersion: 1,
    id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: 'Profil visuel local ZAILON.',
    backendId: 'windows-gamma-ramp',
    monitorId,
    settings: { ...settings },
    hdrMode: 'system',
    createdAt: now,
    updatedAt: now,
    gameAssociations: [],
    favorite: false,
  }
}

export function validateVisualSettings(settings: VisualSettings) {
  const ranges: Record<keyof VisualSettings, [number, number]> = {
    saturation: [0, 2],
    vibrance: [-1, 1],
    brightness: [-0.5, 0.5],
    contrast: [0.5, 1.5],
    gamma: [0.5, 2.5],
    temperature: [2500, 10000],
    red: [0.5, 1.5],
    green: [0.5, 1.5],
    blue: [0.5, 1.5],
    shadows: [-1, 1],
    highlights: [-1, 1],
    sharpness: [0, 1],
  }
  return (Object.keys(ranges) as Array<keyof VisualSettings>).every(key => {
    const value = settings[key]
    const [min, max] = ranges[key]
    return Number.isFinite(value) && value >= min && value <= max
  })
}
