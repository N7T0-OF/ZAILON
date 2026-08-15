/**
 * Tests des correctifs UX — Accueil / config jeu / centre de notifications.
 * Assertions statiques sur les sources (pas de DOM) : position du widget son,
 * bulle « Historique » masquée quand vide, sections réduites par défaut.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('widget son : placé en haut à droite, juste sous les boutons d’action (spec §2)', () => {
  const home = read('src/components/Views/HomeView.tsx')
  // Le contrôle audio est rendu après le </header> (boutons Paramètres/Actions),
  // plus jamais dans le conteneur `mt-auto` qui le collait au-dessus des widgets.
  const headerIndex = home.indexOf('</header>')
  const audioIndex = home.indexOf('<HeroAudioControl')
  const mtAutoIndex = home.indexOf('className="mt-auto"')
  assert.ok(headerIndex > 0 && audioIndex > 0 && mtAutoIndex > 0, 'repères introuvables')
  assert.ok(audioIndex > headerIndex, 'le contrôle audio doit être APRÈS le header')
  assert.ok(audioIndex < mtAutoIndex, 'le contrôle audio ne doit plus être dans mt-auto (en bas)')
  // Compact, aligné à droite, sous les boutons.
  assert.ok(home.includes('className="mt-3 flex justify-end"'), 'le contrôle est aligné à droite sous le header')
})

test('bulle Historique : masquée quand aucune tâche active ni notification (spec §1)', () => {
  const app = read('src/App.tsx')
  assert.ok(app.includes('if (!active && !showHistory && runningTasks === 0) return null'), 'la bulle doit être masquée quand vide')
  assert.ok(app.includes("state.backgroundTasks.filter(task => task.status === 'running').length"), 'la bulle tient compte des tâches actives (téléchargements/scans/déploiements)')
})

test('config jeu : seules les sections essentielles ouvertes par défaut (spec §3)', () => {
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  assert.ok(panel.includes("DEFAULT_OPEN = ['lancement']"), 'seul « Lancement » doit être ouvert par défaut')
  assert.ok(!panel.includes("DEFAULT_OPEN = ['lancement', 'apparence']"), '« Apparence » doit démarrer repliée')
  // L'état ouvert/fermé est mémorisé PAR JEU.
  assert.ok(panel.includes('zailon:config-open:${game.id}'), 'l’état des sections doit être persisté par jeu')
})

test('config jeu : « Apparence » reste un ConfigCard repliable avec son toggle', () => {
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  assert.ok(panel.includes('ConfigCard id="apparence"'), 'la section Apparence existe toujours')
  assert.ok(panel.includes('open={open.includes(\'apparence\')}'), 'Apparence est pilotée par l’état open')
})
