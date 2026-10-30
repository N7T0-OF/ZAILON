/**
 * SDK d'extensions ZAILON (spec §19, §25-28, §69-71).
 *
 * Les add-ons n'importent JAMAIS les composants internes privés : ils passent
 * par des interfaces publiques versionnées (Addon API v1, §24-25). Chaque
 * appel de service est filtré par les permissions déclarées dans le manifest
 * (§11-13). Le chargement est lazy (§19) et un module qui échoue à
 * s'activer est désactivé sans bloquer ZAILON (§21).
 *
 * Cette lib est pure (aucun import natif) — les contrats et la machinerie
 * (gate, bus, registres, cycle de vie) sont testables sans exécution de code
 * add-on.
 */

import {
  ADDON_API_VERSION,
  ADDON_EVENTS,
  ADDON_LAZY_EVENTS,
  recordAddonCrash,
  type AddonEvent,
  type AddonPermission,
  type CrashGuardStorage,
  type ZailonAddonManifest,
} from './addons.ts'

// ─────────────────────────────── Services publics ───────────────────────────

/**
 * Surface publique minimale exposée aux add-ons (§25). Chaque méthode est
 * implémentée par le Core derrière la gate de permissions — jamais de
 * composant interne privé.
 */
export interface GameService {
  list(): unknown
  read(id: string): unknown
}
export interface ProfileService {
  list(gameId: string): unknown
  read(gameId: string, profileId: string): unknown
}
export interface ModService {
  list(gameId: string, profileId: string): unknown
}
export interface LaunchService {
  launch(gameId: string, profileId: string): Promise<void>
}
export interface SettingsService {
  get(key: string): unknown
  set(key: string, value: unknown): void
}
export interface ProviderService {
  search(query: string): Promise<unknown[]>
}
export interface UIExtensionService {
  register(slot: UIExtensionSlot, render: () => unknown): { unregister: () => void }
}

/** Contexte d'exécution d'un add-on — versionné (spec §24). */
export interface ZailonAddonApi {
  apiVersion: typeof ADDON_API_VERSION
  manifest: ZailonAddonManifest
  services: {
    games: GameService
    profiles: ProfileService
    mods: ModService
    launch: LaunchService
    settings: SettingsService
    provider: ProviderService
    ui: UIExtensionService
  }
  events: AddonEventBus
  /** Enregistre une extension UI sur un emplacement défini (§27). */
  extend(slot: UIExtensionSlot, render: () => unknown): { unregister: () => void }
  /** Stockage de données add-on (séparé du code, §16). */
  storage: AddonStorageApi
  log(message: string): void
}

export interface AddonStorageApi {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  remove(key: string): void
}

// ─────────────────────────────── Gate de permissions ────────────────────────

export type ServiceName = keyof ZailonAddonApi['services'] | 'storage' | 'events'

const PERMISSION_FOR_SERVICE: Record<Exclude<ServiceName, 'events'>, AddonPermission | undefined> = {
  games: 'game.read',
  profiles: 'profile.read',
  mods: 'mods.read',
  launch: 'game.launch',
  settings: 'settings',
  provider: 'provider',
  ui: 'ui.extend',
  storage: 'settings',
}

/** Lève une erreur si le service n'est pas couvert par les permissions (§11). */
export function assertServicePermission(permissions: AddonPermission[], service: ServiceName): void {
  if (service === 'events') return
  const required = PERMISSION_FOR_SERVICE[service]
  if (required && !permissions.includes(required)) {
    throw new Error(`Permission manquante : « ${required} » est requis pour utiliser « ${service} ».`)
  }
}

// ─────────────────────────────── Bus d'événements ───────────────────────────

export type AddonEventHandler = (payload: unknown) => void | Promise<void>

export interface AddonEventBus {
  on(event: AddonEvent, handler: AddonEventHandler): () => void
  emit(event: AddonEvent, payload?: unknown): void
}

/**
 * Bus d'événements (§70) : les add-ons s'abonnent uniquement aux événements
 * nécessaires. L'abonnement à OnZailonStarted est signalé (startup — jamais
 * la règle, §69).
 */
export function createAddonEventBus(): AddonEventBus {
  const handlers = new Map<AddonEvent, Set<AddonEventHandler>>()
  return {
    on(event, handler) {
      let set = handlers.get(event)
      if (!set) { set = new Set(); handlers.set(event, set) }
      set.add(handler)
      return () => { set?.delete(handler) }
    },
    emit(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) {
        // Un handler qui échoue (sync ou async) ne bloque jamais les autres
        // ni le Core — isolation totale (§21).
        try {
          Promise.resolve(handler(payload)).catch(() => undefined)
        } catch {
          /* handler synchrone fautif isolé */
        }
      }
    },
  }
}

/** Événements lazy autorisés (§69) — OnZailonStarted reste restreint. */
export function isLazyEvent(event: AddonEvent): boolean {
  return ADDON_LAZY_EVENTS.includes(event)
}

export function assertLazyEvents(manifest: ZailonAddonManifest): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  for (const event of manifest.events || []) {
    if (event === 'OnZailonStarted') {
      errors.push('OnZailonStarted est restreint : privilégiez un événement à la demande (§69).')
    } else if (!isLazyEvent(event)) {
      errors.push(`Événement inconnu : ${event}.`)
    }
  }
  return { ok: errors.length === 0, errors }
}

// ─────────────────────────────── Slots UI ───────────────────────────────────

/** Emplacements UI définis (§26-27) — jamais de modification arbitraire du DOM. */
export const UI_EXTENSION_SLOTS = [
  'GameSettings.ModBackend',
  'GameSettings.Visual',
  'GameDiagnostics',
  'ProfileTools',
  'QuickPanel.Visual',
  'Explorer',
  'ContextMenu',
] as const

export type UIExtensionSlot = typeof UI_EXTENSION_SLOTS[number]

export interface UiExtensionRegistration {
  addonId: string
  slot: UIExtensionSlot
  render: () => unknown
}

/** Registre des extensions UI : un emplacement défini par add-on (§27-28). */
export class UiExtensionRegistry {
  private readonly registrations = new Map<string, UiExtensionRegistration>()

  register(addonId: string, slot: UIExtensionSlot, render: () => unknown): { unregister: () => void } {
    const key = `${addonId}::${slot}`
    this.registrations.set(key, { addonId, slot, render })
    return {
      unregister: () => { this.registrations.delete(key) },
    }
  }

  forSlot(slot: UIExtensionSlot): UiExtensionRegistration[] {
    return [...this.registrations.values()].filter(registration => registration.slot === slot)
  }

  forAddon(addonId: string): UiExtensionRegistration[] {
    return [...this.registrations.values()].filter(registration => registration.addonId === addonId)
  }

  /** Libère toutes les extensions d'un add-on (désactivation/désinstallation). */
  releaseAddon(addonId: string): number {
    let removed = 0
    for (const key of [...this.registrations.keys()]) {
      if (this.registrations.get(key)?.addonId === addonId) {
        this.registrations.delete(key)
        removed += 1
      }
    }
    return removed
  }
}

// ─────────────────────────────── Cycle de vie ───────────────────────────────

/** Module d'add-on : le contrat de point d'entrée (manifest.entrypoint). */
export interface AddonModule {
  activate(api: ZailonAddonApi): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export interface AddonRuntimeState {
  id: string
  state: 'idle' | 'loaded' | 'active' | 'error' | 'disabled'
  error?: string
  lastActivatedAt?: number
  lastEvent?: AddonEvent
}

export interface AddonLifecycleEvents {
  onStateChange?: (state: AddonRuntimeState) => void
}

/**
 * Cycle de vie d'un add-on (§19, §21) : idle → loaded (lazy) → active sur
 * premier besoin → error (désactivé via le crash guard) → disabled.
 */
export class AddonLifecycle {
  private readonly states = new Map<string, AddonRuntimeState>()
  private readonly loaders = new Map<string, () => AddonModule | Promise<AddonModule>>()
  private readonly apis = new Map<string, ZailonAddonApi>()
  private readonly crashStorage: CrashGuardStorage
  private readonly events: AddonLifecycleEvents

  constructor(crashStorage: CrashGuardStorage, events: AddonLifecycleEvents = {}) {
    this.crashStorage = crashStorage
    this.events = events
  }

  /** Enregistre le chargeur lazy d'un add-on — jamais exécuté au démarrage. */
  registerLazy(addonId: string, loader: () => AddonModule | Promise<AddonModule>): void {
    this.loaders.set(addonId, loader)
    this.states.set(addonId, { id: addonId, state: 'idle' })
  }

  state(addonId: string): AddonRuntimeState | undefined {
    return this.states.get(addonId)
  }

  /** Charge l'add-on à la demande (premier événement/emplacement nécessaire). */
  async ensureLoaded(addonId: string): Promise<AddonRuntimeState> {
    const current = this.states.get(addonId)
    if (current && current.state !== 'idle' && current.state !== 'error') return current
    const loader = this.loaders.get(addonId)
    if (!loader) return { id: addonId, state: 'error', error: 'Aucun chargeur enregistré.' }
    try {
      const module = await loader()
      this.states.set(addonId, { id: addonId, state: 'loaded', lastEvent: 'OnDemand' })
      void module
      return this.states.get(addonId)!
    } catch (reason) {
      return this.fail(addonId, reason)
    }
  }

  /** Active le module (premier usage réel) — les erreurs désactivent (§21). */
  async activate(addonId: string, api: ZailonAddonApi): Promise<AddonRuntimeState> {
    const loaded = await this.ensureLoaded(addonId)
    if (loaded.state === 'error' || loaded.state === 'disabled') return loaded
    const loader = this.loaders.get(addonId)
    try {
      const module = loader ? await loader() : undefined
      await module?.activate(api)
      this.apis.set(addonId, api)
      const state: AddonRuntimeState = { id: addonId, state: 'active', lastActivatedAt: Date.now() }
      this.states.set(addonId, state)
      this.events.onStateChange?.(state)
      return state
    } catch (reason) {
      return this.fail(addonId, reason)
    }
  }

  /** Désactive proprement : deactivate, extensions UI libérées, données intactes. */
  async deactivate(addonId: string): Promise<void> {
    const state = this.states.get(addonId)
    if (!state || state.state === 'disabled') return
    const loader = this.loaders.get(addonId)
    try {
      const module = await loader?.()
      await module?.deactivate?.()
    } catch { /* la désactivation ne bloque jamais */ }
    this.states.set(addonId, { id: addonId, state: 'idle' })
  }

  private fail(addonId: string, reason: unknown): AddonRuntimeState {
    const message = reason instanceof Error ? reason.message : String(reason)
    // Crash guard : 2 échecs consécutifs → désactivé avec message (spec §21).
    const result = recordAddonCrash(addonId, this.crashStorage)
    const state: AddonRuntimeState = { id: addonId, state: result.disabled ? 'disabled' : 'error', error: result.message || message }
    this.states.set(addonId, state)
    this.events.onStateChange?.(state)
    return state
  }
}

// ─────────────────────────────── Contribution au démarrage ──────────────────

export interface StartupContributionEntry {
  addonId: string
  ms: number
}

export interface StartupContributionReport {
  coreMs: number
  addonsMs: number
  entries: StartupContributionEntry[]
}

/**
 * Mesure de contribution au démarrage (§68) : les add-ons doivent approcher
 * zéro grâce au lazy loading — ce rapport sert de diagnostic développeur.
 */
export class StartupContributionMonitor {
  private readonly entries: StartupContributionEntry[] = []

  record(addonId: string, ms: number): void {
    this.entries.push({ addonId, ms })
  }

  report(coreMs: number): StartupContributionReport {
    const addonsMs = this.entries.reduce((sum, entry) => sum + entry.ms, 0)
    return { coreMs, addonsMs, entries: [...this.entries] }
  }
}

// ─────────────────────────────── Construction de l'API ──────────────────────

/**
 * Construit l'API publique d'un add-on (versionnée) avec la gate de
 * permissions : tout service non déclaré lève une erreur au premier appel.
 */
export function createAddonApi(
  manifest: ZailonAddonManifest,
  implementations: {
    games: GameService
    profiles: ProfileService
    mods: ModService
    launch: LaunchService
    settings: SettingsService
    provider: ProviderService
  },
  bus: AddonEventBus,
  uiRegistry: UiExtensionRegistry,
  storage: AddonStorageApi,
  onLog?: (message: string) => void,
): ZailonAddonApi {
  // La gate de permissions agit à l'appel, pas à la construction : un add-on
  // aux permissions minimales ne s'active que s'il utilise réellement un
  // service non couvert (§11-13).
  const wrap = <T extends object>(service: ServiceName, impl: T): T => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(impl)) {
      const fn = (impl as Record<string, unknown>)[key]
      if (typeof fn === 'function') {
        out[key] = ((...args: unknown[]) => {
          assertServicePermission(manifest.permissions, service)
          return (fn as (...args: unknown[]) => unknown)(...args)
        })
      }
    }
    return out as T
  }
  const services = {
    games: wrap('games', implementations.games),
    profiles: wrap('profiles', implementations.profiles),
    mods: wrap('mods', implementations.mods),
    launch: wrap('launch', implementations.launch),
    settings: wrap('settings', implementations.settings),
    provider: wrap('provider', implementations.provider),
    ui: {
      register: (slot: UIExtensionSlot, render: () => unknown) => {
        assertServicePermission(manifest.permissions, 'ui')
        if (!UI_EXTENSION_SLOTS.includes(slot)) throw new Error(`Emplacement UI inconnu : ${slot}.`)
        return uiRegistry.register(manifest.id, slot, render)
      },
    },
  }
  return {
    apiVersion: ADDON_API_VERSION,
    manifest,
    services,
    events: bus,
    extend: services.ui.register,
    storage: {
      get: key => storage.get(key),
      set: (key, value) => { assertServicePermission(manifest.permissions, 'storage'); storage.set(key, value) },
      remove: key => { assertServicePermission(manifest.permissions, 'storage'); storage.remove(key) },
    },
    log(message) {
      onLog?.(`[addon:${manifest.id}] ${message}`)
    },
  }
}
