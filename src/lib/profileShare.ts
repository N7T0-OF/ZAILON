import type { ProfileArchiveManifest } from '../types'
import type { Game, Mod, Profile } from '../types'
import type { ProfileArchiveManifest as Manifest } from '../types'

export type ProfileShareMode = 'light' | 'complete'

/**
 * Statistiques de partage (spec §56-57) : reproductibilité, sources, mods locaux.
 */
export interface ProfileShareStats {
  totalMods: number
  frameworkCount: number
  withSource: number
  localWithoutSource: number
  localIncluded: number
  estimatedBytes: number
  reproducibility: number
}

const PATH_FIELDS: Array<keyof Profile> = [
  'directory',
  'manifestPath',
  'loadOrderPath',
  'settingsPath',
  'overwritePath',
  'generatedPath',
  'deploymentPath',
]

/** Chemins absolus machine jamais partagés (§45-46) — remplacés par des jetons portables. */
const PORTABLE_PATH_TOKENS: Record<string, string> = {
  directory: 'PROFILE_STORE',
  manifestPath: 'PROFILE_STORE/manifest.json',
  loadOrderPath: 'PROFILE_STORE/loadorder.txt',
  settingsPath: 'PROFILE_STORE/settings.ini',
  overwritePath: 'PROFILE_STORE/overwrite',
  generatedPath: 'PROFILE_STORE/generated',
  deploymentPath: 'GAME_ROOT',
}

/** Un mod est « récupérable » s'il possède une source distante ou une référence externe. */
export function modHasSource(mod: Mod): boolean {
  return Boolean(mod.sourceUrl) || Boolean(mod.externalReferences && mod.externalReferences.length > 0)
}

export function computeShareStats(mods: Mod[], mode: ProfileShareMode): ProfileShareStats {
  const totalMods = mods.length
  const frameworkCount = mods.filter(mod => mod.framework).length
  const withSource = mods.filter(modHasSource).length
  const localWithoutSource = mods.filter(mod => !modHasSource(mod)).length
  const localIncluded = mode === 'complete' ? localWithoutSource : 0
  const estimatedBytes = mods.reduce((sum, mod) => sum + (mod.sizeBytes || 0), 0)
  // §57 : 80 mods récupérables + 4 locaux inclus = 100 % ; mods locaux exclus en mode léger.
  const reproducible = withSource + localIncluded
  const reproducibility = totalMods === 0 ? 100 : Math.round((reproducible / totalMods) * 100)
  return { totalMods, frameworkCount, withSource, localWithoutSource, localIncluded, estimatedBytes, reproducibility }
}

/** Nom sans collision pour un profil importé (§37 : ne jamais écraser, « Default (2) »). */
export function nextProfileName(existingNames: string[], desired: string): string {
  const base = desired.trim() || 'Profil importé'
  const taken = new Set(existingNames.map(name => name.toLocaleLowerCase()))
  if (!taken.has(base.toLocaleLowerCase())) return base
  let index = 2
  while (taken.has(`${base} (${index})`.toLocaleLowerCase())) index += 1
  return `${base} (${index})`
}

/**
 * Construit le manifeste d'export depuis un jeu + profil (spec §24-33, §44-46).
 * Les chemins absolus utilisateur sont neutralisés : GAME_ROOT / PROFILE_STORE.
 */
export function buildProfileShareManifest(input: {
  game: Game
  profile: Profile
  mods: Mod[]
  mode: ProfileShareMode
  appVersion: string
}): ProfileArchiveManifest {
  const { game, profile, mods, mode, appVersion } = input
  const { mods: _legacy, ...profileFields } = profile
  const portableProfile: Record<string, unknown> = { ...profileFields }
  for (const field of PATH_FIELDS) {
    if (typeof portableProfile[field] === 'string') {
      portableProfile[field] = PORTABLE_PATH_TOKENS[field] || 'PROFILE_STORE'
    }
  }
  // §45 : le bypass est un chemin local — on garde seulement l'intention, jamais le chemin.
  if (typeof portableProfile.bypass === 'string' && portableProfile.bypass.trim()) {
    portableProfile.bypass = 'GAME_ROOT/Bypass'
  }
  const sanitizedMods = mods.map(mod => {
    const { path: _path, files: _files, ...safe } = mod
    const result: Record<string, unknown> = { ...safe }
    delete result.path
    return result as Omit<Mod, 'path' | 'files'>
  })
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: 'ZAILON',
    appVersion,
    exportMode: mode,
    game: {
      name: game.name,
      provider: game.provider,
      providerGameId: game.providerGameId,
      // §44 : réglages globaux du jeu transportables (QWERTY virtuel, chaîne de lancement).
      keyboardLayout: game.keyboardLayout,
      launchAdapter: game.launchAdapter,
      backgroundMedia: game.backgroundMedia,
    },
    profile: portableProfile as unknown as Manifest['profile'],
    mods: sanitizedMods,
  }
}

/**
 * Nettoie un manifeste reçu avant import : chemins absolus machine supprimés,
 * champs inconnus conservés mais bornés, aucune donnée exécutable.
 */
export function sanitizeProfileForImport(profile: Profile): Profile {
  const clean = { ...profile }
  for (const field of PATH_FIELDS) delete clean[field]
  delete clean.bypass
  delete clean.clonedFromProfileId
  delete clean.templateId
  return clean
}

/** Compte des mods « framework » dans le manifeste (loaders : RED4ext, TweakXL, …). */
export function countFrameworkMods(mods: Array<{ framework?: string }>): number {
  return mods.filter(mod => mod.framework).length
}
