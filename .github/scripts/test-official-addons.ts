/**
 * Tests des add-ons officiels RÉELS (spec « Simplification totale » §6, §16,
 * §38, §49).
 *
 * — chaque dossier `addons/<id>/` a un manifest valide ;
 * — le pack est DÉTERMINISTE (deux builds = mêmes octets, SHA-256 fiable) ;
 * — l'archive contient manifest.json + module/index.ts ;
 * — le catalogue officiel (schema 2) référence le même SHA-256 + taille que
 *   le package construit (les métadonnées ne peuvent pas diverger de la
 *   réalité) ;
 * — le package est VERSIONNÉ dans son nom et servi par raw.githubusercontent
 *   (repository statique — AUCUNE GitHub Release, spec §1-2) ;
 * — le package existe réellement dans `zailon-addons/packages/` (§6).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { packAddonFolder } from './addon-cli.ts'
import { readZipEntryNames } from '../../src/lib/addonZip.ts'
import { OFFICIAL_ADDON_CATALOG, OFFICIAL_ADDON_REPOSITORY_URL, catalogAddonAvailability, resolveAddonDownloadUrl, validateAddonManifest } from '../../src/lib/addons.ts'
import { existsSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const addonsRoot = join(root, 'addons')

const officialIds = ['official.zailon.frosty', 'official.zailon.frosty-editor']

test('chaque add-on officiel a un manifest valide (validateAddonManifest)', () => {
  const dirs = readdirSync(addonsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  assert.ok(dirs.includes('official.zailon.frosty'), 'Frosty Support présent')
  assert.ok(dirs.includes('official.zailon.frosty-editor'), 'Frosty Editor présent')
  for (const id of officialIds) {
    const raw = readFileSync(join(addonsRoot, id, 'manifest.json'), 'utf8')
    const result = validateAddonManifest(JSON.parse(raw))
    assert.equal(result.ok, true, `${id} : ${result.error}`)
    assert.equal(result.manifest?.id, id)
  }
})

test('pack déterministe : deux builds donnent exactement les mêmes octets', () => {
  for (const id of officialIds) {
    const first = packAddonFolder(join(addonsRoot, id))
    const second = packAddonFolder(join(addonsRoot, id))
    const a = Buffer.from(first.bytes as Uint8Array)
    const b = Buffer.from(second.bytes as Uint8Array)
    assert.ok(a.equals(b), `${id} doit être déterministe (SHA-256 vérifiable)`)

    // L'archive contient le manifest + le module + la doc.
    const names = readZipEntryNames(first.bytes as Uint8Array)
    assert.ok(names.includes('manifest.json'), `${id} : manifest.json dans l'archive`)
    assert.ok(names.includes('module/index.ts'), `${id} : module/index.ts dans l'archive`)
  }
})

test('le catalogue référence le SHA-256 et la taille réels des packages (spec §6, §38)', () => {
  for (const id of officialIds) {
    const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === id)
    assert.ok(entry, `${id} dans le catalogue`)
    const packed = packAddonFolder(join(addonsRoot, id))
    const sha = createHash('sha256').update(Buffer.from(packed.bytes as Uint8Array)).digest('hex')
    assert.equal(entry.sha256, sha, `${id} : SHA-256 du catalogue = SHA-256 du package`)
    assert.equal(entry.downloadSize, (packed.bytes as Uint8Array).length, `${id} : taille du catalogue = taille du package`)
    // Repository statique (spec §1-2, §16) : chemin relatif versionné, fichier
    // réellement présent dans zailon-addons/packages/, URL raw résolue.
    assert.ok(entry.package, `${id} : package versionné présent`)
    assert.ok(entry.package && entry.package.includes(`-v${entry.version}.zailon-addon`), `${id} : version dans le nom du fichier`)
    const absPath = join(root, 'zailon-addons', entry.package!)
    assert.ok(existsSync(absPath), `${id} : fichier package présent dans le dépôt`)
    const url = resolveAddonDownloadUrl(entry)
    assert.ok(url && url === `${OFFICIAL_ADDON_REPOSITORY_URL}${entry.package}`, `${id} : URL = BASE_URL + package`)
  }
})

test('catalogAddonAvailability : les deux add-ons avec package sont installables (spec §5, §49)', () => {
  for (const id of officialIds) {
    const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === id)
    assert.ok(entry, `${id} dans le catalogue`)
    const availability = catalogAddonAvailability(entry)
    assert.equal(availability.installable, true, `${id} : Installer disponible`)
    assert.equal(availability.status, 'available', `${id} : statut Disponible`)
    assert.ok(availability.downloadUrl, `${id} : URL de téléchargement`)
  }
})

test('Frosty Editor déclare la dépendance à Frosty Support (spec §31, §34)', () => {
  const editor = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === 'official.zailon.frosty-editor')
  assert.ok(editor?.dependencies?.includes('official.zailon.frosty'))
  const frosty = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === 'official.zailon.frosty')
  assert.ok(!frosty?.dependencies || frosty.dependencies.length === 0, 'Frosty Support n\'a pas de dépendance')
})

test('aucune URL latest/download dans le catalogue construit (spec §3, §39)', () => {
  const serialized = JSON.stringify(OFFICIAL_ADDON_CATALOG)
  assert.ok(!serialized.includes('/releases/latest/download/'))
})
