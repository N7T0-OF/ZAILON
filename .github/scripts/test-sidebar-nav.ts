import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('Statistiques est un bouton de la barre latérale (spec §10)', () => {
  const sidebar = readFileSync(join(root, 'src/components/Layout/Sidebar.tsx'), 'utf8')
  assert.ok(sidebar.includes("id: 'statistics', icon: BarChart3, label: 'Statistiques'"), 'entrée Statistiques dans la NAV')
})

test('la pastille Add-ons est un point discret, pas le texte « Nouveau » (spec §9)', () => {
  const sidebar = readFileSync(join(root, 'src/components/Layout/Sidebar.tsx'), 'utf8')
  assert.ok(sidebar.includes('dot={item.id === \'addons\' && addonsNudgePending}'), 'badge devient un dot')
  assert.ok(!sidebar.includes("badge={item.id === 'addons' && addonsNudgePending ? 'Nouveau'"), 'plus de texte Nouveau')
})
