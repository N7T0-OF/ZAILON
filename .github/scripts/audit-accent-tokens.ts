import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * AccentTokenAudit (spec §68) : aucun composant interactif principal ne doit
 * hardcoder une couleur d'action (les couleurs viennent des tokens
 * `--zailon-accent*` / `--zailon-danger*`). La règle : un composant demande ses
 * couleurs au DesignTokenService — jamais sa propre couleur primaire.
 *
 * Denylist : les 7 couleurs d'accent prédéfinies (Paramètres > Apparence), la
 * couleur « accent clair » historique et les textes de contraste sombres, en
 * classe `bg-[#…]` / `text-[#…]`.
 */

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))

// Couleurs d'accent prédéfinies + ancien accent clair (#dbe8e5) : INTERDITES
// en fond d'action (`bg-[#…]`) et en texte (`text-[#…]`) — l'accent vient des
// tokens. Les textes de contraste sombres (#101313 / #0d1111) sont interdits
// en `text-[#…]` (doivent suivre --zailon-accent-text) mais RESTENT autorisés
// en `bg-[#…]` : ce sont des surfaces sombres légitimes de l'interface.
const FORBIDDEN_BG_HEX = new Set(['#dbe8e5', '#f3faf8', '#38bdf8', '#2dd4bf', '#a78bfa', '#fb7185', '#fbbf24', '#f97316'])
const FORBIDDEN_TEXT_HEX = new Set(['#dbe8e5', '#f3faf8', '#101313', '#0d1111'])

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectTsx(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

function findHardcodedAcents(file: string): string[] {
  const source = readFileSync(file, 'utf-8')
  const hits: string[] = []
  for (const color of FORBIDDEN_BG_HEX) {
    const pattern = new RegExp(`bg-\\[#${color.slice(1)}(?:/[0-9.]+)?\\]`, 'gi')
    for (const match of source.matchAll(pattern)) hits.push(match[0])
  }
  for (const color of FORBIDDEN_TEXT_HEX) {
    const pattern = new RegExp(`text-\\[#${color.slice(1)}(?:/[0-9.]+)?\\]`, 'gi')
    for (const match of source.matchAll(pattern)) hits.push(match[0])
  }
  return hits
}

test('AccentTokenAudit : aucune couleur d’action hardcodée dans les composants (spec §68)', () => {
  const files = collectTsx(join(PROJECT_ROOT, 'src'))
  const offenders: Array<{ file: string; colors: string[] }> = []
  for (const file of files) {
    const hits = findHardcodedAcents(file)
    if (hits.length) offenders.push({ file: relative(PROJECT_ROOT, file), colors: [...new Set(hits)] })
  }
  assert.deepEqual(
    offenders,
    [],
    `Couleurs d'action hardcodées détectées (à migrer vers les tokens --zailon-accent*):\n${offenders.map(o => `  ${o.file}: ${o.colors.join(', ')}`).join('\n')}`,
  )
})
