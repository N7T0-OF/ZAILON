/**
 * Add-on Manager (spec « ZAILON — Nouvelle architecture Add-ons » §1-83).
 *
 * Principes :
 * - ZAILON CORE reste petit, offline-first, indépendant — les add-ons sont
 *   installés à la demande, jamais bundlés (§1) ;
 * - ID immuable (le nom peut changer, l'ID jamais — §10) ;
 * - permissions explicites — un add-on n'accède jamais à tout le PC (§11-13) ;
 * - pas de marketplace : les add-ons communautaires arrivent via
 *   « Importer un add-on » (§7-8) ;
 * - lazy loading : un add-on n'est chargé que lorsqu'il est nécessaire (§19) ;
 * - un add-on cassé ne bloque jamais le démarrage de ZAILON (§21-22) ;
 * - installation atomique avec rollback (§15, §65).
 *
 * Cette lib est pure (aucun import natif) — toute la décision est testable.
 */

import { versionCompare } from './reshade.ts'
// Source de vérité unique (spec « Simplification totale » §3-4, §19) : le
// catalogue vit dans `zailon-addons/catalog.json` à la racine du dépôt,
// importé tel quel (jamais dupliqué). Le même fichier est servi par
// raw.githubusercontent.com pour la synchronisation distante.
import officialCatalogJson from '../../zailon-addons/catalog.json' with { type: 'json' }

// ─────────────────────────────── Types de base ──────────────────────────────

/** Version de l'API d'extensions — séparée de la version ZAILON (§24). */
export const ADDON_API_VERSION = '1'

export const ZAILON_CURRENT_VERSION = '1.69.0'

export type AddonCategory = 'game-support' | 'modding' | 'visual' | 'appearance' | 'sources' | 'utilities'

export const ADDON_CATEGORY_LABELS: Record<AddonCategory, string> = {
  'game-support': 'Jeux',
  modding: 'Modding',
  visual: 'Visuel',
  appearance: 'Apparence',
  sources: 'Sources',
  utilities: 'Utilitaires',
}

/** Permissions déclarables (spec §11). Un add-on ne reçoit rien d'implicite. */
export const ADDON_PERMISSIONS = [
  'game.read',
  'game.launch',
  'game.files.read',
  'game.files.write',
  'profile.read',
  'profile.write',
  'mods.read',
  'mods.write',
  'network',
  'process.read',
  'process.launch',
  'ui.extend',
  'settings',
  'provider',
  'filesystem.external',
  'display.profiles',
] as const

export type AddonPermission = typeof ADDON_PERMISSIONS[number]

export const ADDON_PERMISSION_LABELS: Record<AddonPermission, string> = {
  'game.read': 'Lire les jeux configurés',
  'game.launch': 'Lancer des jeux',
  'game.files.read': 'Lire les fichiers des jeux',
  'game.files.write': 'Écrire dans les fichiers des jeux',
  'profile.read': 'Lire les profils',
  'profile.write': 'Modifier les profils',
  'mods.read': 'Lire les mods',
  'mods.write': 'Gérer les mods (installer, ordre, activation)',
  network: 'Accès réseau (téléchargements, mises à jour)',
  'process.read': 'Observer les processus',
  'process.launch': 'Lancer des composants',
  'ui.extend': 'Étendre l’interface (emplacements définis uniquement)',
  settings: 'Accéder aux paramètres ZAILON',
  provider: 'Agir comme fournisseur Explorer',
  'filesystem.external': 'Accéder au système de fichiers hors des dossiers ZAILON',
  'display.profiles': 'Appliquer et restaurer les profils d\'affichage système',
}

export const isAddonPermission = (value: string): value is AddonPermission =>
  (ADDON_PERMISSIONS as readonly string[]).includes(value)

export interface ZailonAddonManifest {
  schema: 1
  id: string
  name: string
  version: string
  author: string
  description: string
  category: AddonCategory
  entrypoint?: string
  minZailonVersion: string
  maxZailonVersion?: string
  minAddonApiVersion?: string
  permissions: AddonPermission[]
  supportedPlatforms?: Array<'windows' | 'linux' | 'macos'>
  supportedGames?: string[]
  dependencies?: string[]
  optionalDependencies?: string[]
  /** Événements auxquels l'add-on s'abonne (lazy, §69-70). */
  events?: AddonEvent[]
}

export type AddonSource = 'official' | 'community'

export interface InstalledAddon {
  manifest: ZailonAddonManifest
  source: AddonSource
  installedAt: number
  enabled: boolean
  /** Données utilisateur conservées après désinstallation (§17). */
  dataKept: boolean
}

export interface AddonCatalogEntry {
  id: string
  name: string
  version: string
  category: AddonCategory
  /** Chemin RELATIF du package dans le repository statique (spec §2, §4) :
   * `packages/<dir>/<id>-<version>.zailon-addon`. `null` = en développement,
   * aucun package construit → jamais de bouton Installer (§5). Le fichier est
   * VERSIONNÉ dans son nom (§16) : cache CDN inoffensif, rollback naturel. */
  package?: string | null
  /** URL absolue alternative (catalogue communautaire / dev hors repository). */
  download?: string
  sha256?: string
  /** Taille du package `.zailon-addon` (octets). */
  downloadSize?: number
  /** Taille estimée une fois déployée (octets). */
  installedSize?: number
  platforms?: Array<'windows' | 'linux' | 'macos'>
  minZailonVersion: string
  maxZailonVersion?: string
  minAddonApiVersion?: string
  permissions: AddonPermission[]
  description: string
  dependencies?: string[]
  optionalDependencies?: string[]
  /** Signature Ed25519 (base64) du SHA-256 du package (spec §14, §52). */
  signature?: string
  /** Clé publique Ed25519 (base64, 32 octets) ayant signé le package. */
  signaturePublicKey?: string
  /** Notes de version (spec §41) : chargées à la demande, jamais au boot. */
  changelogPath?: string | null
  official: boolean
}

export interface AddonCatalog {
  schema: 2
  addons: AddonCatalogEntry[]
  /** Horodatage de mise en cache (enveloppe de cache, spec §35) — absent du
   * catalogue parse ; utilisé pour la revalidation TTL (spec §34, §45). */
  fetchedAt?: number
}

// ─────────────────────────────── IDs immuables ──────────────────────────────

const ADDON_ID_SEGMENT = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
// Séparateur de segments : point littéral construit sans backslash dans la
// source (évite les ambiguïtés d'échappement selon l'outillage).
const ADDON_ID_DOT = String.fromCharCode(92) + '.'
const ADDON_ID_PATTERN = new RegExp('^' + ADDON_ID_SEGMENT + '(?:' + ADDON_ID_DOT + ADDON_ID_SEGMENT + ')+$')
const ADDON_ID_SEGMENT_MAX = 32

/**
 * Un ID d'add-on est immuable : segments alphanumériques en minuscules (tiret
 * autorisé à l'intérieur d'un segment), au moins deux segments (§10).
 */
export function isValidAddonId(id: unknown): id is string {
  if (typeof id !== 'string' || id.length > 160) return false
  if (!ADDON_ID_PATTERN.test(id)) return false
  const segments = id.split('.')
  return segments.every(segment => segment.length <= ADDON_ID_SEGMENT_MAX)
}

// ─────────────────────────────── Compatibilité ──────────────────────────────

export interface AddonCompatibility {
  ok: boolean
  reasons: string[]
}

/**
 * Porte de compatibilité (§23, §64) : version ZAILON min/max, version API,
 * plateforme, architecture et dépendances manquantes. Jamais installé si
 * incompatible.
 */
export function checkAddonCompatibility(
  manifest: Pick<ZailonAddonManifest, 'id' | 'version' | 'minZailonVersion' | 'maxZailonVersion' | 'minAddonApiVersion' | 'supportedPlatforms' | 'dependencies'>,
  context: { zailonVersion?: string; addonApiVersion?: string; platform?: 'windows' | 'linux' | 'macos'; arch?: 'x64' | 'arm64'; installedIds: string[] },
): AddonCompatibility {
  const reasons: string[] = []
  const zailon = context.zailonVersion || ZAILON_CURRENT_VERSION

  if (versionCompare(zailon, manifest.minZailonVersion) < 0) {
    reasons.push(`Nécessite ZAILON ${manifest.minZailonVersion} ou plus (actuel : ${zailon}).`)
  }
  if (manifest.maxZailonVersion && versionCompare(zailon, manifest.maxZailonVersion) > 0) {
    reasons.push(`Nécessite ZAILON ${manifest.maxZailonVersion} ou moins (actuel : ${zailon}).`)
  }
  if (manifest.minAddonApiVersion && context.addonApiVersion
    && versionCompare(context.addonApiVersion, manifest.minAddonApiVersion) < 0) {
    reasons.push(`Nécessite l’API d’extensions v${manifest.minAddonApiVersion} (actuelle : v${context.addonApiVersion}).`)
  }
  if (manifest.supportedPlatforms && context.platform && !manifest.supportedPlatforms.includes(context.platform)) {
    reasons.push(`Non pris en charge sur ${context.platform} (support : ${manifest.supportedPlatforms.join(', ')}).`)
  }
  if (manifest.dependencies) {
    const missing = manifest.dependencies.filter(id => !context.installedIds.includes(id))
    if (missing.length) reasons.push(`Dépendances manquantes : ${missing.join(', ')}.`)
  }
  return { ok: reasons.length === 0, reasons }
}

// ─────────────────────────────── Catalogue ──────────────────────────────────

export interface ParseCatalogResult {
  ok: boolean
  catalog?: AddonCatalog
  errors: string[]
}

/** Valide un catalogue officiel (schema 2). Les entrées invalides sont rejetées. */
export function parseAddonCatalog(json: unknown): ParseCatalogResult {
  const errors: string[] = []
  if (typeof json !== 'object' || json === null) return { ok: false, errors: ['Catalogue non JSON.'] }
  const raw = json as Record<string, unknown>
  if (raw.schema !== 2) { errors.push(`Schema inattendu : ${String(raw.schema)} (attendu 2).`) }
  if (!Array.isArray(raw.addons)) { errors.push('Champ addons manquant ou invalide.') }

  const seen = new Set<string>()
  const addons: AddonCatalogEntry[] = []
  const list = Array.isArray(raw.addons) ? raw.addons as unknown[] : []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) { errors.push('Entrée de catalogue non objet.'); continue }
    const entry = item as Record<string, unknown>
    const id = entry.id
    if (!isValidAddonId(id)) { errors.push(`ID invalide : ${String(id)}.`); continue }
    if (seen.has(id)) { errors.push(`ID dupliqué : ${id}.`); continue }
    seen.add(id)

    const required: Array<[string, string]> = [
      ['name', 'string'], ['version', 'string'], ['category', 'string'],
      ['minZailonVersion', 'string'], ['description', 'string'], ['permissions', 'object'],
    ]
    let valid = true
    for (const [key, type] of required) {
      const value = entry[key]
      if (type === 'object' ? !Array.isArray(value) : typeof value !== type) {
        errors.push(`[${id}] Champ ${key} manquant ou invalide.`)
        valid = false
      }
    }
    if (!valid) continue

    // Package (spec §2, §5) : chemin RELATIF dans le repository statique, ou
    // `null`/absent = en développement. Un package déclaré exige un SHA-256
    // réel et une taille positive — sinon l'entrée est invalide (jamais 404).
    let packagePath: string | null | undefined
    if (entry.package === null || entry.package === undefined) {
      packagePath = null
    } else if (typeof entry.package === 'string' && /^[A-Za-z0-9_./-]+\.zailon-addon$/.test(entry.package.trim())) {
      packagePath = entry.package.trim()
    } else {
      errors.push(`[${id}] package invalide (doit être un chemin relatif .zailon-addon ou null).`)
      valid = false
    }

    const sha256 = typeof entry.sha256 === 'string' ? entry.sha256 : ''
    const downloadSize = typeof entry.downloadSize === 'number' ? entry.downloadSize : 0
    if (packagePath && (!/^[0-9a-f]{64}$/i.test(sha256) || downloadSize <= 0)) {
      errors.push(`[${id}] package déclaré sans SHA-256 réel (64 hex) et taille positive.`)
      valid = false
    }

    // URL absolue alternative (catalogue communautaire / dev) : `download`.
    const download = typeof entry.download === 'string' && entry.download.trim().length > 0
      ? entry.download.trim()
      : undefined

    const rawPermissions = entry.permissions as unknown[]
    const permissions = (rawPermissions as string[]).filter(isAddonPermission)
    if (permissions.length !== rawPermissions.length) {
      errors.push(`[${id}] Permission inconnue ignorée.`)
    }
    const category = entry.category as string
    if (!(category in ADDON_CATEGORY_LABELS)) {
      errors.push(`[${id}] Catégorie inconnue : ${category}.`)
      valid = false
    }
    // Signature (spec §14) : signature et clé publique vont toujours ensemble —
    // un package déclarant l'un sans l'autre est rejeté par le parseur.
    const hasSignature = typeof entry.signature === 'string' && entry.signature.length > 0
    const hasPublicKey = typeof entry.signaturePublicKey === 'string' && entry.signaturePublicKey.length > 0
    if (hasSignature !== hasPublicKey) {
      errors.push(`[${id}] signature et signaturePublicKey doivent être fournies ensemble.`)
      valid = false
    }
    if (valid) {
      const platforms = Array.isArray(entry.platforms)
        ? (entry.platforms as string[]).filter((value): value is 'windows' | 'linux' | 'macos' => value === 'windows' || value === 'linux' || value === 'macos')
        : undefined
      addons.push({
        id: id as string,
        name: entry.name as string,
        version: entry.version as string,
        category: category as AddonCategory,
        package: packagePath,
        download,
        sha256: packagePath ? sha256 : undefined,
        downloadSize: packagePath ? downloadSize : undefined,
        installedSize: typeof entry.installedSize === 'number' ? entry.installedSize : undefined,
        platforms,
        minZailonVersion: entry.minZailonVersion as string,
        maxZailonVersion: typeof entry.maxZailonVersion === 'string' ? entry.maxZailonVersion : undefined,
        minAddonApiVersion: typeof entry.minAddonApiVersion === 'string' ? entry.minAddonApiVersion : undefined,
        permissions,
        description: entry.description as string,
        dependencies: Array.isArray(entry.dependencies) ? (entry.dependencies as string[]).filter(isValidAddonId) : undefined,
        optionalDependencies: Array.isArray(entry.optionalDependencies) ? (entry.optionalDependencies as string[]).filter(isValidAddonId) : undefined,
        signature: hasSignature ? (entry.signature as string) : undefined,
        signaturePublicKey: hasSignature ? (entry.signaturePublicKey as string) : undefined,
        changelogPath: typeof entry.changelogPath === 'string' ? entry.changelogPath : undefined,
        official: true,
      })
    }
  }

  if (errors.length > 0 && addons.length === 0) return { ok: false, errors }
  return { ok: true, catalog: { schema: 2, addons }, errors }
}

/** Vérifie le SHA-256 (comparaison insensible à la casse). */
export function verifyAddonHash(expectedSha256: string, actualSha256: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256) || !/^[0-9a-f]{64}$/i.test(actualSha256)) return false
  return expectedSha256.toLowerCase() === actualSha256.toLowerCase()
}

// ─────────────────────────────── Dépendances ────────────────────────────────

export interface DependencyPlan {
  toInstall: string[]
  missing: string[]
}

/**
 * Résout l'ensemble d'installation : les dépendances disponibles dans le
 * catalogue sont ajoutées, celles qui manquent sont signalées (§31-33).
 * Détection des cycles pour ne jamais boucler.
 */
export function resolveAddonDependencies(
  entryId: string,
  catalogById: Map<string, AddonCatalogEntry>,
  installedIds: ReadonlySet<string>,
): DependencyPlan {
  const toInstall: string[] = []
  const missing: string[] = []
  const visited = new Set<string>()
  const stack: string[] = [entryId]

  while (stack.length > 0) {
    const current = stack.pop() as string
    if (visited.has(current)) continue
    visited.add(current)
    const entry = catalogById.get(current)
    const deps = entry?.dependencies || []
    for (const dep of deps) {
      if (installedIds.has(dep)) continue
      if (catalogById.has(dep)) {
        if (!toInstall.includes(dep)) toInstall.push(dep)
        stack.push(dep)
      } else {
        if (!missing.includes(dep)) missing.push(dep)
      }
    }
  }
  return { toInstall, missing }
}

/** Cycle de dépendances entre add-ons installés/du catalogue (gardé simple). */
export function detectDependencyCycle(edges: Array<[string, string]>): string[] | null {
  const graph = new Map<string, string[]>()
  for (const [from, to] of edges) {
    const list = graph.get(from) || []
    list.push(to)
    graph.set(from, list)
  }
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []
  const visit = (node: string): boolean => {
    color.set(node, GRAY)
    stack.push(node)
    for (const next of graph.get(node) || []) {
      const nextColor = color.get(next) ?? WHITE
      if (nextColor === GRAY) {
        const start = stack.indexOf(next)
        return true // cycle trouvé (le stack contient le cycle)
      }
      if (nextColor === WHITE && visit(next)) return true
    }
    stack.pop()
    color.set(node, BLACK)
    return false
  }
  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE && visit(node)) {
      return [...stack]
    }
  }
  return null
}

// ─────────────────────────────── Désinstallation ────────────────────────────

export interface UninstallPlan {
  safe: boolean
  dependents: string[]
}

/** Jamais de suppression silencieuse si d'autres add-ons dépendent (§33). */
export function planAddonUninstall(addonId: string, installed: InstalledAddon[]): UninstallPlan {
  const dependents = installed
    .filter(item => item.manifest.dependencies?.includes(addonId))
    .map(item => item.manifest.id)
  return { safe: dependents.length === 0, dependents }
}

// ─────────────────────────────── Crash guard / safe mode ────────────────────

export interface AddonCrashRecord {
  crashes: number
  lastCrashAt: number
  disabled: boolean
}

export interface CrashGuardStorage {
  read(id: string): AddonCrashRecord | undefined
  write(id: string, record: AddonCrashRecord): void
}

const defaultRecord = (): AddonCrashRecord => ({ crashes: 0, lastCrashAt: 0, disabled: false })

/**
 * AddonCrashGuard (§21) : après 2 crashs consécutifs, le module fautif est
 * désactivé — ZAILON Core démarre toujours. Le compteur se réinitialise après
 * un délai (crashs espacés ≠ panne).
 */
export function recordAddonCrash(id: string, storage: CrashGuardStorage, now = Date.now()): { disabled: boolean; message?: string } {
  const record = storage.read(id) || defaultRecord()
  const recent = now - record.lastCrashAt < 10 * 60 * 1000
  const crashes = recent ? record.crashes + 1 : 1
  const disabled = crashes >= 2
  storage.write(id, { crashes, lastCrashAt: now, disabled })
  return disabled
    ? { disabled, message: `${id} a rencontré une erreur et a été désactivé.` }
    : { disabled }
}

/** Réactive un add-on désactivé par le crash guard. */
export function reenableAddon(id: string, storage: CrashGuardStorage): void {
  storage.write(id, { ...defaultRecord(), disabled: false })
}

/**
 * Safe Mode (§22) : si ZAILON crash plusieurs fois au démarrage, tous les
 * add-ons tiers sont désactivés — les données restent intactes.
 */
export function shouldEnterSafeMode(bootCrashes: number, threshold = 3): boolean {
  return bootCrashes >= threshold
}

// ─────────────────────────────── Événements (lazy) ──────────────────────────

export type AddonEvent =
  | 'OnGameSelected'
  | 'OnGameLaunching'
  | 'OnGameStarted'
  | 'OnGameStopped'
  | 'OnExplorerOpened'
  | 'OnProfileChanged'
  | 'OnDemand'
  | 'OnZailonStarted'

export const ADDON_EVENTS: readonly AddonEvent[] = [
  'OnGameSelected', 'OnGameLaunching', 'OnGameStarted', 'OnGameStopped',
  'OnExplorerOpened', 'OnProfileChanged', 'OnDemand', 'OnZailonStarted',
]

/** Événements autorisés (§69-71) : tout sauf OnZailonStarted est lazy/à la demande. */
export const ADDON_LAZY_EVENTS: readonly AddonEvent[] = ADDON_EVENTS.filter(event => event !== 'OnZailonStarted')

export function validateAddonEvents(events: unknown): { ok: boolean; errors: string[]; startup: boolean } {
  const errors: string[] = []
  if (!Array.isArray(events)) return { ok: true, errors, startup: false }
  for (const event of events) {
    if (!ADDON_EVENTS.includes(event as AddonEvent)) errors.push(`Événement inconnu : ${String(event)}.`)
  }
  return { ok: errors.length === 0, errors, startup: events.includes('OnZailonStarted') }
}

// ─────────────────────────────── Installation atomique ──────────────────────

export type AddonInstallPhase = 'download' | 'verify' | 'staging' | 'swap' | 'health' | 'cleanup'

export const ADDON_INSTALL_PHASES: readonly AddonInstallPhase[] = ['download', 'verify', 'staging', 'swap', 'health', 'cleanup']

export interface AddonInstallPlan {
  phases: AddonInstallPhase[]
  /** Étapes après lesquelles un rollback est possible. */
  rollbackAfter: AddonInstallPhase[]
}

/** Installation atomique (§15, §65) : jamais d'écrasement direct — swap + rollback. */
export function planAddonInstall(): AddonInstallPlan {
  return { phases: [...ADDON_INSTALL_PHASES], rollbackAfter: ['staging', 'health'] }
}

/** Estimation de la taille installée (~2,5× le téléchargement, §73). */
export function estimateInstalledSize(downloadSizeBytes: number): number {
  return Math.round(downloadSizeBytes * 2.5)
}

export function formatAddonSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['o', 'Ko', 'Mo', 'Go']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${size.toLocaleString('fr-FR', { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`
}

// ─────────────────────────────── Validation manifest ────────────────────────

export interface ManifestValidationResult {
  ok: boolean
  error?: string
  manifest?: ZailonAddonManifest
}

/**
 * Valide un manifest d'add-on importé (schéma, ID, permissions, catégorie,
 * version). Un manifest invalide n'est jamais installé (§9, §14).
 */
export function validateAddonManifest(json: unknown): ManifestValidationResult {
  if (typeof json !== 'object' || json === null) return { ok: false, error: 'Manifest non JSON.' }
  const raw = json as Record<string, unknown>
  if (raw.schema !== 1) return { ok: false, error: `Schema inattendu : ${String(raw.schema)}.` }
  if (!isValidAddonId(raw.id)) return { ok: false, error: `ID d’add-on invalide : ${String(raw.id)}.` }
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return { ok: false, error: 'Nom manquant.' }
  if (typeof raw.version !== 'string' || !/^\d+\.\d+\.\d+/.test(raw.version)) return { ok: false, error: `Version invalide : ${String(raw.version)}.` }
  if (typeof raw.author !== 'string' || raw.author.trim().length === 0) return { ok: false, error: 'Auteur manquant.' }
  const category = raw.category
  if (typeof category !== 'string' || !(category in ADDON_CATEGORY_LABELS)) return { ok: false, error: `Catégorie inconnue : ${String(category)}.` }
  if (typeof raw.minZailonVersion !== 'string') return { ok: false, error: 'minZailonVersion manquant.' }
  const permissions = Array.isArray(raw.permissions) ? (raw.permissions as string[]).filter(isAddonPermission) : []
  if (permissions.length === 0) return { ok: false, error: 'Aucune permission valide déclarée.' }
  const events = Array.isArray(raw.events)
    ? (raw.events as string[]).filter((event): event is AddonEvent => ADDON_EVENTS.includes(event as AddonEvent))
    : undefined
  const eventCheck = validateAddonEvents(raw.events)
  if (!eventCheck.ok) return { ok: false, error: eventCheck.errors.join(' ') }
  const manifest: ZailonAddonManifest = {
    schema: 1,
    id: raw.id as string,
    name: raw.name as string,
    version: raw.version as string,
    author: raw.author as string,
    description: typeof raw.description === 'string' ? raw.description : '',
    category: category as AddonCategory,
    entrypoint: typeof raw.entrypoint === 'string' ? raw.entrypoint : undefined,
    minZailonVersion: raw.minZailonVersion as string,
    maxZailonVersion: typeof raw.maxZailonVersion === 'string' ? raw.maxZailonVersion : undefined,
    minAddonApiVersion: typeof raw.minAddonApiVersion === 'string' ? raw.minAddonApiVersion : undefined,
    permissions,
    supportedPlatforms: Array.isArray(raw.supportedPlatforms)
      ? (raw.supportedPlatforms as string[]).filter((value): value is 'windows' | 'linux' | 'macos' => value === 'windows' || value === 'linux' || value === 'macos')
      : undefined,
    supportedGames: Array.isArray(raw.supportedGames) ? (raw.supportedGames as string[]).filter(Boolean) : undefined,
    dependencies: Array.isArray(raw.dependencies) ? (raw.dependencies as string[]).filter(isValidAddonId) : undefined,
    optionalDependencies: Array.isArray(raw.optionalDependencies) ? (raw.optionalDependencies as string[]).filter(isValidAddonId) : undefined,
    events,
  }
  return { ok: true, manifest }
}

// ────────────────── Repository statique + disponibilité ─────────────────────
// Spec « Simplification totale » §1-5, §16, §39 : AUCUNE GitHub Release. Un
// SEUL repository contient `catalog.json` + tous les packages, servis en
// contenu brut (raw.githubusercontent.com). Le catalogue référence un chemin
// RELATIF (`package`), jamais une URL construite à la volée depuis l'ID.

/** Configuration du repository officiel des add-ons (spec §3, §25, §39).
 * Une seule racine — catalog, packages et docs dérivent de cette config. */
export const ADDON_REPOSITORY = {
  owner: 'N7T0-OF',
  // Le dépôt dédié `zailon-addons` n'existe pas encore (404) : les packages
  // sont hébergés dans le dépôt ZAILON sous `zailon-addons/`, structurés
  // exactement comme le dépôt autonome cible. Quand `N7T0-OF/zailon-addons`
  // sera créé, il suffit de changer ce nom — rien d'autre.
  repo: 'ZAILON',
  // Branche STABLE dédiée (spec §39) : les URLs raw doivent servir le contenu
  // publié immédiatement — `main` peut être en retard (branche d'intégration).
  // Après chaque release d'add-on : `git push origin <HEAD>:zailon-addons-stable`.
  branch: 'zailon-addons-stable',
  /** Préfixe des chemins du catalogue dans le dépôt (racine du repository add-ons). */
  prefix: 'zailon-addons/',
} as const

export const OFFICIAL_ADDON_REPOSITORY_URL = `https://raw.githubusercontent.com/${ADDON_REPOSITORY.owner}/${ADDON_REPOSITORY.repo}/${ADDON_REPOSITORY.branch}/${ADDON_REPOSITORY.prefix}`

/** URL du catalogue officiel (spec §4, §23) — jamais fetché au boot. */
export const OFFICIAL_CATALOG_URL = `${OFFICIAL_ADDON_REPOSITORY_URL}catalog.json`

/** Vrai si le SHA-256 est réel (64 hex). */
export function hasRealAddonHash(sha256: string): boolean {
  return /^[0-9a-f]{64}$/i.test(sha256)
}

/**
 * Résout l'URL de téléchargement réelle (spec §2) : `BASE_URL + package` pour
 * le chemin relatif officiel, ou l'URL absolue `download` d'un catalogue
 * communautaire/dev. Ne renvoie JAMAIS une URL dérivée de l'ID ni une URL
 * `releases/latest`.
 */
export function resolveAddonDownloadUrl(entry: AddonCatalogEntry): string | undefined {
  if (entry.package) return `${OFFICIAL_ADDON_REPOSITORY_URL}${entry.package}`
  if (entry.download && /^https:\/\//i.test(entry.download) && !entry.download.includes('/releases/latest/')) return entry.download
  return undefined
}

export type AddonAvailabilityStatus = 'available' | 'development' | 'error'

export interface AddonAvailability {
  /** Un package téléchargeable réel existe (bouton Installer autorisé). */
  installable: boolean
  /** Statut principal de la carte (spec §49). */
  status: AddonAvailabilityStatus
  /** Raison lisible si non installable (bulle ⓘ). */
  reason?: string
  /** URL de téléchargement réelle (si installable). */
  downloadUrl?: string
}

/**
 * Disponibilité réelle d'une entrée (spec §5, §49) : installable seulement si
 * le catalogue déclare un package. Pas de package → « En développement »
 * (aucun bouton Installer, aucune requête 404). Package déclaré mais
 * irrésoluble / SHA manquant → « Erreur » (catalogue incohérent).
 */
export function catalogAddonAvailability(entry: AddonCatalogEntry): AddonAvailability {
  if (!entry.package) {
    return { installable: false, status: 'development', reason: 'En développement — aucun package construit pour cette version.' }
  }
  const downloadUrl = resolveAddonDownloadUrl(entry)
  if (!downloadUrl) {
    return { installable: false, status: 'error', reason: 'Package introuvable dans le catalogue.' }
  }
  if (entry.official && !hasRealAddonHash(entry.sha256 || '')) {
    return { installable: false, status: 'error', reason: 'Le SHA-256 officiel du package est manquant ou invalide.' }
  }
  return { installable: true, status: 'available', downloadUrl }
}

// ─────────────────────────────── Catalogue officiel ─────────────────────────

/**
 * Catalogue officiel de référence (spec §5, §79) — source de vérité :
 * `zailon-addons/catalog.json` à la racine du dépôt (importé, jamais
 * dupliqué). Utilisé comme cache hors ligne (§6) ; en production, ZAILON
 * télécharge catalog.json depuis le repository statique et fusionne avec ce
 * fallback. Les entrées `package: null` sont en développement — aucun bouton
 * Installer tant qu'un vrai `.zailon-addon` n'est pas committé (spec §5,
 * §49).
 */
// Les entrées JSON sont toutes officielles (`official: true` implicite) — le
// cast passe par `unknown` car le fichier ne répète pas le champ par entrée.
export const OFFICIAL_ADDON_CATALOG: AddonCatalog = officialCatalogJson as unknown as AddonCatalog
