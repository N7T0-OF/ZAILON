/**
 * Orchestration de l'installation des add-ons (spec §14-15, §65).
 *
 * Pipeline : téléchargement (HTTPS) → vérification SHA-256 → signature Ed25519
 * (si déclarée) → extraction en staging → swap atomique → vérification de
 * santé → terminé. En cas d'échec, rollback (l'ancien répertoire est restauré
 * côté natif). La machine à états est pure et testable ; l'orchestrateur
 * appelle les commandes natives.
 */

import { ADDON_INSTALL_PHASES, estimateInstalledSize, OFFICIAL_CATALOG_URL, parseAddonCatalog, type AddonCatalog, type AddonCatalogEntry, type InstalledAddon, type ParseCatalogResult } from './addons.ts'

export { OFFICIAL_CATALOG_URL } from './addons.ts'
import type { AddonInstallPhase } from './addons.ts'

// ─────────────────────────────── Machine à états ────────────────────────────

export type AddonInstallRunStatus = 'running' | 'done' | 'failed' | 'rolled_back'

export interface AddonInstallRunState {
  status: AddonInstallRunStatus
  phase: AddonInstallPhase | 'cleanup'
  progress: number
  message: string
}

export type AddonInstallEvent =
  | { type: 'phase'; phase: AddonInstallPhase | 'cleanup'; message: string }
  | { type: 'progress'; progress: number }
  | { type: 'done' }
  | { type: 'failed'; message: string }
  | { type: 'rolled_back'; message: string }

// ─────────────────────────── Politique de confiance ─────────────────────────
// Spec « Finalisation des add-ons » §17-24 : le SHA-256 garantit l'intégrité,
// la signature Ed25519 garantit l'origine. Pour v1 du système : un add-on
// OFFICIEL (dépôt officiel + manifest valide + SHA-256 réel vérifié) est
// INSTALLABLE SANS signature — la signature est recommandée mais PAS
// obligatoire (elle sera vérifiée quand elle est déclarée). Seuls restent des
// motifs de refus : hash incorrect, manifest invalide, package corrompu,
// incompatibilité, path traversal, permission interdite, dépendance invalide.

/** Niveau de confiance d'une entrée (spec §19). */
export type AddonTrustLevel =
  | 'official-verified-hash'
  | 'official-signed'
  | 'community-signed'
  | 'community-unsigned'

/** Vrai si l'entrée déclare une signature utilisable (signature + clé). */
export function hasAddonSignature(entry: Pick<AddonCatalogEntry, 'signature' | 'signaturePublicKey'>): boolean {
  return Boolean(entry.signature && entry.signaturePublicKey)
}

/** Vrai si le SHA-256 est réel (pas le placeholder 'catalog' de référence). */
export function hasRealSha256(entry: Pick<AddonCatalogEntry, 'sha256'>): boolean {
  return Boolean(entry.sha256 && entry.sha256 !== 'catalog')
}

/** Niveau de confiance (spec §19) — pur, testable. */
export function addonTrustLevel(entry: Pick<AddonCatalogEntry, 'official' | 'signature' | 'signaturePublicKey'>): AddonTrustLevel {
  if (entry.official) return hasAddonSignature(entry) ? 'official-signed' : 'official-verified-hash'
  return hasAddonSignature(entry) ? 'community-signed' : 'community-unsigned'
}

export interface AddonSignaturePolicy {
  /** Une signature doit être présente pour installer. */
  required: boolean
  /** Niveau de confiance effectif de l'entrée (spec §19). */
  trust: AddonTrustLevel
  /** Raison lisible de la politique. */
  reason: string
}

/** Politique de confiance d'une entrée de catalogue (pur, testable). */
export function addonSignaturePolicy(entry: Pick<AddonCatalogEntry, 'official' | 'sha256' | 'signature' | 'signaturePublicKey'>): AddonSignaturePolicy {
  if (entry.official && hasRealSha256(entry)) {
    return hasAddonSignature(entry)
      ? { required: true, trust: 'official-signed', reason: 'Signature officielle déclarée — vérifiée avant installation.' }
      : { required: false, trust: 'official-verified-hash', reason: 'Add-on officiel vérifié par SHA-256 (dépôt officiel + manifest valide) — la signature cryptographique est recommandée mais pas obligatoire (v1, spec §17-20).' }
  }
  if (hasAddonSignature(entry)) {
    return { required: false, trust: 'community-signed', reason: 'Signature déclarée — vérifiée avant installation.' }
  }
  if (entry.official) {
    return { required: false, trust: 'official-verified-hash', reason: 'Catalogue de référence (SHA-256 en attente) — la signature sera vérifiée quand le package réel sera publié.' }
  }
  return { required: false, trust: 'community-unsigned', reason: 'Add-on communautaire — signature facultative (permissions affichées avant installation).' }
}

const PHASE_INDEX = new Map(ADDON_INSTALL_PHASES.map((phase, index) => [phase, index]))

export const ADDON_INSTALL_INITIAL_STATE: AddonInstallRunState = {
  status: 'running',
  phase: 'download',
  progress: 0,
  message: 'Téléchargement…',
}

/**
 * Réducteur pur du pipeline d'installation : chaque événement fait avancer la
 * machine ; `failed` / `rolled_back` sont des états terminaux.
 */
export function addonInstallReducer(state: AddonInstallRunState, event: AddonInstallEvent): AddonInstallRunState {
  switch (event.type) {
    case 'phase': {
      const current = PHASE_INDEX.get(state.phase) ?? 0
      const next = PHASE_INDEX.get(event.phase) ?? 0
      return {
        status: 'running',
        phase: event.phase,
        progress: next > current ? Math.max(state.progress, next / ADDON_INSTALL_PHASES.length) : state.progress,
        message: event.message,
      }
    }
    case 'progress':
      return { ...state, progress: Math.min(0.95, Math.max(state.progress, event.progress)) }
    case 'done':
      return { ...state, status: 'done', progress: 1, message: 'Installé.' }
    case 'failed':
      return { ...state, status: 'failed', message: event.message }
    case 'rolled_back':
      return { ...state, status: 'rolled_back', message: event.message }
  }
}

// ─────────────────────────────── Catalogue distant ──────────────────────────
// Spec « Simplification totale » §1-5 : AUCUNE GitHub Release. Le catalogue
// officiel est servi en contenu brut depuis le repository statique
// (`OFFICIAL_CATALOG_URL` défini dans addons.ts) ; la source embarquée
// (`OFFICIAL_ADDON_CATALOG`) sert de fallback hors ligne (spec §6).

const OFFICIAL_CATALOG_HOSTS = ['raw.githubusercontent.com', 'github.com']

export function isOfficialCatalogUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false
  try {
    const host = new URL(url).hostname
    return OFFICIAL_CATALOG_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed))
  } catch {
    return false
  }
}

/** URL de téléchargement sûre : HTTPS, sans identifiants, hôte non vide. */
export function isSafeDownloadUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) return false
    return parsed.hostname.includes('.')
  } catch {
    return false
  }
}

export interface CatalogFetchResult {
  catalog: AddonCatalog
  source: 'remote' | 'cache' | 'fallback'
  errors: string[]
  /** Horodatage de la dernière synchronisation réseau (spec §35). */
  fetchedAt?: number
}

/**
 * Fusionne le catalogue distant avec le fallback hors ligne (spec §6) : les
 * entrées distantes priment sur le même ID, les entrées du fallback absentes
 * du distant restent disponibles hors ligne.
 */
export function mergeCatalogs(remote: AddonCatalog, fallback: AddonCatalog): AddonCatalog {
  const byId = new Map<string, AddonCatalogEntry>()
  for (const entry of fallback.addons) byId.set(entry.id, entry)
  for (const entry of remote.addons) byId.set(entry.id, entry)
  return { schema: 2, addons: [...byId.values()] }
}

/**
 * Récupère le catalogue : cache localStorage d'abord (s'il existe), puis
 * réseau (validé), sinon le fallback hors ligne. Jamais d'échec bloquant —
 * ZAILON fonctionne sans Internet (§6).
 */
export async function fetchAddonCatalog(options: {
  url?: string
  fallback: AddonCatalog
  fetchJson: (url: string) => Promise<unknown>
  readCache: () => AddonCatalog | undefined
  writeCache: (catalog: AddonCatalog) => void
  /** Âge max du cache (ms) avant revalidation réseau (défaut : 6 h). */
  maxAgeMs?: number
  /** Ignore le cache même s'il est frais (bouton « Actualiser », spec §34). */
  force?: boolean
}): Promise<CatalogFetchResult> {
  const url = options.url || OFFICIAL_CATALOG_URL
  const maxAgeMs = options.maxAgeMs ?? 6 * 60 * 60 * 1000

  if (isOfficialCatalogUrl(url)) {
    const cached = options.readCache()
    // Cache frais → réponse instantanée ; cache périmé → revalidation réseau.
    // `force` (Actualiser, spec §34) court-circuite toujours le cache — sinon
    // un ancien catalogue (schema 1, chemins `release`/URL 404) ne serait
    // jamais rafraîchi (spec §47 : invalider l'ancien cache).
    if (cached && cached.schema === 2 && !options.force) {
      const age = Date.now() - (cached.fetchedAt ?? 0)
      if (age < maxAgeMs) return { catalog: cached, source: 'cache', errors: [], fetchedAt: cached.fetchedAt }
    }
  }

  if (isOfficialCatalogUrl(url)) {
    try {
      const json = await options.fetchJson(url)
      const parsed = parseAddonCatalog(json)
      if (parsed.ok && parsed.catalog) {
        const merged = mergeCatalogs(parsed.catalog, options.fallback)
        const stamped = { ...merged, fetchedAt: Date.now() }
        options.writeCache(stamped)
        return { catalog: stamped, source: 'remote', errors: parsed.errors, fetchedAt: stamped.fetchedAt }
      }
      return { catalog: options.fallback, source: 'fallback', errors: parsed.errors }
    } catch (reason) {
      const cached = options.readCache()
      if (cached) return { catalog: cached, source: 'cache', errors: [messageOf(reason)] }
      return { catalog: options.fallback, source: 'fallback', errors: [messageOf(reason)] }
    }
  }

  // URL non officielle (add-on communautaire en développement) : parse direct,
  // sans cache persistant.
  try {
    const json = await options.fetchJson(url)
    const parsed = parseAddonCatalog(json)
    if (parsed.ok && parsed.catalog) return { catalog: parsed.catalog, source: 'remote', errors: parsed.errors, fetchedAt: Date.now() }
    return { catalog: options.fallback, source: 'fallback', errors: parsed.errors }
  } catch (reason) {
    return { catalog: options.fallback, source: 'fallback', errors: [messageOf(reason)] }
  }
}

const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

// ─────────────────────────────── Erreurs de téléchargement ──────────────────
// Spec §23, §40-41 : un 404 = package ABSENT (aucun retry, affiché
// immédiatement) ; 403/429 = GitHub temporairement limité (retry plus tard) ;
// sinon erreur réseau générique. Les détails techniques passent dans ⓘ.

export interface AddonDownloadErrorInfo {
  title: string
  detail?: string
  /** Vrai si un retry a du sens (jamais pour 404 — spec §40). */
  retryable: boolean
}

/** Classe une erreur de téléchargement d'add-on (pur, testable). */
export function describeAddonDownloadError(raw: string): AddonDownloadErrorInfo {
  // Spec « Pipeline » §1 : un `.zailon-addon` doit être un VRAI ZIP. Un HTML/
  // JSON d'erreur GitHub ou un fichier corrompu n'est jamais accepté comme
  // package — erreur explicite, pas un message de décompression brut.
  if (/zip|archive|html|error page|invalide|corrupt/i.test(raw)) {
    return {
      title: 'Archive invalide',
      detail: 'L’archive de l’add-on est invalide ou le téléchargement GitHub n’a pas renvoyé une archive ZIP. Le fichier reçu n’est pas un ZIP valide (page d’erreur HTML ou package corrompu).',
      retryable: true,
    }
  }
  if (/404|not found/i.test(raw)) {
    return {
      title: 'Package introuvable',
      detail: 'Le package référencé par le catalogue est absent du repository (404). Actualisez le catalogue ou importez le fichier manuellement.',
      retryable: false,
    }
  }
  if (/403|429|rate limit/i.test(raw)) {
    return {
      title: 'GitHub temporairement indisponible',
      detail: 'La limite de requêtes GitHub a été atteinte. Réessayez plus tard.',
      retryable: true,
    }
  }
  return {
    title: 'Impossible d’installer l’add-on',
    detail: raw,
    retryable: true,
  }
}

/**
 * URL miroir CDN d'un package officiel (spec §7) : le contenu statique GitHub
 * est répliqué sur jsDelivr (`@branch` au lieu de la branche) — utilisé en
 * repli quand l'URL principale échoue ou sert un contenu invalide. Pur, testé.
 */
export function mirrorAddonUrl(url: string): string | undefined {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.exec(url)
  if (!match) return undefined
  const [, owner, repo, branch, path] = match
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`
}

// ─────────────────────────────── Rapport de stockage ────────────────────────

export interface AddonStorageRow {
  id: string
  name: string
  installedBytes: number
}

export interface AddonStorageReport {
  rows: AddonStorageRow[]
  totalBytes: number
  /** Éléments de cache nettoyables (spec §72, §74). */
  cacheBytes: number
}

/** Rapport de stockage par add-on (spec §72) : taille installée estimée + cache. */
export function addonStorageReport(
  installed: InstalledAddon[],
  options: { knownSizes?: Record<string, number>; cacheEntries?: Array<{ id: string; bytes: number }> } = {},
): AddonStorageReport {
  const known = options.knownSizes || {}
  const rows: AddonStorageRow[] = installed.map(item => {
    const downloadSize = known[item.manifest.id] || 1_000_000
    return { id: item.manifest.id, name: item.manifest.name, installedBytes: estimateInstalledSize(downloadSize) }
  })
  const totalBytes = rows.reduce((sum, row) => sum + row.installedBytes, 0)
  const cacheBytes = (options.cacheEntries || []).reduce((sum, entry) => sum + entry.bytes, 0)
  return { rows, totalBytes, cacheBytes }
}

/** Parse d'un résultat de catalogue (réexport de confort). */
export function parseCatalogResult(json: unknown): ParseCatalogResult {
  return parseAddonCatalog(json)
}
