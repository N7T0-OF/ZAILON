/**
 * Assistant d'installation FiveM — logique pure (spec « Assistant FiveM » §1-3).
 *
 * Modélise :
 *   - les options de copie à la création d'un profil (config courante, mods,
 *     ReShade, plugins, paramètres graphiques) ;
 *   - l'état d'initialisation de l'environnement d'un profil FiveM
 *     (`ready` / `partial` / `missing`) — au premier lancement FiveM génère
 *     lui-même `mods`/`citizen`/`plugins`/`citizenfx.ini`, ZAILON ne crée
 *     jamais une structure FiveM de toutes pièces (spec « Premier lancement ») ;
 *   - le nom d'un profil « propre » (jamais en conflit avec l'existant).
 *
 * Aucun accès disque/processus : testable sous node --test.
 */

/** Options de copie proposées à la création d'un profil FiveM (spec §2). */
export interface FiveMCopyOptions {
  /** Copier la configuration courante (citizenfx.ini). */
  copyConfig: boolean
  /** Copier les mods. */
  copyMods: boolean
  /** Copier ReShade (presets/shaders). */
  copyReshade: boolean
  /** Copier les plugins. */
  copyPlugins: boolean
  /** Copier les paramètres graphiques. */
  copyGraphics: boolean
}

export const DEFAULT_FIVE_M_COPY_OPTIONS: FiveMCopyOptions = {
  copyConfig: true,
  copyMods: false,
  copyReshade: false,
  copyPlugins: false,
  copyGraphics: false,
}

/** Vrai si l'option demande une copie (profil non neutre). */
export function fiveMCopyActive(options: FiveMCopyOptions): boolean {
  return options.copyConfig || options.copyMods || options.copyReshade || options.copyPlugins || options.copyGraphics
}

/** État d'initialisation de l'environnement d'un profil FiveM. */
export type FiveMProfileInitState = 'ready' | 'partial' | 'missing'

/** Dossiers observés de l'environnement FiveM (détection disque). */
export interface FiveMFoldersState {
  mods: boolean
  citizen: boolean
  plugins: boolean
  hasCitizenFxIni: boolean
}

/**
 * Déduit l'état d'initialisation (spec « Premier lancement d'un profil ») :
 * FiveM crée lui-même sa structure — ZAILON se contente de la détecter.
 * `ready` = dossiers + ini présents ; `partial` = certains éléments ; `missing`
 * = aucun (premier lancement requis).
 */
export function fiveMProfileInitState(folders: FiveMFoldersState): FiveMProfileInitState {
  const present = [folders.mods, folders.citizen, folders.plugins, folders.hasCitizenFxIni].filter(Boolean).length
  if (present === 4) return 'ready'
  if (present === 0) return 'missing'
  return 'partial'
}

/** Libellé humain de l'état d'initialisation (pour l'UI de l'assistant). */
export function fiveMInitLabel(state: FiveMProfileInitState): string {
  switch (state) {
    case 'ready':
      return 'Environnement initialisé'
    case 'partial':
      return 'Initialisation partielle'
    case 'missing':
      return 'Premier lancement requis'
  }
}

/** Détaille les éléments manquants (feedback de l'assistant). */
export function fiveMMissingItems(folders: FiveMFoldersState): string[] {
  const missing: string[] = []
  if (!folders.mods) missing.push('mods/')
  if (!folders.citizen) missing.push('citizen/')
  if (!folders.plugins) missing.push('plugins/')
  if (!folders.hasCitizenFxIni) missing.push('citizenfx.ini')
  return missing
}

/** Nom d'un profil « propre » : « FiveM — Clean » puis « Clean (2) », etc. */
export function nextCleanFiveMProfileName(existingNames: string[]): string {
  const base = 'FiveM — Clean'
  const lower = new Set(existingNames.map(name => name.toLocaleLowerCase()))
  if (!lower.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  while (lower.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1
  return `${base} (${suffix})`
}
