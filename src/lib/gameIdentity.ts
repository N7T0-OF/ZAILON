/**
 * Game Identity Resolver (spec « Configuration par jeu » §2-4).
 *
 * Une identité de jeu stable ne se déduit JAMAIS du seul nom de l'exécutable
 * (`launcher.exe` peut désigner n'importe quoi). Elle combine, par ordre de
 * confiance décroissante :
 *
 *   1. fournisseur + AppID (ex. `steam:1091500`, `epic:<id>`, `ea:<id>`) ;
 *   2. exécutable + chemin d'installation normalisé ;
 *   3. éditeur + nom ;
 *   4. nom seul (dernier recours, faible confiance).
 *
 * Logique pure et testable — aucun accès disque/processus.
 */

import type { Game } from '../types'

export interface GameIdentityInput {
  name?: string
  execPath?: string
  installDirectory?: string
  provider?: string
  providerGameId?: string
  publisher?: string
  version?: string
}

export type GameIdentityKind = 'game' | 'software' | 'launcher' | 'unknown'
export type GameIdentityConfidence = 'high' | 'medium' | 'low'

export interface GameIdentity {
  /** Clé d'identité stable, normalisée (comparaison insensible à la casse). */
  key: string
  kind: GameIdentityKind
  confidence: GameIdentityConfidence
  /** Signaux réellement utilisés pour construire la clé. */
  signals: string[]
}

/** Normalise une chaîne : minuscules, espaces/ponctuation réduits. */
function norm(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function executableBasename(execPath?: string): string | undefined {
  const base = (execPath || '').split(/[\\/]/).pop()
  return base && base.trim() ? norm(base) : undefined
}

function normalizedInstallDir(installDirectory?: string): string | undefined {
  return installDirectory && installDirectory.trim() ? norm(installDirectory) : undefined
}

/** Nom du fournisseur normalisé (steam/epic/ea/gog/rockstar/standalone). */
function providerKey(provider?: string): string | undefined {
  return provider && provider.trim() ? norm(provider) : undefined
}

/** Vrai si le nom d'exécutable ressemble à un launcher plutôt qu'à un jeu. */
function looksLikeLauncher(exec?: string, name?: string): boolean {
  const haystack = norm(`${exec || ''} ${name || ''}`)
  return /launcher(-|$)|(^|-)startup(-|$)|steam|epicgames|ea-app|ubisoft|rockstar|blizzard|battle-net|gog-galaxy/.test(haystack)
}

/**
 * Résout l'identité stable d'un jeu/application à partir de plusieurs signaux.
 * La confiance reflète la solidité des signaux disponibles.
 */
export function resolveGameIdentity(input: GameIdentityInput): GameIdentity {
  const provider = providerKey(input.provider)
  const appId = input.providerGameId && input.providerGameId.trim() ? input.providerGameId.trim() : undefined
  const exec = executableBasename(input.execPath)
  const installDir = normalizedInstallDir(input.installDirectory)
  const publisher = input.publisher && input.publisher.trim() ? norm(input.publisher) : undefined
  const name = input.name && input.name.trim() ? norm(input.name) : undefined

  if (provider && appId) {
    return { key: `${provider}:${appId}`, kind: 'game', confidence: 'high', signals: ['provider', 'providerGameId'] }
  }
  if (exec && installDir) {
    const kind: GameIdentityKind = looksLikeLauncher(input.execPath, input.name) ? 'launcher' : 'game'
    return { key: `${exec}@${installDir}`, kind, confidence: 'medium', signals: ['execPath', 'installDirectory'] }
  }
  if (publisher && name) {
    return { key: `${publisher}:${name}`, kind: 'unknown', confidence: 'medium', signals: ['publisher', 'name'] }
  }
  if (exec) {
    return { key: `exec:${exec}`, kind: looksLikeLauncher(input.execPath, input.name) ? 'launcher' : 'unknown', confidence: 'low', signals: ['execPath'] }
  }
  if (name) {
    return { key: `name:${name}`, kind: 'unknown', confidence: 'low', signals: ['name'] }
  }
  return { key: 'unknown', kind: 'unknown', confidence: 'low', signals: [] }
}

/**
 * Vrai si deux entrées désignent le même jeu (clé identique, ou mêmes
 * exécutable + chemin d'installation — jamais le seul nom).
 */
export function sameGameIdentity(a: GameIdentityInput, b: GameIdentityInput): boolean {
  const left = resolveGameIdentity(a)
  const right = resolveGameIdentity(b)
  if (left.key === right.key) return true
  const leftExec = executableBasename(a.execPath)
  const rightExec = executableBasename(b.execPath)
  const leftDir = normalizedInstallDir(a.installDirectory)
  const rightDir = normalizedInstallDir(b.installDirectory)
  if (leftExec && leftExec === rightExec && leftDir && leftDir === rightDir) return true
  return false
}

// ---------------------------------------------------------------------------
// Renommage d'affichage (spec « Renommer un jeu ») — cosmétique uniquement.
//
// `displayName` ne remplace JAMAIS l'identité technique (`id`) ni les signaux
// de détection ci-dessus. Renommer un jeu ne casse donc jamais la détection,
// les mods, profils, add-ons, statistiques, temps de jeu, raccourcis ou
// associations Steam/Epic.
// ---------------------------------------------------------------------------

export type GameNameFields = Pick<Game, 'name' | 'displayName' | 'shortName'>

/** Nom complet d'un jeu : displayName (choix utilisateur) sinon le nom détecté. */
export function resolveGameName(game: GameNameFields): string {
  return normalizeDisplayName(game.displayName) || game.name
}

/** Nom court pour les gros titres (Hero) : displayName > shortName > name. */
export function resolveGameTitle(game: GameNameFields): string {
  return normalizeDisplayName(game.displayName) || game.shortName || game.name
}

/** Nettoie un nom saisi : trim + espaces multiples réduits. Vide → '' (reset). */
export function normalizeDisplayName(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

/** Vrai si un nom saisi diffère réellement du nom détecté (dirty state). */
export function isRenamed(game: GameNameFields): boolean {
  return Boolean(normalizeDisplayName(game.displayName) && normalizeDisplayName(game.displayName) !== game.name)
}
