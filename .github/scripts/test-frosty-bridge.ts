import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyGameDataFile, classifyRuntimeExe, gameDataSummary, gameFilesToAssetIndex,
  localRuntimeCandidates, recommendedRuntimeForGame, runtimeRequiredCheck,
  workerAfterNativeCrash, workerFromNative, workerStopDecision,
} from '../../src/lib/frostyBridge.ts'
import { createFrostyProject } from '../../src/lib/frostyEditor.ts'

test('classification runtime — ModManager > Editor > Cmd', () => {
  assert.equal(classifyRuntimeExe('FrostyModManager.exe'), 'modmanager')
  assert.equal(classifyRuntimeExe('FrostyEditor.exe'), 'editor')
  assert.equal(classifyRuntimeExe('FrostyCmd.exe'), 'cmd')
  assert.equal(classifyRuntimeExe('inconnu.exe'), 'modmanager')
})

test('version recommandée par jeu §62', () => {
  assert.equal(recommendedRuntimeForGame('Need for Speed (2015)'), '1.0.6.3')
  assert.equal(recommendedRuntimeForGame('Jeu inconnu'), '1.0.6.3')
})

test('candidats locaux (dossier du jeu)', () => {
  const candidates = localRuntimeCandidates('G:/Games/NFS/Need for Speed.exe')
  assert.ok(candidates[0].includes('G:/Games/NFS'))
  assert.ok(candidates[1].endsWith('Frosty'))
})

test('classification des fichiers réels par extension — honnête, jamais inventée §16', () => {
  assert.deepEqual(classifyGameDataFile('Data/Win32/cas_01.cas'), { type: 'chunk', resourceType: 'CasResource' })
  assert.deepEqual(classifyGameDataFile('Data/cat.bin'), { type: 'chunk', resourceType: 'CasResource' })
  assert.equal(classifyGameDataFile('Data/x.ebx').type, 'ebx')
  assert.equal(classifyGameDataFile('Data/tex/voiture.dds').type, 'texture')
  assert.equal(classifyGameDataFile('Data/mesh/car.mesh').type, 'mesh')
  assert.equal(classifyGameDataFile('Data/audio/engine.spk').type, 'audio')
  assert.equal(classifyGameDataFile('Data/unknown.xyz').type, 'res')
})

test('fichiers réels → index d\'assets avec de vraies tailles §16', () => {
  const files = [
    { path: 'Data/Win32/cas_01.cas', size: 1024, modified: 1 },
    { path: 'Data/tex/voiture.dds', size: 4096, modified: 2 },
    { path: 'Data/audio/engine.spk', size: 512, modified: 3 },
  ]
  const assets = gameFilesToAssetIndex('nfs16', '1.0.6.3', files)
  assert.equal(assets.length, 3)
  assert.equal(assets[0].type, 'chunk')
  assert.equal(assets[0].size, 1024)
  assert.equal(assets[0].bundle, 'Win32')
  assert.equal(assets[1].type, 'texture')
  assert.equal(assets[1].bundle, 'tex')
  assert.ok(assets.every(a => a.id.startsWith('nfs16:')))
})

test('résumé du scan réel', () => {
  const summary = gameDataSummary([
    { path: 'a', size: 10, modified: 0 },
    { path: 'b', size: 2_000_000_000, modified: 0 },
    { path: 'c', size: 500, modified: 0 },
  ])
  assert.equal(summary.count, 3)
  assert.equal(summary.bytes, 2_000_000_510)
  assert.ok(summary.biggest?.includes('2.0 Go'))
})

test('Worker natif — politique de crash §78/§83 et arrêt §81', () => {
  assert.equal(workerAfterNativeCrash(0), 'restart')
  assert.equal(workerAfterNativeCrash(1), 'disable')
  assert.equal(workerStopDecision('max').stopNow, true)
  assert.equal(workerStopDecision('balanced').warmMs, 45_000)
  assert.equal(workerStopDecision('performance').warmMs, 5_000)
  const fromNative = workerFromNative({ running: true, memoryMb: 128 }, 42)
  assert.equal(fromNative.pid, 42)
  assert.equal(fromNative.memoryMb, 128)
})

test('build exige un runtime réel §102', () => {
  const project = createFrostyProject({ id: 'p', name: 'NFS Night', gameId: 'g', gameName: 'Need for Speed (2015)', editorProjectsRoot: 'root' })
  assert.equal(runtimeRequiredCheck(null, project).ok, false)
  const ok = runtimeRequiredCheck({ path: 'x/FrostyModManager.exe', exe: 'FrostyModManager.exe', kind: 'modmanager', size: 1, detectedAt: 1 }, project)
  assert.equal(ok.ok, true)
})
