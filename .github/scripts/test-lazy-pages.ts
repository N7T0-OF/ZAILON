/**
 * Tests de la logique pure du lazy loading (spec §16-20).
 * — ProviderHealthCache : TTL, invalidation, fraîcheur ;
 * — cachedProviderStatuses : pas de re-fetch dans le TTL, re-fetch hors TTL ;
 * — scheduleAfterIdle : exécution après idle, annulation ;
 * — skeletonCount : bornes.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ProviderHealthCache, PROVIDER_HEALTH_TTL_MS, cachedProviderStatuses, scheduleAfterIdle, skeletonCount } from '../../src/lib/lazyPages.ts'

test('ProviderHealthCache: retourne la valeur fraîche', () => {
  let now = 1000
  const cache = new ProviderHealthCache<{ nexus: boolean }>(PROVIDER_HEALTH_TTL_MS, () => now)
  assert.equal(cache.get(), undefined)
  cache.set({ nexus: true })
  assert.deepEqual(cache.get(), { nexus: true })
  now = 1000 + PROVIDER_HEALTH_TTL_MS - 1
  assert.deepEqual(cache.get(), { nexus: true }, 'encore dans le TTL')
})

test('ProviderHealthCache: expire hors TTL et se laisse invalider', () => {
  let now = 1000
  const cache = new ProviderHealthCache<number>(1000, () => now)
  cache.set(42)
  now = 2001
  assert.equal(cache.get(), undefined, 'hors TTL')
  assert.equal(cache.age(), 1001)
  cache.set(7)
  cache.invalidate()
  assert.equal(cache.get(), undefined)
  assert.equal(cache.isFresh, false)
})

test('cachedProviderStatuses: pas de re-fetch dans le TTL, re-fetch hors TTL', async () => {
  let now = 0
  const cache = new ProviderHealthCache<Record<string, string>>(1000, () => now)
  let fetches = 0
  const fetchStatuses = async () => { fetches += 1; return { nexus: 'ready' } }

  const first = await cachedProviderStatuses(cache, fetchStatuses)
  assert.deepEqual(first, { nexus: 'ready' })
  assert.equal(fetches, 1)

  const second = await cachedProviderStatuses(cache, fetchStatuses)
  assert.deepEqual(second, { nexus: 'ready' })
  assert.equal(fetches, 1, 'cache réutilisé, aucun IPC natif')

  now = 1001
  const third = await cachedProviderStatuses(cache, fetchStatuses)
  assert.deepEqual(third, { nexus: 'ready' })
  assert.equal(fetches, 2, 'hors TTL → re-fetch')

  cache.invalidate()
  await cachedProviderStatuses(cache, fetchStatuses)
  assert.equal(fetches, 3, 'invalidation forcée → re-fetch')
})

test('scheduleAfterIdle: exécute la tâche et supporte l\'annulation', async () => {
  let ran = 0
  const cancel = scheduleAfterIdle(() => { ran += 1 })
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(ran, 1)

  let ran2 = 0
  const cancel2 = scheduleAfterIdle(() => { ran2 += 1 }, 50)
  cancel2()
  await new Promise(resolve => setTimeout(resolve, 120))
  assert.equal(ran2, 0, 'tâche annulée')
  void cancel
})

test('skeletonCount: bornes min/max et valeurs non finies', () => {
  assert.equal(skeletonCount(6), 6)
  assert.equal(skeletonCount(0), 1)
  assert.equal(skeletonCount(-3), 1)
  assert.equal(skeletonCount(500), 12)
  assert.equal(skeletonCount(Number.NaN), 1)
})
