/**
 * Tests des décisions de raccourci bureau (spec « Fix création de raccourci »)
 * — logique PURE : mode (via ZAILON vs direct), viabilité du direct, profil
 * cible. Un jeu à chaîne de lancement ne passe JAMAIS en direct.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { directShortcutViable, shortcutModeFor, shortcutProfileId } from '../../src/lib/shortcuts.ts'
import type { Game } from '../../src/types.ts'

const game = (name: string, execPath?: string, profiles: Array<{ id: string; isDefault?: boolean }> = []): Game => ({
  id: name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  execPath,
  installedMods: [],
  profiles: profiles.map(profile => ({ id: profile.id, name: profile.id, modStates: {}, playtime: 0, createdAt: 0, ...profile }) as Game['profiles'][number]),
  totalPlaytime: 0,
} as Game)

test('directShortcutViable : processus direct + exécutable = viable', () => {
  assert.equal(directShortcutViable(game('Cyberpunk 2077', 'C:\\Games\\CP2077\\Cyberpunk2077.exe')), true)
  // FiveM est un launcher externe — jamais viable en direct.
  assert.equal(directShortcutViable(game('FiveM', 'C:\\FiveM\\FiveM.exe')), false)
  assert.equal(directShortcutViable(game('Cyberpunk 2077')), false) // sans exécutable
})

test('shortcutModeFor : direct accepté seulement si viable, sinon repli zailon', () => {
  const cyberpunk = game('Cyberpunk 2077', 'C:\\Games\\CP2077\\Cyberpunk2077.exe')
  assert.equal(shortcutModeFor(cyberpunk, 'direct'), 'direct')
  const fivem = game('FiveM', 'C:\\FiveM\\FiveM.exe')
  // Même demandé en direct, FiveM retombe sur ZAILON (chaîne conservée).
  assert.equal(shortcutModeFor(fivem, 'direct'), 'zailon')
  assert.equal(shortcutModeFor(fivem, 'zailon'), 'zailon')
  assert.equal(shortcutModeFor(cyberpunk, 'zailon'), 'zailon')
})

test('shortcutProfileId : profil préféré, sinon défaut, sinon premier', () => {
  const g = game('Cyberpunk 2077', 'C:\\Games\\CP2077\\Cyberpunk2077.exe', [
    { id: 'default', isDefault: true },
    { id: 'modded' },
  ])
  assert.equal(shortcutProfileId(g, 'modded'), 'modded')
  assert.equal(shortcutProfileId(g, 'inconnu'), 'default') // préféré inconnu → défaut
  assert.equal(shortcutProfileId(g), 'default')
  const noDefault = game('NTE', 'C:\\Games\\NTE\\HT-Win64-Shipping.exe', [{ id: 'a' }, { id: 'b' }])
  assert.equal(shortcutProfileId(noDefault), 'a')
  assert.equal(shortcutProfileId(noDefault, 'b'), 'b')
})
