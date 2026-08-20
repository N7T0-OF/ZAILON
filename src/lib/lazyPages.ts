/**
 * Lazy loading des pages (spec Startup §16-20).
 *
 * - La santé des providers (Nexus, GameBanana, CurseForge, SteamGridDB, IGDB)
 *   n'est JAMAIS testée au boot : on réutilise le dernier état connu pendant
 *   un TTL, puis on rafraîchit uniquement à l'ouverture d'Explorer /
 *   Intégrations ou sur refresh manuel (§20).
 * - Les initialisations non critiques d'une page sont exécutées après le
 *   premier paint (requestIdleCallback avec repli setTimeout) : la vue
 *   s'affiche instantanément avec son squelette, puis charge ses données.
 */

/** Durée de validité d'un état de santé provider (ms) — 5 minutes. */
export const PROVIDER_HEALTH_TTL_MS = 5 * 60 * 1000

import type { ProviderConnectionStatus } from './native'

export interface ProviderHealthEntry<T> {
  value: T
  checkedAt: number
}

/**
 * Cache de santé des providers (§20) : une seule source, partagée entre les
 * pages (Explorer, Intégrations). Hors TTL, le getter natif est rappelé.
 */
export class ProviderHealthCache<T> {
  private readonly ttlMs: number
  private readonly now: () => number
  private entry?: ProviderHealthEntry<T>

  constructor(ttlMs: number = PROVIDER_HEALTH_TTL_MS, now: () => number = Date.now) {
    this.ttlMs = ttlMs
    this.now = now
  }

  /** Valeur en cache si encore fraîche, sinon undefined (→ appeler refresh). */
  get(): T | undefined {
    const entry = this.entry
    if (!entry) return undefined
    if (this.now() - entry.checkedAt >= this.ttlMs) return undefined
    return entry.value
  }

  set(value: T): void {
    this.entry = { value, checkedAt: this.now() }
  }

  /** Force un re-test au prochain accès (refresh manuel, §20). */
  invalidate(): void {
    this.entry = undefined
  }

  /** Âge de la valeur en cache (ms) ; -1 si aucune valeur. */
  age(): number {
    return this.entry ? this.now() - this.entry.checkedAt : -1
  }

  /** Fraîche : valeur présente et dans le TTL. */
  get isFresh(): boolean {
    return this.get() !== undefined
  }
}

/**
 * Singleton partagé entre Explorer et Intégrations (§20) : un seul état de
 * santé par processus — ouvrir les deux pages n'appelle plus qu'une fois le
 * getter natif dans le TTL de 5 minutes.
 */
export const providerHealthCache = new ProviderHealthCache<Record<string, ProviderConnectionStatus>>()

/**
 * Lit la santé des providers en réutilisant le cache : un seul état par
 * processus, partagé entre toutes les pages. Le getter natif n'est appelé que
 * hors TTL — ouvrir Explorer puis Intégrations ne déclenche plus deux IPC.
 */
export function cachedProviderStatuses<T>(
  cache: ProviderHealthCache<T>,
  fetchStatuses: () => Promise<T>,
): Promise<T> {
  const fresh = cache.get()
  if (fresh !== undefined) return Promise.resolve(fresh)
  return fetchStatuses().then(value => {
    cache.set(value)
    return value
  })
}

/**
 * Exécute une initialisation non critique après le premier paint
 * (requestIdleCallback, repli setTimeout ~200 ms). Jamais bloquant.
 */
export function scheduleAfterIdle(task: () => void, fallbackDelayMs = 200): () => void {
  let cancelled = false
  const run = () => {
    if (!cancelled) task()
  }
  const globalScope = globalThis as { requestIdleCallback?: (callback: () => void) => number }
  if (typeof globalScope.requestIdleCallback === 'function') {
    const handle = globalScope.requestIdleCallback(run)
    return () => {
      cancelled = true
      if (typeof (globalScope as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback === 'function') {
        ;(globalScope as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(handle)
      }
    }
  }
  const timer = globalThis.setTimeout(run, fallbackDelayMs)
  return () => {
    cancelled = true
    globalThis.clearTimeout(timer)
  }
}

/** Construit un nombre de blocs squelette (stable, borné). */
export function skeletonCount(count: number, min = 1, max = 12): number {
  if (!Number.isFinite(count)) return min
  return Math.min(max, Math.max(min, Math.floor(count)))
}
