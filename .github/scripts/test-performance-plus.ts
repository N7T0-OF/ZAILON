import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchProcessPriority, shouldApplyProcessPriority } from '../../src/lib/performancePlus.ts'
import { gameProcessPriorityForMode } from '../../src/lib/performanceProfiles.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('launchProcessPriority : suit le preset du mode (jamais temps réel)', () => {
  assert.equal(launchProcessPriority('balanced'), 'normal')
  assert.equal(launchProcessPriority('quality'), 'normal')
  assert.equal(launchProcessPriority('performance'), 'auto') // preset performance → auto (système garde la main)
  assert.equal(launchProcessPriority('auto'), 'auto')
  assert.equal(launchProcessPriority('performance'), gameProcessPriorityForMode('performance'))
})

test('shouldApplyProcessPriority : auto = ne pas toucher, sinon appliquer', () => {
  assert.equal(shouldApplyProcessPriority('auto'), false)
  assert.equal(shouldApplyProcessPriority('normal'), true)
  assert.equal(shouldApplyProcessPriority('above-normal'), true)
  assert.equal(shouldApplyProcessPriority('high'), true)
})

test('garde-fou source : priorité appliquée seulement avec la capacité performance.plus', () => {
  const store = readFileSync(join(root, 'src/store/useStore.ts'), 'utf8')
  assert.ok(store.includes('performancePlusAllowed(addonCapabilities(get().addons))'), 'appliquée seulement avec la capacité')
  assert.ok(store.includes('setGameProcessPriority(result.pid, priority)'), 'appliquée au PID réel du jeu')
  assert.ok(store.includes("get().performanceModes[game.id] ?? 'auto'"), 'mode par jeu, défaut auto')

  const gating = readFileSync(join(root, 'src/lib/addonGating.ts'), 'utf8')
  assert.ok(gating.includes("hasCapability(capabilities, 'performance.plus')"), 'gate pure performance.plus')

  const panel = readFileSync(join(root, 'src/components/Views/GameConfigurationPanel.tsx'), 'utf8')
  assert.ok(panel.includes("hasCapability(addonCapabilities(useStore(state => state.addons)), 'performance.plus')"), 'panneau gated')
  assert.ok(panel.includes('Priorité réellement appliquée au processus au lancement'), 'texte honnête avec add-on')
  assert.ok(panel.includes('Priorité non appliquée à l’OS'), 'texte honnête sans add-on (feature removal §57)')

  const native = readFileSync(join(root, 'src/lib/native.ts'), 'utf8')
  assert.ok(native.includes("'set_game_process_priority'"), 'binding natif')
})
