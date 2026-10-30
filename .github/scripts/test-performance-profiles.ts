// Tests des profils Performance par jeu (spec §24, §37-39).
//   node --test .github/scripts/test-performance-profiles.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  animationsReducedDuringGame,
  effectivePerformance,
  policiesForMode,
  PERFORMANCE_PRESETS,
} from '../../src/lib/performanceProfiles.ts'

test('presets (spec §24) : Performance = pause + animations off + priorité basse', () => {
  const performance = PERFORMANCE_PRESETS.performance
  assert.equal(performance.zailon.downloads, 'paused')
  assert.equal(performance.zailon.scans, 'paused')
  assert.equal(performance.zailon.animations, 'off')
  assert.equal(performance.zailon.quickPanel, 'minimal')
  assert.equal(performance.zailon.zailonPriority, 'low')
  assert.equal(performance.game.processPriority, 'auto')
  assert.equal(PERFORMANCE_PRESETS.balanced.zailon.downloads, 'limited')
  assert.equal(PERFORMANCE_PRESETS.quality.zailon.animations, 'normal')
})

test('aucune session active → tout normal (aucune optimisation résiduelle)', () => {
  const effective = effectivePerformance({}, {}, [])
  assert.deepEqual(effective, {
    downloads: 'normal',
    scans: 'normal',
    animations: 'normal',
    quickPanel: 'normal',
    zailonPriority: 'normal',
    gameProcessPriority: 'auto',
  })
})

test('spec §39 : une session qui demande la pause → pause globale', () => {
  const effective = effectivePerformance(
    { cyberpunk: 'performance', photoshop: 'balanced' },
    {},
    [
      { gameId: 'cyberpunk', state: 'Running' },
      { gameId: 'photoshop', state: 'Running' },
    ],
    'cyberpunk',
  )
  assert.equal(effective.downloads, 'paused') // la pause gagne (spec §39)
  assert.equal(effective.scans, 'paused')
  assert.equal(effective.animations, 'off')
  assert.equal(effective.zailonPriority, 'low')
  // Priorité du jeu : celle de la session prioritaire uniquement.
  assert.equal(effective.gameProcessPriority, 'auto')
})

test('spec §38 : quand le jeu prioritaire ferme, le niveau se recalcule', () => {
  const before = effectivePerformance(
    { cyberpunk: 'performance', photoshop: 'balanced' },
    {},
    [
      { gameId: 'cyberpunk', state: 'Running' },
      { gameId: 'photoshop', state: 'Running' },
    ],
    'cyberpunk',
  )
  assert.equal(before.animations, 'off')
  const after = effectivePerformance(
    { cyberpunk: 'performance', photoshop: 'balanced' },
    {},
    [{ gameId: 'photoshop', state: 'Running' }],
    'cyberpunk',
  )
  assert.equal(after.animations, 'reduced') // Équilibré appliqué
  assert.equal(after.downloads, 'limited')
})

test('custom : valeurs personnalisées, défauts Équilibré sinon', () => {
  assert.equal(policiesForMode('custom', {}).downloads, 'limited')
  assert.equal(policiesForMode('custom', { downloads: 'paused' }).downloads, 'paused')
  assert.equal(policiesForMode('custom', { downloads: 'paused' }).scans, 'reduced')
  assert.equal(policiesForMode('balanced', { downloads: 'paused' }).downloads, 'limited') // preset non affecté
})

test('animationsReducedDuringGame : off ou reduced → vrai (spec §14)', () => {
  assert.equal(animationsReducedDuringGame('off'), true)
  assert.equal(animationsReducedDuringGame('reduced'), true)
  assert.equal(animationsReducedDuringGame('normal'), false)
})

test('modes sans jeu actif de référence → première session active', () => {
  const effective = effectivePerformance(
    { cyberpunk: 'quality' },
    {},
    [{ gameId: 'cyberpunk', state: 'Focused' }],
  )
  assert.equal(effective.downloads, 'paused')
  assert.equal(effective.gameProcessPriority, 'normal')
})
