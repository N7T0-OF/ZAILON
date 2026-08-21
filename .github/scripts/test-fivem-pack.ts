import test from 'node:test'
import assert from 'node:assert/strict'
import { mapPackEntry, packManifest, packManifestJson, planFiveMPack, rollbackPlanFromManifest, stripCommonRoot } from '../../src/lib/fivemPack.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('stripCommonRoot : supprime la racine commune (MonPack/, FiveM/application data/)', () => {
  assert.deepEqual(stripCommonRoot(['MonPack/mods/a.txt', 'MonPack/plugins/b.dll']), ['mods/a.txt', 'plugins/b.dll'])
  assert.deepEqual(
    stripCommonRoot(['FiveM/application data/mods/x', 'FiveM/application data/plugins/y']),
    ['mods/x', 'plugins/y'],
  )
  // Une seule entrée → pas de racine supprimée.
  assert.deepEqual(stripCommonRoot(['mods/a.txt']), ['mods/a.txt'])
})

test('mapPackEntry : mappe mods/, citizen/, plugins/, reshade-shaders/ et presets', () => {
  assert.deepEqual(mapPackEntry('mods/graphicpack/file.ytd'), { kind: 'mods', target: 'mods/graphicpack/file.ytd' })
  assert.deepEqual(mapPackEntry('plugins/dxgi.dll'), { kind: 'plugins', target: 'plugins/dxgi.dll' })
  assert.deepEqual(mapPackEntry('citizen/common/data/x'), { kind: 'citizen', target: 'citizen/common/data/x' })
  assert.deepEqual(mapPackEntry('reshade-shaders/Shaders/foo.fx'), { kind: 'reshade-shaders', target: 'reshade-shaders/Shaders/foo.fx' })
  assert.deepEqual(mapPackEntry('ReShade.ini'), { kind: 'reshade-config', target: 'presets/ReShade.ini' })
  assert.deepEqual(mapPackEntry('citizenfx.ini'), { kind: 'citizenfx', target: 'citizenfx.ini' })
})

test('mapPackEntry : exclut les fichiers GTA V (jamais copiés dans FiveM)', () => {
  assert.equal(mapPackEntry('scripts/gtav-mod.asi').kind, 'gtav')
  assert.equal(mapPackEntry('x64/unknown.rpf').kind, 'gtav')
  assert.equal(mapPackEntry('update/update.rpf').kind, 'gtav')
  assert.equal(mapPackEntry('dlcpacks/mp/foo.rpf').kind, 'gtav')
  assert.equal(mapPackEntry('random/file.txt').kind, 'unknown')
})

test('planFiveMPack : résumé correct, exclusions et fichiers sensibles signalés', () => {
  const plan = planFiveMPack([
    'MonPack/mods/a.ytd',
    'MonPack/plugins/dxgi.dll',
    'MonPack/reshade-shaders/Shaders/b.fx',
    'MonPack/ReShade.ini',
    'MonPack/scripts/gtav.asi',
    'MonPack/random.exe',
  ])
  assert.equal(plan.summary.mods, 1)
  assert.equal(plan.summary.plugins, 1)
  assert.equal(plan.summary.reshadeShaders, 1)
  assert.equal(plan.summary.reshadeConfig, 1)
  assert.equal(plan.summary.gtav, 1)
  assert.equal(plan.summary.unknown, 1)
  // dxgi.dll + random.exe sont sensibles ; gtav.asi est aussi sensible mais exclu.
  assert.ok(plan.sensitive.some(entry => entry.source === 'plugins/dxgi.dll'))
  assert.ok(plan.excluded.some(entry => entry.kind === 'gtav'))
})

test('le bouton et le dialogue Packs graphiques sont gated par fivem.profiles', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  assert.ok(gamesView.includes("fiveMProfiles && selectedGame.provider === 'FiveM Client' && <button"), 'boutons FiveM gated')
  assert.ok(gamesView.includes('fiveMProfiles && fivemPackOpen'), 'dialogue Packs gated')
  const dialog = readFileSync(join(root, 'src/components/FiveMPackDialog.tsx'), 'utf8')
  assert.ok(dialog.includes('planFiveMPack'), 'analyse via la lib pure')
  assert.ok(dialog.includes('fivemPackScan'), 'inventaire natif réel de l\'archive')
  assert.ok(dialog.includes('fivemPackApply'), 'application réelle via le backend natif')
  assert.ok(dialog.includes('fivemPackRemove'), 'rollback via le backend natif')
  assert.ok(dialog.includes('installRoot'), 'cible = environnement FiveM détecté, jamais codé en dur')
})

test('packManifest + rollbackPlanFromManifest : aller-retour des fichiers possédés', () => {
  const plan = planFiveMPack(['mods/a.ytd', 'plugins/b.dll'])
  const manifest = packManifest('Natural Vision', plan) as { files: Array<{ target?: string }> }
  assert.equal(manifest.kind, 'FiveMGraphicPack')
  assert.equal(manifest.files.length, 2)
  const rollback = rollbackPlanFromManifest(manifest)
  assert.deepEqual(rollback, ['mods/a.ytd', 'plugins/b.dll'])
})

test('packManifestJson : manifeste sérialisé prêt pour le backend (sources exactes)', () => {
  const plan = planFiveMPack(['Natural/mods/a.ytd', 'Natural/plugins/b.dll'])
  const json = JSON.parse(packManifestJson('Natural Vision', plan)) as { schemaVersion: number; kind: string; name: string; files: Array<{ target: string; source: string }> }
  assert.equal(json.schemaVersion, 1)
  assert.equal(json.kind, 'FiveMGraphicPack')
  assert.equal(json.name, 'Natural Vision')
  assert.deepEqual(
    json.files.map(file => file.source),
    ['mods/a.ytd', 'plugins/b.dll'],
  )
  assert.deepEqual(
    json.files.map(file => file.target),
    ['mods/a.ytd', 'plugins/b.dll'],
  )
})
