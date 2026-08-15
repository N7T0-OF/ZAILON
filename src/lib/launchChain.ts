/**
 * Moteur de chaîne de lancement — logique pure (spec « Fix Frosty — suivi de
 * chaîne » ⭐ Amélioration importante).
 *
 * Le principe est UNIVERSEL, pas seulement Frosty : pour toute chaîne
 * ZAILON → launcher → (plugins) → processus final, ZAILON « possède » une
 * session, pas un PID. La fermeture du launcher ne termine JAMAIS la session ;
 * seul le processus final réellement associé au jeu la termine.
 *
 * Chaînes couvertes : Frosty (FrostyModManager → plugin → NFS16.exe), NTE
 * (launcher → UAC → NTE.exe), FiveM (FiveM → CitizenFX → GTA5.exe), Steam
 * (Steam → launcher → jeu), processus direct (Cyberpunk).
 */

import type { GameLaunchAdapter } from '../types'
import { isLauncherBased } from './launchAdapters.ts'

export type LauncherExitOutcome = 'end' | 'wait-for-game' | 'wait-for-elevation'

/**
 * Le launcher vient de sortir. Décision :
 * - processus direct → la session se termine (le processus ÉTAIT le jeu) ;
 * - launcher avec UAC dans la chaîne → on attend l'élévation, puis le jeu ;
 * - autre launcher → on attend le processus final (fenêtre de rattachement).
 */
export function chainAfterLauncherExit(adapter: GameLaunchAdapter): LauncherExitOutcome {
  if (!isLauncherBased(adapter)) return 'end'
  return adapter.launchChainStages.includes('UAC') ? 'wait-for-elevation' : 'wait-for-game'
}

/** Le launcher a-t-il une chaîne de rattachement (UAC attendu) ? */
export function chainExpectsElevation(adapter: GameLaunchAdapter): boolean {
  return adapter.launchChainStages.includes('UAC')
}

/**
 * Le processus final détecté confirme la session : « En cours ». Un launcher
 * resté ouvert ne compte pas — seul le processus final compte (spec §4).
 */
export function chainAcceptsDetectedGame(adapter: GameLaunchAdapter, processName: string): boolean {
  if (processName) return true
  // Aucun nom de processus (cas extrême) : seulement si une preuve forte
  // existe déjà côté session — on refuse un rattachement sans identité.
  return false
}

/** Une session directe (sans launcher) se termine quand SON processus sort. */
export function chainIsDirect(adapter: GameLaunchAdapter): boolean {
  return adapter.launchBehavior === 'DirectProcess'
}
