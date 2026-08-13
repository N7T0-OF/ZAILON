/**
 * Tests du moteur de widgets de l'Accueil (spec « Accueil modulaire » §1-28,
 * §82-90, §123) — logique PURE, sans DOM : activé/désactivé, ordre, presets,
 * normalisation (add-on retiré), aucune case vide.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyHomeLayoutPreset,
  enabledWidgetIds,
  HOME_WIDGET_DEFAULTS,
  normalizeHomeWidgets,
  orderHomeWidgets,
  widgetGridClass,
  type HomeWidgetConfig,
} from '../../src/lib/homeWidgets.ts'

test('ordre par défaut : Favoris, Statistiques, Activité (spec §83)', () => {
  assert.deepEqual(enabledWidgetIds(HOME_WIDGET_DEFAULTS), ['favorites', 'statistics', 'activity'])
})

test("un widget désactivé n'est jamais rendu — aucun id, aucune case vide (spec §4, §7)", () => {
  const widgets: HomeWidgetConfig[] = [
    { id: 'favorites', enabled: false, order: 1, variant: 'cards', size: 'wide' },
    { id: 'statistics', enabled: true, order: 2, variant: 'summary', size: 'medium' },
    { id: 'activity', enabled: true, order: 3, variant: 'recent', size: 'medium' },
  ]
  assert.deepEqual(enabledWidgetIds(widgets), ['statistics', 'activity'])
  // Statistiques prend automatiquement la première position (spec §3).
  assert.deepEqual(orderHomeWidgets(widgets).map(widget => widget.id), ['statistics', 'activity'])
})

test("ordre configuré respecté — l'utilisateur réordonne (spec §5)", () => {
  const widgets: HomeWidgetConfig[] = [
    { id: 'favorites', enabled: true, order: 3, variant: 'cards', size: 'wide' },
    { id: 'statistics', enabled: true, order: 1, variant: 'summary', size: 'medium' },
    { id: 'activity', enabled: true, order: 2, variant: 'recent', size: 'medium' },
  ]
  assert.deepEqual(orderHomeWidgets(widgets).map(widget => widget.id), ['statistics', 'activity', 'favorites'])
})

test('normalisation : ids inconnus (add-on désinstallé) ignorés, manquants ajoutés (spec §84)', () => {
  const raw = [
    { id: 'favorites', enabled: false, order: 1, variant: 'cards', size: 'wide' },
    { id: 'unknown.widget', enabled: true, order: 99, variant: 'x', size: 'wide' },
  ]
  const normalized = normalizeHomeWidgets(raw)
  assert.deepEqual(normalized.map(widget => widget.id), ['favorites', 'statistics', 'activity'])
  assert.equal(normalized[0].enabled, false, 'favorites désactivé conservé')
  assert.equal(normalized[1].variant, 'summary', 'variante par défaut pour les ajoutés')
  assert.ok(!normalized.some(widget => widget.id === 'unknown.widget'))
})

test('presets (spec §111-112) : Minimal = Favoris seul, Standard = Favoris + Stats', () => {
  const minimal = applyHomeLayoutPreset(HOME_WIDGET_DEFAULTS, 'minimal')
  assert.deepEqual(enabledWidgetIds(minimal), ['favorites'])
  const standard = applyHomeLayoutPreset(HOME_WIDGET_DEFAULTS, 'standard')
  assert.deepEqual(enabledWidgetIds(standard), ['favorites', 'statistics'])
  const complete = applyHomeLayoutPreset(HOME_WIDGET_DEFAULTS, 'complete')
  assert.deepEqual(enabledWidgetIds(complete), ['favorites', 'statistics', 'activity'])
})

test('grille responsive : Wide = ligne entière, Medium = moitié de ligne (spec §85-87)', () => {
  assert.equal(widgetGridClass('wide'), 'min-[900px]:col-span-6')
  assert.equal(widgetGridClass('medium'), 'min-[900px]:col-span-3')
})

test('entrées invalides rejetées par normalize (pas de crash sur état corrompu)', () => {
  assert.deepEqual(normalizeHomeWidgets(null).map(widget => widget.id), ['favorites', 'statistics', 'activity'])
  assert.deepEqual(normalizeHomeWidgets('nope').map(widget => widget.id), ['favorites', 'statistics', 'activity'])
  assert.deepEqual(normalizeHomeWidgets([{}]).map(widget => widget.id), ['favorites', 'statistics', 'activity'])
})
