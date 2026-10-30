import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyFrostyIndex, filterFrostyAssets, frostyAssetBundles, frostyAssetCounts,
  frostyIndexCacheKey, ingestFrostyAssets, pushSearchHistory, searchFrostyAssets,
  setFrostyIndexProgress, synthFrostyAssets, toggleAssetSelection,
  toggleFavoriteAsset, virtualizeFrostyAssets,
} from '../../src/lib/frostyAssets.ts'

const sample = synthFrostyAssets('nfs16', 'vehicles', 24)

test('index — clé de cache par (game, version, profile, frosty) §16', () => {
  assert.equal(frostyIndexCacheKey({ gameKey: 'nfs16', frostyVersion: '1.0.6.3' }), 'nfs16|||1.0.6.3')
  assert.notEqual(
    frostyIndexCacheKey({ gameKey: 'nfs16', frostyVersion: '1.0.6.3' }),
    frostyIndexCacheKey({ gameKey: 'nfs16', frostyVersion: '1.0.6.2' }),
  )
})

test('index — ingestion incrémentale + progression §17', () => {
  let index = emptyFrostyIndex('nfs16', '1.0.6.3')
  assert.equal(index.assets.length, 0)
  assert.equal(index.progress, 0)
  index = ingestFrostyAssets(index, sample.slice(0, 10))
  index = ingestFrostyAssets(index, sample) // doublons ignorés
  assert.equal(index.assets.length, 24)
  index = setFrostyIndexProgress(index, 0.24)
  assert.equal(index.progress, 0.24)
  assert.equal(index.builtAt, 0)
  index = setFrostyIndexProgress(index, 1)
  assert.equal(index.builtAt > 0, true)
})

test('recherche — exact > préfixe > sous-chaîne, insensible à la casse §18', () => {
  const assets = [
    { id: 'a', name: 'cars/handling', path: 'x', type: 'ebx' as const, bundle: 'vehicle', resourceType: 'VehicleData', size: 1 },
    { id: 'b', name: 'handling/extra', path: 'x', type: 'ebx' as const, bundle: 'vehicle', resourceType: 'VehicleData', size: 1 },
    { id: 'c', name: 'HandlingMaster', path: 'x', type: 'ebx' as const, bundle: 'vehicle', resourceType: 'VehicleData', size: 1 },
    { id: 'd', name: 'ui/skybox', path: 'x', type: 'texture' as const, bundle: 'ui', resourceType: 'TextureAsset', size: 1 },
  ]
  const results = searchFrostyAssets(assets, 'handling')
  assert.deepEqual(results.map(a => a.id), ['b', 'c', 'a']) // préfixes puis sous-chaîne
  assert.equal(searchFrostyAssets(assets, 'HandlingMaster')[0].id, 'c')
  assert.equal(searchFrostyAssets(assets, '').length, 4)
  assert.equal(searchFrostyAssets(assets, 'skybox').length, 1)
})

test('filtres — types + bundles combinés', () => {
  const filtered = filterFrostyAssets(sample, { types: ['texture'], bundles: [], query: '' }, '')
  assert.ok(filtered.every(a => a.type === 'texture'))
  const both = filterFrostyAssets(sample, { types: ['texture', 'mesh'], bundles: ['vehicle'], query: '' }, '')
  assert.ok(both.every(a => (a.type === 'texture' || a.type === 'mesh') && a.bundle === 'vehicle'))
})

test('virtualisation — fenêtre de rendu + total §15', () => {
  const page = virtualizeFrostyAssets(sample, 10, 8)
  assert.equal(page.items.length, 8)
  assert.equal(page.total, 24)
  assert.equal(page.offset, 10)
  const tail = virtualizeFrostyAssets(sample, 20, 8)
  assert.equal(tail.items.length, 4)
})

test('sélection multiple — toggle + plage §46', () => {
  const ids = sample.map(a => a.id)
  let selected: string[] = []
  selected = toggleAssetSelection(selected, ids[0], 'toggle')
  selected = toggleAssetSelection(selected, ids[0], 'toggle')
  assert.deepEqual(selected, [])
  selected = toggleAssetSelection(selected, ids[0], 'toggle')
  const range = toggleAssetSelection(selected, ids[8], 'range', ids[0], ids)
  assert.equal(range.length, 9)
  assert.deepEqual(range, ids.slice(0, 9))
})

test('favoris §95 et historique de recherche §98', () => {
  let favs: string[] = []
  favs = toggleFavoriteAsset(favs, 'a')
  favs = toggleFavoriteAsset(favs, 'b')
  favs = toggleFavoriteAsset(favs, 'a')
  assert.deepEqual(favs, ['b'])
  const history = pushSearchHistory(pushSearchHistory([], 'sky'), 'handling')
  const dedup = pushSearchHistory(history, 'Sky')
  assert.equal(dedup[0], 'Sky')
  assert.equal(dedup.length, 2)
})

test('stats et bundles pour les filtres', () => {
  const counts = frostyAssetCounts(sample)
  assert.equal(counts.texture, 4) // 24 assets, 6 types
  const bundles = frostyAssetBundles(sample)
  assert.ok(bundles.includes('vehicle'))
  assert.deepEqual(bundles, [...bundles].sort())
})
