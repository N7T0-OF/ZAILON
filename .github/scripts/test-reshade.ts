/**
 * Tests de la logique pure ReShade (spec §1-115).
 * — Target/API : adaptateurs connus, launcher exclu, Unreal/Vulkan ;
 * — état d'installation : NotInstalled / Installed / UpdateAvailable / Broken ;
 * — versionCompare ;
 * — inspecteur de presets : seuil de score, ENB exclu, dépendances ;
 * — compatibilité anti-cheat : EAC/BattlEye/NTE → non automatique, solo → sûr ;
 * — stratégie de session : Vanilla / safe mode → Disabled ;
 * — conflits DLL proxy ;
 * — fingerprint fast check ;
 * — plan de mise à jour : verrou, jeu en cours, auto-update.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyReShadeCompatibility,
  classifyReShadeInstallation,
  detectGraphicsApi,
  findProxyDllConflicts,
  inspectReShadePreset,
  planReShadeUpdate,
  resolveReShadeSessionStrategy,
  resolveReShadeTarget,
  resolveShaderDependencies,
  sameReShadeFingerprint,
  buildReShadeFingerprint,
  versionCompare,
  unusedShaderPacks,
} from '../../src/lib/reshade.ts'

const game = (name: string, execPath = 'C:/Games/x.exe') => ({ id: 'g1', name, execPath, gamePath: 'C:/Games' })

test('detectGraphicsApi: adaptateurs connus (NFS16 → DirectX)', () => {
  const result = detectGraphicsApi(game('Need for Speed', 'C:/Games/NFS/NFS16.exe'))
  assert.equal(result.api, 'Direct3D10_11_12')
  assert.equal(result.confidence, 0.9)
})

test('detectGraphicsApi: Unreal sans adaptateur → Unknown avec heuristique', () => {
  const result = detectGraphicsApi(game('Mon Jeu UE5', 'C:/Games/Game.exe'))
  assert.equal(result.api, 'Unknown')
  assert.ok(result.confidence < 0.5)
})

test('resolveReShadeTarget: n\'installe jamais sur un launcher', () => {
  const target = resolveReShadeTarget(game('NFS', 'C:/Games/NFS/Launcher.exe'))
  assert.ok(target.confidence <= 0.5, 'confiance plafonnée (jamais d\'install auto sur un launcher)')
  assert.match(target.reason, /launcher/i)
})

test('resolveReShadeTarget: exe de rendu connu → haute confiance', () => {
  const target = resolveReShadeTarget(game('Need for Speed', 'C:/Games/NFS/NFS16.exe'))
  assert.equal(target.executableName, 'NFS16.exe')
  assert.equal(target.graphicsApi, 'Direct3D10_11_12')
  assert.ok(target.confidence >= 0.7)
})

test('classifyReShadeInstallation: les 4 états', () => {
  assert.equal(classifyReShadeInstallation({ dllPresent: false, iniPresent: false }).state, 'NotInstalled')
  assert.equal(classifyReShadeInstallation({ dllPresent: true, iniPresent: false }).state, 'Broken')
  assert.equal(classifyReShadeInstallation({ dllPresent: true, iniPresent: true, installedVersion: '6.3.0', availableVersion: '6.3.0' }).state, 'Installed')
  assert.equal(classifyReShadeInstallation({ dllPresent: true, iniPresent: true, installedVersion: '6.0.0', availableVersion: '6.3.0' }).state, 'UpdateAvailable')
})

test('versionCompare: ordre sémantique', () => {
  assert.ok(versionCompare('6.3.0', '6.2.0') > 0)
  assert.ok(versionCompare('6.2.0', '6.10.0') < 0)
  assert.equal(versionCompare('6.3.0', '6.3.0'), 0)
  assert.ok(versionCompare('v6.3.0', '6.3.0') === 0)
})

test('inspectReShadePreset: preset réel reconnu', () => {
  const result = inspectReShadePreset({
    fileName: 'NaturalVision.ini',
    category: 'Visuals',
    description: 'ReShade preset with qUINT shaders for photorealistic lighting',
    name: 'Natural Vision',
  })
  assert.equal(result.isPreset, true)
  assert.ok(result.score >= 25)
  assert.ok(result.needsShaders)
  assert.ok(result.dependencyHints.includes('qUINT'))
})

test('inspectReShadePreset: un simple .ini config n\'est pas un preset', () => {
  const result = inspectReShadePreset({ fileName: 'settings.ini', description: 'game configuration file' })
  assert.equal(result.isPreset, false)
})

test('inspectReShadePreset: ENB est exclu du classement ReShade', () => {
  const result = inspectReShadePreset({ fileName: 'enbseries.ini', description: 'ENB graphics mod' })
  assert.equal(result.isPreset, false)
})

test('classifyReShadeCompatibility: EAC → non automatique', () => {
  const result = classifyReShadeCompatibility(game('Fortnite'), ['EAC'])
  assert.equal(result.level, 'MultiplayerRestricted')
  assert.equal(result.autoInstallSafe, false)
  assert.ok(result.detectedAntiCheats.length > 0)
})

test('classifyReShadeCompatibility: NTE restreint sans promesse', () => {
  const result = classifyReShadeCompatibility(game('Neverness to Everness'), [])
  assert.equal(result.autoInstallSafe, false)
  assert.match(result.reason, /Experimental|anti-cheat/i)
})

test('classifyReShadeCompatibility: NFS solo → installation proposée', () => {
  const result = classifyReShadeCompatibility(game('Need for Speed'), [])
  assert.equal(result.level, 'SafeKnown')
  assert.equal(result.autoInstallSafe, true)
})

test('resolveReShadeSessionStrategy: Vanilla et safe mode → Disabled', () => {
  assert.equal(resolveReShadeSessionStrategy({ enabled: false, shaderDependencies: [] }, false).kind, 'Disabled')
  assert.equal(resolveReShadeSessionStrategy({ enabled: true, shaderDependencies: [] }, true).kind, 'Disabled')
  const enabled = resolveReShadeSessionStrategy({ enabled: true, presetId: 'natural', shaderDependencies: ['qUINT'] }, false)
  assert.equal(enabled.kind, 'Enabled')
  if (enabled.kind === 'Enabled') assert.equal(enabled.presetId, 'natural')
})

test('findProxyDllConflicts: dxgi.dll déjà pris → conflit signalé', () => {
  const issues = findProxyDllConflicts(['C:/Games/Game/bin/x64/dxgi.dll', 'C:/Games/Game/bin/x64/CET.dll'])
  assert.equal(issues.length, 1)
  assert.equal(issues[0].fileName, 'dxgi.dll')
  assert.equal(issues[0].conflict, true)
})

test('sameReShadeFingerprint: fast check', () => {
  const target = resolveReShadeTarget(game('Need for Speed', 'C:/Games/NFS/NFS16.exe'))
  const a = buildReShadeFingerprint(target, '6.3.0', 'natural')
  const b = buildReShadeFingerprint(target, '6.3.0', 'natural')
  const c = buildReShadeFingerprint(target, '6.4.0', 'natural')
  assert.equal(sameReShadeFingerprint(a, b), true)
  assert.equal(sameReShadeFingerprint(a, c), false)
})

test('planReShadeUpdate: verrou, jeu en cours, auto-update', () => {
  assert.equal(planReShadeUpdate({ installedVersion: '6.3.0', availableVersion: '6.4.0', gameRunning: false, versionLocked: true, autoUpdate: true }).action, 'blocked')
  assert.equal(planReShadeUpdate({ installedVersion: '6.3.0', availableVersion: '6.4.0', gameRunning: true, versionLocked: false, autoUpdate: true }).action, 'deferred')
  assert.equal(planReShadeUpdate({ installedVersion: '6.3.0', availableVersion: '6.4.0', gameRunning: false, versionLocked: false, autoUpdate: false }).action, 'now')
  assert.equal(planReShadeUpdate({ installedVersion: '6.4.0', availableVersion: '6.4.0', gameRunning: false, versionLocked: false, autoUpdate: true }).action, 'none')
})

test('resolveShaderDependencies + unusedShaderPacks: référence partagée', () => {
  const deps = resolveShaderDependencies('This preset needs qUINT and SweetFX')
  assert.ok(deps.includes('qUINT'))
  assert.ok(deps.includes('sweetfx'))
  const shared = unusedShaderPacks([{ shaderDependencies: ['qUINT'] }, { shaderDependencies: ['qUINT', 'sweetfx'] }])
  assert.ok(!shared.includes('qUINT'), 'qUINT partagé → conservé')
  assert.ok(shared.includes('astrayfx'))
})
