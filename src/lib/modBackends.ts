/**
 * Backends de modding derrière la même interface (spec Frosty §59-60).
 *
 * Le même UX (profils, Installer, Désinstaller, activer, partager, Jouer) mais
 * ZAILON choisit le moteur de modding approprié au jeu :
 *
 *   Cyberpunk2077.exe → CyberpunkVirtualBackend (VFS MO2-like, RED4ext/r6)
 *   NFS16.exe         → FrostyBackend (.fbmod, resource patch pipeline)
 *   NTE (bootstrap)   → NTEPakBackend (.pak/.utoc)
 *   autre             → GenericFolderBackend (dossier de mods simple)
 */
import { findFrostyAdapter, frostyAdapterForExecutable, frostyPlatformStrategy, frostyVersionCompatibilityAlert } from './frosty.ts'

export type ModBackendId = 'cyberpunk-vfs' | 'frosty' | 'nte-pak' | 'generic-folder'

export interface ModBackendDescriptor {
  id: ModBackendId
  label: string
  detail: string
  /** Types de packages reconnus par ce backend (badge, import). */
  packageExtensions: string[]
  /** Le backend nécessite-t-il un runtime/loader externe géré par profil ? */
  managedRuntime: boolean
  /** Ce backend ne doit JAMAIS être initialisé au démarrage global. */
  lazyOnly: boolean
}

export const MOD_BACKENDS: Record<ModBackendId, ModBackendDescriptor> = {
  'cyberpunk-vfs': {
    id: 'cyberpunk-vfs',
    label: 'Cyberpunk VirtualFS',
    detail: 'VFS MO2-like : mods hors dossier jeu, exposés virtuellement au runtime (RED4ext, r6, archive).',
    packageExtensions: ['zip', 'rar', '7z', 'archive'],
    managedRuntime: true,
    lazyOnly: false,
  },
  frosty: {
    id: 'frosty',
    label: 'Frosty',
    detail: 'Pipeline de patch de ressources Frostbite : .fbmod, runtime par jeu/profil (jamais « latest »).',
    packageExtensions: ['fbmod'],
    managedRuntime: true,
    lazyOnly: true,
  },
  'nte-pak': {
    id: 'nte-pak',
    label: 'NTE PAK',
    detail: 'Packages .pak/.utoc (Neverness to Everness) — backend distinct du VFS Cyberpunk.',
    packageExtensions: ['pak', 'utoc', 'ucas'],
    managedRuntime: false,
    lazyOnly: false,
  },
  'generic-folder': {
    id: 'generic-folder',
    label: 'Dossier générique',
    detail: 'Backend par défaut : dossier de mods simple, sans runtime géré.',
    packageExtensions: [],
    managedRuntime: false,
    lazyOnly: false,
  },
}

/** Détection automatique par exécutable/config (§60). Ordre : spécifique → générique. */
export function detectModBackend(input: {
  execPath?: string
  gameName?: string
  steamAppId?: number
  /**
   * Vrai si le backend NTE PAK est autorisé — doit être branché sur l'add-on
   * NTE Support (capacité `nte.modloader`, feature removal §57). Par défaut
   * `true` pour préserver le comportement de la lib pure ; les appels UI
   * passent explicitement la gate. Sans autorisation, un jeu NTE retombe sur
   * `generic-folder`.
   */
  nteAllowed?: boolean
}): ModBackendId {
  const executable = (input.execPath || '').toLocaleLowerCase().split(/[\\/]/).pop() || ''
  if (executable.includes('cyberpunk2077') || (input.gameName || '').toLocaleLowerCase().includes('cyberpunk')) {
    return 'cyberpunk-vfs'
  }
  if (findFrostyAdapter('nfs-2015') && (executable === 'nfs16.exe' || (input.gameName || '').toLocaleLowerCase().includes('need for speed'))) {
    return 'frosty'
  }
  const nteMarkers = ['nte', 'neverness', 'neverness-to-everness', 'ntegloballauncher']
  if ((input.nteAllowed ?? true) && nteMarkers.some(marker => executable.includes(marker) || (input.gameName || '').toLocaleLowerCase().includes(marker))) {
    return 'nte-pak'
  }
  return 'generic-folder'
}

export function backendDescriptor(id: ModBackendId): ModBackendDescriptor {
  return MOD_BACKENDS[id]
}

/** Badge UI compact pour la liste de mods (§61 : « FROSTY » discret si utile). */
export function backendBadge(id: ModBackendId): string {
  return id === 'frosty' ? 'FROSTY' : id === 'nte-pak' ? 'PAK' : ''
}

export interface FrostyBackendStatus {
  adapterFound: boolean
  supportLevel?: string
  preferredRuntime?: string
  blockedRuntimes: string[]
  versionAlert?: string
  strategyLabel?: string
  pluginConflict: boolean
}

/** État Frosty compact pour Configuration (spec §62-63) — jamais initialisé au boot.
 * L'adaptateur est résolu par id de registre OU par exécutable (jeux ajoutés par
 * l'utilisateur avec un id UUID, NFS16.exe). */
export function frostyBackendStatus(input: {
  gameId: string
  execPath?: string
  platform: 'ea-app' | 'steam' | 'epic' | 'unknown'
  actualRuntime?: string
  datapathFix: boolean
  launchPlatformPlugin: boolean
}): FrostyBackendStatus {
  const adapter = findFrostyAdapter(input.gameId) || frostyAdapterForExecutable(input.execPath)
  if (!adapter) return { adapterFound: false, blockedRuntimes: [], pluginConflict: false }
  const platform = frostyPlatformStrategy(input.platform, adapter, {
    datapathFix: input.datapathFix,
    launchPlatformPlugin: input.launchPlatformPlugin,
  })
  return {
    adapterFound: true,
    supportLevel: adapter.testedStatus,
    preferredRuntime: adapter.runtime.preferred,
    blockedRuntimes: adapter.runtime.blocked || [],
    versionAlert: frostyVersionCompatibilityAlert(adapter, input.actualRuntime),
    strategyLabel: platform.strategy,
    pluginConflict: platform.pluginConflict,
  }
}
