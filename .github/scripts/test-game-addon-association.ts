/**
 * Tests de l'association jeu ↔ add-on (spec « Mise à niveau » §4).
 * Lib pure `gameAddonAssociation.ts` : étiquette sur les jeux liés à un
 * add-on, jamais d'étiquette sinon ; statut installé/disponible/développement ;
 * clic → page Add-ons.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gameAddonAssociations, gameAddonLabels } from '../../src/lib/gameAddonAssociation.ts'
import { OFFICIAL_ADDON_CATALOG } from '../../src/lib/addons.ts'
import type { Game, InstalledAddon } from '../../src/types.ts'
import type { AddonCatalogEntry } from '../../src/lib/addons.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  name: 'Jeu',
  execPath: 'C:/Games/jeu/Jeu.exe',
  modsPath: '',
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
  ...overrides,
} as Game)

const installed = (id: string, enabled = true): InstalledAddon => ({
  manifest: { id, name: id, version: '1.0.0', api: '1', entry: 'addon.js', permissions: [], category: 'utility' },
  installedAt: 0,
  enabled,
} as unknown as InstalledAddon)

test('gameAddonAssociations : Cyberpunk → Cyberpunk Advanced', () => {
  const associations = gameAddonAssociations(game({ name: 'Cyberpunk 2077' }))
  assert.equal(associations.length, 1)
  assert.equal(associations[0].addonId, 'official.zailon.game.cyberpunk')
  assert.equal(associations[0].addonName, 'Cyberpunk Advanced')
})

test('gameAddonAssociations : FiveM (nom OU client) → FiveM Profiles', () => {
  assert.equal(gameAddonAssociations(game({ name: 'FiveM — Profil Mods' }))[0].addonId, 'official.zailon.game.fivem')
  assert.equal(gameAddonAssociations(game({ name: 'CinqM', provider: 'FiveM Client' }))[0].addonId, 'official.zailon.game.fivem')
})

test('gameAddonAssociations : NTE → NTE Support', () => {
  const associations = gameAddonAssociations(game({ name: 'Neverness to Everness' }))
  assert.equal(associations[0].addonId, 'official.zailon.game.nte')
  assert.equal(associations[0].addonName, 'NTE Support')
})

test('gameAddonAssociations : jeu Frostbite via exécutable du registre → Frosty Support', () => {
  const associations = gameAddonAssociations(game({ name: 'Need for Speed', execPath: 'C:/Games/NFS/NFS16.exe' }))
  assert.equal(associations[0].addonId, 'official.zailon.frosty')
  assert.equal(associations[0].addonName, 'Frosty Support')
})

test('gameAddonAssociations : AUCUNE étiquette si aucun add-on n’est associé', () => {
  assert.equal(gameAddonAssociations(game({ name: 'Visual Studio Code', execPath: 'C:/dev/Code.exe' })).length, 0)
  assert.equal(gameAddonAssociations(game({ name: 'Photoshop' })).length, 0)
})

test('gameAddonLabels : statut installé (activé) > disponible > développement', () => {
  const catalog = OFFICIAL_ADDON_CATALOG.addons as AddonCatalogEntry[]
  const cyberpunk = game({ name: 'Cyberpunk 2077' })
  // Installé + activé → « Add-on installé ».
  assert.equal(gameAddonLabels(cyberpunk, [installed('official.zailon.game.cyberpunk')], catalog)[0].status, 'installed')
  // Installé mais DÉSACTIVÉ → jamais « installé ».
  assert.equal(gameAddonLabels(cyberpunk, [installed('official.zailon.game.cyberpunk', false)], catalog)[0].status, 'available')
  // Non installé, package catalogue réel → « Add-on disponible ».
  assert.equal(gameAddonLabels(cyberpunk, [], catalog)[0].status, 'available')
  // Le statut est toujours accompagné d'un libellé lisible (spec §4).
  assert.ok(gameAddonLabels(cyberpunk, [installed('official.zailon.game.cyberpunk')], catalog)[0].statusLabel.includes('installé'))
  assert.ok(gameAddonLabels(cyberpunk, [], catalog)[0].statusLabel.includes('disponible'))
})

test('gameAddonLabels : jamais d’étiquette sans association, même si add-ons installés', () => {
  const catalog = OFFICIAL_ADDON_CATALOG.addons as AddonCatalogEntry[]
  assert.equal(gameAddonLabels(game({ name: 'Photoshop' }), [installed('official.zailon.frosty')], catalog).length, 0)
})

test('UI : la carte de la Bibliothèque rend l’étiquette et ouvre la page Add-ons au clic', () => {
  const games = read('src/components/Views/GamesView.tsx')
  assert.ok(games.includes("gameAddonLabels(game, addons, OFFICIAL_ADDON_CATALOG.addons)"), 'la carte calcule les étiquettes')
  assert.ok(games.includes("setView('addons')"), 'le clic ouvre la page Add-ons')
  assert.ok(games.includes('· installé') && games.includes('· disponible'), 'le statut est affiché clairement')
})
