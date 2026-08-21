#!/usr/bin/env node
/**
 * SettingsDensityAudit — détecte les blocs de texte JSX trop longs dans les
 * composants et propose une action (Keep / Shorten / MoveToTooltip / MoveToHelp).
 * Usage : node .github/scripts/ui-density-audit.mjs [seuil]
 * Sortie : rapport Markdown sur stdout.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SRC = join(ROOT, 'src')
const MAX = Number(process.argv[2] || 160)

const technical = /backend|usvfs|cache|framework|provider|quota|api|json|sha-?256|runtime|injection|driver|manifest|redscript|red4ext|cet|steamgriddb|igdb|vfs|hash|checksum|protocol|webview|tauri|scancode|hkl|layout logique|coffre|stockage/i

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

const rows = []
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/>([^<>{}\n]+)</g)) {
      const text = match[1].trim()
      if (text.length < 30) continue
      if (!/[a-zéèêàâçùüœîô]/i.test(text)) continue
      if (text.length <= MAX) continue
      const technicalDetail = technical.test(text)
      rows.push({
        file: relative(ROOT, file).replace(/\\/g, '/'),
        line: index + 1,
        length: text.length,
        text: text.length > 110 ? `${text.slice(0, 110)}…` : text,
        suggestion: technicalDetail ? 'MoveToTooltip' : 'Shorten',
      })
    }
  })
}
rows.sort((left, right) => right.length - left.length)

const moveToTooltip = rows.filter(row => row.suggestion === 'MoveToTooltip').length
const shorten = rows.filter(row => row.suggestion === 'Shorten').length

console.log(`# Settings Density Audit

Généré par \`.github/scripts/ui-density-audit.mjs\` (seuil : ${MAX} caractères).

## Résumé

- ${rows.length} bloc(s) de texte dépassant ${MAX} caractères.
- ${moveToTooltip} à déplacer en bulle ⓘ (détail technique).
- ${shorten} à raccourcir.

## Détail

| Verdict | Fichier | Ligne | Longueur | Extrait |
|---|---|---|---|---|`)

for (const row of rows) {
  console.log(`| ${row.suggestion} | \`${row.file}\` | ${row.line} | ${row.length} | ${row.text.replace(/\|/g, '\\|')} |`)
}
