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

test('config jeu : « Apparence » supprimée (spec Passe de correction §3)', () => {
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  assert.ok(!panel.includes('ConfigCard id="apparence"'), 'la section Apparence doit avoir été retirée de la configuration')
  assert.ok(!panel.includes('GameAppearanceEditor'), 'GameAppearanceEditor ne doit plus être embarqué dans la config')
})

test('raccourcis : création en un clic sans micro-fenêtre (spec Passe de correction §4)', () => {
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  assert.ok(!panel.includes('CreateShortcutDialog'), 'la micro-fenêtre de raccourci doit avoir disparu de la config')
  assert.ok(panel.includes('createShortcut()'), 'la création doit être directe, sans dialogue')
  assert.ok(panel.includes('shortcutPlanFor(game, \'current\', profile.id)'), 'le raccourci utilise le profil actif')
})

test('menu Accueil : « Modifier l’apparence » retiré + dossier mods conditionnel (spec §5)', () => {
  const menu = read('src/components/GameContextMenu.tsx')
  assert.ok(!menu.includes("label: 'Modifier l’apparence'"), 'le menu ⋯ ne doit plus proposer « Modifier l’apparence »')
  assert.ok(!menu.includes('onEditResources'), 'le menu ⋯ ne doit plus dépendre du callback apparence')
  assert.ok(menu.includes('...(game.modsPath ?'), '« Ouvrir le dossier des mods » doit être conditionnel au dossier configuré')
})

test('Ctrl+K : une seule interface de recherche (spec Passe de correction §6)', () => {
  assert.throws(() => read('src/components/CommandPalette.tsx'), 'CommandPalette doit avoir été supprimée (fusion dans GlobalSearch)')
  const search = read('src/components/GlobalSearch.tsx')
  assert.ok(search.includes("(event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k'"), 'GlobalSearch gère Ctrl+K')
  assert.ok(search.includes('action:settings'), 'les actions rapides vivent dans la recherche unique')
})
