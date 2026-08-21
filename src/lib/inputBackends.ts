import type { Game, GameKeyboardLayout } from '../types'

/**
 * GameInputBackend — architecture des backends d'entrée (Phase 6).
 *
 * Un backend est une méthode d'application de la disposition clavier par jeu.
 * L'ordre de préférence (spec « UI compacte + remapping NTE », §9) :
 *   1. bindings natifs du jeu ;
 *   2. changement de layout reconnu par le jeu ;
 *   3. remapping temporaire ZAILON limité à la fenêtre du jeu ;
 *   4. Steam Input uniquement lorsque réellement compatible ;
 *   5. aucune méthode.
 *
 * Cette couche TypeScript est purement décisionnelle et en lecture seule :
 * l'application réelle (bindings, HKL, interception scancodes) est fournie par
 * les backends Rust de la Phase 6, à tester sur un vrai jeu.
 */

export type InputBackendId =
  | 'native-binding'
  | 'window-layout'
  | 'scoped-remap'
  | 'steam-input'
  | 'unsupported'

export type BackendScope = 'game-config' | 'windows-hkl' | 'window-only' | 'controller' | 'none'

export interface InputBackend {
  id: InputBackendId
  label: string
  shortLabel: string
  scope: BackendScope
  priority: number
  safeWithAntiCheat: boolean
  requiresInjection: boolean
  requiresDriver: boolean
  requiresProcessWrite: boolean
  touchesDesktop: boolean
  windowsLanguageChange: boolean
  note: string
}

export const INPUT_BACKENDS: Record<InputBackendId, InputBackend> = {
  'native-binding': {
    id: 'native-binding',
    label: 'Bindings natifs du jeu',
    shortLabel: 'Bindings natifs',
    scope: 'game-config',
    priority: 1,
    safeWithAntiCheat: false,
    requiresInjection: false,
    requiresDriver: false,
    requiresProcessWrite: false,
    touchesDesktop: false,
    windowsLanguageChange: false,
    note: 'Écrit la configuration d’entrée du jeu. À éviter sur les jeux protégés par Anti-Cheat sans confirmation.',
  },
  'window-layout': {
    id: 'window-layout',
    label: 'Layout reconnu par le jeu',
    shortLabel: 'Layout Windows',
    scope: 'windows-hkl',
    priority: 2,
    safeWithAntiCheat: true,
    requiresInjection: false,
    requiresDriver: false,
    requiresProcessWrite: false,
    touchesDesktop: true,
    windowsLanguageChange: true,
    note: 'Change temporairement le layout logique Windows. Inefficace pour les jeux qui lisent les touches physiques/scancodes (ex. NTE).',
  },
  'scoped-remap': {
    id: 'scoped-remap',
    label: 'Remapping ZAILON limité à la fenêtre',
    shortLabel: 'Remap fenêtre',
    scope: 'window-only',
    priority: 3,
    safeWithAntiCheat: true,
    requiresInjection: false,
    requiresDriver: false,
    requiresProcessWrite: false,
    touchesDesktop: false,
    windowsLanguageChange: false,
    note: 'Traduit les touches uniquement lorsque la fenêtre du jeu est au premier plan. Aucun hook dans le jeu, aucun fichier modifié, aucun driver.',
  },
  'steam-input': {
    id: 'steam-input',
    label: 'Steam Input',
    shortLabel: 'Steam Input',
    scope: 'controller',
    priority: 4,
    safeWithAntiCheat: true,
    requiresInjection: false,
    requiresDriver: false,
    requiresProcessWrite: false,
    touchesDesktop: false,
    windowsLanguageChange: false,
    note: 'Pensé pour les manettes, pas pour clavier/souris. Ne jamais modifier une configuration Steam Input existante sans confirmation.',
  },
  unsupported: {
    id: 'unsupported',
    label: 'Aucune méthode',
    shortLabel: 'Aucune',
    scope: 'none',
    priority: 5,
    safeWithAntiCheat: true,
    requiresInjection: false,
    requiresDriver: false,
    requiresProcessWrite: false,
    touchesDesktop: false,
    windowsLanguageChange: false,
    note: 'Aucune application automatique : la disposition reste un choix manuel dans le jeu.',
  },
}

export const BACKEND_PRIORITY: InputBackendId[] = ['native-binding', 'window-layout', 'scoped-remap', 'steam-input', 'unsupported']

export const isNte = (gameName: string) => gameName.toLocaleLowerCase().includes('neverness')

export function detectAntiCheat(gameName: string): { detected: boolean; name?: string } {
  if (isNte(gameName)) return { detected: true, name: 'Anti-Cheat Expert' }
  return { detected: false }
}

export interface InputBackendAvailability {
  backend: InputBackend
  available: boolean
  reason: string
}

export interface InputBackendPlan {
  chosen: InputBackendId
  chain: InputBackendAvailability[]
  antiCheat: { detected: boolean; name?: string }
  constraints: string[]
}

/**
 * Planifie la méthode d'application pour un jeu, en lecture seule.
 * Ne modifie rien : pure décision à partir du nom du jeu et de la configuration.
 */
export function planInputBackend(game: Game, layout: GameKeyboardLayout): InputBackendPlan {
  const antiCheat = detectAntiCheat(game.name)
  const constraints: string[] = []
  const nte = isNte(game.name)
  const hasMapping = (game.keyboardProfiles || []).some(profile => profile.enabled && profile.mapping.length > 0)

  if (antiCheat.detected) {
    constraints.push(`${antiCheat.name} détecté : aucun hook, injection, driver ni manipulation du processus.`)
  }
  if (nte) {
    constraints.push('Neverness to Everness : les retours joueurs montrent qu’un simple changement de layout logique ne suffit pas (touches physiques).')
    constraints.push('L’adaptateur NTE doit tester la méthode réellement fonctionnelle via la sonde de compatibilité (Phase 6 Rust) avant application.')
  }
  if (!hasMapping) {
    constraints.push('Aucune traduction active : la disposition s’applique telle quelle, sans remapping.')
  }

  const chain: InputBackendAvailability[] = BACKEND_PRIORITY.map(id => {
    const backend = INPUT_BACKENDS[id]
    let available = true
    let reason = backend.note

    if (id === 'native-binding') {
      if (nte) {
        available = false
        reason = 'Interdit pour NTE : la modification des fichiers du jeu est exclue avec Anti-Cheat Expert.'
      }
    } else if (id === 'window-layout') {
      if (nte) {
        available = false
        reason = 'Inefficace constaté pour NTE (touches physiques/scancodes) — la sonde la teste néanmoins avant de conclure.'
      }
    } else if (id === 'scoped-remap') {
      // Toujours disponible : externe au jeu, sûr avec Anti-Cheat.
    } else if (id === 'steam-input') {
      if (nte) {
        available = false
        reason = 'Non pertinent pour NTE en clavier/souris ; réservé aux manettes et uniquement si réellement compatible.'
      }
    }
    if (!hasMapping && id !== 'unsupported') {
      available = false
      reason = 'Aucune traduction active à appliquer.'
    }
    return { backend, available, reason }
  })

  const chosen: InputBackendId = chain.find(item => item.available)?.backend.id || 'unsupported'

  return { chosen, chain, antiCheat, constraints }
}

export interface InputDiagnosticRow {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'neutral'
}

/**
 * État visible (spec §15/§20) — diagnostic d'entrée par jeu.
 * Les détections de processus/fenêtre sont fournies par la Phase 6 Rust ;
 * tant qu'elles n'existent pas, la colonne est honnêtement « non surveillé ».
 */
export function inputDiagnosticRows(game: Game, layout: GameKeyboardLayout): InputDiagnosticRow[] {
  const plan = planInputBackend(game, layout)
  const nte = isNte(game.name)
  return [
    { label: 'Jeu', value: game.name },
    { label: 'Disposition souhaitée', value: layout.toUpperCase() },
    { label: 'Méthode', value: INPUT_BACKENDS[plan.chosen].label },
    { label: 'État', value: plan.chosen === 'scoped-remap' ? 'Actif uniquement dans le jeu' : plan.chosen === 'unsupported' ? 'Aucune application automatique' : 'Selon backend', tone: plan.chosen === 'unsupported' ? 'warn' : 'ok' },
    { label: 'ACE détecté', value: plan.antiCheat.detected ? (plan.antiCheat.name || 'oui') : 'non', tone: plan.antiCheat.detected ? 'warn' : 'ok' },
    { label: 'Injection', value: 'non' },
    { label: 'Driver', value: 'non' },
    { label: 'Langue Windows ajoutée', value: 'non' },
    { label: 'Processus / Fenêtre', value: nte ? 'Sonde Phase 6 Rust (non surveillé ici)' : '—', tone: 'neutral' },
  ]
}
