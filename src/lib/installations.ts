import type { Game, GameInstallation, Profile } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Installations multiples par jeu (spec « Profils multi-installation » §6-16,
// §60-64) — fonctionnalité CORE générique, pas spécifique FiveM : un jeu garde
// UNE carte Bibliothèque, chaque profil pointe vers une installation physique.
// Toutes ces fonctions sont pures et testées (test-installations.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const PRINCIPAL_INSTALLATION_ID = 'principal'

/** Nom court d'un chemin (dernier segment), pour affichage compact. */
export function shortPathName(path?: string): string {
  if (!path) return ''
  const cleaned = path.replace(/[\\/]+$/, '')
  return cleaned.split(/[\\/]/).pop() || cleaned
}

/**
 * Idempotent : garantit l'installation « Principal » d'un jeu legacy
 * (execPath/installDirectory). Retourne la liste existante si déjà présente.
 * Utilisé par la migration v6 et par les actions qui créent un jeu avec un
 * exécutable — jamais deux installations « Principal » (spec §14).
 */
export function ensurePrincipalInstallation(game: Game): GameInstallation[] {
  const existing = Array.isArray(game.installations) ? game.installations : []
  if (existing.some(installation => installation.id === PRINCIPAL_INSTALLATION_ID)) return existing
  if (!game.execPath) return existing
  return [
    ...existing,
    {
      id: PRINCIPAL_INSTALLATION_ID,
      gameId: game.id,
      name: 'Principal',
      executablePath: game.execPath,
      rootPath: game.installDirectory,
      modsPath: game.modsPath,
      bypassPath: game.bypassPath,
      platform: game.platform,
      createdAt: Date.now(),
    },
  ]
}

export interface ResolvedInstallation {
  /** Installation résolue — absent pour un jeu legacy sans installations. */
  installation?: GameInstallation
  /** Exécutable à lancer (fallback : `game.execPath`). */
  executablePath?: string
  /** Racine du jeu passée à l'installation (fallback : installDirectory). */
  rootPath?: string
  modsPath?: string
  bypassPath?: string
  platform?: GameInstallation['platform']
}

/**
 * Résout l'installation d'un profil (spec §8-10) :
 * 1. `profile.installationId` trouvé dans `game.installations` ;
 * 2. sinon « Principal » / première installation ;
 * 3. sinon fallback legacy (`execPath`/`installDirectory`) — aucun jeu ne casse.
 */
export function resolveGameInstallation(game: Game, profile?: Pick<Profile, 'installationId'>): ResolvedInstallation {
  const installations = Array.isArray(game.installations) ? game.installations : []
  const installation = (profile?.installationId && installations.find(item => item.id === profile.installationId))
    || installations.find(item => item.id === PRINCIPAL_INSTALLATION_ID)
    || installations[0]
  return {
    installation,
    executablePath: installation?.executablePath || game.execPath,
    rootPath: installation?.rootPath || game.installDirectory,
    modsPath: installation?.modsPath || game.modsPath,
    bypassPath: installation?.bypassPath || game.bypassPath,
    platform: installation?.platform || game.platform,
  }
}

/** Nom lisible de l'installation pour les stats/sessions (spec §16, §64). */
export function installationDisplayName(game: Game, installationId?: string): string | undefined {
  if (!installationId) return undefined
  const installation = (Array.isArray(game.installations) ? game.installations : []).find(item => item.id === installationId)
  return installation?.name ?? installationId
}
