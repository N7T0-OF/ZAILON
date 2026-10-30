import test from 'node:test'
import assert from 'node:assert/strict'
import { addonCapabilities, CAPABILITY_ADDON, PROVIDER_ADDON, hasCapability } from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG, catalogAddonAvailability, validateAddonManifest } from '../../src/lib/addons.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ID = 'official.zailon.provider.nexus'

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'sources', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

// ── Feature removal (spec §57) : sans l'add-on, Nexus n'existe nulle part ────

test('sans l’add-on → Nexus absent d’Explorer et des Paramètres', () => {
  assert.equal(CAPABILITY_ADDON['provider.nexus'], ID)
  assert.equal(PROVIDER_ADDON.nexus, 'provider.nexus')
  const caps = addonCapabilities([])
  assert.equal(hasCapability(caps, 'provider.nexus'), false)
})

test('add-on installé mais désactivé → capacité absente (spec §18)', () => {
  const caps = addonCapabilities([makeAddon(ID, false)])
  assert.equal(hasCapability(caps, 'provider.nexus'), false)
})

test('add-on installé + activé → capacité présente', () => {
  const caps = addonCapabilities([makeAddon(ID)])
  assert.equal(hasCapability(caps, 'provider.nexus'), true)
})

// ── Le package est un vrai package installable (spec §47-49) ─────────────────

test('Nexus Provider est Disponible dans le catalogue avec package + SHA-256 réel', () => {
  const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === ID)
  assert.ok(entry, 'entrée au catalogue')
  const availability = catalogAddonAvailability(entry!)
  assert.equal(availability.installable, true)
  assert.equal(availability.status, 'available')
  assert.ok(entry!.package, 'package versionné')
  assert.ok(entry!.sha256 && /^[0-9a-f]{64}$/i.test(entry!.sha256), 'SHA-256 réel (64 hex)')
})

test('le manifest de l’add-on déclare la capabilité provider.nexus et des permissions valides', () => {
  const raw = JSON.parse(readFileSync(join(root, 'addons', ID, 'manifest.json'), 'utf8'))
  const result = validateAddonManifest(raw)
  assert.equal(result.ok, true, result.error)
  assert.ok((raw.capabilities as string[]).includes('provider.nexus'))
  assert.ok((raw.slots as string[]).includes('Explorer.Provider'))
  assert.ok((raw.slots as string[]).includes('Settings.Provider.Nexus'))
  for (const permission of result.manifest?.permissions || []) {
    assert.ok(['network', 'game.read', 'mods.write', 'settings'].includes(permission), `permission : ${permission}`)
  }
})
