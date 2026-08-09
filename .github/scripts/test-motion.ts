// Tests de la logique d'animation / parallaxe (spec « Library Polish » §11-13).
//   node --test .github/scripts/test-motion.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { motionReduced, parallaxActive, tiltFromPointer } from '../../src/lib/motion.ts'

test('motionReduced : mode explicite gagne, auto suit le système', () => {
  assert.equal(motionReduced('reduced', false), true)
  assert.equal(motionReduced('enabled', true), false)
  assert.equal(motionReduced('auto', true), true)
  assert.equal(motionReduced('auto', false), false)
})

test('parallaxActive : activé seulement si toggle ET animations non réduites', () => {
  assert.equal(parallaxActive(true, false), true)
  assert.equal(parallaxActive(true, true), false) // réduit → désactivé (spec §11)
  assert.equal(parallaxActive(false, false), false)
})

test('tiltFromPointer : bord gauche = -1, droite = +1, centre = 0, borné', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 }
  assert.deepEqual(tiltFromPointer(0, 50, rect), { x: -1, y: 0 })
  assert.deepEqual(tiltFromPointer(100, 50, rect), { x: 1, y: 0 })
  assert.deepEqual(tiltFromPointer(50, 0, rect), { x: 0, y: -1 })
  assert.deepEqual(tiltFromPointer(50, 100, rect), { x: 0, y: 1 })
  assert.deepEqual(tiltFromPointer(50, 50, rect), { x: 0, y: 0 })
  // Hors bornes → clampé à [-1, 1] (spec §5 : amplitude bornée).
  const outside = tiltFromPointer(500, 500, rect)
  assert.ok(Math.abs(outside.x) <= 1 && Math.abs(outside.y) <= 1)
  // Dimensions nulles → neutre (jamais de division par zéro).
  assert.deepEqual(tiltFromPointer(30, 30, { left: 0, top: 0, width: 0, height: 0 }), { x: 0, y: 0 })
})
