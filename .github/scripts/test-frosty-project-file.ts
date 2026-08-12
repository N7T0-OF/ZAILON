import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFrostyProjectArchive, decodeText, estimateFrostyProjectExportBytes,
  frostyProjectArchiveText, frostyProjectManifest, parseFrostyProjectExport,
} from '../../src/lib/frostyProjectFile.ts'
import { createFrostyProject, markAssetInProject, autosaveProject, toggleFavorite, setAssetNote } from '../../src/lib/frostyEditor.ts'

function sampleProject() {
  let p = createFrostyProject({
    id: 'p123', name: 'NFS Night Visuals', gameId: 'g1', gameName: 'Need for Speed (2015)',
    gameVersion: '1.0.0', editorProjectsRoot: 'ZAILON_DATA/editor-projects',
  })
  p = markAssetInProject(p, 'sky/lighting', 'modified')
  p = markAssetInProject(p, 'tex_paint', 'added')
  p = autosaveProject(p, 'Autosave 1')
  p = setAssetNote(p, 'sky/lighting', 'test nuit')
  p = toggleFavorite(p, 'sky/lighting')
  return p
}

test('manifest projet §108 — contenu versionné', () => {
  const manifest = frostyProjectManifest(sampleProject())
  assert.equal(manifest.schema, 1)
  assert.equal(manifest.kind, 'zailon-frosty-project')
  assert.equal(manifest.gameName, 'Need for Speed (2015)')
  assert.equal(manifest.modifiedAssets.length, 1)
  assert.equal(manifest.autosaves.length, 1)
})

test('archive déterministe + README + checksum', () => {
  const project = sampleProject()
  const a = buildFrostyProjectArchive(project)
  const b = buildFrostyProjectArchive(project)
  assert.deepEqual(a, b) // mêmes entrées → mêmes octets
  const text = decodeText(a)
  assert.ok(text.includes('project.json'))
  assert.ok(text.includes('assets.json'))
  assert.ok(text.includes('checksum.json'))
  assert.ok(text.includes('README.txt'))
})

test('parse/validate d\'un export — ok', () => {
  const project = sampleProject()
  const text = frostyProjectArchiveText(project)
  const parsed = parseFrostyProjectExport(text)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.manifest.name, 'NFS Night Visuals')
    assert.equal(parsed.manifest.frostyRuntimeVersion, '1.0.6.3')
    assert.deepEqual(parsed.manifest.assetNotes, { 'sky/lighting': 'test nuit' })
  }
})

test('parse — rejets : JSON invalide, mauvais kind, champs manquants §108', () => {
  assert.equal(parseFrostyProjectExport('pas du json').ok, false)
  assert.equal(parseFrostyProjectExport(JSON.stringify({ schema: 1, kind: 'autre' })).ok, false)
  assert.equal(parseFrostyProjectExport(JSON.stringify({ schema: 1, kind: 'zailon-frosty-project' })).ok, false)
  assert.equal(parseFrostyProjectExport(JSON.stringify({ schema: 1, kind: 'zailon-frosty-project', id: 'x', name: 'n', gameName: 'g' })).ok, false)
})

test('taille estimée de l\'export', () => {
  const project = sampleProject()
  const bytes = estimateFrostyProjectExportBytes(project)
  const actual = buildFrostyProjectArchive(project).length
  assert.ok(bytes >= actual)
})
