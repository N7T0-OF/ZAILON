import test from 'node:test'
import assert from 'node:assert/strict'
import { addonCapabilities, CAPABILITY_ADDON, nteModsAllowed } from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG, catalogAddonAvailability, validateAddonManifest } from '../../src/lib/addons.ts'
import { detectModBackend } from '../../src/lib/modBackends.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NTE_ID = 'official.zailon.game.nte'

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'game-support', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

// ── Feature removal (spec §57) : sans l'add-on, aucun jeu n'est classé NTE PAK ─

test('sans l’add-on NTE → aucune capacité, détection PAK fermée', () => {
  assert.equal(CAPABILITY_ADDON['nte.modloader'], NTE_ID)
  const caps = addonCapabilities([])
  assert.equal(caps.has('nte.modloader'), false)
  assert.equal(nteModsAllowed(caps), false)
  // Un jeu Neverness to Everness SANS l'add-on retombe sur le dossier générique.
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness', nteAllowed: false }), 'generic-folder')
  assert.equal(detectModBackend({ execPath: 'X:\\Games\\NTE\\ntegloballauncher.exe', nteAllowed: false }), 'generic-folder')
})

test('add-on installé mais DÉSACTIVÉ → gate fermée (spec §18)', () => {
  const caps = addonCapabilities([makeAddon(NTE_ID, false)])
  assert.equal(nteModsAllowed(caps), false)
})

test('add-on installé + activé → gate ouverte, backend NTE PAK détecté', () => {
  const caps = addonCapabilities([makeAddon(NTE_ID)])
  assert.equal(caps.has('nte.modloader'), true)
  assert.equal(nteModsAllowed(caps), true)
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness', nteAllowed: true }), 'nte-pak')
})

test('défaut de la lib pure : nteAllowed absent → comportement historique (test-mod-backends)', () => {
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness' }), 'nte-pak')
})

// ── Le package est un vrai package installable (spec §47-49) ─────────────────

test('NTE Support est Disponible dans le catalogue avec package + SHA-256 réel', () => {
  const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === NTE_ID)
  assert.ok(entry, 'entrée au catalogue')
  const availability = catalogAddonAvailability(entry!)
  assert.equal(availability.installable, true)
  assert.equal(availability.status, 'available')
  assert.ok(entry!.package, 'package versionné')
  assert.ok(entry!.sha256 && /^[0-9a-f]{64}$/i.test(entry!.sha256), 'SHA-256 réel (64 hex)')
})

test('le manifest de l’add-on déclare la capabilité nte.modloader et des permissions valides', () => {
  const raw = JSON.parse(readFileSync(join(root, 'addons', NTE_ID, 'manifest.json'), 'utf8'))
  const result = validateAddonManifest(raw)
  assert.equal(result.ok, true, result.error)
  assert.ok((raw.capabilities as string[]).includes('nte.modloader'))
  assert.ok((raw.slots as string[]).includes('Game.Configuration'))
  for (const permission of result.manifest?.permissions || []) {
    assert.ok(['game.read', 'game.launch', 'process.read', 'mods.read', 'mods.write'].includes(permission), `permission : ${permission}`)
  }
})
