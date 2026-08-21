#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-official-addons.ts — construit les add-ons officiels et met à jour le
// catalogue (spec « Simplification totale du système d'Add-ons GitHub » §8,
// §9-10, §16, §19).
//
// Modèle : UN SEUL repository statique (aucune GitHub Release). Le catalogue
// `zailon-addons/catalog.json` (schema 2) référence des chemins RELATIFS de
// packages, et ZAILON télécharge directement le fichier demandé via
// raw.githubusercontent.com. Le nom de fichier est VERSIONNÉ :
//   `official.zailon.frosty-1.0.0.zailon-addon`
// → aucun problème de cache CDN, rollback naturel (§16-18).
//
//   node scripts/build-official-addons.ts
//
// Ce script :
//   1. empaquette chaque `addons/<id>/` en `.zailon-addon` déterministe dans
//      `zailon-addons/packages/<dir>/<id>-<version>.zailon-addon` ;
//   2. calcule SHA-256, downloadSize, installedSize ;
//   3. met à jour `zailon-addons/catalog.json` automatiquement (version,
//      sha256, tailles, package, métadonnées du manifest, updatedAt) — jamais
//      de valeurs éditées à la main (§19).
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { packAddonFolder } from '../.github/scripts/addon-cli.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const addonsRoot = join(root, 'addons')
const repoRoot = join(root, 'zailon-addons')
const catalogPath = join(repoRoot, 'catalog.json')

if (!existsSync(addonsRoot)) {
  console.error('Aucun dossier addons/ — rien à construire.')
  process.exit(1)
}
mkdirSync(join(repoRoot, 'packages'), { recursive: true })

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
  schema: number
  updatedAt?: string
  addons: Array<Record<string, unknown> & { id: string }>
}
if (catalog.schema !== 2) {
  console.error(`Catalogue non schema 2 (reçu : ${catalog.schema}) — rejetez la migration.`)
  process.exit(1)
}

const directories = readdirSync(addonsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

let failed = false

for (const id of directories) {
  const sourceDir = join(addonsRoot, id)
  const manifest = JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8')) as {
    id: string; name: string; version: string; description: string; category: string
    minZailonVersion: string; maxZailonVersion?: string; minAddonApiVersion?: string
    permissions: string[]; dependencies?: string[]; optionalDependencies?: string[]
    supportedPlatforms?: Array<'windows' | 'linux' | 'macos'>
  }

  // Pack déterministe : deux exécutions doivent produire exactement les mêmes
  // octets — sinon le SHA-256 ne serait pas fiable (§14, §38).
  const first = packAddonFolder(sourceDir)
  const second = packAddonFolder(sourceDir)
  const a = Buffer.from(first.bytes as Uint8Array)
  const b = Buffer.from(second.bytes as Uint8Array)
  if (!a.equals(b)) {
    console.error(`✖ ${id} : pack non déterministe — deux builds donnent des octets différents.`)
    failed = true
    continue
  }

  const subdir = id.split('.').pop() || id
  const fileName = `${manifest.id}-v${manifest.version}.zailon-addon`
  const outPath = join(repoRoot, 'packages', subdir, fileName)
  mkdirSync(join(repoRoot, 'packages', subdir), { recursive: true })
  writeFileSync(outPath, a)
  const sha256 = createHash('sha256').update(a).digest('hex')

  // Met à jour l'entrée du catalogue (schema 2, §19) — version, package, hash,
  // tailles et métadonnées du manifest. L'entrée peut être absente (nouvel
  // add-on) : elle est ajoutée.
  const existing = catalog.addons.find(item => item.id === id)
  const entry: Record<string, unknown> = existing ?? { id, package: null }
  entry.name = manifest.name
  entry.version = manifest.version
  entry.category = manifest.category
  entry.description = manifest.description
  entry.minZailonVersion = manifest.minZailonVersion
  entry.permissions = manifest.permissions
  if (manifest.maxZailonVersion) entry.maxZailonVersion = manifest.maxZailonVersion
  if (manifest.minAddonApiVersion) entry.minAddonApiVersion = manifest.minAddonApiVersion
  if (manifest.dependencies?.length) entry.dependencies = manifest.dependencies
  if (manifest.optionalDependencies?.length) entry.optionalDependencies = manifest.optionalDependencies
  entry.package = `packages/${subdir}/${fileName}`
  entry.sha256 = sha256
  entry.downloadSize = a.length
  entry.installedSize = Math.round(a.length * 2.5)
  entry.platforms = manifest.supportedPlatforms ?? ['windows', 'linux', 'macos']
  if (!existing) catalog.addons.push(entry)

  console.log(`✓ ${id} v${manifest.version} — ${a.length} o — SHA-256 ${sha256.slice(0, 16)}…`)
  console.log(`  → ${outPath.replace(root, '.')}`)
}

if (failed) process.exit(1)

catalog.updatedAt = new Date().toISOString().slice(0, 10)
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`\nCatalogue mis à jour : ${catalog.addons.length} add-ons, ${catalog.addons.filter(a => a.package != null).length} avec package — updatedAt ${catalog.updatedAt}.`)
console.log('Publication = commit + push (aucune GitHub Release nécessaire).')
