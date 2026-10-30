import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceBulkExport, bulkExportFileName, bulkExportSummary, finishBulkExport,
  planBulkExport, startBulkExport,
} from '../../src/lib/frostyBulk.ts'
import { synthFrostyAssets } from '../../src/lib/frostyAssets.ts'

const assets = synthFrostyAssets('nfs16', 'vehicles', 12)

test('plan — types non supportés (ebx/res/chunk) retirés §44-45', () => {
  const plan = planBulkExport({ assets, types: ['texture', 'mesh', 'ebx'], outputFolder: 'G:/exports' })
  assert.ok(plan.assets.length > 0)
  assert.ok(plan.assets.every(a => a.type === 'texture' || a.type === 'mesh'))
  assert.deepEqual(plan.types, ['texture', 'mesh'])
  assert.equal(plan.supportedByBackend.ebx, false)
  assert.equal(plan.supportedByBackend.texture, true)
})

test('noms de fichiers de sortie par type', () => {
  const texture = assets.find(a => a.type === 'texture')
  const audio = assets.find(a => a.type === 'audio')
  if (!texture || !audio) throw new Error('assets manquants')
  assert.equal(bulkExportFileName(texture), `${texture.name.split('/').pop()}.dds`)
  assert.equal(bulkExportFileName(audio), `${audio.name.split('/').pop()}.ea3`)
})

test('progression en arrière-plan §45', () => {
  const plan = planBulkExport({ assets: assets.filter(a => a.type === 'texture'), types: ['texture'], outputFolder: 'out' })
  let run = startBulkExport(plan)
  assert.equal(run.stage, 'exporting')
  assert.equal(run.progress, 0)
  for (const asset of plan.assets) run = advanceBulkExport(run, asset.name, true)
  assert.equal(run.stage, 'checksum')
  assert.equal(run.progress, 1)
  run = finishBulkExport(run)
  assert.equal(run.stage, 'done')
  assert.equal(bulkExportSummary(run), `${run.exported}/${run.total} exporté(s) → out`)
})

test('échec partiel et échec global', () => {
  const plan = planBulkExport({ assets: assets.slice(0, 4), types: ['mesh'], outputFolder: 'out' })
  let run = startBulkExport(plan)
  run = advanceBulkExport(run, 'a', true)
  run = advanceBulkExport(run, 'b', false)
  assert.equal(run.exported, 1)
  assert.equal(run.failed, 1)
  run = advanceBulkExport(run, 'c', true)
  run = advanceBulkExport(run, 'd', true)
  assert.equal(run.stage, 'checksum')
  const failed = finishBulkExport(run, 'erreur disque')
  assert.equal(failed.stage, 'failed')
  assert.equal(bulkExportSummary(failed), 'Échec : erreur disque')
})

test('plan vide si aucun asset supporté', () => {
  const plan = planBulkExport({ assets, types: ['ebx'], outputFolder: 'out' })
  assert.equal(plan.assets.length, 0)
  const run = startBulkExport(plan)
  assert.equal(run.total, 0)
  assert.equal(finishBulkExport(run).progress, 1)
})
