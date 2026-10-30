import test from 'node:test'
import assert from 'node:assert/strict'
import { extractReShade5Id, hasReShade5Id, parseCitizenFx, removeReShade5Id, setReShade5Id } from '../../src/lib/citizenfx.ts'
import { classifyFiveMPack, detectFiveMStructure, fiveMReShadeCompatibility, isFiveMName } from '../../src/lib/fivemSupport.ts'
import { groupTotalPlaytime, normalizeGameGroups, proposeGameGroups } from '../../src/lib/gameGroups.ts'
import type { Game } from '../../src/types/index.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── CitizenFX.ini : éditeur sécurisé (spec §6, §8-9, §20) ───────────────────

const SAMPLE = `[Game]\nIVPath=G:\\Games\\GTAV\nUpdateChannel=beta\nSavedBuildNumber=3570\n\n[Addons]\nSomeOther=keep-me\n`

test('parseCitizenFx : lit IVPath sans jamais le modifier', () => {
  const parsed = parseCitizenFx(SAMPLE)
  assert.equal(parsed.gamePath, 'G:\\Games\\GTAV')
  assert.equal(parsed.updateChannel, 'beta')
  assert.equal(parsed.savedBuildNumber, '3570')
  assert.equal(parsed.reshade5Id, undefined)
  assert.equal(parsed.raw, SAMPLE)
})

test('setReShade5Id : ajoute la ligne [Addons] en préservant tout le reste', () => {
  const out = setReShade5Id(SAMPLE, 'ABCD1234')
  assert.ok(out.includes('[Game]'))
  assert.ok(out.includes('IVPath=G:\\Games\\GTAV'))
  assert.ok(out.includes('UpdateChannel=beta'))
  assert.ok(out.includes('SavedBuildNumber=3570'))
  assert.ok(out.includes('SomeOther=keep-me'))
  assert.ok(out.includes('ReShade5=ID:ABCD1234 acknowledged that ReShade 5.x has a bug that will lead to game crashes'))
  // Les autres clés restent intactes, l'ID est exact.
  assert.equal(parseCitizenFx(out).reshade5Id, 'ABCD1234')
  assert.equal(parseCitizenFx(out).gamePath, 'G:\\Games\\GTAV')
})

test('setReShade5Id : remplace un ID existant sans doublon', () => {
  const first = setReShade5Id(SAMPLE, 'OLDID000')
  const second = setReShade5Id(first, 'NEWID111')
  const count = (second.match(/ReShade5=/g) || []).length
  assert.equal(count, 1)
  assert.equal(parseCitizenFx(second).reshade5Id, 'NEWID111')
  assert.ok(!second.includes('OLDID000'))
  assert.ok(second.includes('SomeOther=keep-me'))
})

test('setReShade5Id : crée la section [Addons] si absente', () => {
  const out = setReShade5Id('[Game]\nIVPath=C:\\Games\\GTAV\n', 'XYZ99')
  assert.ok(out.includes('[Addons]'))
  assert.ok(out.includes('ReShade5=ID:XYZ99'))
  assert.ok(out.includes('IVPath=C:\\Games\\GTAV'))
})

test('hasReShade5Id / removeReShade5Id : retire UNIQUEMENT la ligne ZAILON', () => {
  const added = setReShade5Id(SAMPLE, 'TOBEGONE')
  assert.equal(hasReShade5Id(added), true)
  const removed = removeReShade5Id(added)
  assert.equal(hasReShade5Id(removed), false)
  assert.ok(removed.includes('SomeOther=keep-me'))
  assert.ok(removed.includes('[Addons]'))
  assert.ok(removed.includes('[Game]'))
  assert.ok(!removed.includes('ReShade5'))
})

test('extractReShade5Id : extrait l’ID des formats courants', () => {
  assert.equal(extractReShade5Id('ID:ABCD1234 acknowledged that ReShade 5.x has a bug'), 'ABCD1234')
  assert.equal(extractReShade5Id('ID:0d1dd633'), '0d1dd633')
  assert.equal(extractReShade5Id('ReShade5'), undefined)
})

// ── Détection / classification FiveM (spec §1, §4, §26) ─────────────────────

test('detectFiveMStructure : détecte FiveM.app, dossiers et citizenfx.ini', () => {
  const structure = detectFiveMStructure({
    installDirectory: 'C:\\Games\\FiveM',
    observedPaths: [
      'C:\\Games\\FiveM\\FiveM.exe',
      'C:\\Games\\FiveM\\FiveM.app\\citizenfx.ini',
      'C:\\Games\\FiveM\\FiveM.app\\mods\\x',
      'C:\\Games\\FiveM\\FiveM.app\\plugins\\y',
    ],
  })
  assert.equal(structure.root, 'C:\\Games\\FiveM')
  assert.equal(structure.hasCitizenFxIni, true)
  assert.equal(structure.folders.mods, true)
  assert.equal(structure.folders.plugins, true)
  assert.equal(structure.folders.citizen, false)
})

test('isFiveMName : marqueurs FiveM reconnus', () => {
  assert.equal(isFiveMName('FiveM'), true)
  assert.equal(isFiveMName('Five M'), true)
  assert.equal(isFiveMName('CitizenFX'), true)
  assert.equal(isFiveMName('Cyberpunk 2077'), false)
})

test('fiveMReShadeCompatibility : conservateur, jamais « dernière = bonne »', () => {
  assert.equal(fiveMReShadeCompatibility(), 'unknown')
  assert.equal(fiveMReShadeCompatibility('5.9.2'), 'compatible')
  assert.equal(fiveMReShadeCompatibility('6.1.0'), 'unknown')
  assert.equal(fiveMReShadeCompatibility('6.1.0', { knownBad: ['6.1.0'] }), 'risky')
  assert.equal(fiveMReShadeCompatibility('5.9.2', { knownGood: ['5.9.2'] }), 'recommended')
})

test('classifyFiveMPack : sépare FiveM / ReShade / GTA V / inconnu + fichiers sensibles', () => {
  const classification = classifyFiveMPack([
    'mods/graphicpack/',
    'plugins/dxgi.dll',
    'reshade-shaders/Shaders/foo.fx',
    'ReShade.ini',
    'scripts/gtav-mod.asi',
    'x64/unknown.rpf',
    'random-file.txt',
    'launcher.exe',
  ])
  assert.equal(classification.hasFiveM, true)
  assert.equal(classification.hasReShade, true)
  assert.equal(classification.hasGtaV, true)
  assert.ok(classification.unknownFiles.includes('random-file.txt'))
  assert.ok(classification.sensitiveFiles.includes('plugins/dxgi.dll'))
  assert.ok(classification.sensitiveFiles.includes('launcher.exe'))
})

// ── Groupes de jeux (spec §1-4, §7, §10) ────────────────────────────────────

const game = (id: string, execPath?: string, groupId?: string, playtime = 0): Game => ({
  id, name: id, installedMods: [], profiles: [], totalPlaytime: playtime, execPath, groupId,
})

test('proposeGameGroups : regroupe les jeux au même exécutable, jamais en auto', () => {
  const games = [
    game('f1', 'C:\\FiveM\\FiveM.exe'),
    game('f2', 'D:\\FiveM\\FiveM.exe'),
    game('c1', 'C:\\Cyberpunk\\Cyberpunk2077.exe'),
  ]
  const suggestions = proposeGameGroups(games)
  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].name, 'FiveM')
  assert.deepEqual(suggestions[0].gameIds.sort(), ['f1', 'f2'])
})

test('proposeGameGroups : ignore les jeux déjà groupés et les exécutables uniques', () => {
  const games = [
    game('f1', 'C:\\FiveM\\FiveM.exe', 'g1'),
    game('f2', 'D:\\FiveM\\FiveM.exe', 'g1'),
    game('c1', 'C:\\Cyberpunk\\Cyberpunk2077.exe'),
  ]
  assert.equal(proposeGameGroups(games).length, 0)
})

test('groupTotalPlaytime : somme des membres, séparée des profils', () => {
  const games = [game('a', undefined, 'g1', 42), game('b', undefined, 'g1', 61), game('c', undefined, undefined, 23)]
  const total = groupTotalPlaytime(games, { id: 'g1', name: 'FiveM', memberGameIds: ['a', 'b'], createdAt: 0 })
  assert.equal(total, 103)
})

// ── Gating UI : le dialogue ReShade FiveM n'est atteignable que gated ───────

test('GamesView : le bouton et le dialogue ReShade FiveM sont conditionnés par la gate fivem.profiles', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  assert.ok(gamesView.includes("fiveMProfiles && selectedGame.provider === 'FiveM Client' && <button"), 'bouton ReShade FiveM gated')
  assert.ok(gamesView.includes('fiveMProfiles && fivemReShadeOpen'), 'dialogue ReShade FiveM gated')
})

test('le dialogue réutilise l’éditeur pur citizenfx (aucune écriture hors validation)', () => {
  const dialog = readFileSync(join(root, 'src/components/FiveMReShadeDialog.tsx'), 'utf8')
  assert.ok(dialog.includes('setReShade5Id'), 'aperçu via la lib pure')
  assert.ok(dialog.includes('removeReShade5Id'), 'retrait via la lib pure')
  assert.ok(dialog.includes('writeCitizenFx'), 'écriture avec backup')
})

test('normalizeGameGroups : retire les membres inexistants et les groupes vides', () => {
  const games = [game('a', undefined, 'g1'), game('b')]
  const normalized = normalizeGameGroups([{ id: 'g1', name: 'FiveM', memberGameIds: ['a', 'ghost'], createdAt: 0 }, { id: 'g2', name: 'Vide', memberGameIds: ['ghost'], createdAt: 0 }], games)
  assert.equal(normalized.length, 1)
  assert.deepEqual(normalized[0].memberGameIds, ['a'])
})
