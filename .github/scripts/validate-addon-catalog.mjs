/**
 * Validation CI du catalogue officiel d'add-ons (spec « Simplification totale »
 * §6, §37-38, §49).
 *
 * Modèle : UN SEUL repository statique — AUCUNE GitHub Release. Le catalogue
 * `zailon-addons/catalog.json` (schema 2) référence des chemins RELATIFS de
 * packages versionnés, servis en contenu brut.
 *
 * Règles bloquantes :
 * - schéma = 2, catalogSchemaVersion et updatedAt présents ;
 * - chaque entrée : id immuable unique, champs obligatoires ;
 * - un add-on avec `package` : le fichier EXISTE réellement dans le dépôt,
 *   son manifest interne correspond (ID + version = catalogue), son SHA-256
 *   réel == hash du fichier, downloadSize == taille du fichier, plateformes
 *   valides, dépendances présentes dans le catalogue ;
 * - un add-on sans package (`null`) est en développement — accepté (§5) ;
 * - AUCUNE URL `releases/latest` et AUCUN champ `release`/`available` —
 *   le système Release n'existe plus (§1, §46-48).
 *
 * Exécution : `node .github/scripts/validate-addon-catalog.mjs` (Node ≥ 18,
 * aucun import TS — le catalogue JSON est la source de vérité partagée).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const catalogPath = join(root, 'zailon-addons', 'catalog.json')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

const errors = []
const VALID_PLATFORMS = new Set(['windows', 'linux', 'macos'])

if (catalog.schema !== 2) errors.push(`schema doit être 2 (reçu : ${catalog.schema}).`)
if (catalog.catalogSchemaVersion === undefined) errors.push('catalogSchemaVersion manquant (invalidation du cache, spec §47).')
if (!catalog.updatedAt) errors.push('updatedAt manquant.')
if (!Array.isArray(catalog.addons) || catalog.addons.length === 0) errors.push('addons manquant ou vide.')

const addons = Array.isArray(catalog.addons) ? catalog.addons : []
const seen = new Set()

for (const entry of addons) {
  const id = entry.id
  const label = id || '(sans id)'
  if (!id || seen.has(id)) { errors.push(`[${label}] id manquant ou dupliqué.`); continue }
  seen.add(id)

  // ID immuable : ≥ 2 segments alphanumériques minuscules (tiret interne).
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(id)) {
    errors.push(`[${label}] id invalide (≥ 2 segments, minuscules, tirets internes).`)
  }

  for (const field of ['name', 'version', 'category', 'minZailonVersion', 'description']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') errors.push(`[${label}] champ ${field} manquant.`)
  }
  if (!Array.isArray(entry.permissions) || entry.permissions.length === 0) errors.push(`[${label}] permissions manquantes.`)

  // Le système Release n'existe plus (spec §1, §46) : aucun champ `release`,
  // `available`, aucune URL `latest`.
  const serialized = JSON.stringify(entry)
  if (entry.release !== undefined || entry.available !== undefined) {
    errors.push(`[${label}] champs « release »/« available » interdits (schema 2).`)
  }
  if (serialized.includes('/releases/')) {
    errors.push(`[${label}] URL de release interdite (spec §1).`)
  }

  // Package : chemin relatif VERSIONNÉ (spec §2, §16) ou `null` (développement).
  const packagePath = entry.package
  if (packagePath === null || packagePath === undefined) continue // en développement, §5

  if (typeof packagePath !== 'string' || !/^packages\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.zailon-addon$/.test(packagePath)) {
    errors.push(`[${label}] package invalide (attendu packages/<dir>/<id>-<version>.zailon-addon).`)
    continue
  }

  const absPath = join(root, 'zailon-addons', packagePath)
  if (!existsSync(absPath)) {
    errors.push(`[${label}] package introuvable dans le dépôt : ${packagePath} (spec §6).`)
    continue
  }

  // SHA-256 réel du fichier == hash du catalogue (spec §6, §20).
  const bytes = readFileSync(absPath)
  const actualSha = createHash('sha256').update(bytes).digest('hex')
  const expectedSha = typeof entry.sha256 === 'string' ? entry.sha256 : ''
  if (!/^[0-9a-f]{64}$/i.test(expectedSha) || expectedSha.toLowerCase() !== actualSha) {
    errors.push(`[${label}] SHA-256 du catalogue ≠ fichier (${actualSha.slice(0, 12)}…).`)
  }
  if (typeof entry.downloadSize !== 'number' || entry.downloadSize !== bytes.length) {
    errors.push(`[${label}] downloadSize ≠ taille réelle du fichier (${bytes.length}).`)
  }
  if (Array.isArray(entry.platforms)) {
    for (const platform of entry.platforms) {
      if (!VALID_PLATFORMS.has(platform)) errors.push(`[${label}] plateforme invalide : ${platform}.`)
    }
  }
  // Dépendances présentes dans le catalogue (spec §6, §31).
  for (const dep of entry.dependencies || []) {
    if (!addons.some(item => item.id === dep)) errors.push(`[${label}] dépendance absente du catalogue : ${dep}.`)
  }

  // Manifest interne du package : ID + version = catalogue (spec §6, §36).
  const unzip = spawnSync('python', ['-c', `
import json, zipfile
with zipfile.ZipFile(r"${absPath}") as z:
    manifest = json.loads(z.read("manifest.json"))
print(json.dumps(manifest))
`], { encoding: 'utf8' })
  if (unzip.status !== 0) {
    errors.push(`[${label}] manifest illisible dans le package : ${unzip.stderr || 'erreur zip'}`)
  } else {
    const manifest = JSON.parse(unzip.stdout.trim().split('\n').pop())
    if (manifest.id !== id) errors.push(`[${label}] manifest.id ≠ id catalogue (${manifest.id}).`)
    if (manifest.version !== entry.version) errors.push(`[${label}] manifest.version ≠ version catalogue (${manifest.version}).`)
  }
}

if (errors.length > 0) {
  console.error(`Catalogue invalide (${errors.length} erreur(s)) :`)
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

const packaged = addons.filter(entry => entry.package != null).length
console.log(`Catalogue OK : ${addons.length} add-ons, ${packaged} avec package, aucun URL de release.`)
