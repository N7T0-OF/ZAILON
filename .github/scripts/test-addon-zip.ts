import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildZip, crc32, readZipEntryNames } from '../../src/lib/addonZip.ts'
import { packAddonFolder, scaffoldAddon, validateAddonFolder, sha256Hex } from './addon-cli.ts'

const text = (value: string): Uint8Array => new TextEncoder().encode(value)

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(text('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
})

test('buildZip produces a deterministic store zip with sorted entries', () => {
  const entries = [
    { name: 'module/index.ts', data: text('export default {}') },
    { name: 'manifest.json', data: text('{"schema":1}') },
    { name: 'locales/fr.json', data: text('{"name":"x"}') },
  ]
  const first = buildZip(entries)
  const second = buildZip([...entries].reverse()) // l'ordre d'entrée ne compte pas
  assert.deepEqual(first, second, 'la sortie doit être déterministe (ordre trié)')
  assert.deepEqual(readZipEntryNames(first), ['locales/fr.json', 'manifest.json', 'module/index.ts'])
  // L'archive commence par la signature locale et se termine par EOCD
  // (signature 0x06054b50 aux 22 derniers octets).
  assert.equal(first[0], 0x50)
  assert.equal(first[1], 0x4b)
  assert.equal(first[first.length - 22], 0x50)
  assert.equal(first[first.length - 21], 0x4b)
  assert.equal(first[first.length - 20], 0x05)
  assert.equal(first[first.length - 19], 0x06)
})

test('buildZip round-trips utf-8 names and empty input', () => {
  const names = buildZip([{ name: 'réglages/é-à-ç.json', data: text('{}') }])
  assert.deepEqual(readZipEntryNames(names), ['réglages/é-à-ç.json'])
  const empty = buildZip([])
  assert.deepEqual(readZipEntryNames(empty), [])
  assert.equal(empty.length, 22) // EOCD seul
})

test('sha256Hex matches a known vector', () => {
  assert.equal(sha256Hex(text('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('packAddonFolder packs a valid folder and keeps stable bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zailon-pack-'))
  try {
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        schema: 1,
        id: 'community.tests.pack',
        name: 'Pack Test',
        version: '1.0.0',
        author: 'Tests',
        description: 'Test',
        category: 'utilities',
        minZailonVersion: '1.71.0',
        permissions: ['game.read'],
      }),
    )
    mkdirSync(join(dir, 'module'))
    writeFileSync(join(dir, 'module', 'index.ts'), text('export default {}'))

    const result = packAddonFolder(dir)
    assert.equal(result.addonId, 'community.tests.pack')
    assert.equal(result.version, '1.0.0')
    assert.equal(result.entryCount, 2)
    const names = readZipEntryNames(result.bytes!)
    assert.ok(names.includes('manifest.json'))
    assert.ok(names.includes('module/index.ts'))

    // Stabilité : repack du même contenu → mêmes octets (SHA-256 identique).
    const again = packAddonFolder(dir)
    assert.equal(sha256Hex(again.bytes!), sha256Hex(result.bytes!))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('packAddonFolder refuses a folder without manifest or with invalid manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zailon-pack-bad-'))
  try {
    assert.throws(() => packAddonFolder(dir), /manifest\.json introuvable/)
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ schema: 1, id: 'x' }))
    assert.throws(() => packAddonFolder(dir), /Manifest invalide/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('packAddonFolder dry-run reports entries without bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zailon-pack-dry-'))
  try {
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        schema: 1,
        id: 'community.tests.dry',
        name: 'Dry Run',
        version: '0.1.0',
        author: 'Tests',
        description: 'Test',
        category: 'utilities',
        minZailonVersion: '1.71.0',
        permissions: ['game.read'],
      }),
    )
    const result = packAddonFolder(dir, { dryRun: true })
    assert.equal(result.entryCount, 1)
    assert.equal(result.bytes, undefined)
    assert.equal(result.addonId, 'community.tests.dry')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('scaffoldAddon produces a folder that validates and packs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zailon-scaffold-'))
  try {
    const { manifest } = scaffoldAddon(dir, {
      id: 'community.tests.scaffold',
      name: 'Scaffold Test',
      author: 'Tests',
      version: '0.1.0',
    })
    assert.equal(manifest.id, 'community.tests.scaffold')
    assert.equal(manifest.name, 'Scaffold Test')
    assert.equal(manifest.version, '0.1.0')
    assert.ok(existsSync(join(dir, 'module', 'index.ts')))
    assert.ok(existsSync(join(dir, 'icon.svg')))
    assert.ok(validateAddonFolder(dir))
    const result = packAddonFolder(dir)
    assert.equal(result.entryCount >= 6, true, 'le template doit contenir plusieurs fichiers')
    const names = readZipEntryNames(result.bytes!)
    assert.ok(names.includes('manifest.json'))
    assert.ok(names.includes('module/index.ts'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
