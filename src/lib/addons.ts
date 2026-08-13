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
import officialCatalogJson from './official-addon-catalog.json' with { type: 'json' }

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

export interface AddonReleaseMeta {
  /** Repository GitHub de la release (ex. `N7T0-OF/zailon-addons`). */
  repository: string
  /** Tag explicite de la release (ex. `frosty-v1.0.0`) — jamais `latest` (§3). */
  tag: string
  /** Nom EXACT de l'asset publié (ex. `official.zailon.frosty-v1.0.0.zailon-addon`) —
   * jamais déduit de l'ID (§12). */
  asset: string
}

export interface AddonCatalogEntry {
  id: string
  name: string
  version: string
  category: AddonCategory
  size: number
  sha256: string
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
  official: boolean
  /** Un package RÉEL est publié (spec §13, §25-27) : false = planifié, jamais
   * de bouton Installer. `available` n'est pas déduit — le catalogue l'écrit. */
  available?: boolean
  /** Métadonnées de release GitHub (spec §2-4) — la SEULE source de l'URL de
   * téléchargement. Jamais d'URL construite à la volée depuis l'ID (§2, §39). */
  release?: AddonReleaseMeta
  /** Ancien format « URL directe » (compatibilité catalogues déjà publiés) —
   * accepté seulement si c'est une URL de release EXPLICITE (tag, jamais
   * `latest`, §3, §5). */
  download?: string
}

export interface AddonCatalog {
  schema: 1
  addons: AddonCatalogEntry[]
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

/** Valide un catalogue officiel (schema 1). Les entrées invalides sont rejetées. */
export function parseAddonCatalog(json: unknown): ParseCatalogResult {
  const errors: string[] = []
  if (typeof json !== 'object' || json === null) return { ok: false, errors: ['Catalogue non JSON.'] }
  const raw = json as Record<string, unknown>
  if (raw.schema !== 1) { errors.push(`Schema inattendu : ${String(raw.schema)}.`) }
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
      ['name', 'string'], ['version', 'string'], ['category', 'string'], ['size', 'number'],
      ['sha256', 'string'], ['minZailonVersion', 'string'],
      ['description', 'string'], ['permissions', 'object'],
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

    // Disponibilité réelle (spec §25) : booléen facultatif, non déduit.
    const available = typeof entry.available === 'boolean' ? entry.available : true

    // Métadonnées de release (spec §2-4) : repository/tag/asset non vides.
    // Un `release` invalide rend l'entrée non installable, jamais 404 au
    // téléchargement.
    let release: AddonReleaseMeta | undefined
    if (entry.release !== undefined) {
      if (typeof entry.release !== 'object' || entry.release === null) {
        errors.push(`[${id}] release doit être un objet.`)
        valid = false
      } else {
        const meta = entry.release as Record<string, unknown>
        const repository = typeof meta.repository === 'string' ? meta.repository.trim() : ''
        const tag = typeof meta.tag === 'string' ? meta.tag.trim() : ''
        const asset = typeof meta.asset === 'string' ? meta.asset.trim() : ''
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
          errors.push(`[${id}] release.repository invalide.`)
          valid = false
        }
        if (!/^[A-Za-z0-9._-]+$/.test(tag) || tag.toLocaleLowerCase() === 'latest') {
          errors.push(`[${id}] release.tag invalide (espaces interdits, tag \`latest\` interdit).`)
          valid = false
        }
        if (!/^[A-Za-z0-9._-]+\.zailon-addon$/.test(asset)) {
          errors.push(`[${id}] release.asset invalide (doit être un .zailon-addon).`)
          valid = false
        }
        if (valid) release = { repository, tag, asset }
      }
    }

    // URL directe de l'ancien format (compat) : acceptée seulement si explicite
    // (tag) — jamais une URL `latest/download` (§3, §39).
    let download: string | undefined
    if (typeof entry.download === 'string' && entry.download.trim().length > 0) {
      download = entry.download.trim()
    }

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
      addons.push({
        id: id as string,
        name: entry.name as string,
        version: entry.version as string,
        category: category as AddonCategory,
        size: entry.size as number,
        sha256: entry.sha256 as string,
        minZailonVersion: entry.minZailonVersion as string,
        maxZailonVersion: typeof entry.maxZailonVersion === 'string' ? entry.maxZailonVersion : undefined,
        minAddonApiVersion: typeof entry.minAddonApiVersion === 'string' ? entry.minAddonApiVersion : undefined,
        permissions,
        description: entry.description as string,
        dependencies: Array.isArray(entry.dependencies) ? (entry.dependencies as string[]).filter(isValidAddonId) : undefined,
        optionalDependencies: Array.isArray(entry.optionalDependencies) ? (entry.optionalDependencies as string[]).filter(isValidAddonId) : undefined,
        signature: hasSignature ? (entry.signature as string) : undefined,
        signaturePublicKey: hasSignature ? (entry.signaturePublicKey as string) : undefined,
        official: true,
        available,
        release,
        download,
      })
    }
  }

  if (errors.length > 0 && addons.length === 0) return { ok: false, errors }
  return { ok: true, catalog: { schema: 1, addons }, errors }
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

// ──────────────────────── Résolution de release + disponibilité ─────────────
// Spec §2-5, §13, §25-27, §49 : le bouton « Installer » n'existe QUE si un
// package réel est référencé par le catalogue (release explicite avec tag +
// asset exact) et, pour les officiels, si le SHA-256 réel est publié. Jamais
// d'URL construite à la volée depuis l'ID — c'est la règle qui évite les 404.

/** Vrai si le SHA-256 est réel (pas le placeholder 'catalog' de référence). */
export function hasRealAddonHash(sha256: string): boolean {
  return Boolean(sha256 && sha256 !== 'catalog')
}

/** Vrai si l'URL est une URL de release GitHub EXPLICITE (tag + asset), jamais
 * `latest/download` (spec §3, §39) — les URL `latest` sont fragiles : une
 * release suivante casse l'installation d'une version ancienne. */
export function isExplicitReleaseUrl(url: string): boolean {
  if (!/^https:\/\/github\.com\//i.test(url)) return false
  if (url.includes('/releases/latest/download/')) return false
  const match = /\/releases\/download\/([^/]+)\/[^/]+$/.exec(url)
  if (!match) return false
  return match[1].toLocaleLowerCase() !== 'latest'
}

/**
 * Résout l'URL de téléchargement réelle d'une entrée (spec §2-5) : depuis les
 * métadonnées `release` (recommandé) ou une URL directe explicite de l'ancien
 * format. Ne renvoie JAMAIS une URL dérivée de l'ID ni une URL `latest`.
 */
export function resolveAddonDownloadUrl(entry: AddonCatalogEntry): string | undefined {
  if (entry.release && entry.release.tag.toLocaleLowerCase() !== 'latest') {
    return `https://github.com/${entry.release.repository}/releases/download/${entry.release.tag}/${entry.release.asset}`
  }
  if (entry.download && isExplicitReleaseUrl(entry.download)) return entry.download
  return undefined
}

export interface AddonAvailability {
  /** Un package téléchargeable réel existe (bouton Installer autorisé). */
  installable: boolean
  /** Le package est marqué publié dans le catalogue (spec §25). */
  published: boolean
  /** Raison lisible si non installable (tooltip / panneau). */
  reason?: string
  /** URL de téléchargement réelle (si installable). */
  downloadUrl?: string
}

/**
 * Disponibilité réelle d'une entrée de catalogue (spec §13, §25-27, §49) :
 * installable seulement si le catalogue déclare un package publié (release
 * explicite) et que le SHA-256 réel est fourni pour les officiels (§20).
 * Un add-on planifié n'a JAMAIS de bouton Installer.
 */
export function catalogAddonAvailability(entry: AddonCatalogEntry): AddonAvailability {
  // « Non publié » : la fiche existe dans le catalogue mais aucun package
  // téléchargeable n'a encore été publié (spec §16-17). Jamais de doublon
  // « En développement + Indisponible ».
  if (entry.available === false) {
    return { installable: false, published: false, reason: 'Non publié — cette version possède une fiche dans le catalogue, mais aucun package téléchargeable n’a encore été publié.' }
  }
  const downloadUrl = resolveAddonDownloadUrl(entry)
  // « Erreur de publication » : le catalogue marque l'add-on publié mais les
  // métadonnées de release manquent — incohérence du catalogue, jamais
  // confondue avec un add-on simplement non publié (spec §20-21).
  if (!downloadUrl) {
    return { installable: false, published: true, reason: 'Erreur de publication — le catalogue marque cet add-on publié mais aucune release explicite n’est définie.' }
  }
  if (entry.official && !hasRealAddonHash(entry.sha256)) {
    return { installable: false, published: true, reason: 'Erreur de publication — le SHA-256 officiel du package n’est pas encore publié.' }
  }
  return { installable: true, published: true, downloadUrl }
}

// ─────────────────────────────── Catalogue officiel ─────────────────────────

/**
 * Catalogue officiel de référence (spec §5, §79) — source de vérité :
 * `src/lib/official-addon-catalog.json` (importé, jamais dupliqué). Utilisé
 * comme cache hors ligne (§6) ; en production, ZAILON télécharge catalog.json
 * depuis le repository officiel et fusionne avec ce fallback. Les entrées
 * `available: false` sont planifiées — aucune URL de package avant qu'un vrai
 * `.zailon-addon` ne soit publié (spec §13, §25-27, §49).
 */
// Les entrées JSON sont toutes officielles (`official: true` implicite) — le
// cast passe par `unknown` car le fichier ne répète pas le champ par entrée.
export const OFFICIAL_ADDON_CATALOG: AddonCatalog = officialCatalogJson as unknown as AddonCatalog
