export interface VisualShortcutConfig {
  enabled: boolean
  restore: string
  toggle: string
  previous: string
  next: string
}

export const DEFAULT_VISUAL_SHORTCUTS: VisualShortcutConfig = {
  enabled: true,
  restore: 'Ctrl+Alt+Backspace',
  toggle: 'Ctrl+Alt+F10',
  previous: 'Ctrl+Alt+F11',
  next: 'Ctrl+Alt+F12',
}

const STORAGE_KEY = 'zailon-visual-shortcuts'
export const VISUAL_SHORTCUTS_CHANGED = 'zailon-visual-shortcuts-changed'

export function getVisualShortcutConfig(): VisualShortcutConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<VisualShortcutConfig>
    return { ...DEFAULT_VISUAL_SHORTCUTS, ...saved }
  } catch {
    return { ...DEFAULT_VISUAL_SHORTCUTS }
  }
}

export function setVisualShortcutConfig(config: VisualShortcutConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  window.dispatchEvent(new CustomEvent(VISUAL_SHORTCUTS_CHANGED))
}
