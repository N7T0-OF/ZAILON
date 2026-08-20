import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chainAcceptsDetectedGame, chainAfterLauncherExit, chainExpectsElevation, chainIsDirect } from '../../src/lib/launchChain.ts'
import { adapterFor, frostyLaunchAdapter } from '../../src/lib/launchAdapters.ts'
import type { Game } from '../../src/types/index.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const game = (name: string, execPath?: string): Game => ({
  id: name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  execPath,
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
})

test('chaîne Frosty : le launcher qui sort ne termine jamais la session', () => {
  const frosty = frostyLaunchAdapter('C:\\Games\\Need for Speed\\NFS16.exe')
  assert.ok(frosty)
  assert.equal(chainAfterLauncherExit(frosty), 'wait-for-game')
  assert.equal(chainExpectsElevation(frosty), false)
  // Le processus final détecté est accepté (« En cours »), même si Frosty reste ouvert.
  assert.equal(chainAcceptsDetectedGame(frosty, 'NFS16.exe'), true)
})

test('chaîne NTE : la sortie du launcher attend l\u2019élévation puis le jeu', () => {
  const nte = adapterFor(game('Neverness to Everness'))
  assert.equal(chainAfterLauncherExit(nte), 'wait-for-elevation')
  assert.equal(chainExpectsElevation(nte), true)
})

test('chaîne FiveM : la sortie de FiveM attend CitizenFX/GTA5.exe', () => {
  const fivem = adapterFor(game('FiveM'))
  assert.equal(chainAfterLauncherExit(fivem), 'wait-for-game')
  assert.equal(chainExpectsElevation(fivem), false)
})

test('processus direct (Cyberpunk) : la sortie du processus termine la session', () => {
  const cyberpunk = adapterFor(game('Cyberpunk 2077'))
  assert.equal(chainAfterLauncherExit(cyberpunk), 'end')
  assert.equal(chainIsDirect(cyberpunk), true)
})

test('chaîne universelle : le jeu détecté est « En cours », jamais le launcher', () => {
  const frosty = frostyLaunchAdapter('NFS16.exe')
  assert.ok(frosty)
  // La détection du processus FINAL est acceptée.
  assert.equal(chainAcceptsDetectedGame(frosty, 'NFS16.exe'), true)
  // Un processus sans identité n'est jamais rattaché à l'aveugle (évite les faux positifs).
  assert.equal(chainAcceptsDetectedGame(frosty, ''), false)
})

test('le store délègue la décision de chaîne à la lib pure (pas de logique dupliquée)', () => {
  const store = readFileSync(join(root, 'src/store/useStore.ts'), 'utf8')
  assert.ok(store.includes("import { chainAfterLauncherExit, chainExpectsElevation } from '../lib/launchChain'"), 'import de la lib pure')
  assert.ok(store.includes('const outcome = chainAfterLauncherExit(adapter)'), 'décision via chainAfterLauncherExit')
  assert.ok(store.includes('const expectsElevation = chainExpectsElevation(adapter)'), 'élévation via chainExpectsElevation')
})
