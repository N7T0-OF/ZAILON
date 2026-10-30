/**
 * Tests d'optimisation du démarrage — code-splitting des vues lourdes.
 * Assertions statiques sur les sources (pas de DOM) : les vues secondaires
 * sont chargées À LA DEMANDE (React.lazy) et non au démarrage.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('AppWindow : les vues lourdes sont lazy (aucun code Frosty/Visual/Stats au démarrage)', () => {
  const window = read('src/components/Layout/AppWindow.tsx')
  const lazyViews = [
    'FrostyEditorView',
    'VisualProfilesPage',
    'StatisticsView',
    'AddonsView',
    'ExploreView',
    'NewsView',
  ]
  for (const name of lazyViews) {
    assert.ok(window.includes(`lazy(() => import`), 'il faut utiliser React.lazy')
    assert.ok(window.includes(`{ default: m.${name} }`), `${name} doit être chargée à la demande`)
    // Jamais importée de façon statique.
    assert.ok(!window.includes(`import { ${name} }`), `${name} ne doit pas être importée statiquement`)
  }
})

test('AppWindow : HomeView reste eager (premier rendu immédiat)', () => {
  const window = read('src/components/Layout/AppWindow.tsx')
  assert.ok(window.includes("import { HomeView } from '../Views/HomeView'"), 'HomeView est la vue par défaut, eager')
  assert.ok(window.includes('<Suspense fallback={<ViewFallback />}>'), 'un fallback Suspense couvre le chargement différé')
})

test('AppWindow : la fenêtre de détection locale est lazy (portail, ouverte à la demande)', () => {
  const window = read('src/components/Layout/AppWindow.tsx')
  assert.ok(window.includes(`{ default: m.SteamDetectionDialog }`), 'SteamDetectionDialog doit être lazy')
  assert.ok(window.includes('<Suspense fallback={null}>'), 'le portail de détection a un fallback silencieux')
})

test('AddonsView : « Installer les dépendances » utilise ZailonSwitch (pas de checkbox brute)', () => {
  const addons = read('src/components/Views/AddonsView.tsx')
  assert.ok(addons.includes('<ZailonSwitch size="compact" checked={deps} onChange={setDeps} />'), 'la dépendance est un switch uniforme')
  assert.ok(!addons.includes('<input type="checkbox" checked={deps}'), 'plus de checkbox brute pour cette préférence')
})
