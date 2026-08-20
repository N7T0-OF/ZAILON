import test from 'node:test'
import assert from 'node:assert/strict'
import { addonCapabilities, CAPABILITY_ADDON, cyberpunkToolsAllowed } from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG, catalogAddonAvailability, validateAddonManifest } from '../../src/lib/addons.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CYBERPUNK_ID = 'official.zailon.game.cyberpunk'

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'game-support', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

// ── Feature removal (spec §57) : les outils avancés Cyberpunk doivent
//    disparaître réellement sans l'add-on ────────────────────────────────────

test('sans l’add-on Cyberpunk → aucun outil, même pour un jeu Cyberpunk', () => {
  assert.equal(CAPABILITY_ADDON['cyberpunk.frameworks'], CYBERPUNK_ID)
  const caps = addonCapabilities([])
  assert.equal(caps.has('cyberpunk.frameworks'), false)
  assert.equal(cyberpunkToolsAllowed(caps, true), false)
  // Un jeu NON Cyberpunk n'a jamais les outils, même avec l'add-on.
})

test('add-on installé mais DÉSACTIVÉ → gate fermée (spec §18)', () => {
  const caps = addonCapabilities([makeAddon(CYBERPUNK_ID, false)])
  assert.equal(cyberpunkToolsAllowed(caps, true), false)
})

test('add-on installé + activé + jeu Cyberpunk → gate ouverte', () => {
  const caps = addonCapabilities([makeAddon(CYBERPUNK_ID)])
  assert.equal(caps.has('cyberpunk.frameworks'), true)
  assert.equal(cyberpunkToolsAllowed(caps, true), true)
})

test('jeu non Cyberpunk → gate fermée même avec l’add-on (les outils restent spécifiques)', () => {
  const caps = addonCapabilities([makeAddon(CYBERPUNK_ID)])
  assert.equal(cyberpunkToolsAllowed(caps, false), false)
})

// ── Le package est un vrai package installable (spec §47-49) ─────────────────

test('Cyberpunk Advanced est Disponible dans le catalogue avec package + SHA-256 réel', () => {
  const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === CYBERPUNK_ID)
  assert.ok(entry, 'entrée au catalogue')
  const availability = catalogAddonAvailability(entry!)
  assert.equal(availability.installable, true)
  assert.equal(availability.status, 'available')
  assert.ok(entry!.package, 'package versionné')
  assert.ok(entry!.sha256 && /^[0-9a-f]{64}$/i.test(entry!.sha256), 'SHA-256 réel (64 hex)')
})

// ── Gating source : les boutons de réparation ne sont atteignables QUE via la
//    gate — garde-fou de régression sur GamesView / GameDiagnosticPanel ──────

test('GamesView et GameDiagnosticPanel n’exposent les outils que via la gate cyberpunkTools', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  const diagnostic = readFileSync(join(root, 'src/components/Views/GameDiagnosticPanel.tsx'), 'utf8')

  // Le bouton « Réparer les racines Cyberpunk » et le passage de onRepairMo2
  // sont conditionnés par `cyberpunkTools` (capability-gated), plus jamais par
  // le seul nom du jeu.
  assert.ok(gamesView.includes('cyberpunkTools && <button'), 'bouton réparation gated par cyberpunkTools')
  assert.ok(gamesView.includes('onRepairMo2={cyberpunkTools ?'), 'onRepairMo2 gated par cyberpunkTools')
  assert.ok(gamesView.includes('showRed4extTools={cyberpunkTools}'), 'carte RED4ext gated via prop')

  // La carte « Réparer RED4ext » ne se rend que si la prop est vraie.
  assert.ok(diagnostic.includes('{showRed4extTools && <Red4extRepairCard'), 'Red4extRepairCard gated par showRed4extTools')
  assert.ok(diagnostic.includes('showRed4extTools = false'), 'défaut : outils désactivés')
})

test('le manifest de l’add-on déclare la capabilité cyberpunk.frameworks et des permissions valides', () => {
  const raw = JSON.parse(readFileSync(join(root, 'addons', CYBERPUNK_ID, 'manifest.json'), 'utf8'))
  const result = validateAddonManifest(raw)
  assert.equal(result.ok, true, result.error)
  assert.ok((raw.capabilities as string[]).includes('cyberpunk.frameworks'))
  assert.ok((raw.slots as string[]).includes('Game.Tools'))
  assert.ok((raw.slots as string[]).includes('Game.Diagnostic'))
  for (const permission of result.manifest?.permissions || []) {
    assert.ok(['game.read', 'game.files.write', 'mods.read', 'mods.write', 'process.read'].includes(permission), `permission : ${permission}`)
  }
})
