import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assetReferences, diffEbxAsset, modifiedCount, pointerRefActions, pointerRefsOf,
  referencingAssets, revertEbxAsset, revertEbxProperty, setEbxProperty,
  validateEbxAsset, validateEbxValue, type EbxAsset, type EbxProperty,
} from '../../src/lib/frostyEbx.ts'

function sampleAsset(): EbxAsset {
  const properties: EbxProperty[] = [
    { path: 'physics.mass', label: 'Mass', type: 'float32', value: 1400.5, original: 1400.5, min: 0, max: 10000 },
    { path: 'physics.count', label: 'Count', type: 'int8', value: 4, original: 4, min: 0, max: 127 },
    { path: 'name', label: 'Name', type: 'cstring', value: 'GT-R', original: 'GT-R' },
    { path: 'body.kind', label: 'Kind', type: 'enum', value: 'coupe', original: 'coupe', enumValues: ['coupe', 'sedan', 'suv'] },
    { path: 'lights', label: 'Lights', type: 'array', value: [1, 2, 3], original: [1, 2, 3] },
    { path: 'paint.ref', label: 'Paint', type: 'pointerref', value: { kind: 'pointerref', target: 'tex_blue', targetType: 'TextureAsset', targetName: 'vehicles/paint_blue' }, original: { kind: 'pointerref', target: 'tex_blue', targetType: 'TextureAsset', targetName: 'vehicles/paint_blue' } },
    { path: 'chassis', label: 'Chassis', type: 'struct', value: { material: 'carbon' }, original: { material: 'carbon' } },
  ]
  return { id: 'VehicleData', name: 'vehicles/car', resourceType: 'VehicleData', properties }
}

test('validation par type §21 — valeurs impossibles rejetées', () => {
  const issues = validateEbxValue({ path: 'x', label: 'X', type: 'int8', value: 300, original: 1 })
  assert.ok(issues.some(i => i.message.includes('Hors bornes int8')))
  const neg = validateEbxValue({ path: 'x', label: 'X', type: 'uint16', value: -1, original: 1 })
  assert.ok(neg.some(i => i.message.includes('non signé')))
  const float = validateEbxValue({ path: 'x', label: 'X', type: 'float32', value: 3.5e39, original: 1 })
  assert.ok(float.some(i => i.message.includes('float32')))
  const nan = validateEbxValue({ path: 'x', label: 'X', type: 'float64', value: Number.NaN, original: 1 })
  assert.ok(nan.length > 0)
  assert.deepEqual(validateEbxValue({ path: 'x', label: 'X', type: 'bool', value: true, original: true }), [])
})

test('validation énumération §21', () => {
  const bad = validateEbxValue({ path: 'k', label: 'K', type: 'enum', value: 'truck', original: 'coupe', enumValues: ['coupe', 'sedan'] })
  assert.ok(bad.some(i => i.message.includes('hors énumération')))
})

test('validation références — pointerref sans cible', () => {
  const issues = validateEbxValue({ path: 'r', label: 'R', type: 'pointerref', value: { kind: 'pointerref' }, original: { kind: 'pointerref' } })
  assert.ok(issues.some(i => i.message.includes('sans cible')))
  const ok = validateEbxValue({ path: 'r', label: 'R', type: 'resourceref', value: { kind: 'resourceref', target: 'x' }, original: { kind: 'resourceref', target: 'x' } })
  assert.deepEqual(ok, [])
})

test('set + revalidation, revert propriété et asset §22', () => {
  let asset = sampleAsset()
  const result = setEbxProperty(asset, 'physics.count', 999) // > int8 max
  assert.ok(result.issues.length > 0)
  asset = result.asset
  assert.equal(asset.properties.find(p => p.path === 'physics.count')?.value, 999)
  asset = revertEbxProperty(asset, 'physics.count')
  assert.equal(asset.properties.find(p => p.path === 'physics.count')?.value, 4)
  const changed = setEbxProperty(asset, 'physics.mass', 1500)
  const reverted = revertEbxAsset(changed.asset)
  assert.equal(reverted.properties.find(p => p.path === 'physics.mass')?.value, 1400.5)
})

test('diff Original | Modified — seulement les changés §22', () => {
  const asset = sampleAsset()
  const changed = setEbxProperty(asset, 'physics.mass', 1500).asset
  const diff = diffEbxAsset(changed)
  assert.equal(diff.length, 1)
  assert.equal(diff[0].path, 'physics.mass')
  assert.equal(diff[0].original, 1400.5)
  assert.equal(diff[0].modified, 1500)
  assert.equal(modifiedCount(changed), 1)
  assert.equal(modifiedCount(asset), 0)
})

test('PointerRef — actions §20 et filtrage', () => {
  const asset = sampleAsset()
  const refs = pointerRefsOf(asset)
  assert.equal(refs.length, 1)
  const ref = refs[0].value as Extract<EbxProperty['value'], { kind: 'pointerref' }>
  const actions = pointerRefActions(ref, asset.name)
  assert.equal(actions?.goTo, 'tex_blue')
  assert.equal(actions?.copyReference, 'vehicles/car → tex_blue')
  assert.equal(pointerRefActions({ kind: 'typeref', target: 'VehicleData' }, asset.name), null)
})

test('impact analysis §100 — références sortantes et entrantes', () => {
  const asset = sampleAsset()
  const others: Array<{ id: string; name: string; properties: EbxProperty[] }> = [
    { id: 'tex_blue', name: 'vehicles/paint_blue', properties: [] },
    { id: 'other', name: 'vehicles/other', properties: [] },
  ]
  const out = assetReferences(asset, others)
  assert.deepEqual(out.map(a => a.id), ['tex_blue'])

  const target = { id: 'tex_blue', name: 'vehicles/paint_blue', properties: [] as EbxProperty[] }
  const inbound = referencingAssets('tex_blue', [asset, target])
  assert.deepEqual(inbound.map(a => a.id), [asset.id])
})

test('validation complète d\'un asset sain', () => {
  assert.deepEqual(validateEbxAsset(sampleAsset()), [])
})
