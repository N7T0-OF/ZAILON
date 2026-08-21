export interface VisualSettings {
  saturation: number
  vibrance: number
  brightness: number
  contrast: number
  gamma: number
  temperature: number
  red: number
  green: number
  blue: number
  shadows: number
  highlights: number
  sharpness: number
}

export interface VisualGameAssociation {
  gameId: string
  profileId?: string
  executable?: string
}

export interface VisualProfile {
  formatVersion: number
  id: string
  name: string
  description: string
  backendId: 'windows-gamma-ramp' | 'preview-only'
  monitorId?: string
  settings: VisualSettings
  hdrMode: string
  createdAt: number
  updatedAt: number
  gameAssociations: VisualGameAssociation[]
  favorite: boolean
  hotkey?: string
  safeFallbackProfileId?: string
}

export interface VisualDisplayTarget {
  id: string
  name: string
  deviceName: string
  width: number
  height: number
  primary: boolean
  hdrSupported?: boolean
  hdrEnabled?: boolean
  iccProfile?: string
  gammaRampSupported: boolean
  ddcCiStatus: string
  warnings: string[]
}

export interface VisualBackendCapabilities {
  id: string
  name: string
  platform: string
  available: boolean
  experimental: boolean
  supportsLivePreview: boolean
  supportsPerMonitor: boolean
  supportsHdr: boolean
  supportsAutomaticRestore: boolean
  supportedSettings: string[]
  limitations: string[]
}

export interface VisualBackendReport {
  activeBackendId: string
  displays: VisualDisplayTarget[]
  backends: VisualBackendCapabilities[]
  activeProfileId?: string
  activeMonitorId?: string
  emergencyStatePresent: boolean
  lastRestoration?: string
  diagnostics: string[]
}

export interface VisualApplyResult {
  applied: boolean
  backendId: string
  monitorId: string
  profileId: string
  confirmationRequired: boolean
  confirmationToken?: string
  confirmationSeconds: number
  appliedSettings: string[]
  previewOnlySettings: string[]
  diagnostics: string[]
}

export interface VisualRestoreResult {
  restored: number
  remaining: number
  diagnostics: string[]
}

export interface VisualSafetyReport {
  gameId: string
  backendId: string
  changesGameFiles: boolean
  injectsCode: boolean
  hooksGraphicsApi: boolean
  readsGameMemory: boolean
  writesGameMemory: boolean
  usesKernelDriver: boolean
  usesOverlay: boolean
  changesSystemDisplay: boolean
  changesMonitorHardware: boolean
  compatibleWithGamePolicy: boolean
  rustPolicy: boolean
  detectedComponents: string[]
  warnings: string[]
}

export interface VisualProfileHistoryItem {
  fileName: string
  updatedAt: number
}

export const NEUTRAL_SETTINGS: VisualSettings = {
  saturation: 1,
  vibrance: 0,
  brightness: 0,
  contrast: 1,
  gamma: 1,
  temperature: 6500,
  red: 1,
  green: 1,
  blue: 1,
  shadows: 0,
  highlights: 0,
  sharpness: 0,
}
