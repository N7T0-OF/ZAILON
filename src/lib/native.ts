import { Channel, convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { UpdateChannel } from '../types'
import type { ModImportCandidate, ProfileArchiveManifest } from '../types'

export interface NativeMod {
  id: string
  name: string
  path: string
  enabled: boolean
  modType: string
  sizeBytes: number
  files: string[]
  fingerprint: string
  framework: string
  manifests: string[]
  sourceUrl?: string
  version?: string
}

export interface DetectedGame {
  name: string
  execPath: string
  modsPath: string
  platform: 'steam' | 'epic' | 'gog' | 'standalone'
  provider: string
  providerGameId?: string
  installDirectory: string
  steamLibrary?: string
  executableCandidates: DetectedExecutable[]
  sizeBytes?: number
  lastUpdated?: number
  buildId?: string
  needsExecutable: boolean
  itemKind: 'game' | 'software'
  confidence: 'high' | 'medium' | 'low'
  version?: string
  publisher?: string
  detectionSource: string
}

export interface DiscoveryProviderDiagnostic {
  provider: string
  status: 'ok' | 'warning' | 'unavailable'
  found: number
  detail: string
}

export interface DiscoveryScan {
  games: DetectedGame[]
  diagnostics: DiscoveryProviderDiagnostic[]
}

export type DiscoveryScanEvent =
  | { event: 'Stage'; data: { provider: string; detail: string } }
  | { event: 'Progress'; data: { current: number; total: number } }

export interface DetectedExecutable {
  path: string
  name: string
  sizeBytes: number
}

export interface SteamScanDiagnostics {
  steamPath: string
  libraries: string[]
  manifestsFound: number
  manifestErrors: number
  skippedNonGames: number
}

export interface SteamScan {
  games: DetectedGame[]
  diagnostics: SteamScanDiagnostics
}

export type SteamScanEvent =
  | { event: 'Stage'; data: { stage: string; detail: string } }
  | { event: 'Progress'; data: { current: number; total: number } }

export type GameResourceKind = 'cover' | 'logo' | 'icon' | 'background' | 'banner' | 'video'

export interface UpdateMetadata {
  version: string
  currentVersion: string
  date?: string
  notes?: string
}

export interface ProfileImportPreview {
  manifest: ProfileArchiveManifest
  archivePath: string
  embeddedFiles: number
  missingModNames: string[]
  warnings: string[]
}

export interface NxmRequest {
  rawUrl: string
  gameDomain: string
  modId: number
  fileId: number
  key?: string
  expires?: number
  userId?: number
}

export type UpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

const desktopOnly = <T>(command: string, args?: Record<string, unknown>) => {
  if (!isTauri()) {
    return Promise.reject(new Error(`${command} is only available in the ZAILON desktop app.`)) as Promise<T>
  }
  return invoke<T>(command, args)
}

export const native = {
  isDesktop: () => isTauri(),
  scanMods: (modsPath: string) => desktopOnly<NativeMod[]>('scan_mods', { modsPath }),
  scanModImport: (paths: string[], gameName: string) => desktopOnly<ModImportCandidate[]>('scan_mod_import', { paths, gameName }),
  toggleMod: (modPath: string, modsRoot: string, enable: boolean) => desktopOnly<string>('toggle_mod', { modPath, modsRoot, enable }),
  deleteMod: (modPath: string, modsRoot: string) => desktopOnly<void>('delete_mod', { modPath, modsRoot }),
  launchGame: (execPath: string) => desktopOnly<void>('launch_game', { execPath }),
  guessModsPath: (execPath: string) => desktopOnly<string>('guess_mods_path', { execPath }),
  scanSteamGames: (steamPath: string | undefined, onEvent: (event: SteamScanEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Steam detection is only available in the ZAILON desktop app.'))
    const channel = new Channel<SteamScanEvent>()
    channel.onmessage = onEvent
    return invoke<SteamScan>('scan_steam_games', { steamPath, onEvent: channel })
  },
  scanLibrary: (mode: 'quick' | 'full', onEvent: (event: DiscoveryScanEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('La détection locale est uniquement disponible dans l’application ZAILON.'))
    const channel = new Channel<DiscoveryScanEvent>()
    channel.onmessage = onEvent
    return invoke<DiscoveryScan>('scan_library', { mode, onEvent: channel })
  },
  installMod: (url: string, fileName: string, modsPath: string) =>
    desktopOnly<string>('install_mod', { url, fileName, modsPath }),
  exportProfile: (destination: string, manifest: ProfileArchiveManifest, complete: boolean, sources: Array<{ id: string; name: string; path: string }>) =>
    desktopOnly<string>('export_profile', { destination, manifest, complete, sources }),
  previewProfileImport: (archivePath: string) =>
    desktopOnly<ProfileImportPreview>('preview_profile_import', { archivePath }),
  extractProfileArchive: (archivePath: string, destination: string) =>
    desktopOnly<string[]>('extract_profile_archive', { archivePath, destination }),
  importModCandidates: (paths: string[], destination: string) =>
    desktopOnly<string[]>('import_mod_candidates', { paths, destination }),
  setProviderSecret: (provider: 'nexus' | 'curseforge', secret: string) =>
    desktopOnly<void>('set_provider_secret', { provider, secret }),
  deleteProviderSecret: (provider: 'nexus' | 'curseforge') =>
    desktopOnly<void>('delete_provider_secret', { provider }),
  providerSecretStatus: () => desktopOnly<Record<string, boolean>>('provider_secret_status'),
  setNxmAssociation: (enabled: boolean) => desktopOnly<boolean>('set_nxm_association', { enabled }),
  nxmAssociationStatus: () => desktopOnly<boolean>('nxm_association_status'),
  pendingExternalInstalls: () => desktopOnly<NxmRequest[]>('pending_external_installs'),
  consumeExternalInstall: (rawUrl: string) => desktopOnly<void>('consume_external_install', { rawUrl }),
  storeGameResource: (gameId: string, kind: GameResourceKind, sourcePath: string) =>
    desktopOnly<string>('store_game_resource', { gameId, kind, sourcePath }),
  removeGameResource: (gameId: string, resourcePath: string) =>
    desktopOnly<void>('remove_game_resource', { gameId, resourcePath }),
  openPath: (path: string) => desktopOnly<void>('open_path', { path }),
  openExternalUrl: (url: string) => desktopOnly<void>('open_external_url', { url }),
  prepareUpdateBackup: (snapshot: string, currentVersion: string, targetVersion: string) =>
    desktopOnly<string>('prepare_update_backup', { snapshot, currentVersion, targetVersion }),
  recordUpdateEvent: (event: string, version: string, message?: string) =>
    desktopOnly<void>('record_update_event', { event, version, message }),
  openUpdateLog: () => desktopOnly<void>('open_update_log'),
  checkForUpdate: (channel: UpdateChannel) =>
    desktopOnly<UpdateMetadata | null>('check_for_update', { channel }),
  installUpdate: (onEvent: (event: UpdateDownloadEvent) => void) => {
    if (!isTauri()) return Promise.reject(new Error('Updates are only available in the ZAILON desktop app.'))
    const channel = new Channel<UpdateDownloadEvent>()
    channel.onmessage = onEvent
    return invoke<void>('install_update', { onEvent: channel })
  },
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

export async function pickFolder(title = 'Select the mods folder') {
  if (!isTauri()) return null
  const selected = await open({ title, directory: true, multiple: false })
  return typeof selected === 'string' ? selected : null
}

export async function pickFolders(title = 'Sélectionnez les dossiers de mods à importer') {
  if (!isTauri()) return []
  const selected = await open({ title, directory: true, multiple: true })
  return Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : []
}

export async function pickProfileArchive() {
  if (!isTauri()) return null
  const selected = await open({
    title: 'Importer un profil ZAILON',
    multiple: false,
    filters: [{ name: 'Profil ZAILON', extensions: ['zailon-profile'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function saveProfileArchive(defaultName: string) {
  if (!isTauri()) return null
  const selected = await save({
    title: 'Exporter le profil ZAILON',
    defaultPath: `${defaultName.replace(/[^a-z0-9_-]+/gi, '-')}.zailon-profile`,
    filters: [{ name: 'Profil ZAILON', extensions: ['zailon-profile'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function pickGameResource(kind: GameResourceKind) {
  if (!isTauri()) return null
  const isVideo = kind === 'video'
  const selected = await open({
    title: `Sélectionnez ${kind === 'background' ? 'un arrière-plan' : `une ressource ${kind}`}`,
    multiple: false,
    filters: [{ name: isVideo ? 'Vidéos' : 'Images', extensions: isVideo ? ['mp4', 'webm'] : ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export const resourceUrl = (path?: string) => path && (isTauri() ? convertFileSrc(path) : path)
