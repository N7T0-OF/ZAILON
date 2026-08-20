import test from 'node:test'
import assert from 'node:assert/strict'
import { backendBadge, backendDescriptor, detectModBackend, frostyBackendStatus, MOD_BACKENDS } from '../../src/lib/modBackends.ts'

test('détection : Cyberpunk → VFS', () => {
  assert.equal(detectModBackend({ execPath: 'D:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe' }), 'cyberpunk-vfs')
  assert.equal(detectModBackend({ gameName: 'Cyberpunk 2077' }), 'cyberpunk-vfs')
})

test('détection : NFS16.exe → Frosty', () => {
  assert.equal(detectModBackend({ execPath: 'C:\\Games\\NFS\\NFS16.exe' }), 'frosty')
  assert.equal(detectModBackend({ gameName: 'Need for Speed' }), 'frosty')
})

test('détection : NTE → PAK, défaut → générique', () => {
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness' }), 'nte-pak')
  assert.equal(detectModBackend({ execPath: 'x:\\app\\editor.exe' }), 'generic-folder')
})

test('descripteurs : 4 backends, Frosty lazy-only', () => {
  assert.deepEqual(Object.keys(MOD_BACKENDS).sort(), ['cyberpunk-vfs', 'frosty', 'generic-folder', 'nte-pak'])
  assert.equal(MOD_BACKENDS.frosty.lazyOnly, true)
  assert.equal(backendDescriptor('frosty').packageExtensions[0], 'fbmod')
  assert.equal(backendBadge('frosty'), 'FROSTY')
  assert.equal(backendBadge('cyberpunk-vfs'), '')
})

test('statut Frosty : adapter trouvé, runtime préféré, conflit plugins', () => {
  const status = frostyBackendStatus({ gameId: 'nfs-2015', platform: 'steam', datapathFix: true, launchPlatformPlugin: true })
  assert.equal(status.adapterFound, true)
  assert.equal(status.preferredRuntime, '1.0.6.3')
  assert.ok(status.blockedRuntimes.includes('1.0.7.0'))
  assert.equal(status.pluginConflict, true)
  const clean = frostyBackendStatus({ gameId: 'nfs-2015', platform: 'ea-app', datapathFix: false, launchPlatformPlugin: false })
  assert.equal(clean.pluginConflict, false)
  assert.equal(clean.strategyLabel, 'native')
})

test('statut Frosty : jeu inconnu → adapterFound false', () => {
  const status = frostyBackendStatus({ gameId: 'not-a-frosty-game', platform: 'unknown', datapathFix: false, launchPlatformPlugin: false })
  assert.equal(status.adapterFound, false)
})

test('statut Frosty : alerte version bloquée', () => {
  const status = frostyBackendStatus({ gameId: 'nfs-2015', platform: 'steam', actualRuntime: '1.0.7.0', datapathFix: false, launchPlatformPlugin: false })
  assert.ok(status.versionAlert?.includes('déconseillée'))
})
