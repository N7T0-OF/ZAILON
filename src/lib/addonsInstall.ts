/**
 * Orchestration de l'installation des add-ons (spec §14-15, §65).
 *
 * Pipeline : téléchargement (HTTPS) → vérification SHA-256 → extraction en
 * staging → swap atomique → vérification de santé → terminé. En cas d'échec,
 * rollback (l'ancien répertoire est restauré côté natif). La machine à états
 * est pure et testable ; l'orchestrateur appelle les commandes natives.
 */

import { ADDON_INSTALL_PHASES, estimateInstalledSize, parseAddonCatalog, type AddonCatalog, type AddonCatalogEntry, type InstalledAddon, type ParseCatalogResult } from './addons.ts'
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

/** Source officielle du catalogue (spec §5, §9) — jamais de mirror tiers. */
export const OFFICIAL_CATALOG_URL = 'https://raw.githubusercontent.com/N7T0-OF/zailon-addons/main/catalog.json'

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
  return { schema: 1, addons: [...byId.values()] }
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
}): Promise<CatalogFetchResult> {
  const url = options.url || OFFICIAL_CATALOG_URL

  if (isOfficialCatalogUrl(url)) {
    const cached = options.readCache()
    if (cached && cached.schema === 1) return { catalog: cached, source: 'cache', errors: [] }
  }

  if (isOfficialCatalogUrl(url)) {
    try {
      const json = await options.fetchJson(url)
      const parsed = parseAddonCatalog(json)
      if (parsed.ok && parsed.catalog) {
        const merged = mergeCatalogs(parsed.catalog, options.fallback)
        options.writeCache(merged)
        return { catalog: merged, source: 'remote', errors: parsed.errors }
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
    if (parsed.ok && parsed.catalog) return { catalog: parsed.catalog, source: 'remote', errors: parsed.errors }
    return { catalog: options.fallback, source: 'fallback', errors: parsed.errors }
  } catch (reason) {
    return { catalog: options.fallback, source: 'fallback', errors: [messageOf(reason)] }
  }
}

const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

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
