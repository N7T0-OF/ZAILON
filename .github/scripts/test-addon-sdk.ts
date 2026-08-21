/**
 * Tests du SDK d'extensions (spec §19, §25-28, §69-71).
 * — gate de permissions : refus au premier appel, jamais à la construction ;
 * — bus d'événements : abonnement/émission, un handler fautif n'arrête pas les autres ;
 * — événements lazy : OnZailonStarted restreint ;
 * — registre de slots UI : un slot par add-on, libération à la désactivation ;
 * — cycle de vie : idle → active, erreur → crash guard → désactivé après 2 échecs ;
 * — contribution au démarrage.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AddonLifecycle,
  StartupContributionMonitor,
  UiExtensionRegistry,
  assertLazyEvents,
  assertServicePermission,
  createAddonApi,
  createAddonEventBus,
  isLazyEvent,
} from '../../src/lib/addonSdk.ts'
import type { CrashGuardStorage } from '../../src/lib/addons.ts'
import type { ZailonAddonManifest } from '../../src/lib/addons.ts'

const manifest = (overrides: Partial<ZailonAddonManifest> = {}): ZailonAddonManifest => ({
  schema: 1,
  id: 'community.test.sdk',
  name: 'SDK Test',
  version: '1.0.0',
  author: 'tester',
  description: 'test',
  category: 'utilities',
  minZailonVersion: '1.0.0',
  permissions: ['game.read', 'settings'],
  ...overrides,
})

test('assertServicePermission: permission requise par service', () => {
  assert.doesNotThrow(() => assertServicePermission(['game.read'], 'games'))
  assert.throws(() => assertServicePermission(['game.read'], 'launch'), /game\.launch/)
  assert.doesNotThrow(() => assertServicePermission([], 'events'), 'events toujours accessible')
})

test('createAddonApi: la gate agit au premier appel, pas à la construction', () => {
  const api = createAddonApi(
    manifest({ permissions: ['game.read'] }),
    { games: { list: () => ['g1'], read: () => undefined }, profiles: { list: () => [], read: () => undefined }, mods: { list: () => [] }, launch: { launch: async () => undefined }, settings: { get: () => undefined, set: () => undefined }, provider: { search: async () => [] } },
    createAddonEventBus(),
    new UiExtensionRegistry(),
    { get: () => undefined, set: () => undefined, remove: () => undefined },
  )
  assert.equal(api.services.games.list()[0], 'g1', 'service couvert fonctionne')
  assert.throws(() => api.services.launch.launch('g', 'p'), /game\.launch/, 'service non couvert refusé à l’appel')
  assert.throws(() => api.storage.set('k', 'v'), /settings/, 'stockage soumis à la permission settings')
})

test('createAddonEventBus: un handler fautif ne bloque ni les autres ni le Core', async () => {
  const bus = createAddonEventBus()
  const calls: string[] = []
  bus.on('OnGameStarted', () => { calls.push('first') })
  bus.on('OnGameStarted', () => { throw new Error('boom') })
  bus.on('OnGameStarted', () => { calls.push('third') })
  bus.emit('OnGameStarted')
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(calls, ['first', 'third'], 'le handler fautif est isolé')
  const off = bus.on('OnProfileChanged', () => calls.push('off'))
  off()
  bus.emit('OnProfileChanged')
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(!calls.includes('off'), 'désabonnement effectif')
})

test('événements lazy: OnZailonStarted restreint', () => {
  assert.equal(isLazyEvent('OnGameStarted'), true)
  assert.equal(isLazyEvent('OnZailonStarted'), false)
  assert.equal(assertLazyEvents(manifest({ events: ['OnGameStarted'] })).ok, true)
  assert.equal(assertLazyEvents(manifest({ events: ['OnZailonStarted'] })).ok, false)
})

test('UiExtensionRegistry: un slot par add-on, libération à la désactivation', () => {
  const registry = new UiExtensionRegistry()
  registry.register('a.b', 'GameSettings.ModBackend', () => undefined)
  registry.register('c.d', 'GameSettings.ModBackend', () => undefined)
  assert.equal(registry.forSlot('GameSettings.ModBackend').length, 2)
  assert.equal(registry.releaseAddon('a.b'), 1)
  assert.equal(registry.forSlot('GameSettings.ModBackend').length, 1)
})

test('AddonLifecycle: idle → loaded → active, erreur isolée', async () => {
  const storage = new Map<string, unknown>()
  const crashStorage: CrashGuardStorage = {
    read: id => storage.get(id) as never,
    write: (id, record) => { storage.set(id, record) },
  }
  const lifecycle = new AddonLifecycle(crashStorage)
  lifecycle.registerLazy('a.b', () => ({ activate: () => undefined }))
  const state = await lifecycle.activate('a.b', {} as never)
  assert.equal(state.state, 'active')
  await lifecycle.deactivate('a.b')
  assert.equal(lifecycle.state('a.b')?.state, 'idle')
})

test('AddonLifecycle: 2 échecs d’activation → désactivé (crash guard)', async () => {
  const storage = new Map<string, unknown>()
  const crashStorage: CrashGuardStorage = {
    read: id => storage.get(id) as never,
    write: (id, record) => { storage.set(id, record) },
  }
  const lifecycle = new AddonLifecycle(crashStorage)
  lifecycle.registerLazy('a.b', () => ({ activate: () => { throw new Error('activate failed') } }))
  const first = await lifecycle.activate('a.b', {} as never)
  assert.equal(first.state, 'error')
  const second = await lifecycle.activate('a.b', {} as never)
  assert.equal(second.state, 'disabled', 'désactivé après 2 échecs (§21)')
  assert.match(second.error || '', /désactivé/)
})

test('StartupContributionMonitor: rapport core + add-ons', () => {
  const monitor = new StartupContributionMonitor()
  monitor.record('a.b', 4)
  monitor.record('c.d', 12)
  const report = monitor.report(320)
  assert.equal(report.coreMs, 320)
  assert.equal(report.addonsMs, 16)
  assert.equal(report.entries.length, 2)
})
