import test from 'node:test'
import assert from 'node:assert/strict'
import { addonCapabilities, CAPABILITY_ADDON, discordPresenceAllowed } from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG, catalogAddonAvailability, validateAddonManifest } from '../../src/lib/addons.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DISCORD_ID = 'official.zailon.discord'

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'sources', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

// ── Feature removal (spec §57) : la fonctionnalité doit disparaître réellement ─

test('sans l’add-on Discord → aucune capacité, gate fermée même si le réglage est resté activé', () => {
  assert.equal(CAPABILITY_ADDON['discord.presence'], DISCORD_ID)
  const caps = addonCapabilities([])
  assert.equal(caps.has('discord.presence'), false)
  // Désinstallé après usage : le réglage utilisateur peut rester activé, le
  // Core ne publie JAMAIS (feature removal §57).
  assert.equal(discordPresenceAllowed(caps, true), false)
})

test('add-on installé mais DÉSACTIVÉ → gate fermée (spec §18)', () => {
  const caps = addonCapabilities([makeAddon(DISCORD_ID, false)])
  assert.equal(discordPresenceAllowed(caps, true), false)
})

test('add-on installé + activé + réglage activé → gate ouverte', () => {
  const caps = addonCapabilities([makeAddon(DISCORD_ID)])
  assert.equal(caps.has('discord.presence'), true)
  assert.equal(discordPresenceAllowed(caps, true), true)
})

test('réglage désactivé → gate fermée même avec l’add-on', () => {
  const caps = addonCapabilities([makeAddon(DISCORD_ID)])
  assert.equal(discordPresenceAllowed(caps, false), false)
})

// ── Le package est un vrai package installable (spec §47-49) ─────────────────

test('Discord Presence est Disponible dans le catalogue avec package + SHA-256 réel', () => {
  const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === DISCORD_ID)
  assert.ok(entry, 'entrée au catalogue')
  const availability = catalogAddonAvailability(entry!)
  assert.equal(availability.installable, true)
  assert.equal(availability.status, 'available')
  assert.ok(entry!.package, 'package versionné')
  assert.ok(entry!.sha256 && /^[0-9a-f]{64}$/i.test(entry!.sha256), 'SHA-256 réel (64 hex)')
})

test('le manifest de l’add-on déclare la capabilité discord.presence et des permissions valides', () => {
  const raw = JSON.parse(readFileSync(join(root, 'addons', DISCORD_ID, 'manifest.json'), 'utf8'))
  const result = validateAddonManifest(raw)
  assert.equal(result.ok, true, result.error)
  // Capabilité et slots : métadonnées déclaratives du manifest (docs
  // addon-sdk) — vérifiées sur le JSON brut.
  assert.ok((raw.capabilities as string[]).includes('discord.presence'))
  assert.ok((raw.slots as string[]).includes('Settings.Discord'))
  assert.ok((raw.slots as string[]).includes('QuickPanel.Discord'))
  for (const permission of result.manifest?.permissions || []) {
    assert.ok(['game.read', 'process.read', 'settings'].includes(permission), `permission : ${permission}`)
  }
})
