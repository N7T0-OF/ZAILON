/**
 * Tests du chargement différé des images (spec « Passe de correction » §7) :
 * l'image complète n'est décodée que lorsque la carte approche du viewport —
 * des centaines de jaquettes ne déclenchent aucun décodage hors écran.
 * Assertions statiques sur les sources (pas de DOM).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('ProgressiveImage : IntersectionObserver + décodage asynchrone + repli', () => {
  const component = read('src/components/UI/ProgressiveImage.tsx')
  assert.ok(component.includes('IntersectionObserver'), 'l’image doit être chargée uniquement à l’approche du viewport')
  assert.ok(component.includes('decoding="async"'), 'le décodage ne doit jamais bloquer le thread UI')
  assert.ok(component.includes('onError'), 'une image cassée doit retomber sur le repli')
  assert.ok(component.includes('rootMargin'), 'une marge de préchargement est configurée')
})

test('ProgressiveImage : pas de src tant que l’élément n’est pas visible', () => {
  const component = read('src/components/UI/ProgressiveImage.tsx')
  assert.ok(component.includes('showImage = Boolean(src) && inView && !failed'), 'src n’est posé que si visible et non échoué')
  assert.ok(component.includes('loading={eager ? \'eager\' : \'lazy\'}'), 'loading natif lazy en complément de l’observer')
})

test('Bibliothèque : les jaquettes passent par ProgressiveImage', () => {
  const games = read('src/components/Views/GamesView.tsx')
  assert.ok(games.includes('<ProgressiveImage'), 'la grille Bibliothèque doit utiliser ProgressiveImage')
  assert.ok(!games.includes('src={cover} alt="" loading="lazy"'), 'l’ancien <img> direct des cartes doit avoir disparu')
})

test('Accueil : le widget Favoris passe par ProgressiveImage', () => {
  const home = read('src/components/Views/HomeView.tsx')
  assert.ok(home.includes('<ProgressiveImage'), 'les vignettes Favoris doivent utiliser ProgressiveImage')
})

test('Statistiques : les vignettes de jeu passent par ProgressiveImage', () => {
  const stats = read('src/components/Views/StatisticsView.tsx')
  assert.ok(stats.includes('<ProgressiveImage'), 'les vignettes de jeu doivent utiliser ProgressiveImage')
})
