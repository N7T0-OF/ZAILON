/**
 * Tests du nettoyage des ressources orphelines (spec « ZAILON Lite / Core »
 * §10) — partie PURE : l'ensemble des chemins d'artwork référencés par le
 * store et les messages de résultat. La suppression disque est testée côté
 * Rust (`cleanup_orphaned_resources_in`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanupSummaryMessage,
  formatFreedBytes,
  referencedResourcePaths,
} from '../../src/lib/resourceCleanup.ts'
import type { Game } from '../../src/types/index.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const game = (resources: Game['resources'] | undefined): Game => ({
  id: 'g1',
  name: 'Test',
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
  resources,
})

test('referencedResourcePaths : collecte les 7 emplacements, déduplique', () => {
  const games = [
    game({ coverPath: 'C:/data/games/g1/resources/cover-a.webp', backgroundPath: 'C:/data/games/g1/resources/background-a.webp' }),
    game({ coverPath: 'C:/data/games/g1/resources/cover-a.webp', bannerPath: 'C:/data/games/g1/resources/banner-b.jpg' }),
    game(undefined),
  ]
  const paths = referencedResourcePaths(games)
  assert.equal(paths.length, 3)
  assert.ok(paths.includes('C:/data/games/g1/resources/cover-a.webp'))
  assert.ok(paths.includes('C:/data/games/g1/resources/background-a.webp'))
  assert.ok(paths.includes('C:/data/games/g1/resources/banner-b.jpg'))
})

test('referencedResourcePaths : ignore les valeurs vides et les fichiers vides', () => {
  const games = [game({ coverPath: '', logoPath: '   ' })]
  assert.deepEqual(referencedResourcePaths(games), [])
})

test('formatFreedBytes : unités lisibles', () => {
  assert.equal(formatFreedBytes(0), '0 o')
  assert.equal(formatFreedBytes(512), '512 o')
  assert.equal(formatFreedBytes(2048), '2 Ko')
  assert.equal(formatFreedBytes(3 * 1024 * 1024 + 400 * 1024), '3,4 Mo')
})

test('cleanupSummaryMessage : propre vs fichiers supprimés', () => {
  assert.match(cleanupSummaryMessage({ removed: 0, freedBytes: 0 }), /Aucune ressource orpheline/)
  assert.match(cleanupSummaryMessage({ removed: 1, freedBytes: 2048 }), /1 fichier orphelin supprimé/)
  assert.match(cleanupSummaryMessage({ removed: 5, freedBytes: 3 * 1024 * 1024 }), /5 fichiers orphelins supprimés/)
  assert.match(cleanupSummaryMessage({ removed: 5, freedBytes: 3 * 1024 * 1024 }), /3 Mo libérés/)
})

test('spec §10 : le nettoyage auto est lancé en phase idle, silencieux', () => {
  const app = read('src/App.tsx')
  assert.ok(app.includes("schedule('idle', 'Nettoyage des ressources orphelines'"), 'nettoyage planifié en phase idle')
  assert.ok(app.includes('runResourceCleanup({ silent: true })'), 'nettoyage auto silencieux au démarrage')
  const store = read('src/store/useStore.ts')
  assert.ok(store.includes('cleanupOrphanedGameResources'), 'le store appelle la commande native')
  assert.ok(store.includes('referencedResourcePaths'), 'le référentiel est construit depuis le store')
})
