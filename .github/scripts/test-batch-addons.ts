import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addonCapabilities,
  CAPABILITY_ADDON,
  fiveMProfilesAllowed,
  mo2ImportAllowed,
  steamAdvancedAllowed,
  themePacksAllowed,
  type ZailonCapability,
} from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG, catalogAddonAvailability, validateAddonManifest } from '../../src/lib/addons.ts'
import { isThemePackActive, THEME_PACKS, themePackSettings } from '../../src/lib/themePacks.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'utilities', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

const CASES: Array<{ id: string; capability: ZailonCapability; gate?: (caps: Set<ZailonCapability>) => boolean; slot: string }> = [
  { id: 'official.zailon.reshade', capability: 'reshade.manager', slot: 'Game.Configuration' },
  { id: 'official.zailon.artwork', capability: 'artwork.plus', slot: 'Settings.Appearance' },
  { id: 'official.zailon.steam-advanced', capability: 'steam.advanced', gate: steamAdvancedAllowed, slot: 'Library.Detect' },
  { id: 'official.zailon.game.fivem', capability: 'fivem.profiles', gate: fiveMProfilesAllowed, slot: 'Game.Mods' },
  { id: 'official.zailon.importer.mo2', capability: 'importer.mo2', gate: mo2ImportAllowed, slot: 'Game.Profiles' },
  { id: 'official.zailon.themes', capability: 'themes.packs', gate: themePacksAllowed, slot: 'Settings.Appearance' },
]

// ── Feature removal (spec §57) ───────────────────────────────────────────────

test('les 6 add-ons du lot : mapping capacité → add-on correct, capacité absente sans add-on', () => {
  for (const entry of CASES) {
    assert.equal(CAPABILITY_ADDON[entry.capability], entry.id)
    const caps = addonCapabilities([])
    assert.equal(caps.has(entry.capability), false)
  }
})

test('les 6 add-ons du lot : gates ouvertes avec add-on actif, fermées sinon', () => {
  for (const entry of CASES) {
    if (!entry.gate) continue // ReShade/Artwork+ gated dans les composants (hasCap)
    assert.equal(entry.gate(addonCapabilities([])), false, `${entry.id} : fermée sans add-on`)
    assert.equal(entry.gate(addonCapabilities([makeAddon(entry.id, false)])), false, `${entry.id} : fermée si désactivé`)
    assert.equal(entry.gate(addonCapabilities([makeAddon(entry.id)])), true, `${entry.id} : ouverte avec add-on actif`)
  }
})

// ── Package réel (spec §47-49) ───────────────────────────────────────────────

test('les 6 add-ons du lot : Disponibles dans le catalogue avec package + SHA-256 réel', () => {
  for (const entry of CASES) {
    const catalogEntry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === entry.id)
    assert.ok(catalogEntry, `${entry.id} : entrée au catalogue`)
    const availability = catalogAddonAvailability(catalogEntry!)
    assert.equal(availability.installable, true, `${entry.id} : installable`)
    assert.equal(availability.status, 'available', `${entry.id} : Disponible`)
    assert.ok(catalogEntry!.package, `${entry.id} : package versionné`)
    assert.ok(catalogEntry!.sha256 && /^[0-9a-f]{64}$/i.test(catalogEntry!.sha256), `${entry.id} : SHA-256 réel`)
  }
})

test('les 6 add-ons du lot : manifest valide avec capabilité + slot + permissions du catalogue', () => {
  for (const entry of CASES) {
    const raw = JSON.parse(readFileSync(join(root, 'addons', entry.id, 'manifest.json'), 'utf8'))
    const result = validateAddonManifest(raw)
    assert.equal(result.ok, true, `${entry.id} : ${result.error}`)
    assert.ok((raw.capabilities as string[]).includes(entry.capability), `${entry.id} : capabilité`)
    assert.ok((raw.slots as string[]).includes(entry.slot), `${entry.id} : slot ${entry.slot}`)
    const catalogEntry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === entry.id)
    for (const permission of result.manifest?.permissions || []) {
      assert.ok(catalogEntry!.permissions.includes(permission), `${entry.id} : permission ${permission} dans le catalogue`)
    }
  }
})

// ── Gating source : garde-fous de régression sur le store et GamesView ──────

test('store : les actions Steam/FiveM/MO2 sont gardées par les capacités', () => {
  const store = readFileSync(join(root, 'src/store/useStore.ts'), 'utf8')
  assert.ok(store.includes('steamAdvancedAllowed(addonCapabilities(get().addons))'), 'addDetectedGames gardé')
  assert.ok(store.includes('fiveMProfilesAllowed(addonCapabilities(get().addons))'), 'initializeFiveMBase gardé')
  assert.ok(store.includes('mo2ImportAllowed(addonCapabilities(get().addons))'), 'completeMo2Import gardé')
})

test('GamesView : détection Steam, bannière FiveM et bouton MO2 conditionnés par les gates', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  assert.ok(gamesView.includes('steamAdvanced && steamDialogOpen'), 'dialogue Steam gated')
  assert.ok(gamesView.includes('fiveMProfiles && selectedGame.provider'), 'bannière FiveM gated')
  assert.ok(gamesView.includes('mo2Import &&'), 'bouton MO2 gated')
})

// ── Theme Packs : la vraie feature (presets) ────────────────────────────────

test('Theme Packs : 5 presets valides, application et détection active', () => {
  assert.ok(THEME_PACKS.length >= 5)
  for (const pack of THEME_PACKS) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(pack.accentColor), `${pack.id} : couleur valide`)
    assert.ok(['comfortable', 'compact'].includes(pack.uiDensity))
    assert.ok(['small', 'normal', 'large', 'very-large'].includes(pack.textSize))
    assert.ok(['auto', 'enabled', 'reduced'].includes(pack.motionMode))
    const settings = themePackSettings(pack)
    assert.equal(settings.accentColor, pack.accentColor)
  }
  const pack = THEME_PACKS[0]
  assert.equal(isThemePackActive(pack, { accentColor: pack.accentColor, uiDensity: pack.uiDensity, textSize: pack.textSize, motionMode: pack.motionMode }), true)
  assert.equal(isThemePackActive(pack, { accentColor: '#000000', uiDensity: pack.uiDensity, textSize: pack.textSize, motionMode: pack.motionMode }), false)
})
