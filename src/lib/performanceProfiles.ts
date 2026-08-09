/**
 * Profils Performance par jeu (spec « Visual Profiles compact + Performance »
 * §5-10, §23-24, §37-40).
 *
 * Deux familles distinctes, jamais mélangées dans l'UI :
 * - **Performance ZAILON** : téléchargements, scans, animations, Quick Panel,
 *   priorité de ZAILON lui-même ;
 * - **Performance du jeu** : priorité du processus du jeu (le contrôle FPS
 *   natif arrive avec les backends dédiés, spec §18-31).
 *
 * Presets (spec §24) : Équilibré / Performance / Qualité (+ Automatique qui se
 * résout sur le presets Équilibré par défaut, adaptation batterie à venir).
 *
 * Résolution effective (spec §37-39) : quand plusieurs sessions tournent, une
 * politique restrictive gagne — si un jeu actif demande la pause des
 * téléchargements, la pause s'applique pour toutes les sessions.
 *
 * Logique pure et testable : aucun accès au store.
 */

export type PerformanceMode = 'auto' | 'balanced' | 'performance' | 'quality' | 'custom'

export type DownloadPolicy = 'normal' | 'limited' | 'paused'
export type ScanPolicy = 'normal' | 'reduced' | 'paused'
export type AnimationPolicy = 'normal' | 'reduced' | 'off'
export type QuickPanelPolicy = 'normal' | 'minimal'
export type ZailonPriorityPolicy = 'normal' | 'low'
export type GameProcessPriority = 'auto' | 'normal' | 'above-normal' | 'high'

export interface ZailonPerformancePolicies {
  downloads: DownloadPolicy
  scans: ScanPolicy
  animations: AnimationPolicy
  quickPanel: QuickPanelPolicy
  zailonPriority: ZailonPriorityPolicy
}

export interface GamePerformancePolicies {
  processPriority: GameProcessPriority
}

export interface PerformancePreset {
  id: PerformanceMode
  label: string
  description: string
  zailon: ZailonPerformancePolicies
  game: GamePerformancePolicies
}

/** Presets (spec §24). « auto » se résout sur Équilibré par défaut. */
export const PERFORMANCE_PRESETS: Record<Exclude<PerformanceMode, 'custom'>, PerformancePreset> = {
  auto: {
    id: 'auto',
    label: 'Automatique',
    description: 'ZAILON adapte son activité autour du jeu (batterie, charge, profil utilisateur). Recommandé.',
    zailon: { downloads: 'limited', scans: 'reduced', animations: 'reduced', quickPanel: 'normal', zailonPriority: 'normal' },
    game: { processPriority: 'auto' },
  },
  balanced: {
    id: 'balanced',
    label: 'Équilibré',
    description: 'Suspend les scans lourds, ralentit les téléchargements, réduit les animations — bonne expérience sans tout interrompre.',
    zailon: { downloads: 'limited', scans: 'reduced', animations: 'reduced', quickPanel: 'normal', zailonPriority: 'normal' },
    game: { processPriority: 'normal' },
  },
  performance: {
    id: 'performance',
    label: 'Performance',
    description: 'Pause téléchargements et scans, animations coupées, Quick Panel minimal, ZAILON en priorité basse — conserve uniquement l’essentiel runtime.',
    zailon: { downloads: 'paused', scans: 'paused', animations: 'off', quickPanel: 'minimal', zailonPriority: 'low' },
    game: { processPriority: 'auto' },
  },
  quality: {
    id: 'quality',
    label: 'Qualité',
    description: 'Privilégie la qualité d’affichage : ZAILON se met en pause mais ne touche pas aux réglages graphiques du jeu.',
    zailon: { downloads: 'paused', scans: 'paused', animations: 'normal', quickPanel: 'normal', zailonPriority: 'normal' },
    game: { processPriority: 'normal' },
  },
}

/** Valeurs par défaut du mode Personnalisé (départ : Équilibré, éditable). */
export const CUSTOM_PERFORMANCE_DEFAULTS: ZailonPerformancePolicies = {
  downloads: 'limited',
  scans: 'reduced',
  animations: 'reduced',
  quickPanel: 'normal',
  zailonPriority: 'normal',
}

export const GAME_PROCESS_PRIORITIES: GameProcessPriority[] = ['auto', 'normal', 'above-normal', 'high']

export const GAME_PROCESS_PRIORITY_LABELS: Record<GameProcessPriority, string> = {
  auto: 'Automatique',
  normal: 'Normale',
  'above-normal': 'Supérieure à la normale',
  high: 'Haute',
}

export const DOWNLOAD_POLICY_LABELS: Record<DownloadPolicy, string> = {
  normal: 'Normaux',
  limited: 'Limités',
  paused: 'En pause',
}

export const SCAN_POLICY_LABELS: Record<ScanPolicy, string> = {
  normal: 'Normaux',
  reduced: 'Réduits',
  paused: 'En pause',
}

export const ANIMATION_POLICY_LABELS: Record<AnimationPolicy, string> = {
  normal: 'Normales',
  reduced: 'Réduites',
  off: 'Désactivées',
}

export const QUICK_PANEL_POLICY_LABELS: Record<QuickPanelPolicy, string> = {
  normal: 'Normal',
  minimal: 'Minimal',
}

export const ZAILON_PRIORITY_LABELS: Record<ZailonPriorityPolicy, string> = {
  normal: 'Normale',
  low: 'Basse',
}

/** Priorité de chaque politique (rang croissant = plus restrictif). */
const DOWNLOAD_RANK: Record<DownloadPolicy, number> = { normal: 0, limited: 1, paused: 2 }
const SCAN_RANK: Record<ScanPolicy, number> = { normal: 0, reduced: 1, paused: 2 }
const ANIMATION_RANK: Record<AnimationPolicy, number> = { normal: 0, reduced: 1, off: 2 }
const QUICK_RANK: Record<QuickPanelPolicy, number> = { normal: 0, minimal: 1 }
const ZAILON_RANK: Record<ZailonPriorityPolicy, number> = { normal: 0, low: 1 }

export interface EffectivePerformance {
  downloads: DownloadPolicy
  scans: ScanPolicy
  animations: AnimationPolicy
  quickPanel: QuickPanelPolicy
  zailonPriority: ZailonPriorityPolicy
  /** Priorité du processus du JEU (spec §14-16) : celle de la session
   * prioritaire uniquement — jamais appliquée aveuglément à tous les jeux. */
  gameProcessPriority: GameProcessPriority
}

/** Politiques d'un jeu : preset (custom = valeurs personnalisées si fournies,
 * sinon défauts). */
export function policiesForMode(
  mode: PerformanceMode,
  custom?: Partial<ZailonPerformancePolicies>,
): ZailonPerformancePolicies {
  if (mode === 'custom') {
    return { ...CUSTOM_PERFORMANCE_DEFAULTS, ...custom }
  }
  return PERFORMANCE_PRESETS[mode].zailon
}

export function gameProcessPriorityForMode(mode: PerformanceMode): GameProcessPriority {
  if (mode === 'custom') return 'auto'
  return PERFORMANCE_PRESETS[mode].game.processPriority
}

function maxByRank<T extends string>(values: T[], rank: Record<T, number>): T {
  return values.reduce((best, value) => (rank[value] > rank[best] ? value : best))
}

export interface PerformanceSessionInput {
  gameId: string
  /** Session active (Running/Focused…). */ 
  state: string
}

/** Politiques effectives (spec §37-39) : une session active demande la pause →
 * pause globale ; la priorité du jeu suit la session prioritaire (première
 * active). Les sessions non actives sont ignorées. */
export function effectivePerformance(
  modes: Record<string, PerformanceMode | undefined>,
  customPolicies: Record<string, Partial<ZailonPerformancePolicies> | undefined>,
  sessions: PerformanceSessionInput[],
  priorityGameId?: string,
): EffectivePerformance {
  const active = sessions.filter(session => session.state !== 'Ended' && session.state !== 'Failed' && session.state !== 'GameLost')
  if (active.length === 0) {
    return {
      downloads: 'normal',
      scans: 'normal',
      animations: 'normal',
      quickPanel: 'normal',
      zailonPriority: 'normal',
      gameProcessPriority: 'auto',
    }
  }
  const policies = active.map(session => policiesForMode(modes[session.gameId] ?? 'auto', customPolicies[session.gameId]))
  const gamePolicies = active.map(session => gameProcessPriorityForMode(modes[session.gameId] ?? 'auto'))
  const target = active.find(session => session.gameId === priorityGameId) ?? active[0]
  return {
    downloads: maxByRank(policies.map(policy => policy.downloads), DOWNLOAD_RANK),
    scans: maxByRank(policies.map(policy => policy.scans), SCAN_RANK),
    animations: maxByRank(policies.map(policy => policy.animations), ANIMATION_RANK),
    quickPanel: maxByRank(policies.map(policy => policy.quickPanel), QUICK_RANK),
    zailonPriority: maxByRank(policies.map(policy => policy.zailonPriority), ZAILON_RANK),
    gameProcessPriority: gameProcessPriorityForMode(modes[target.gameId] ?? 'auto'),
  }
}

/** Les animations sont réduites/désactivées pendant le jeu (spec §14, §36) :
 * vrai si la politique effective est réduite ou coupée. */
export function animationsReducedDuringGame(animations: AnimationPolicy): boolean {
  return animations === 'reduced' || animations === 'off'
}
