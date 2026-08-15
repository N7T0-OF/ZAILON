import test from 'node:test'
import assert from 'node:assert/strict'
import { groupLastPlayed, groupMembers, groupModCount, groupProfileCount, groupTotalPlaytime, reorderArray } from '../../src/lib/gameGroups.ts'
import type { Game, GameGroup } from '../../src/types/index.ts'

const game = (id: string, overrides: Partial<Game> = {}): Game => ({
  id,
  name: id,
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
  ...overrides,
})

const group = (memberGameIds: string[]): GameGroup => ({ id: 'g1', name: 'FiveM', memberGameIds, createdAt: 0 })

test('groupProfileCount : somme des profils des membres, jamais fusionnée', () => {
  const games = [
    game('a', { profiles: [{ id: 'p1', name: 'Default' }, { id: 'p2', name: 'Graphics' }] }),
    game('b', { profiles: [{ id: 'p3', name: 'Vanilla' }] }),
    game('c', { profiles: [{ id: 'p4', name: 'Autre' }] }),
  ]
  assert.equal(groupProfileCount(games, group(['a', 'b'])), 3)
})

test('groupModCount : somme des mods des membres', () => {
  const games = [
    game('a', { installedMods: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] }),
    game('b', { installedMods: [{ id: 'm4' }] }),
  ]
  assert.equal(groupModCount(games, group(['a', 'b'])), 4)
})

test('groupLastPlayed : le plus récent des membres, undefined si aucun', () => {
  const games = [
    game('a', { lastPlayed: 1_000 }),
    game('b', { lastPlayed: 3_000 }),
    game('c', { lastPlayed: 2_000 }),
  ]
  assert.equal(groupLastPlayed(games, group(['a', 'b'])), 3_000)
  assert.equal(groupLastPlayed(games, group([])), undefined)
  assert.equal(groupLastPlayed([game('x')], group(['x'])), undefined)
})

test('groupMembers : ordre déclaré, membres inexistants ignorés', () => {
  const games = [game('a'), game('b')]
  assert.deepEqual(groupMembers(games, group(['b', 'a', 'ghost'])).map(g => g.id), ['b', 'a'])
})

test('reorderArray : décale d\'une case, bornes respectées', () => {
  const items = ['a', 'b', 'c']
  assert.deepEqual(reorderArray(items, 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(reorderArray(items, 2, -1), ['a', 'c', 'b'])
  // Aux bornes : aucun changement (jamais de perte d'ordre).
  assert.deepEqual(reorderArray(items, 0, -1), items)
  assert.deepEqual(reorderArray(items, 2, 1), items)
  assert.equal(reorderArray(items, 0, -1), items) // même référence si sans effet
})

test('groupTotalPlaytime : somme, séparée des profils', () => {
  const games = [game('a', { totalPlaytime: 42 }), game('b', { totalPlaytime: 61 })]
  assert.equal(groupTotalPlaytime(games, group(['a', 'b'])), 103)
})
