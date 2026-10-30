/**
 * Tests de la vérification de profil FiveM (spec « FiveM Profiles » §20) —
 * partie PURE : verdict ok/attention/missing et libellés. Les constats disque
 * sont testés côté Rust (`verify_fivem_profile`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fiveMCheckLabel,
  fiveMProfileVerdict,
  fiveMVerifySummary,
} from '../../src/lib/fivemVerify.ts'
import type { FiveMProfileCheck } from '../../src/lib/native.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const check = (id: string, ok: boolean): FiveMProfileCheck => ({ id, ok })

test('fiveMProfileVerdict : tout présent → ok', () => {
  const checks = ['root', 'app', 'citizenfx', 'mods', 'plugins'].map(id => check(id, true))
  assert.equal(fiveMProfileVerdict(checks), 'ok')
})

test('fiveMProfileVerdict : racine absente → missing', () => {
  assert.equal(fiveMProfileVerdict([check('root', false)]), 'missing')
  assert.equal(fiveMProfileVerdict([]), 'missing')
})

test('fiveMProfileVerdict : élément obligatoire manquant → attention, ReShade ignoré', () => {
  const checks = [check('root', true), check('app', true), check('citizenfx', true), check('mods', true), check('plugins', false), check('reshade', false)]
  assert.equal(fiveMProfileVerdict(checks), 'attention')
})

test('fiveMProfileVerdict : ReShade absent seul → ok (facultatif)', () => {
  const checks = ['root', 'app', 'citizenfx', 'mods', 'plugins'].map(id => check(id, true)).concat(check('reshade', false))
  assert.equal(fiveMProfileVerdict(checks), 'ok')
})

test('fiveMCheckLabel : libellés français par contrôle', () => {
  assert.equal(fiveMCheckLabel('root'), 'Installation FiveM')
  assert.equal(fiveMCheckLabel('citizenfx'), 'CitizenFX.ini')
  assert.equal(fiveMCheckLabel('inconnu'), 'inconnu')
})

test('fiveMVerifySummary : messages par verdict', () => {
  assert.match(fiveMVerifySummary([check('root', false)]), /introuvable/)
  const all = ['root', 'app', 'citizenfx', 'mods', 'plugins'].map(id => check(id, true))
  assert.match(fiveMVerifySummary(all), /Profil fonctionnel/)
  const attention = [...all.slice(0, 4), check('plugins', false)]
  assert.match(fiveMVerifySummary(attention), /Dossier plugins/)
})

test('spec §20 : la commande native et le bouton sont câblés', () => {
  const nativeSrc = read('src/lib/native.ts')
  assert.ok(nativeSrc.includes('verify_fivem_profile'), 'commande verify_fivem_profile exposée')
  const panel = read('src/components/FiveMModsPanel.tsx')
  assert.ok(panel.includes('Vérifier le profil'), 'bouton « Vérifier le profil » présent')
  assert.ok(panel.includes('verifyFiveMProfile'), 'le panneau appelle la commande native')
})
