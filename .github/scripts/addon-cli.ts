#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// addon-cli.ts — CLI développeur `zailon addon` (spec §56)
//
//   node .github/scripts/addon-cli.ts init <dir>    [--id x] [--name y] [--author z] [--version v]
//   node .github/scripts/addon-cli.ts validate <dir>
//   node .github/scripts/addon-cli.ts pack <dir>    [-o fichier.zailon-addon] [--dry-run]
//
// Importable en tant que module (tests) : le corps du CLI ne s'exécute que
// lorsque le fichier est lancé directement (garde ESM ci-dessous).
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildZip } from '../../src/lib/addonZip.ts'
import { validateAddonManifest } from '../../src/lib/addons.ts'
import type { AddonZipEntry, PackAddonResult } from '../../src/lib/addonZip.ts'

export interface PackFolderOptions {
  dryRun?: boolean
}

/** Chemins relatifs à exclure de l'archive (pas de dépendances ni d'historique). */
const EXCLUDED_NAMES = new Set(['.git', 'node_modules'])

/**
 * Empaquette un dossier d'add-on en archive `.zailon-addon` (spec §9, §55) :
 * manifest.json racine obligatoire et validé, puis tous les fichiers embarqués
 * de façon déterministe (ZIP store, ordre trié — sortie stable, SHA-256 et
 * signature vérifiables, §14).
 */
export function packAddonFolder(folderPath: string, options: PackFolderOptions = {}): PackAddonResult {
  const manifestPath = join(folderPath, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error('manifest.json introuvable à la racine du dossier.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    throw new Error('manifest.json illisible (JSON invalide).')
  }
  const result = validateAddonManifest(parsed)
  if (!result.ok) {
    throw new Error(`Manifest invalide : ${result.error ?? 'erreur inconnue'}`)
  }
  const manifest = result.manifest!
  const entries: AddonZipEntry[] = []
  collectFiles(folderPath, folderPath, entries)
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.length, 0)
  if (options.dryRun) {
    return {
      entryCount: entries.length,
      totalBytes,
      addonId: manifest.id,
      version: manifest.version,
      name: manifest.name,
    }
  }
  return {
    bytes: buildZip(entries),
    entryCount: entries.length,
    totalBytes,
    addonId: manifest.id,
    version: manifest.version,
    name: manifest.name,
  }
}

function collectFiles(root: string, current: string, out: AddonZipEntry[]): void {
  for (const name of readdirSync(current)) {
    if (EXCLUDED_NAMES.has(name)) continue
    const full = join(current, name)
    const stat = statSync(full)
    const relative = full.slice(root.length + 1).replace(/\\/g, '/')
    if (stat.isDirectory()) {
      collectFiles(root, full, out)
    } else if (stat.isFile()) {
      out.push({ name: relative, data: new Uint8Array(readFileSync(full)) })
    }
  }
}

/** Crée un add-on à partir du template, puis patche le manifest (spec §55). */
export function scaffoldAddon(
  targetDir: string,
  meta: { id?: string; name?: string; author?: string; version?: string } = {},
): { manifestPath: string; manifest: Record<string, unknown> } {
  const templateDir = fileURLToPath(new URL('../../addon-template', import.meta.url))
  if (!existsSync(templateDir)) {
    throw new Error(`Template introuvable : ${templateDir}`)
  }
  mkdirSync(targetDir, { recursive: true })
  cpSync(templateDir, targetDir, { recursive: true })
  const manifestPath = join(targetDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  if (meta.id) manifest.id = meta.id
  if (meta.name) manifest.name = meta.name
  if (meta.author) manifest.author = meta.author
  if (meta.version) manifest.version = meta.version
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { manifestPath, manifest }
}

/** Valide le manifest d'un dossier (spec §54) — retourne vrai si valide. */
export function validateAddonFolder(folderPath: string): boolean {
  const manifestPath = join(folderPath, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`✖ manifest.json introuvable dans ${folderPath}`)
    return false
  }
  const result = validateAddonManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
  if (!result.ok) {
    console.error(`✖ Manifest invalide : ${result.error ?? 'erreur inconnue'}`)
    return false
  }
  const manifest = result.manifest!
  console.log(
    `✓ ${manifest.name} ${manifest.version} (${manifest.id})\n` +
      `  catégorie : ${manifest.category} · permissions : ${manifest.permissions.length} · événements : ${(manifest.events ?? []).length}`,
  )
  return true
}

// ─────────────────────────────── CLI (exécution directe) ────────────────────

function printUsage(): void {
  console.log(`Usage :
  zailon addon init <dir>     [--id x] [--name y] [--author z] [--version v]
  zailon addon validate <dir>
  zailon addon pack <dir>     [-o out.zailon-addon] [--dry-run]`)
}

function parseFlags(args: string[]): { positional: string[]; flags: Map<string, string>; dryRun: boolean } {
  const positional: string[] = []
  const flags = new Map<string, string>()
  let dryRun = false
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '-o' || arg.startsWith('--')) {
      const key = arg === '-o' ? 'o' : arg.slice(2)
      const value = args[i + 1]
      if (value === undefined) throw new Error(`Valeur manquante pour ${arg}`)
      flags.set(key, value)
      i += 1
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags, dryRun }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  try {
    if (command === 'init') {
      const { positional, flags } = parseFlags(rest)
      const target = positional[0]
      if (!target) {
        printUsage()
        return 1
      }
      const { manifestPath } = scaffoldAddon(target, {
        id: flags.get('id'),
        name: flags.get('name'),
        author: flags.get('author'),
        version: flags.get('version'),
      })
      console.log(`✓ Add-on créé dans ${target}`)
      console.log(`  Éditez : ${manifestPath}`)
      console.log('  Puis :  zailon addon validate <dir>  et  zailon addon pack <dir>')
      return 0
    }
    if (command === 'validate') {
      const { positional } = parseFlags(rest)
      const target = positional[0]
      if (!target) {
        printUsage()
        return 1
      }
      return validateAddonFolder(target) ? 0 : 1
    }
    if (command === 'pack') {
      const { positional, flags, dryRun } = parseFlags(rest)
      const target = positional[0]
      if (!target) {
        printUsage()
        return 1
      }
      const result = packAddonFolder(target, { dryRun })
      if (dryRun) {
        console.log(
          `✓ Prêt à empaqueter : ${result.entryCount} fichiers, ${result.totalBytes} octets ` +
            `(${result.name} ${result.version}, ${result.addonId})`,
        )
        return 0
      }
      const outPath = flags.get('o') ?? `${result.addonId}-${result.version}.zailon-addon`
      writeFileSync(outPath, result.bytes!)
      console.log(
        `✓ ${outPath} — ${result.entryCount} fichiers, ${result.bytes!.length} octets, ` +
          `SHA-256 : ${sha256Hex(result.bytes!)}`,
      )
      return 0
    }
    printUsage()
    return 1
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

/** SHA-256 hex d'un tampon — identique à la vérification native (spec §14). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then(code => { process.exitCode = code })
    .catch(error => {
      console.error(`✖ ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    })
}
