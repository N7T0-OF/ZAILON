import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('détection : un seul composant partagé pour tous les points d’entrée (spec §5-6)', () => {
  // La fenêtre « Bibliothèque locale » est rendue UNE fois dans AppWindow (portail)
  // et plus jamais localement dans HomeView/GamesView.
  const appWindow = read('src/components/Layout/AppWindow.tsx')
  const homeView = read('src/components/Views/HomeView.tsx')
  const gamesView = read('src/components/Views/GamesView.tsx')
  const sidebar = read('src/components/Layout/Sidebar.tsx')

  assert.ok(appWindow.includes('SteamDetectionDialog'), 'AppWindow doit rendre le dialogue partagé')
  assert.ok(!homeView.includes('SteamDetectionDialog'), 'HomeView ne doit plus avoir sa propre instance')
  assert.ok(!gamesView.includes('SteamDetectionDialog'), 'GamesView ne doit plus avoir sa propre instance')
})

test('détection : « Détecter » ouvre toujours la fenêtre, plus de gate Steam Advanced (spec §6)', () => {
  const gamesView = read('src/components/Views/GamesView.tsx')
  // Le bug : onDetect faisait un scan silencieux en arrière-plan sans Steam Advanced.
  // Désormais il n’existe qu’un chemin : ouvrir la fenêtre partagée.
  assert.ok(!gamesView.includes('addDetectedGames'), 'le scan silencieux addDetectedGames doit avoir disparu de la vue')
  assert.ok(!gamesView.includes('steamDialogOpen'), 'l’état local steamDialogOpen doit avoir disparu')
  assert.ok(gamesView.includes('onDetect={() => setDiscoveryDialogOpen(true)}'), 'Détecter doit ouvrir la fenêtre partagée')
})

test('détection : le « + » de la sidebar ouvre la même fenêtre, pas un file picker (spec §5)', () => {
  const sidebar = read('src/components/Layout/Sidebar.tsx')
  assert.ok(sidebar.includes('setDiscoveryDialogOpen(true)'), 'le + de la sidebar doit ouvrir la fenêtre partagée')
  assert.ok(!sidebar.includes('addGameFromExecutable'), 'le + de la sidebar ne doit plus appeler le file picker')
})

test('détection : la fenêtre est transitoire dans le store, jamais persistée', () => {
  const store = read('src/store/useStore.ts')
  const partializeStart = store.indexOf('partialize:')
  assert.ok(partializeStart > 0, 'partialize doit exister')
  const partialize = store.slice(partializeStart)
  assert.ok(!partialize.includes('discoveryDialogOpen'), 'discoveryDialogOpen ne doit pas être persisté')
})

test('détection : la détection locale reste disponible sans add-on (Core seul)', () => {
  // Le scan natif scan_library (Steam/Epic/Registre/FiveM) n’est pas un
  // privilège de l’add-on Steam Advanced : il doit rester accessible tel quel.
  const native = read('src/lib/native.ts')
  assert.ok(native.includes("scan_library"), 'le binding natif scan_library doit exister')
  const rust = read('src-tauri/src/lib.rs')
  assert.ok(rust.includes('fn scan_library('), 'la commande native scan_library doit exister')
})

test('détection : Accueil unifié sur la même fenêtre (Ajouter + Détecter)', () => {
  const homeView = read('src/components/Views/HomeView.tsx')
  const occurrences = (homeView.match(/setDiscoveryDialogOpen\(true\)/g) || []).length
  assert.ok(occurrences >= 3, `Accueil : Ajouter + Détecter + action rapide doivent ouvrir la fenêtre (trouvé ${occurrences})`)
  assert.ok(!homeView.includes('addGameFromExecutable'), 'Accueil ne doit plus appeler le file picker direct')
})

test('détection : la palette de commandes ouvre la même fenêtre', () => {
  const palette = read('src/components/CommandPalette.tsx')
  assert.ok(palette.includes('setDiscoveryDialogOpen(true)'), 'la palette doit ouvrir la fenêtre partagée')
  assert.ok(!palette.includes('addGameFromExecutable'), 'la palette ne doit plus appeler le file picker direct')
})
