import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAddonCatalog } from '../../src/lib/addons.ts'
import { addonSignaturePolicy, hasAddonSignature, hasRealSha256 } from '../../src/lib/addonsInstall.ts'
import type { AddonCatalogEntry } from '../../src/lib/addons.ts'

const baseEntry: AddonCatalogEntry = {
  id: 'official.zailon.test',
  name: 'Test',
  version: '1.0.0',
  category: 'modding',
  size: 1000,
  download: 'https://example.com/test.zailon-addon',
  sha256: 'catalog',
  minZailonVersion: '1.0.0',
  permissions: [],
  description: 'Test',
  official: true,
}

test('hasAddonSignature : les deux champs sont nécessaires', () => {
  assert.equal(hasAddonSignature({}), false)
  assert.equal(hasAddonSignature({ signature: 'abc' }), false)
  assert.equal(hasAddonSignature({ signaturePublicKey: 'xyz' }), false)
  assert.equal(hasAddonSignature({ signature: 'abc', signaturePublicKey: 'xyz' }), true)
})

test('hasRealSha256 : placeholder catalogue exclu', () => {
  assert.equal(hasRealSha256({ sha256: 'catalog' }), false)
  assert.equal(hasRealSha256({ sha256: '' }), false)
  assert.equal(hasRealSha256({ sha256: 'a1b2'.repeat(16) }), true)
})

test('officiel + SHA-256 réel sans signature → refusé (spec §14)', () => {
  const policy = addonSignaturePolicy({ ...baseEntry, sha256: 'a1b2'.repeat(16) })
  assert.equal(policy.required, true)
  assert.match(policy.reason, /refusée/)
})

test('officiel + SHA-256 réel avec signature → vérifiée', () => {
  const policy = addonSignaturePolicy({ ...baseEntry, sha256: 'a1b2'.repeat(16), signature: 'sig', signaturePublicKey: 'key' })
  assert.equal(policy.required, true)
  assert.match(policy.reason, /vérifiée/)
})

test('officiel + SHA-256 placeholder → pas encore exigible', () => {
  const policy = addonSignaturePolicy(baseEntry)
  assert.equal(policy.required, false)
  assert.match(policy.reason, /en attente/)
})

test('communautaire sans signature → facultative', () => {
  const policy = addonSignaturePolicy({ ...baseEntry, official: false })
  assert.equal(policy.required, false)
  assert.match(policy.reason, /facultative/)
})

test('communautaire avec signature → vérifiée', () => {
  const policy = addonSignaturePolicy({ ...baseEntry, official: false, signature: 'sig', signaturePublicKey: 'key' })
  assert.equal(policy.required, false)
  assert.match(policy.reason, /vérifiée/)
})

test('parseAddonCatalog : signature sans clé publique → entrée rejetée', () => {
  const result = parseAddonCatalog({
    schema: 1,
    addons: [
      {
        id: 'official.zailon.signed',
        name: 'Signed',
        version: '1.0.0',
        category: 'modding',
        size: 10,
        download: 'https://example.com/a.zailon-addon',
        sha256: 'a1b2'.repeat(16),
        minZailonVersion: '1.0.0',
        description: 'Signed',
        permissions: [],
        signature: 'c2ln',
      },
    ],
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('signature et signaturePublicKey')))
})

test('parseAddonCatalog : signature + clé acceptées', () => {
  const result = parseAddonCatalog({
    schema: 1,
    addons: [
      {
        id: 'official.zailon.signed',
        name: 'Signed',
        version: '1.0.0',
        category: 'modding',
        size: 10,
        download: 'https://example.com/a.zailon-addon',
        sha256: 'a1b2'.repeat(16),
        minZailonVersion: '1.0.0',
        description: 'Signed',
        permissions: [],
        signature: 'c2ln',
        signaturePublicKey: 'a2V5',
      },
    ],
  })
  assert.equal(result.ok, true)
  assert.equal(result.catalog?.addons[0]?.signature, 'c2ln')
  assert.equal(result.catalog?.addons[0]?.signaturePublicKey, 'a2V5')
})
