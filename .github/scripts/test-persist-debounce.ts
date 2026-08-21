import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDebouncer } from '../../src/lib/persistDebounce.ts'

const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('push coalesce plusieurs valeurs pendant la fenêtre (spec §17)', async () => {
  const written: number[] = []
  const debouncer = createDebouncer((value: number) => written.push(value), 15)
  debouncer.push(1)
  debouncer.push(2)
  debouncer.push(3)
  await tick(30)
  assert.deepEqual(written, [3])
})

test('push après la fenêtre déclenche une nouvelle écriture', async () => {
  const written: number[] = []
  const debouncer = createDebouncer((value: number) => written.push(value), 15)
  debouncer.push(1)
  await tick(30)
  debouncer.push(2)
  await tick(30)
  assert.deepEqual(written, [1, 2])
})

test('flush écrit immédiatement la valeur en attente (fermeture de l’app)', async () => {
  const written: number[] = []
  const debouncer = createDebouncer((value: number) => written.push(value), 1_000)
  debouncer.push(42)
  const flushed = debouncer.flush()
  assert.equal(flushed, true)
  assert.deepEqual(written, [42])
})

test('flush sans valeur en attente ne committe rien', () => {
  const written: number[] = []
  const debouncer = createDebouncer((value: number) => written.push(value), 15)
  assert.equal(debouncer.flush(), false)
  assert.deepEqual(written, [])
})

test('cancel annule l’écriture planifiée', async () => {
  const written: number[] = []
  const debouncer = createDebouncer((value: number) => written.push(value), 15)
  debouncer.push(7)
  debouncer.cancel()
  await tick(30)
  assert.deepEqual(written, [])
})

test('flush après push puis flush vide ne double pas l’écriture', async () => {
  const written: number[] = []
  const debouncer = createDebouncer((value: number) => written.push(value), 15)
  debouncer.push(9)
  assert.equal(debouncer.flush(), true)
  assert.equal(debouncer.flush(), false)
  assert.deepEqual(written, [9])
})
