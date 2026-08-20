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

// ── Socle « Refonte NTE/Aurora » (spec §4, §5, §10, §20-21, §40) ────────────
// L'erreur « Cannot create IPC pipe to Steam client process » du launcher NTE
// Steam doit être un état identifiable (Steam détecté / non détecté) avec une
// action « Ouvrir Steam », jamais un crash. Le dossier mods n'est créé
// qu'après validation du chemin. Un mod = un ensemble .pak/.utoc/.ucas.

const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('socle NTE : état Steam, création validée AuroraMods et validation des mods sont câblés', () => {
  const rust = read('src-tauri/src/lib.rs')
  const native = read('src/lib/native.ts')
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  const store = read('src/store/useStore.ts')

  // Backend natif : commandes enregistrées.
  for (const command of ['nte_steam_check', 'open_steam', 'nte_ensure_mods_dir', 'nte_validate_mods', 'nte_launch_pipeline']) {
    assert.ok(rust.includes(command), `commande native ${command}`)
    assert.ok(rust.includes(`            ${command},`), `${command} enregistrée dans invoke_handler`)
  }
  // Message « Ouvrir Steam » qui remplace le crash IPC (spec §20).
  assert.ok(rust.includes('Cannot create IPC pipe to Steam client process'))

  // Bindings frontend.
  assert.ok(native.includes('nteSteamCheck'))
  assert.ok(native.includes('openSteam'))
  assert.ok(native.includes('nteEnsureModsDir'))
  assert.ok(native.includes('nteValidateMods'))
  assert.ok(native.includes('nteLaunchPipeline'))

  // Carte de configuration : état Steam + actions + pipeline.
  assert.ok(panel.includes('Ouvrir Steam'), 'bouton « Ouvrir Steam »')
  assert.ok(panel.includes('Créer le dossier AuroraMods'), 'création validée AuroraMods')
  assert.ok(panel.includes('Valider les mods'), 'validation des ensembles de mods')
  assert.ok(panel.includes('Vérifier le lancement'), 'pipeline de lancement (spec §15, §40)')
  assert.ok(panel.includes('Pipeline de lancement'), 'affichage des étapes du pipeline')

  // Garde au lancement : un jeu NTE Steam sans Steam ne se lance pas (spec §40).
  assert.ok(store.includes('nteSteamCheck'), 'garde Steam dans le store')
  assert.ok(store.includes('Lancement bloqué'), 'message de blocage au lancement')
})

test('pipeline de lancement NTE : détection du loader Everlight jamais téléchargé (spec §11-14, §35)', () => {
  const rust = read('src-tauri/src/lib.rs')
  assert.ok(rust.includes('version.dll'), 'DLL d\'injection Everlight version.dll')
  assert.ok(rust.includes('dsound.dll'), 'DLL d\'injection Everlight dsound.dll')
  assert.ok(rust.includes('jamais téléchargé'), 'ZAILON ne télécharge pas de DLL (spec §35)')
  assert.ok(rust.includes('nte_pipeline_steps'), 'logique pure des étapes testée')
})
