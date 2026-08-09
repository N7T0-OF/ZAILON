import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CURRENT_TOUR_VERSION, TOUR_STEPS, tourSteps } from '../../src/lib/tourSteps.ts'

test('le tour expose 6 étapes (spec §20)', () => {
  assert.equal(tourSteps().length, 6)
})

test('les ids d’étapes sont uniques et non vides', () => {
  const ids = tourSteps().map(step => step.id)
  assert.equal(new Set(ids).size, ids.length)
  ids.forEach(id => assert.ok(id.length > 0))
})

test('chaque étape pointe vers une vue valide', () => {
  const validViews = ['home', 'games', 'explore', 'downloads', 'visuals', 'news', 'settings']
  tourSteps().forEach(step => assert.ok(validViews.includes(step.view), `${step.id} → ${step.view}`))
})

test('les étapes couvrent Bibliothèque, Profils, Explorer, Jouer et Quick Panel', () => {
  const ids = tourSteps().map(step => step.id)
  for (const required of ['library', 'game', 'profiles', 'explore', 'play', 'quick-panel']) {
    assert.ok(ids.includes(required), `étape « ${required} » manquante`)
  }
})

test('chaque étape a un titre et un texte non vides', () => {
  tourSteps().forEach(step => {
    assert.ok(step.title.trim().length > 0, `${step.id}: titre vide`)
    assert.ok(step.text.trim().length > 0, `${step.id}: texte vide`)
  })
})

test('la version courante du tour est définie (spec §23)', () => {
  assert.equal(typeof CURRENT_TOUR_VERSION, 'number')
  assert.ok(CURRENT_TOUR_VERSION >= 1)
})

test('l’ordre du tour est stable : 1. Bibliothèque → 4. Explorer', () => {
  const steps = tourSteps()
  assert.equal(steps[0].id, 'library')
  assert.equal(steps[3].id, 'explore')
  assert.equal(steps[TOUR_STEPS.length - 1].id, 'quick-panel')
})
