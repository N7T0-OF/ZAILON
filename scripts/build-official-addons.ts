#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-official-addons.ts — construit les add-ons officiels (spec §9-11, §16,
// §45). Empaquette chaque dossier `addons/<id>/` en `.zailon-addon` déterministe
// dans `dist/`, calcule SHA-256 + taille et affiche le bloc de métadonnées à
// copier dans `src/lib/official-addon-catalog.json` (§4, §38).
//
//   node scripts/build-official-addons.ts
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { packAddonFolder } from '../.github/scripts/addon-cli.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const addonsRoot = join(root, 'addons')
const outDir = join(root, 'dist')

if (!existsSync(addonsRoot)) {
  console.error('Aucun dossier addons/ — rien à construire.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

const directories = readdirSync(addonsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

if (directories.length === 0) {
  console.error('Aucun add-on officiel dans addons/.')
  process.exit(1)
}

let failed = false

for (const id of directories) {
  const sourceDir = join(addonsRoot, id)
  const manifest = JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8')) as { id: string; version: string }

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

  const fileName = `${manifest.id}-v${manifest.version}.zailon-addon`
  const outPath = join(outDir, fileName)
  writeFileSync(outPath, a)
  const sha256 = createHash('sha256').update(a).digest('hex')

  console.log(`✓ ${id} v${manifest.version} — ${a.length} o — SHA-256 ${sha256.slice(0, 16)}…`)
  console.log(`  → ${fileName}`)
  console.log('  Bloc catalogue :')
  console.log(`    "release": { "repository": "N7T0-OF/zailon-addons", "tag": "${id.split('.').pop()}-v${manifest.version}", "asset": "${fileName}" },`)
  console.log(`    "sha256": "${sha256}", "size": ${a.length},`)
  console.log('')
}

if (failed) process.exit(1)
console.log(`Build terminé : ${directories.length} add-on(s) dans dist/ — métadonnées prêtes pour le catalogue.`)
