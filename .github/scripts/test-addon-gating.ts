import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addonCapabilities,
  ALL_ZAILON_CAPABILITIES,
  CAPABILITY_ADDON,
  hasCapability,
  isCapabilityMissing,
  missingCapabilities,
  PROVIDER_ADDON,
  type ZailonCapability,
} from '../../src/lib/addonGating.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'modding', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

test('aucun add-on → aucune capacité', () => {
  const caps = addonCapabilities([])
  assert.equal(caps.size, 0)
  assert.equal(hasCapability(caps, 'frosty.backend'), false)
})

test('add-on installé et activé → capacité présente', () => {
  const caps = addonCapabilities([makeAddon('official.zailon.frosty')])
  assert.equal(hasCapability(caps, 'frosty.backend'), true)
})

test('add-on désactivé → capacité absente (spec §18)', () => {
  const caps = addonCapabilities([makeAddon('official.zailon.frosty', false)])
  assert.equal(hasCapability(caps, 'frosty.backend'), false)
})

test('les 16 capacités du mapping sont reconnues', () => {
  const addons = ALL_ZAILON_CAPABILITIES.map(cap => makeAddon(CAPABILITY_ADDON[cap]))
  const caps = addonCapabilities(addons)
  assert.equal(caps.size, ALL_ZAILON_CAPABILITIES.length)
  for (const cap of ALL_ZAILON_CAPABILITIES) assert.equal(hasCapability(caps, cap), true)
})

test('les add-ons sans capacité ne fournissent rien', () => {
  const caps = addonCapabilities([makeAddon('community.author.random')])
  assert.equal(caps.size, 0)
})

test('mapping providers → capacité cohérente avec les add-ons', () => {
  assert.equal(PROVIDER_ADDON.nexus, 'provider.nexus')
  assert.equal(PROVIDER_ADDON.gamebanana, 'provider.gamebanana')
  assert.equal(PROVIDER_ADDON.curseforge, 'provider.curseforge')
  assert.equal(CAPABILITY_ADDON[PROVIDER_ADDON.nexus], 'official.zailon.provider.nexus')
})

test('isCapabilityMissing et missingCapabilities', () => {
  const caps = addonCapabilities([makeAddon('official.zailon.reshade')])
  assert.equal(isCapabilityMissing(caps, 'reshade.manager'), false)
  assert.equal(isCapabilityMissing(caps, 'provider.nexus'), true)
  assert.deepEqual(missingCapabilities(caps, ['reshade.manager', 'provider.nexus', 'artwork.plus']), ['provider.nexus', 'artwork.plus'])
})

test('un add-on installé mais inconnu du mapping n\'expose aucune capacité', () => {
  const caps = addonCapabilities([makeAddon('official.zailon.themes')])
  assert.equal(hasCapability(caps, 'themes.packs'), true)
  assert.equal(hasCapability(caps, 'ue.modding'), false)
})

test('set mutable et tableau équivalents pour hasCapability', () => {
  const list: ZailonCapability[] = ['frosty.backend']
  assert.equal(hasCapability(list, 'frosty.backend'), true)
  assert.equal(hasCapability(list, 'reshade.manager'), false)
})
