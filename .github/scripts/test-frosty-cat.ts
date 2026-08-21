import test from 'node:test'
import assert from 'node:assert/strict'
import {
  catEntriesToAssets, catSummary, FROSTY_CAT_MAGIC, parseFrostyCat,
} from '../../src/lib/frostyCat.ts'

const encoder = new TextEncoder()

function u32BE(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff])
}

/** Construit un catalogue legacy (32 octets/entrée, pas de compteurs). */
function buildLegacyCat(entries: Array<{ sha1: number[]; offset: number; size: number; archive: number }>): Uint8Array {
  const parts: Uint8Array[] = [encoder.encode(FROSTY_CAT_MAGIC)]
  for (const entry of entries) {
    const sha = new Uint8Array(20).fill(0)
    entry.sha1.forEach((byte, i) => { sha[i] = byte })
    parts.push(sha, u32BE(entry.offset), u32BE(entry.size), u32BE(entry.archive))
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) { out.set(part, cursor); cursor += part.length }
  return out
}

/** Construit un catalogue moderne (36 octets/entrée + compteurs). */
function buildModernCat(count: number): Uint8Array {
  const header = encoder.encode(FROSTY_CAT_MAGIC)
  const counts = new Uint8Array([...u32BE(count), ...u32BE(0)])
  const out = new Uint8Array(16 + 8 + count * 36)
  out.set(header, 0)
  out.set(counts, 16)
  for (let i = 0; i < count; i += 1) {
    const base = 24 + i * 36
    const sha = new Uint8Array(20).fill(7)
    sha[0] = i
    out.set(sha, base)
    out.set(u32BE(1024 + i), base + 20) // offset
    out.set(u32BE(512), base + 24) // size
    out.set(u32BE(0), base + 28) // logicalOffset
    out.set(u32BE(i % 4), base + 32) // archiveIndex
  }
  return out
}

test('magic — rejet d\'un fichier non Frostbite', () => {
  const result = parseFrostyCat(encoder.encode('pas un catalogue'))
  assert.equal(result.ok, false)
})

test('format legacy (NFS 2015) — entrées de 32 octets, compteur dérivé', () => {
  const bytes = buildLegacyCat([
    { sha1: [1, 2, 3], offset: 100, size: 64, archive: 0 },
    { sha1: [4, 5, 6], offset: 200, size: 128, archive: 1 },
    { sha1: [9, 9, 9], offset: 300, size: 32, archive: 1 },
  ])
  const result = parseFrostyCat(bytes)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.format, 'legacy')
  assert.equal(result.resourceCount, 3)
  assert.equal(result.entries.length, 3)
  assert.equal(result.entries[0].offset, 100)
  assert.equal(result.entries[0].size, 64)
  assert.equal(result.entries[1].archiveIndex, 1)
  assert.equal(result.entries[0].logicalOffset, null)
  assert.match(result.entries[0].sha1, /^010203/)
})

test('format moderne — compteurs + LogicalOffset (36 octets)', () => {
  const bytes = buildModernCat(5)
  const result = parseFrostyCat(bytes)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.format, 'modern')
  assert.equal(result.resourceCount, 5)
  assert.equal(result.entries.length, 5)
  assert.equal(result.entries[0].size, 512)
  assert.equal(result.entries[3].archiveIndex, 3)
  assert.equal(result.entries[0].logicalOffset, 0)
})

test('modern dégradé → legacy (validation par longueur)', () => {
  // Un legacy qui ressemble à un moderne invalide doit retomber en legacy.
  const bytes = buildLegacyCat([{ sha1: [1], offset: 10, size: 10, archive: 0 }])
  const result = parseFrostyCat(bytes)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.format, 'legacy')
})

test('catEntriesToAssets — ressources réelles en chunks', () => {
  const bytes = buildLegacyCat([
    { sha1: [1, 2, 3], offset: 0, size: 4096, archive: 0 },
    { sha1: [4, 5, 6], offset: 0, size: 8192, archive: 2 },
  ])
  const result = parseFrostyCat(bytes)
  if (!result.ok) throw new Error('parse failed')
  const assets = catEntriesToAssets('cat.bin', result.entries)
  assert.equal(assets.length, 2)
  assert.equal(assets[0].type, 'chunk')
  assert.equal(assets[0].size, 4096)
  assert.ok(assets[0].resourceType.includes('Cas#0'))
  assert.ok(assets[1].resourceType.includes('Cas#2'))
  assert.ok(assets[0].id.startsWith('cat:'))
})

test('résumé du catalogue', () => {
  const bytes = buildModernCat(12)
  const result = parseFrostyCat(bytes)
  if (!result.ok) throw new Error('parse failed')
  const summary = catSummary(result.entries)
  assert.equal(summary.count, 12)
  assert.equal(summary.bytes, 12 * 512)
  assert.equal(summary.archives, 4)
})
