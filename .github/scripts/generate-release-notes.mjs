#!/usr/bin/env node
/**
 * generate-release-notes.mjs
 *
 * Génère les Release Notes structurées (français) pour une release GitHub à partir
 * de CHANGELOG.md. Utilisé par `.github/workflows/release.yml` (publication) et par
 * `verify.yml` (contrôle). Voir AGENTS.md et docs/RELEASE_POLICY.md.
 *
 * Utilisation :
 *   node generate-release-notes.mjs [--version vX.Y.Z] [--out FILE]
 *       [--strict] [--allow-empty] [--changelog FILE]
 *
 *   --version vX.Y.Z  Version cible : la section "## [X.Y.Z] - date" est utilisée.
 *                     Par défaut : la section "[Unreleased]".
 *   --out FILE        Écrit les notes dans un fichier au lieu de stdout.
 *   --strict          Échoue si la section de la version demandée est absente.
 *   --allow-empty     Sort avec le code 0 même si aucune note n'est générable
 *                     (utilisé par le contrôle CI sur les PR).
 *   --changelog FILE  Chemin vers CHANGELOG.md (défaut : racine du dépôt).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function usage() {
  console.error(`Usage: generate-release-notes.mjs [--version vX.Y.Z] [--out FILE] [--strict] [--allow-empty] [--changelog FILE]

Génère les Release Notes structurées (français) à partir de CHANGELOG.md.

Options:
  --version <v>     Version cible (ex. v1.9.1) : la section "## [X.Y.Z] - date" est
                    utilisée. Défaut : la section [Unreleased].
  --out <file>      Écrit les notes dans un fichier au lieu de stdout.
  --strict          Échoue si la section de la version demandée est absente.
  --allow-empty     Sort avec le code 0 même sans contenu (contrôle CI sur PR).
  --changelog <file> Chemin vers CHANGELOG.md (défaut : racine du dépôt).`)
}

const argv = process.argv.slice(2)
const opts = {}
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
  if (arg === '--version') { opts.version = argv[++i]; continue }
  if (arg === '--out') { opts.out = argv[++i]; continue }
  if (arg === '--changelog') { opts.changelog = argv[++i]; continue }
  if (arg === '--strict') { opts.strict = true; continue }
  if (arg === '--allow-empty') { opts.allowEmpty = true; continue }
  console.error(`Argument inconnu : ${arg}`)
  usage()
  process.exit(2)
}

const changelogPath = opts.changelog ? resolve(opts.changelog) : join(ROOT, 'CHANGELOG.md')
const content = readFileSync(changelogPath, 'utf8')

// --- Parsing de CHANGELOG.md -------------------------------------------------

function normalizeVersion(header) {
  let value = header.trim()
  value = value.split(/\s+(?:-|—|–)\s+/)[0].trim()
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1)
  return value.replace(/^v/i, '').toLowerCase()
}

function parseSections(raw) {
  const sections = []
  let current = null
  for (const line of raw.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      current = { header: heading[1].trim(), version: normalizeVersion(heading[1]), lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return sections
}

function parseCategories(lines) {
  const categories = []
  const introLines = []
  let current = null
  for (const line of lines) {
    const sub = line.match(/^###\s+(.+)$/)
    if (sub) {
      current = { name: sub[1].trim(), bullets: [] }
      categories.push(current)
    } else if (current) {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/)
      if (bullet) {
        current.bullets.push(bullet[1].trim())
      } else if (line.trim() && current.bullets.length > 0) {
        const last = current.bullets.length - 1
        current.bullets[last] = `${current.bullets[last]} ${line.trim()}`
      }
    } else if (line.trim() && !line.trim().startsWith('>') && !line.trim().startsWith('<!--')) {
      introLines.push(line.trim())
    }
  }
  return { intro: introLines.join(' '), categories }
}

// --- Correspondance catégories CHANGELOG -> sections des Release Notes ---------

const CATEGORY_RULES = [
  { test: /breaking/, section: '💥 Changement important' },
  { test: /known issue|probl[eè]me/, section: '⚠️ Problèmes connus' },
  { test: /security|s[eé]curit/, section: '🔒 Sécurité' },
  { test: /performance|optimis|perf/, section: '⚡ Optimisations' },
  { test: /compat|migrat/, section: '🔄 Compatibilité / Migration' },
  { test: /experimental|exp[eé]rimental/, section: '🧪 Expérimental' },
  { test: /^removed|^suppression/, section: '🗑️ Suppressions' },
  { test: /^added|nouveaut/, section: '✨ Nouveautés' },
  { test: /improve|am[eé]lioration|^change/, section: '🔧 Améliorations' },
  { test: /fix|correction/, section: '🐛 Corrections' },
  { test: /\bui\b|interface/, section: '🎨 Interface' },
  { test: /^data|donn[eé]e/, section: '💾 Conservation des données' },
  { test: /technic|internal|architecture/, section: '🧱 Technique' },
]

function mapCategories(categories) {
  const grouped = new Map()
  for (const { name, bullets } of categories) {
    const rule = CATEGORY_RULES.find(({ test }) => test.test(name.toLowerCase()))
    if (!rule) {
      console.error(`generate-release-notes: avertissement — catégorie non reconnue : "${name}"`)
      continue
    }
    const existing = grouped.get(rule.section) || []
    grouped.set(rule.section, existing.concat(bullets))
  }
  return [...grouped.entries()].map(([section, bullets]) => ({ section, bullets }))
}

// --- Rendu -------------------------------------------------------------------

const SINGULAR = {
  '✨ Nouveautés': 'nouveauté',
  '🔧 Améliorations': 'amélioration',
  '⚡ Optimisations': 'optimisation',
  '🐛 Corrections': 'correction',
  '🔒 Sécurité': 'correctif de sécurité',
}

function fallbackIntro(mapped) {
  const parts = []
  for (const { section, bullets } of mapped) {
    if (!bullets.length) continue
    const singular = SINGULAR[section]
    if (!singular) continue
    parts.push(`${bullets.length} ${bullets.length === 1 ? singular : `${singular}s`}`)
  }
  if (!parts.length) return ''
  return `Cette mise à jour apporte ${parts.join(', ')}.`
}

function render({ version, parsed, mapped }) {
  const lines = [`# ZAILON ${version}`]
  const intro = parsed.intro || fallbackIntro(mapped)
  if (intro) lines.push('', intro)
  if (version.includes('-')) {
    lines.push('', '> Cette version est destinée aux tests. Elle n’est pas proposée sur le canal Stable.')
  }
  for (const { section, bullets } of mapped) {
    if (!bullets.length) continue
    lines.push('', `## ${section}`)
    if (section === '💾 Conservation des données') {
      lines.push('', 'Vos jeux, profils, mods, réglages et statistiques existants sont conservés lors de cette mise à jour.')
    }
    lines.push('')
    for (const bullet of bullets) lines.push(`- ${bullet}`)
  }
  return lines.join('\n') + '\n'
}

// --- Exécution ---------------------------------------------------------------

const versionKey = (opts.version || '').replace(/^v/i, '').toLowerCase()
const sections = parseSections(content)

let section
if (versionKey) {
  section = sections.find(item => item.version === versionKey)
  if (!section) {
    const available = sections.map(item => item.version).filter(v => v !== 'unreleased')
    if (opts.strict) {
      console.error(`generate-release-notes: aucune section "## [${versionKey}]" dans ${changelogPath}`)
      console.error(`Sections disponibles : ${available.join(', ') || '(aucune)'}`)
      process.exit(1)
    }
    console.error(`generate-release-notes: avertissement — section [${versionKey}] absente, utilisation de [Unreleased]`)
    section = sections.find(item => item.version === 'unreleased')
  }
} else {
  section = sections.find(item => item.version === 'unreleased')
}

if (!section) {
  console.error('generate-release-notes: aucune section [Unreleased] dans CHANGELOG.md')
  process.exit(1)
}

const parsed = parseCategories(section.lines)
const mapped = mapCategories(parsed.categories)
const hasContent = Boolean(parsed.intro) || mapped.some(item => item.bullets.length)

if (!hasContent) {
  if (opts.allowEmpty) process.exit(0)
  console.error('generate-release-notes: aucune note générable (section vide ?)')
  process.exit(1)
}

const notes = render({ version: versionKey || 'Unreleased', parsed, mapped })

if (opts.out) {
  writeFileSync(resolve(opts.out), notes)
  console.error(`generate-release-notes: notes écrites dans ${resolve(opts.out)}`)
} else {
  process.stdout.write(notes)
}
