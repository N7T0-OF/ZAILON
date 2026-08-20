/**
 * NTE (Neverness to Everness) — bibliothèque de support pure (aucun DOM).
 *
 * Fusion des connaissances du launcher open-source Aurora
 * (https://github.com/SpeedyQwQ/Aurora-Launcher, GPL-3.0) :
 *
 * - Dossier de mods PAK : `<jeu>/Client/WindowsNoEditor/HT/Content/Paks/AuroraMods/`.
 *   Chaque mod est UN sous-dossier contenant des fichiers .pak/.utoc/.ucas.
 *   L'activation/désactivation d'Aurora = renommage transactionnel
 *   `.pak` ↔ `.pak.disabled` DANS le dossier (jamais de déplacement) — c'est le
 *   mécanisme qui rend un mod réellement chargé/ignoré par le moteur Everlight.
 * - Versions : Global (NTEGlobalLauncher.exe), China (NTELauncher.exe),
 *   Taiwan (NTETWLauncher.exe). Processus helper associés (session tracking).
 * - Distribution Epic : marqueur `NTEGlobal/EOSSDK-Win64-Shipping.dll` ; les
 *   builds Epic exigent des arguments d'auth au lancement du launcher.
 * - Métadonnées `mod.json` (Aurora « Display file », docs.getaurora.moe) :
 *   clés insensibles à la casse, BOM toléré, `optionals.support link` /
 *   `optionals.custom image url`, schéma https:// ajouté si absent, nom
 *   d'affichage = nom du dossier sans le suffixe `_P`.
 *
 * Les vérifications de fichiers réels vivent dans le backend natif
 * (`nte_game_report`) ; ici les détecteurs prennent une fonction `exists`
 * injectable — pure et testable sous node --test
 * (`.github/scripts/test-nte-lib.ts`), inoffensive dans le navigateur.
 */

import { detectModBackend } from './modBackends.ts'

/** Versions officielles de NTE (Aurora `shared::classes::info::version::Version`). */
export type NteVersion = 'global' | 'cn' | 'tw' | 'unknown'

/** Distribution de lancement (Aurora `Distribution` + plateforme ZAILON). */
export type NteDistribution = 'epic' | 'steam' | 'standalone'

/** Launcher par version — AUCUN autre exe ne valide une installation NTE. */
export const NTE_LAUNCHERS: ReadonlyArray<{ exe: string; version: NteVersion; label: string }> = [
  { exe: 'NTEGlobalLauncher.exe', version: 'global', label: 'Global' },
  { exe: 'NTELauncher.exe', version: 'cn', label: 'China (CN)' },
  { exe: 'NTETWLauncher.exe', version: 'tw', label: 'Taiwan (TW)' },
]

/** Processus helper par version (Aurora `VersionSpec::helper_processes`). */
export const NTE_HELPER_PROCESSES: Record<Exclude<NteVersion, 'unknown'>, string[]> = {
  global: ['NTEGlobal.exe', 'NTEGlobalGame.exe'],
  cn: ['NTEGame.exe'],
  tw: ['NTETWGame.exe'],
}

/** Arbre client NTE sous la racine du jeu (Aurora `paths.rs`). */
export const NTE_CLIENT_WIN64 = 'Client/WindowsNoEditor/HT/Binaries/Win64'
/** Dossier chargé par le moteur Aurora (Everlight) — dossier Mods NTE natif. */
export const NTE_MODS_RELATIVE = 'Client/WindowsNoEditor/HT/Content/Paks/AuroraMods'
/** Marqueur de validation d'une installation (Aurora `markers.rs`). */
export const NTE_PAKS_MARKER = 'Client/WindowsNoEditor/HT/Content/Paks'

/** Noms de dossier connus pour NTE (Aurora `markers.rs` — y compris 異環). */
export const NTE_FOLDER_NAMES = ['Neverness To Everness', '異環', 'NTE']

/** Arguments d'auth exigés par les builds Epic (Aurora `Distribution::launch_args`). */
export const NTE_EPIC_AUTH_ARGS = ['-AUTH_PASSWORD=1234', '-AUTH_TYPE=exchangecode']

/** Suffixes de fichiers de mod PAK (Aurora `MOD_EXTENSIONS`). */
export const NTE_MOD_EXTENSIONS = ['pak', 'utoc', 'ucas']

/** Extension que l'on renomme pour désactiver (Aurora `TOGGLE_EXTENSION` : seul
 * le .pak est renommé — .utoc/.ucas orphelins = ensemble inactif). */
export const NTE_TOGGLE_EXTENSION = 'pak'

/** Préfixe de staging d'installation d'Aurora (ignoré au scan). */
export const NTE_STAGING_PREFIX = '.aurora-installing-'

/** Préfixe des groupes Aurora (`AU GRP - <nom>`), traités comme des mods. */
export const NTE_GROUP_PREFIX = 'AU GRP - '

/** Nom du fichier de métadonnées Aurora. */
export const NTE_MOD_JSON = 'mod.json'

/** Signature de vérification d'existence injectable (tests node, sinon Rust). */
export type PathExists = (path: string) => boolean

const joinRelative = (...parts: string[]): string => parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/')

/** Dossier Mods Aurora d'une racine de jeu NTE. */
export function nteModsPathFor(gameRoot: string): string {
  return joinRelative(gameRoot, NTE_MODS_RELATIVE)
}

/** Dossier des binaires Win64 d'une racine de jeu NTE. */
export function nteBinariesPathFor(gameRoot: string): string {
  return joinRelative(gameRoot, NTE_CLIENT_WIN64)
}

/** Vrai si le nom d'exécutable correspond à un launcher NTE connu. */
export function isNteLauncher(executable?: string): boolean {
  const lower = (executable || '').toLocaleLowerCase().split(/[\\/]/).pop() || ''
  return NTE_LAUNCHERS.some(entry => entry.exe.toLocaleLowerCase() === lower)
}

/** Vrai si un nom d'exécutable évoque NTE (marqueurs Aurora + ZAILON legacy). */
export function isNteExecutable(executable?: string): boolean {
  const lower = (executable || '').toLocaleLowerCase()
  return isNteLauncher(lower) || ['nte', 'neverness'].some(marker => lower.includes(marker))
}

/** Vrai si un nom de jeu évoque NTE (noms connus, insensibles à la casse). */
export function isNteGameName(gameName?: string): boolean {
  const lower = (gameName || '').toLocaleLowerCase()
  return NTE_FOLDER_NAMES.some(name => lower.includes(name.toLocaleLowerCase()))
    || lower.includes('neverness')
    || lower.includes('nte')
}

/**
 * Détection de la version NTE par présence du launcher (Aurora `detect_version`).
 * L'ordre suit `LAUNCHER_MAP` : Global, CN, TW. `exists` est injectable (défaut
 * : aucune vérification réelle — les appels UI passent par `nte_game_report`).
 */
export function detectNteVersion(installDir?: string, exists: PathExists = () => false): NteVersion {
  if (!installDir) return 'unknown'
  const normalized = installDir.replace(/\\/g, '/').replace(/\/+$/, '')
  for (const entry of NTE_LAUNCHERS) {
    if (exists(joinRelative(normalized, entry.exe))) return entry.version
  }
  return 'unknown'
}

/**
 * Détection de la distribution (Aurora `detect_distribution` : le marqueur Epic
 * est `NTEGlobal/EOSSDK-Win64-Shipping.dll`). La plateforme déclarée par ZAILON
 * prime, le marqueur système sert de preuve indépendante pour les builds
 * détectées « standalone » mais réellement installées par Epic.
 */
export function detectNteDistribution(installDir?: string, platform?: string, exists: PathExists = () => false): NteDistribution {
  if (platform === 'epic') return 'epic'
  if (platform === 'steam') return 'steam'
  if (installDir) {
    const normalized = installDir.replace(/\\/g, '/').replace(/\/+$/, '')
    if (exists(joinRelative(normalized, 'NTEGlobal/EOSSDK-Win64-Shipping.dll'))) return 'epic'
  }
  return 'standalone'
}

/** Arguments de lancement du launcher selon la distribution (Epic → auth). */
export function nteLaunchArgs(distribution: NteDistribution): string[] {
  return distribution === 'epic' ? [...NTE_EPIC_AUTH_ARGS] : []
}

/** Marqueurs de validation d'une installation NTE (diagnostic « Tester »). */
export function nteValidationMarkers(installDir?: string, exists: PathExists = () => false): Array<{ label: string; marker: string; found: boolean }> {
  if (!installDir) return NTE_LAUNCHERS.map(entry => ({ label: entry.label, marker: entry.exe, found: false }))
  const normalized = installDir.replace(/\\/g, '/').replace(/\/+$/, '')
  return [
    ...NTE_LAUNCHERS.map(entry => ({
      label: `Launcher ${entry.version}`,
      marker: entry.exe,
      found: exists(joinRelative(normalized, entry.exe)),
    })),
    { label: 'Arbre client (Paks)', marker: NTE_PAKS_MARKER, found: exists(joinRelative(normalized, NTE_PAKS_MARKER)) },
    { label: 'Dossier mods (AuroraMods)', marker: NTE_MODS_RELATIVE, found: exists(joinRelative(normalized, NTE_MODS_RELATIVE)) },
  ]
}

/** Métadonnées Aurora `mod.json` (champs optionnels, défauts côté appelant). */
export interface NteModJson {
  name?: string
  version?: string
  author?: string
  icon?: string
  supportLink?: string
  imageUrl?: string
}

/**
 * Parse un `mod.json` Aurora (spec « Display file ») : BOM toléré, JSON invalide
 * → null, clés insensibles à la casse, `optionals.support link` /
 * `optionals.custom image url`, schéma https:// ajouté si absent.
 */
export function parseNteModJson(raw: string): NteModJson | null {
  const trimmed = raw.trimStart().replace(/^\uFEFF/, '')
  if (!trimmed) return null
  let root: Record<string, unknown>
  try {
    const value: unknown = JSON.parse(trimmed)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    root = value as Record<string, unknown>
  } catch {
    return null
  }

  const field = (name: string): unknown => {
    const entry = Object.entries(root).find(([key]) => key.toLocaleLowerCase() === name)
    return entry ? entry[1] : undefined
  }
  const optionals = field('optionals')
  const optionalsMap = typeof optionals === 'object' && optionals !== null
    ? optionals as Record<string, unknown>
    : {}
  const optional = (name: string): string | undefined => {
    const entry = Object.entries(optionalsMap).find(([key]) => key.toLocaleLowerCase() === name)
    const value = typeof entry?.[1] === 'string' ? entry[1].trim() : ''
    return value || undefined
  }

  const withScheme = (value: string): string =>
    value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`

  const asString = (value: unknown): string | undefined => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text || undefined
  }

  const name = asString(field('name'))
  const version = asString(field('version'))
  const author = asString(field('author'))
  const icon = asString(field('icon'))
  const supportLink = optional('support link')
  const imageUrl = optional('custom image url')

  if (!name && !version && !author && !icon && !supportLink && !imageUrl) return null
  return {
    name,
    version,
    author,
    icon,
    supportLink: supportLink ? withScheme(supportLink) : undefined,
    imageUrl: imageUrl ? withScheme(imageUrl) : undefined,
  }
}

/**
 * Nom d'affichage Aurora d'un mod : nom du dossier sans le suffixe `_P`
 * (convention des mods NTE, Aurora `get_mod_data`).
 */
export function nteDisplayName(folderName: string): string {
  return folderName.endsWith('_P') ? folderName.slice(0, -2) : folderName
}

/** Vrai si le nom de fichier est un fichier de mod NTE (pak/utoc/ucas). */
export function isNteModFile(name: string): boolean {
  const extension = name.split('.').pop()?.toLocaleLowerCase() || ''
  return NTE_MOD_EXTENSIONS.includes(extension)
}

/** Vrai si le nom de fichier est un .pak désactivé (`foo.pak.disabled`). */
export function isNteDisabledModFile(name: string): boolean {
  if (!name.endsWith('.disabled')) return false
  return isNteModFile(name.slice(0, -'.disabled'.length))
}

/** Vrai si le fichier est un .pak activable (Aurora `is_pak_file`). */
export function isNtePakFile(name: string): boolean {
  return (name.split('.').pop()?.toLocaleLowerCase() || '') === NTE_TOGGLE_EXTENSION
}

/** Vrai si ce jeu doit utiliser le backend NTE PAK (détection + gate add-on). */
export function isNteGame(input: { execPath?: string; gameName?: string; nteAllowed: boolean }): boolean {
  return detectModBackend({
    execPath: input.execPath,
    gameName: input.gameName,
    nteAllowed: input.nteAllowed,
  }) === 'nte-pak'
}

/**
 * Monitoring de session NTE (spec « Refonte NTE/Aurora » §16-17, Live
 * Monitoring d'Aurora) : si l'utilisateur modifie le dossier de mods pendant
 * que NTE tourne (activation/désactivation, ajout, suppression), ZAILON signale
 * « Modification détectée — redémarrage nécessaire ». Décision PURE, testable :
 * le fingerprint du dossier mods (léger : métadonnées de premier niveau) est
 * comparé au baseline capturé au début de la session.
 *
 * - `capture` : premier tick de session → enregistrer le baseline (jamais de
 *   fausse alerte sur l'état initial).
 * - `notify` : le fingerprint a changé et aucune notification n'a été émise.
 * - `wait` : rien à faire (inchangé, ou déjà notifié).
 */
export type NteModsChangeDecision = 'capture' | 'notify' | 'wait'

export function nteModsChangeDecision(input: {
  baseline?: string
  current?: string
  notified: boolean
}): NteModsChangeDecision {
  if (input.baseline === undefined) {
    // Aucun baseline : c'est le premier tick de session → capturer l'état actuel.
    return 'capture'
  }
  if (input.notified) return 'wait'
  // Fingerprint vide (dossier mods absent) ≠ baseline : changement réel.
  return input.current !== input.baseline ? 'notify' : 'wait'
}
