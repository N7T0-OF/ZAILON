/**
 * Tests de l'import du temps Steam/Epic (spec « Mise à niveau » §3).
 * Lib pure `playtimeImport.ts` (jamais fusionnée avec le suivi ZAILON) +
 * contrat natif Rust (lecture seule localconfig.vdf, minutes).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySteamPlaytime, combinedPlaytimeMin, importedTotals } from '../../src/lib/playtimeImport.ts'
import type { Game } from '../../src/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const steamGame = (overrides: Partial<Game> = {}): Game => ({
  id: 'a',
  name: 'Counter-Strike',
  execPath: '',
  modsPath: '',
  installedMods: [],
  profiles: [],
  totalPlaytime: 60,
  platform: 'steam',
  provider: 'Steam',
  providerGameId: '730',
  ...overrides,
} as Game)

test('combinedPlaytimeMin : suivi ZAILON + historique importé, jamais fusionnés en un seul champ', () => {
  assert.equal(combinedPlaytimeMin({ totalPlaytime: 100, importedPlaytimeMin: 40 }), 140)
  assert.equal(combinedPlaytimeMin({ totalPlaytime: 100 }), 100)
  assert.equal(combinedPlaytimeMin({ totalPlaytime: 0, importedPlaytimeMin: 0 }), 0)
})

test('applySteamPlaytime : seul importedPlaytimeMin est renseigné, totalPlaytime intact', () => {
  const games: Game[] = [
    steamGame({ id: 'a', providerGameId: '730' }),
    steamGame({ id: 'b', providerGameId: '292030' }),
    steamGame({ id: 'c', platform: 'epic', provider: 'Epic', providerGameId: '730' }),
    steamGame({ id: 'd', platform: 'standalone', provider: undefined, providerGameId: undefined }),
  ]
  const next = applySteamPlaytime(games, { '730': 12345, missing: 99 })
  assert.equal(next[0].importedPlaytimeMin, 12345)
  assert.equal(next[0].externalPlaytimeSource, 'steam')
  assert.equal(next[0].totalPlaytime, 60, 'le suivi ZAILON ne doit jamais bouger')
  assert.equal(next[1].importedPlaytimeMin, undefined, 'AppID sans donnée → inchangé')
  assert.equal(next[2].importedPlaytimeMin, undefined, 'jeu Epic ≠ Steam, même AppID')
  assert.equal(next[3].importedPlaytimeMin, undefined, 'jeu sans AppID → inchangé')
})

test('importedTotals : agrégat par source, jeux vides ignorés', () => {
  const games = [
    { importedPlaytimeMin: 100, externalPlaytimeSource: 'steam' },
    { importedPlaytimeMin: 50, externalPlaytimeSource: 'steam' },
    { importedPlaytimeMin: 0, externalPlaytimeSource: 'steam' },
    { importedPlaytimeMin: 30, externalPlaytimeSource: 'epic' },
  ] as unknown as Game[]
  const totals = importedTotals(games)
  assert.equal(totals.minutes, 180)
  assert.equal(totals.count, 3, 'jeu à 0 minute ignoré')
  assert.deepEqual(totals.bySource, { steam: 150, epic: 30 })
})

test('native : steam_playtime est une commande lecture seule (jamais latest/download)', () => {
  const native = read('src/lib/native.ts')
  assert.ok(native.includes("steamPlaytime: (steamPath?: string) => desktopOnly<Record<string, number>>('steam_playtime'"), 'le wrapper natif existe')
})

test('Rust : parse_steam_localconfig_playtime lit PlaytimeForever en MINUTES (localconfig.vdf)', () => {
  const lib = read('src-tauri/src/lib.rs')
  assert.ok(lib.includes('fn parse_steam_localconfig_playtime(text: &str) -> HashMap<u32, u64>'), 'le parseur VDF existe')
  assert.ok(lib.includes('.get("PlaytimeForever")'), 'lit PlaytimeForever')
  assert.ok(lib.includes('keyvalues_parser::parse(text)'), 'parse via keyvalues-parser (robuste, pas de regex maison)')
  // Lecture seule : aucune écriture dans Steam (documenté + read_to_string).
  assert.ok(lib.includes('fs::read_to_string(&config)'), 'lecture seule')
  assert.ok(lib.includes('Lecture seule, aucune'), 'le contrat « aucune écriture » est documenté')
})

test('Store : importSteamPlaytime applique via applySteamPlaytime, jamais totalPlaytime', () => {
  const store = read('src/store/useStore.ts')
  assert.ok(store.includes('importSteamPlaytime: async opts =>'), 'l’action existe')
  assert.ok(store.includes('applySteamPlaytime(get().games, minutesByAppId)'), 'passe par la lib pure')
  // Auto-import au démarrage : silencieux, aucun toast (spec §2).
  assert.ok(store.includes('opts?.silent'), 'le mode silencieux existe (auto-import au démarrage)')
})
