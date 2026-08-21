import test from 'node:test'
import assert from 'node:assert/strict'
import {
  enablePlugin, frostyPluginRegistry, loadPluginsForType, pluginCategory,
  pluginCrashed, pluginStats, pluginsForAssetType, releasePluginsForType,
} from '../../src/lib/frostyPlugins.ts'

test('registre — aucun plugin legacy, tous dormants', () => {
  const registry = frostyPluginRegistry()
  assert.ok(registry.length >= 26)
  assert.ok(registry.every(p => p.state === 'dormant' && p.crashCount === 0))
  assert.ok(!registry.some(p => p.name === 'BlankPlugin' || p.name === 'TestPlugin'))
})

test('chargement à la demande par type d\'asset §43', () => {
  let registry = frostyPluginRegistry()
  const texturePlugins = pluginsForAssetType('texture', registry)
  assert.ok(texturePlugins.includes('TexturePlugin'))
  registry = loadPluginsForType(registry, 'texture')
  const loaded = registry.filter(p => p.state === 'loaded')
  assert.ok(loaded.length > 0)
  assert.ok(loaded.every(p => p.loadedFor === 'texture'))
  // Les plugins mesh restent dormants.
  assert.ok(registry.find(p => p.name === 'MeshSetPlugin')?.state === 'dormant')
})

test('plugins requis masqués quand désactivés', () => {
  const registry = frostyPluginRegistry()
  const afterCrash = pluginCrashed(pluginCrashed(registry, 'SoundEditorPlugin'), 'SoundEditorPlugin')
  const audioPlugins = pluginsForAssetType('audio', afterCrash)
  assert.ok(!audioPlugins.includes('SoundEditorPlugin'))
})

test('crash → 2 crashs désactivent le plugin §83', () => {
  let registry = frostyPluginRegistry()
  registry = pluginCrashed(registry, 'MeshSetPlugin')
  assert.equal(registry.find(p => p.name === 'MeshSetPlugin')?.state, 'crashed')
  registry = pluginCrashed(registry, 'MeshSetPlugin')
  assert.equal(registry.find(p => p.name === 'MeshSetPlugin')?.state, 'disabled')
  // Un plugin désactivé reste désactivé.
  registry = pluginCrashed(registry, 'MeshSetPlugin')
  assert.equal(registry.find(p => p.name === 'MeshSetPlugin')?.crashCount, 2)
})

test('release des plugins à la fermeture d\'un asset §43', () => {
  let registry = loadPluginsForType(frostyPluginRegistry(), 'mesh')
  assert.ok(registry.find(p => p.name === 'MeshSetPlugin')?.state === 'loaded')
  registry = releasePluginsForType(registry, 'mesh')
  assert.ok(registry.find(p => p.name === 'MeshSetPlugin')?.state === 'dormant')
})

test('réactivation d\'un plugin désactivé', () => {
  let registry = pluginCrashed(pluginCrashed(frostyPluginRegistry(), 'TexturePlugin'), 'TexturePlugin')
  assert.equal(registry.find(p => p.name === 'TexturePlugin')?.state, 'disabled')
  registry = enablePlugin(registry, 'TexturePlugin')
  assert.equal(registry.find(p => p.name === 'TexturePlugin')?.state, 'dormant')
  assert.equal(registry.find(p => p.name === 'TexturePlugin')?.crashCount, 0)
})

test('stats §74', () => {
  const registry = loadPluginsForType(frostyPluginRegistry(), 'audio')
  const stats = pluginStats(registry)
  assert.ok(stats.loaded >= 1)
  assert.equal(stats.disabled, 0)
  assert.equal(stats.loaded + stats.dormant + stats.disabled + stats.crashed, registry.length)
})

test('catégorie d\'un plugin', () => {
  assert.equal(pluginCategory('TexturePlugin'), 'texture')
  assert.equal(pluginCategory('SoundEditorPlugin'), 'audio')
  assert.equal(pluginCategory('Inconnu'), 'utility')
})
