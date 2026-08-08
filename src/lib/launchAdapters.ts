import type { Game, GameLaunchAdapter } from '../types'

/**
 * Adaptateurs de lancement par jeu (système multi-étapes, Phase 6).
 *
 * Un adaptateur décrit comment un jeu démarre réellement : processus direct,
 * launcher enfant, launcher détaché (UAC / redirection), Steam, launcher
 * externe ou chaîne multi-étapes. ZAILON « possède » une GameSession, pas un PID :
 * la fermeture du processus initial ne termine donc plus la session pendant la
 * fenêtre de rattachement.
 */

export const DEFAULT_REATTACH_WINDOW_SECONDS = 60
export const DEFAULT_END_GRACE_SECONDS = 10

export const FALLBACK_ADAPTER: GameLaunchAdapter = {
  launchBehavior: 'DirectProcess',
  launcherExecutable: undefined,
  launcherExecutableCandidates: [],
  gameExecutableCandidates: [],
  reattachWindowSeconds: DEFAULT_REATTACH_WINDOW_SECONDS,
  endGraceSeconds: DEFAULT_END_GRACE_SECONDS,
  launchChainStages: ['Game'],
}

// NTE : la chaîne réelle peut passer par ntegloballauncher.exe (stage
// intermédiaire VALIDE, jamais le processus final) avant le vrai jeu sous
// Client\WindowsNoEditor\HT\Binaries\Win64\. Un launcher intermédiaire ne doit
// jamais déclencher « Chaîne incomplète » ni demander un attachement manuel.
const NTE_ADAPTER: GameLaunchAdapter = {
  launchBehavior: 'SteamLauncher',
  launcherExecutable: 'NTELauncher.exe',
  launcherExecutableCandidates: ['NTELauncher.exe', 'ntegloballauncher.exe'],
  gameExecutableCandidates: ['HT-Win64-Shipping.exe', 'NTE-Win64-Shipping.exe', 'NevernessToEverness.exe'],
  reattachWindowSeconds: 90,
  endGraceSeconds: 10,
  launchChainStages: ['Steam', 'NTELauncher', 'UAC', 'ElevatedLauncher', 'Game'],
  steamAppId: 4508340,
}

const CYBERPUNK_ADAPTER: GameLaunchAdapter = {
  launchBehavior: 'DirectProcess',
  launcherExecutable: undefined,
  gameExecutableCandidates: ['Cyberpunk2077.exe'],
  reattachWindowSeconds: 45,
  endGraceSeconds: 8,
  launchChainStages: ['Game'],
}

const FIVEM_ADAPTER: GameLaunchAdapter = {
  launchBehavior: 'ExternalLauncher',
  launcherExecutable: 'FiveM.exe',
  gameExecutableCandidates: ['FiveM_GTAProcess.exe', 'FiveM.exe'],
  reattachWindowSeconds: 120,
  endGraceSeconds: 10,
  launchChainStages: ['FiveM', 'CitizenFX', 'Game'],
}

export function defaultAdapterFor(name: string): GameLaunchAdapter {
  const lower = name.toLocaleLowerCase()
  if (lower.includes('neverness')) return NTE_ADAPTER
  if (lower.includes('cyberpunk')) return CYBERPUNK_ADAPTER
  if (lower.includes('fivem')) return FIVEM_ADAPTER
  return FALLBACK_ADAPTER
}

export function adapterFor(game: Game): GameLaunchAdapter {
  return game.launchAdapter || defaultAdapterFor(game.name)
}

/** Un adaptateur « avec launcher » : la sortie du premier PID ne doit pas
 * terminer immédiatement la session (fenêtre de rattachement). */
export function isLauncherBased(adapter: GameLaunchAdapter): boolean {
  return adapter.launchBehavior !== 'DirectProcess'
}

export const LAUNCH_BEHAVIOR_LABELS: Record<GameLaunchAdapter['launchBehavior'], string> = {
  DirectProcess: 'Processus direct',
  LauncherChild: 'Launcher enfant',
  LauncherDetached: 'Launcher détaché',
  SteamLauncher: 'Steam + launcher',
  ExternalLauncher: 'Launcher externe',
  MultiStage: 'Multi-étapes',
}

export const SESSION_STATE_LABELS: Record<string, string> = {
  Preparing: 'Préparation',
  LauncherStarted: 'Launcher ouvert',
  WaitingForElevation: 'Autorisation UAC',
  WaitingForGame: 'En attente du jeu',
  GameDetected: 'Jeu détecté',
  GameRunning: 'En cours',
  GameLost: 'Jeu perdu',
  Reattaching: 'Rattachement',
  Ending: 'Fermeture',
  Ended: 'Terminé',
  Failed: 'Échec',
}
