import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLibraryStartupCache,
  chunkedWork,
  createStartupProfiler,
  isNetworkFreePhase,
  PHASE_DELAY_MS,
  PHASE_LABELS,
  PHASE_ORDER,
  priorityForPhase,
  startupSummary,
} from '../../src/lib/startup.ts'

test('ordre des phases bootstrap → idle', () => {
  assert.deepEqual(PHASE_ORDER, ['bootstrap', 'shell', 'local', 'sessions', 'services', 'idle'])
})

test('priorités : jamais de réseau ni de services avant l\'interactif', () => {
  assert.equal(priorityForPhase('bootstrap'), 'critical')
  assert.equal(priorityForPhase('shell'), 'interactive')
  assert.equal(priorityForPhase('local'), 'interactive')
  assert.equal(priorityForPhase('sessions'), 'interactive')
  assert.equal(priorityForPhase('services'), 'normal')
  assert.equal(priorityForPhase('idle'), 'idle')
  assert.ok(isNetworkFreePhase('bootstrap'))
  assert.ok(isNetworkFreePhase('shell'))
  assert.ok(isNetworkFreePhase('local'))
  assert.equal(isNetworkFreePhase('sessions'), false)
})

test('labels et délais croissants', () => {
  assert.ok(PHASE_LABELS.bootstrap)
  assert.ok(PHASE_DELAY_MS.bootstrap < PHASE_DELAY_MS.services)
  assert.ok(PHASE_DELAY_MS.services < PHASE_DELAY_MS.idle)
})

test('profiler : marque les étapes une seule fois et résume', () => {
  const start = 1_000_000
  const { metrics, mark } = createStartupProfiler(start)
  assert.equal(metrics.windowAt, start)
  mark('shellAt')
  mark('interactiveAt')
  mark('shellAt') // déjà marqué — ignoré
  assert.ok(metrics.shellAt && metrics.shellAt >= start)
  assert.ok(metrics.interactiveAt && metrics.interactiveAt >= (metrics.shellAt || 0))
  const summary = startupSummary(metrics)
  assert.ok(summary.includes('Shell'))
  assert.ok(summary.includes('Interactif'))
})

test('profiler : résumé vide sans étapes', () => {
  const { metrics } = createStartupProfiler(1)
  assert.equal(startupSummary(metrics), '—')
})

test('cache bibliothèque : uniquement des résumés légers', () => {
  const games = [
    { id: 'g1', name: 'Cyberpunk 2077', favorite: true, backgroundArt: 'cover://g1', totalPlaytime: 3600, profiles: [{ id: 'p1', name: 'Default' }, { id: 'p2', name: 'Evolution' }] },
    { id: 'g2', name: 'NTE', totalPlaytime: 120, profiles: [{ id: 'p9', name: 'Vanilla' }] },
  ]
  const cache = buildLibraryStartupCache(games, new Set(['g2']), { g1: 'p2' })
  assert.equal(cache.length, 2)
  assert.equal(cache[0].activeProfileName, 'Evolution')
  assert.equal(cache[0].favorite, true)
  assert.equal(cache[1].running, true)
  assert.equal(cache[1].activeProfileName, 'Vanilla')
  assert.equal('installedMods' in cache[0], false)
})

test('chunkedWork : traite tout en tranches', async () => {
  const seen: number[] = []
  await new Promise<void>(resolve => {
    chunkedWork([1, 2, 3, 4, 5, 6, 7, 8], 3, chunk => seen.push(...chunk), () => resolve(), 1)
  })
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8])
})
