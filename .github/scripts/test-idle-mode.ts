/**
 * Tests du mode veille (spec « ZAILON Lite / Core » §15) — décision PURE.
 * La veille suspend les scrutateurs périodiques uniquement quand : aucune
 * session, aucune tâche de fond, pas de suivi d'apps externes, et
 * `timeoutMs` d'inactivité atteint. Jamais de veille agressive (< 60 s).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  idleScanIntervalMs,
  isSessionActive,
  MIN_IDLE_TIMEOUT_MS,
  normalizeIdleTimeout,
  shouldIdle,
} from '../../src/lib/idleMode.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const ctx = (over: Partial<Parameters<typeof shouldIdle>[0]> = {}) => ({
  lastActivityAt: 0,
  now: DEFAULT_IDLE_TIMEOUT_MS,
  sessionActive: false,
  backgroundActive: false,
  trackExternalApps: false,
  ...over,
})

test('shouldIdle : inactivité suffisante + rien d’actif → veille', () => {
  assert.equal(shouldIdle(ctx({ now: DEFAULT_IDLE_TIMEOUT_MS })), true)
})

test('shouldIdle : interaction récente → jamais de veille', () => {
  assert.equal(shouldIdle(ctx({ lastActivityAt: DEFAULT_IDLE_TIMEOUT_MS - 1, now: DEFAULT_IDLE_TIMEOUT_MS })), false)
})

test('shouldIdle : session active → jamais de veille', () => {
  assert.equal(shouldIdle(ctx({ now: 99_999_999, sessionActive: true })), false)
})

test('shouldIdle : tâche de fond active → jamais de veille', () => {
  assert.equal(shouldIdle(ctx({ now: 99_999_999, backgroundActive: true })), false)
})

test('shouldIdle : suivi des apps externes → scrutateur gardé éveillé', () => {
  assert.equal(shouldIdle(ctx({ now: 99_999_999, trackExternalApps: true })), false)
})

test('shouldIdle : timeout court borné à 60 s minimum', () => {
  assert.equal(shouldIdle(ctx({ now: 59_999 }), 60_000), false)
  assert.equal(shouldIdle(ctx({ now: 60_000 }), 60_000), true)
})

test('isSessionActive : session OU tâche de fond', () => {
  assert.equal(isSessionActive(false, false), false)
  assert.equal(isSessionActive(true, false), true)
  assert.equal(isSessionActive(false, true), true)
})

test('idleScanIntervalMs : 30 s en veille, 1 s éveillé', () => {
  assert.equal(idleScanIntervalMs(true), 30_000)
  assert.equal(idleScanIntervalMs(false), 1_000)
})

test('normalizeIdleTimeout : valeurs invalides repliées, jamais < 60 s', () => {
  assert.equal(normalizeIdleTimeout(undefined), DEFAULT_IDLE_TIMEOUT_MS)
  assert.equal(normalizeIdleTimeout(Number.NaN), DEFAULT_IDLE_TIMEOUT_MS)
  assert.equal(normalizeIdleTimeout(30_000), MIN_IDLE_TIMEOUT_MS)
  assert.equal(normalizeIdleTimeout(300_000), 300_000)
})

test('spec §15 : le scruteur App vérifie la veille avant tout IPC/natif', () => {
  const app = read('src/App.tsx')
  assert.ok(app.includes('shouldIdle({'), 'la veille doit être évaluée dans le watcher périodique')
  assert.ok(app.includes('if (idle) return'), 'en veille, aucun scan Steam/présence/fenêtres ne doit partir')
  assert.ok(app.includes('data-idle'), 'l’attribut data-idle coupe les animations en veille')
})
