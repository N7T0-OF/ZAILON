import test from 'node:test'
import assert from 'node:assert/strict'
import { globalSearch } from '../../src/lib/globalSearch.ts'
import type { Game, GameGroup } from '../../src/types/index.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'

const game = (id: string, overrides: Partial<Game> = {}): Game => ({
  id,
  name: id,
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
  ...overrides,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addon = (id: string, name: string): InstalledAddon => ({ manifest: { id, name }, source: 'official', installedAt: 0, enabled: true, dataKept: false } as any)

const groups: GameGroup[] = [{ id: 'g1', name: 'FiveM', memberGameIds: ['f1', 'f2'], createdAt: 0 }]

const games: Game[] = [
  game('cp', {
    name: 'Cyberpunk 2077',
    publisher: 'CD Projekt',
    profiles: [{ id: 'p1', name: 'Cinematic' }, { id: 'p2', name: 'Vanilla' }],
    installedMods: [{ id: 'm1', name: 'RED4ext', enabled: true } as never],
  }),
  game('f1', { name: 'FiveM — Default', execPath: 'C:\\FiveM\\FiveM.exe', profiles: [{ id: 'p3', name: 'Default' }] }),
  game('f2', { name: 'FiveM — Graphics', execPath: 'D:\\FiveM\\FiveM.exe', profiles: [{ id: 'p4', name: 'Graphics' }] }),
  game('nt', { name: 'Photoshop', itemKind: 'software' }),
]

test('globalSearch : trouve un jeu par nom, fournisseur ou éditeur', () => {
  assert.equal(globalSearch({ query: 'cyber', games, gameGroups: groups, addons: [] })[0]?.kind, 'game')
  assert.equal(globalSearch({ query: 'cyber', games, gameGroups: groups, addons: [] })[0]?.gameId, 'cp')
  // Éditeur.
  assert.ok(globalSearch({ query: 'projekt', games, gameGroups: groups, addons: [] }).some(r => r.gameId === 'cp'))
})

test('globalSearch : trouve un profil et l\'associe à son jeu', () => {
  const results = globalSearch({ query: 'cinematic', games, gameGroups: groups, addons: [] })
  const hit = results.find(r => r.kind === 'profile')
  assert.ok(hit)
  assert.equal(hit.gameId, 'cp')
  assert.equal(hit.profileId, 'p1')
})

test('globalSearch : trouve un mod et un add-on', () => {
  const mods = globalSearch({ query: 'red4ext', games, gameGroups: groups, addons: [] })
  assert.ok(mods.some(r => r.kind === 'mod' && r.gameId === 'cp'))
  const addons = globalSearch({ query: 'reshade', games, gameGroups: groups, addons: [addon('official.zailon.reshade', 'ReShade Manager')] })
  assert.ok(addons.some(r => r.kind === 'addon' && r.title === 'ReShade Manager'))
})

test('globalSearch : trouve un groupe par nom', () => {
  const results = globalSearch({ query: 'fivem', games, gameGroups: groups, addons: [] })
  assert.ok(results.some(r => r.kind === 'group' && r.key === 'group:g1'))
})

test('globalSearch : distingue les applications', () => {
  const results = globalSearch({ query: 'photoshop', games, gameGroups: groups, addons: [] })
  assert.equal(results[0]?.kind, 'game')
  assert.equal(results[0]?.subtitle, 'Application')
})

test('globalSearch : requête vide ou sans match → aucun résultat', () => {
  assert.deepEqual(globalSearch({ query: '', games, gameGroups: groups, addons: [] }), [])
  assert.deepEqual(globalSearch({ query: 'zzzz', games, gameGroups: groups, addons: [] }), [])
})

test('globalSearch : tri par score (préfixe avant sous-chaîne) et borne le total', () => {
  const results = globalSearch({ query: 'five', games, gameGroups: groups, addons: [] })
  // « FiveM » (groupe et jeux) : les préfixes passent devant les sous-chaînes.
  const first = results[0]
  assert.ok(first.title.toLocaleLowerCase().startsWith('five'))
  // La borne est respectée même sur une requête large.
  const wide = globalSearch({ query: 'a', games, gameGroups: groups, addons: [] }, 3)
  assert.ok(wide.length <= 3)
})
