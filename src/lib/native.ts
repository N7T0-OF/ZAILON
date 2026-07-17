import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export interface NativeMod {
  id: string
  name: string
  path: string
  enabled: boolean
  modType: string
  sizeBytes: number
}

export interface DetectedGame {
  name: string
  execPath: string
  modsPath: string
  platform: 'steam' | 'epic' | 'gog' | 'standalone'
}

const desktopOnly = <T>(command: string, args?: Record<string, unknown>) => {
  if (!isTauri()) {
    return Promise.reject(new Error(`${command} is only available in the ZAILON desktop app.`)) as Promise<T>
  }
  return invoke<T>(command, args)
}

export const native = {
  isDesktop: () => isTauri(),
  scanMods: (modsPath: string) => desktopOnly<NativeMod[]>('scan_mods', { modsPath }),
  toggleMod: (modPath: string, enable: boolean) => desktopOnly<string>('toggle_mod', { modPath, enable }),
  deleteMod: (modPath: string) => desktopOnly<void>('delete_mod', { modPath }),
  launchGame: (execPath: string) => desktopOnly<void>('launch_game', { execPath }),
  guessModsPath: (execPath: string) => desktopOnly<string>('guess_mods_path', { execPath }),
  detectGames: () => desktopOnly<DetectedGame[]>('detect_games'),
  installMod: (url: string, fileName: string, modsPath: string) =>
    desktopOnly<string>('install_mod', { url, fileName, modsPath }),
}

export async function pickExecutable() {
  if (!isTauri()) return null
  const selected = await open({
    title: 'Select a game executable',
    multiple: false,
    filters: [{ name: 'Executables', extensions: ['exe', 'app'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function pickFolder() {
  if (!isTauri()) return null
  const selected = await open({ title: 'Select the mods folder', directory: true, multiple: false })
  return typeof selected === 'string' ? selected : null
}
