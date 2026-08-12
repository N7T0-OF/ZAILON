/**
 * Tests de la logique pure Frosty Editor (spec §1-122).
 * Exécution : node --test .github/scripts/test-frosty-editor.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceFrostyBuild,
  autosaveProject,
  buildFrostyEditorDiagnostic,
  createFrostyProject,
  editorSupportForGame,
  estimateFrostyModSize,
  failFrostyBuild,
  FROSTY_BUILD_STAGES,
  FROSTY_EDITOR_SUPPORT,
  FROSTY_LICENSE_POLICY,
  FROSTY_PLUGIN_INVENTORY,
  markAssetInProject,
  projectReady,
  recentFrostyProjects,
  recordFrostyBuild,
  restoreAutosave,
  setAssetNote,
  toggleFavorite,
  validateFrostyProject,
  workerClosed,
  workerPluginCrashed,
  workerTick,
  workerWarmed,
} from '../../src/lib/frostyEditor.ts'

const base = {
  id: 'p1',
  name: 'NFS Night Visuals',
  gameId: 'g1',
  gameName: 'Need for Speed (2015)',
  gameVersion: '1.0.0',
  editorProjectsRoot: 'ZAILON_DATA/editor-projects',
}
const support = FROSTY_EDITOR_SUPPORT['Need for Speed (2015)']
const okOpts = { support, installedPlugins: ['TexturePlugin', 'MeshSetPlugin'], runtimePresent: true }

test('createFrostyProject — modèle §10, chemin hors jeu §11, runtime par jeu §62', () => {
  const p = createFrostyProject(base)
  assert.equal(p.name, 'NFS Night Visuals')
  assert.equal(p.frostyRuntimeVersion, '1.0.6.3')
  assert.ok(p.projectPath.startsWith('ZAILON_DATA/editor-projects/Need%20for%20Speed%20(2015)/'))
  assert.equal(p.dirty, false)
  assert.deepEqual(p.autosaves, [])
})

test('runtime par défaut et nettoyage du nom', () => {
  const p = createFrostyProject({ ...base, name: '  Projet<>:*? 1  ', gameName: 'Battlefield 1' })
  assert.equal(p.name, 'Projet 1')
  assert.equal(p.frostyRuntimeVersion, '1.0.6.3')
})

test('markAssetInProject — déduplication + dirty §10/§70', () => {
  let p = createFrostyProject(base)
  p = markAssetInProject(p, 'VehicleData', 'modified')
  p = markAssetInProject(p, 'VehicleData', 'modified')
  assert.equal(p.modifiedAssets.length, 1)
  assert.equal(p.dirty, true)
  p = markAssetInProject(p, 'sky/lighting', 'added')
  assert.equal(p.addedAssets.length, 1)
})

test('autosave + rotation §12 et restore', () => {
  let p = createFrostyProject(base)
  p = markAssetInProject(p, 'a1', 'modified')
  p = autosaveProject(p, 'Autosave 1')
  assert.equal(p.dirty, false)
  const snap = p.autosaves[0]
  assert.equal(snap.assetCount, 1)
  p = markAssetInProject(p, 'a2', 'modified')
  p = restoreAutosave(p, snap.at)
  assert.equal(p.autosaves.length, 0)
  assert.equal(p.dirty, true)
})

test('rotation à maxAutosaves (5 par défaut)', () => {
  let p = createFrostyProject(base)
  for (let i = 0; i < 8; i++) p = autosaveProject(p, `Autosave ${i}`)
  assert.equal(p.autosaves.length, 5)
})

test('projets récents triés §13', () => {
  const a = createFrostyProject({ ...base, id: 'a' })
  const b = createFrostyProject({ ...base, id: 'b' })
  const c = createFrostyProject({ ...base, id: 'c' })
  const recents = recentFrostyProjects([a, b, c], 2)
  assert.equal(recents.length, 2)
})

test('editorSupportForGame — NFS 2015 via exe nfs16 §58', () => {
  assert.ok(editorSupportForGame('Need for Speed', 'nfs16.exe'))
  assert.ok(editorSupportForGame('Need for Speed (2015)'))
  assert.ok(editorSupportForGame('Need for Speed Heat'))
  assert.equal(editorSupportForGame('Cyberpunk 2077', 'Cyberpunk2077.exe'), null)
})

test('validation avant build §102 — erreurs', () => {
  const p = createFrostyProject(base)
  const issues = validateFrostyProject(p, { ...okOpts, runtimePresent: false })
  assert.ok(issues.some(i => i.code === 'no-runtime'))
  const missing = validateFrostyProject({ ...p, requiredPlugins: ['SoundEditorPlugin'] }, okOpts)
  assert.ok(missing.some(i => i.code === 'missing-plugin'))
})

test('validation — asset ajouté ET supprimé → erreur duplicate-id', () => {
  let p = createFrostyProject(base)
  p = markAssetInProject(p, 'x', 'added')
  p = markAssetInProject(p, 'x', 'removed')
  const issues = validateFrostyProject(p, okOpts)
  assert.ok(issues.some(i => i.code === 'duplicate-id'))
})

test('projectReady — ok sans erreur bloquante, warning projet vide', () => {
  const p = createFrostyProject(base)
  const ready = projectReady(p, okOpts)
  assert.equal(ready.ok, true)
  assert.ok(ready.issues.some(i => i.code === 'empty-project' && i.severity === 'warning'))
})

test('pipeline build §48-52 — étapes et progression', () => {
  let pipe = { stage: 'idle' as const, progress: 0, issues: [] as string[] }
  for (const stage of FROSTY_BUILD_STAGES) {
    pipe = advanceFrostyBuild(pipe)
    assert.equal(pipe.stage, stage)
    assert.ok(pipe.progress > 0)
  }
  pipe = advanceFrostyBuild(pipe)
  assert.equal(pipe.stage, 'done')
  assert.equal(pipe.progress, 1)
  assert.equal(advanceFrostyBuild(pipe).stage, 'done')
  assert.equal(failFrostyBuild(pipe, 'boom').stage, 'failed')
})

test('estimation taille mod §103 et build history §104', () => {
  let p = createFrostyProject(base)
  p = markAssetInProject(p, 'a', 'modified')
  p = markAssetInProject(p, 'b', 'added')
  assert.equal(estimateFrostyModSize(p, 4_000_000), 8_000_000)
  p = recordFrostyBuild(p, { version: '1.0.1', modName: 'NFS Night', estimatedSize: 8_000_000, status: 'built', issues: [] })
  assert.equal(p.buildHistory.length, 1)
  assert.equal(p.buildHistory[0].buildNumber, 1)
})

test('worker lifecycle §76-83 — warm timeout et arrêt RAM', () => {
  let w = workerWarmed({ state: 'stopped', crashCount: 0, disabledPlugins: [] })
  w = workerClosed(w, 'balanced')
  assert.equal(w.state, 'warm')
  assert.ok(w.warmUntil !== undefined)
  w = workerTick(w, (w.warmUntil ?? 0) + 1)
  assert.equal(w.state, 'stopped')
  assert.equal(w.warmUntil, undefined)
})

test('worker — mode max : arrêt immédiat §81', () => {
  const w = workerWarmed({ state: 'stopped', crashCount: 0, disabledPlugins: [] })
  const closed = workerClosed(w, 'max')
  assert.equal(closed.state, 'stopped')
})

test('worker crash plugin §83 — 2 crashs désactivent le plugin', () => {
  let w = { state: 'starting' as const, crashCount: 0, disabledPlugins: [] as string[] }
  w = workerPluginCrashed(w, 'MeshSetPlugin')
  assert.equal(w.crashCount, 1)
  assert.equal(w.state, 'starting')
  w = workerPluginCrashed(w, 'MeshSetPlugin')
  assert.equal(w.crashCount, 2)
  assert.ok(w.disabledPlugins.includes('MeshSetPlugin'))
  assert.equal(w.state, 'stopped')
})

test('diagnostic compact §74', () => {
  const p = createFrostyProject(base)
  const d = buildFrostyEditorDiagnostic(p, okOpts)
  assert.equal(d.runtimeVersion, '1.0.6.3')
  assert.equal(d.gameProfile, 'Frostbite')
  assert.equal(d.assetIndex, 'ready')
  assert.equal(d.pluginsLoaded, 2)
  assert.equal(d.projectValid, true)
})

test('notes locales §97 et favoris §95-96', () => {
  let p = createFrostyProject(base)
  p = setAssetNote(p, 'VehicleData', 'grip test 4')
  assert.equal(p.assetNotes.VehicleData, 'grip test 4')
  p = setAssetNote(p, 'VehicleData', '   ')
  assert.equal(p.assetNotes.VehicleData, undefined)
  p = toggleFavorite(p, 'handling')
  assert.ok(p.favorites.includes('handling'))
  p = toggleFavorite(p, 'handling')
  assert.ok(!p.favorites.includes('handling'))
})

test('inventaire plugins — 29 entrées (28 dossiers + ChunkResEditor), catégories connues, aucun doublon', () => {
  assert.equal(FROSTY_PLUGIN_INVENTORY.length, 29)
  const names = FROSTY_PLUGIN_INVENTORY.map(p => p.name)
  assert.equal(new Set(names).size, names.length)
  for (const plugin of FROSTY_PLUGIN_INVENTORY) {
    assert.ok(['texture', 'mesh', 'audio', 'bundle', 'localization', 'utility', 'reference', 'launch', 'legacy'].includes(plugin.category))
  }
})

test('licence — politique stricte §87-89', () => {
  assert.equal(FROSTY_LICENSE_POLICY.bundling, 'interdit')
  assert.equal(FROSTY_LICENSE_POLICY.externalRuntime, 'requis — installation officielle Frosty détectée par Frosty Support')
  assert.ok(FROSTY_LICENSE_POLICY.license.includes('CC BY-NC-ND 4.0'))
})
