import type { PerformanceMode } from './performanceProfiles'
import type { GameSession } from '../types'

/**
 * QuickPanelState — contenu contextuel du panneau rapide (spec Quick Panel
 * §16-18, §24-25, §64-69). Logique pure, testable : l'état Performance
 * effectif (mode + politiques de pause réelles) et la préparation des mods
 * (spec §69 : un jeu détecté après lancement externe n'a pas eu de préparation
 * de profil — le panneau doit le dire honnêtement, jamais un faux ✓).
 */

export interface QuickPanelPerformanceState {
  /** Mode du jeu : explicite par jeu, sinon le mode global (spec §24). */
  mode: PerformanceMode
  /** Politiques réelles dérivées des sessions (spec §24 : affichage simple,
   * pas d'exposition de tous les réglages). */
  downloadsPaused: boolean
  scansPaused: boolean
}

export function quickPanelPerformanceState(
  performanceModes: Record<string, PerformanceMode>,
  globalPerformanceMode: PerformanceMode,
  runtimeActivity: { downloads: string; scans: string },
  gameId: string,
): QuickPanelPerformanceState {
  return {
    mode: performanceModes[gameId] || globalPerformanceMode,
    downloadsPaused: runtimeActivity.downloads === 'paused',
    scansPaused: runtimeActivity.scans !== 'normal',
  }
}

/**
 * Spec §69 : les mods sont « préparés » seulement si la session a été lancée
 * PAR ZAILON avec le déploiement actif. Un jeu détecté après coup (Steam,
 * launcher externe, UAC) n'a pas eu la préparation de profil — le panneau
 * affiche « Mods ⚠ Non préparés » avec la bulle explicative.
 */
export function modsPreparedFor(session: Pick<GameSession, 'source' | 'deploymentActive'>): boolean {
  return session.source === 'zailon' && session.deploymentActive === true
}
