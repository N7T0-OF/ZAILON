import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeProfileCode, encodeProfileCode, isProfileCode, MAX_PROFILE_CODE_BYTES, summarizeProfileCode, validateManifestShape } from '../../src/lib/profileShareCode.ts'
import type { ProfileArchiveManifest } from '../../src/types/index.ts'

function manifest(overrides: Partial<ProfileArchiveManifest> = {}): ProfileArchiveManifest {
  return {
    schemaVersion: 1,
    exportedAt: '2026-08-10T00:00:00.000Z',
    app: 'ZAILON',
    appVersion: '1.65.0',
    exportMode: 'light',
    game: { name: 'Cyberpunk 2077', provider: 'gog', providerGameId: '1423040' },
    profile: { id: 'p1', gameId: 'g1', name: 'Default', modStates: { m1: { enabled: true, priority: 0 } }, playtime: 0, createdAt: 1 },
    mods: [{ id: 'm1', name: 'Better X', enabled: true, loader: 'mo2', autoUpdate: false, version: '1.2', source: 'nexus', sourceUrl: 'https://www.nexusmods.com/cyberpunk2077/mods/1' }],
    ...overrides,
  }
}

test('roundtrip léger', () => {
  const code = encodeProfileCode(manifest())
  assert.ok(code.startsWith('ZAILON-PROFILE-V1:'))
  const decoded = decodeProfileCode(code)
  assert.ok(decoded)
  assert.equal(decoded.game.name, 'Cyberpunk 2077')
  assert.equal(decoded.profile.name, 'Default')
  assert.equal(decoded.mods.length, 1)
  assert.deepEqual(decoded, manifest())
})

test('tolère les retours à la ligne et espaces', () => {
  const code = encodeProfileCode(manifest())
  const decoded = decodeProfileCode(`  ${code}\n`)
  assert.ok(decoded)
})

test('refuse le bruit, préfixes inconnus et JSON arbitraire', () => {
  assert.equal(decodeProfileCode(''), null)
  assert.equal(decodeProfileCode('hello world'), null)
  assert.equal(decodeProfileCode('NODE:process.mainModule.require("child_process")'), null)
  assert.equal(decodeProfileCode('ZAILON-PROFILE-V1:not-base64!!'), null)
  assert.equal(decodeProfileCode('ZAILON-PROFILE-V1:' + Buffer.from('{"hello":1}').toString('base64url')), null)
})

test('refuse un manifeste mal formé', () => {
  assert.equal(validateManifestShape(null), false)
  assert.equal(validateManifestShape({}), false)
  assert.equal(validateManifestShape({ ...manifest(), app: 'NotZailon' }), false)
  assert.equal(validateManifestShape({ ...manifest(), schemaVersion: 99 }), false)
  assert.equal(validateManifestShape({ ...manifest(), mods: 'nope' }), false)
  assert.equal(validateManifestShape({ ...manifest(), profile: { ...manifest().profile, name: 42 } }), false)
  assert.ok(validateManifestShape(manifest()))
})

test('refuse un code trop volumineux', () => {
  const big = manifest()
  big.mods = Array.from({ length: 5000 }, (_, index) => ({
    id: `m${index}`,
    name: `Mod très long numéro ${index}`.repeat(20),
    enabled: true,
    loader: 'mo2' as const,
    autoUpdate: false,
  }))
  assert.throws(() => encodeProfileCode(big), /trop volumineux/)
})

test('encodeProfileCode rejette au-delà de la limite d\'octets', () => {
  const oversized = manifest()
  oversized.mods = Array.from({ length: 100 }, () => ({
    id: 'x',
    name: 'z'.repeat(8000),
    enabled: true,
    loader: 'mo2' as const,
    autoUpdate: false,
  }))
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) > MAX_PROFILE_CODE_BYTES)
  assert.throws(() => encodeProfileCode(oversized))
})

test('isProfileCode ne détecte que le préfixe exact', () => {
  assert.ok(isProfileCode('ZAILON-PROFILE-V1:abc'))
  assert.equal(isProfileCode('ZAILON-PROFILE-V2:abc'), false)
  assert.equal(isProfileCode('zailon-profile-v1:abc'), false)
  assert.equal(isProfileCode(''), false)
})

test('summarizeProfileCode tronque sans casser', () => {
  const code = encodeProfileCode(manifest())
  const summary = summarizeProfileCode(code, 40)
  assert.ok(summary.length <= 41)
  assert.ok(summary.startsWith('ZAILON-PROFILE-V1:'))
})

test('les caractères unicode survivent au roundtrip', () => {
  const m = manifest()
  m.profile = { ...m.profile, name: 'Profil — Café ☕ Épinglé' }
  const decoded = decodeProfileCode(encodeProfileCode(m))
  assert.equal(decoded?.profile.name, 'Profil — Café ☕ Épinglé')
})
