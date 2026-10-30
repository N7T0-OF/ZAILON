import type { Game } from '../types/index.ts'
import { adapterFor } from './launchAdapters.ts'
import type { GamePresenceRequest, GameWindowRequest, LearnedProcessSignature } from './native.ts'

/**
 * GamePresenceEngine — logique pure de détection de présence, testable.
 *
 * Philosophie (GameSessionV2) : ZAILON « possède » une session, pas un PID. Un
 * jeu configuré qui tourne hors ZAILON (Steam, launcher externe, redémarrage)
 * doit être rattaché automatiquement, sans bouton « Attacher » dans l'UI
 * standard. Steam n'est jamais la seule source de vérité, mais sa présence
 * (AppID actif dans le registre) déclenche la recherche du processus final au
 * lieu de terminer la session.
 */

/** Un jeu configuré doit-il être scanné comme candidat externe ?
 * - jamais s'il a déjà une session active (le watcher de session s'en charge) ;
 * - si l'utilisateur a activé « Attacher automatiquement si détecté » ;
 * - si Steam indique que son AppID tourne (preuve forte, indépendante de la
 *   préférence — Steam sait que le jeu est lancé, ZAILON doit le suivre). */
export function shouldScanExternalGame(
  game: Game,
  steamAppIds: number[],
  autoAttachGameIds: string[],
  activeGameIds: string[],
): boolean {
  if (!game.installDirectory) return false
  if (activeGameIds.includes(game.id)) return false
  if (autoAttachGameIds.includes(game.id)) return true
  const appId = adapterFor(game).steamAppId
  return appId !== undefined && steamAppIds.includes(appId)
}

/** Construit la requête de scan pour un jeu (session en attente ou externe).
 * `learned` : signatures apprises lors des lancements précédents (spec NTE §7 /
 * #36) — le nom appris donne un score fort, même si l'exécutable a changé. */
export function presenceRequestFor(game: Game, reattachContext: boolean, learned?: LearnedProcessSignature[], steamRunning = false): GamePresenceRequest {
  const adapter = adapterFor(game)
  return {
    gameId: game.id,
    installRoot: game.installDirectory,
    launcherExecutable: adapter.launcherExecutable,
    launcherExecutableCandidates: adapter.launcherExecutableCandidates ?? [],
    gameExecutableCandidates: adapter.gameExecutableCandidates,
    reattachContext,
    learnedSignatures: learned?.length ? learned : undefined,
    steamRunning,
    gamePathPatterns: adapter.relativePathPatterns ?? [],
  }
}

/** Construit la requête de watcher de fenêtres pour un jeu. Les motifs de
 * titre ne sont jamais devinés : ils viennent de l'adaptateur (appris lors des
 * tests réels). */
export function windowRequestFor(game: Game, reattachContext: boolean): GameWindowRequest {
  const adapter = adapterFor(game)
  return {
    gameId: game.id,
    installRoot: game.installDirectory,
    gameExecutableCandidates: adapter.gameExecutableCandidates,
    titlePatterns: adapter.windowTitlePatterns ?? [],
    reattachContext,
  }
}

/** Seuil de confiance au-dessus duquel le rattachement est automatique. */
export const AUTO_ATTACH_THRESHOLD = 80

/**
 * Seuil Steam-backé (spec UAC §5-6, §10) : quand Steam confirme que l'AppID du
 * jeu est « En cours », le rattachement devient plus permissif — le processus
 * final peut être élevé et refuser son chemin. nom(+25) + contexte(+20) +
 * Steam(+20) = 65 ≥ 60 suffit alors, et Steam + fenêtre visible confirme.
 */
export const STEAM_BACKED_ATTACH_THRESHOLD = 60
