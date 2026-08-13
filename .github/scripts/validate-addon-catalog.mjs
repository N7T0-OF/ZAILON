/**
 * Validation CI du catalogue officiel d'add-ons (spec §37-38, §49).
 *
 * Règles bloquantes :
 * - schéma = 1, champs obligatoires présents pour chaque entrée ;
 * - un add-on `available` (≠ false) DOIT référencer une release explicite
 *   (repository + tag + asset .zailon-addon) ET un SHA-256 réel (64 hex) —
 *   sinon le catalogue est cassé et le job échoue ;
 * - AUCUNE URL `releases/latest/download` n'est autorisée (spec §3, §39) ;
 * - IDs immuables : au moins deux segments alphanumériques.
 *
 * Exécution : `node .github/scripts/validate-addon-catalog.mjs` (Node ≥ 18,
 * aucun import TS — le catalogue JSON est la source de vérité partagée).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const catalogPath = join(root, 'src', 'lib', 'official-addon-catalog.json')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

const errors = []

if (catalog.schema !== 1) errors.push(`schema doit être 1 (reçu : ${catalog.schema}).`)
if (catalog.catalogSchemaVersion === undefined) errors.push('catalogSchemaVersion manquant (invalidation du cache, spec §33).')
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

  for (const field of ['name', 'version', 'category', 'sha256', 'minZailonVersion', 'description']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') errors.push(`[${label}] champ ${field} manquant.`)
  }
  if (typeof entry.size !== 'number' || entry.size <= 0) errors.push(`[${label}] size invalide.`)
  if (!Array.isArray(entry.permissions) || entry.permissions.length === 0) errors.push(`[${label}] permissions manquantes.`)

  // Aucune URL `latest/download` (spec §3, §39) — le catalogue ne doit jamais
  // pointer vers une URL fragile construite à la volée.
  const serialized = JSON.stringify(entry)
  if (serialized.includes('/releases/latest/download/')) {
    errors.push(`[${label}] URL « releases/latest/download » interdite (spec §3).`)
  }

  // Un add-on disponible DOIT avoir un package réel publié (spec §13, §25, §49).
  const available = entry.available !== false
  if (available) {
    const release = entry.release
    const hasRelease = release && typeof release.repository === 'string' && release.repository.includes('/')
      && typeof release.tag === 'string' && /^[A-Za-z0-9._-]+$/.test(release.tag)
      && typeof release.asset === 'string' && /\.zailon-addon$/.test(release.asset)
    if (!hasRelease) {
      errors.push(`[${label}] available sans release explicite (repository + tag + asset .zailon-addon) — spec §2-4.`)
    }
    const hash = typeof entry.sha256 === 'string' ? entry.sha256 : ''
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      errors.push(`[${label}] available sans SHA-256 réel (64 hex) — spec §20.`)
    }
  }
}

if (errors.length > 0) {
  console.error(`Catalogue invalide (${errors.length} erreur(s)) :`)
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

console.log(`Catalogue OK : ${addons.length} add-ons, ${addons.filter(e => e.available !== false).length} disponible(s), aucun URL « latest ».`)
