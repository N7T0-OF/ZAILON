import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_FIVE_M_COPY_OPTIONS, fiveMCopyActive, fiveMInitLabel, fiveMMissingItems, fiveMProfileInitState, nextCleanFiveMProfileName } from '../../src/lib/fivemProfile.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('fiveMProfileInitState : ready / partial / missing', () => {
  const ready = { mods: true, citizen: true, plugins: true, hasCitizenFxIni: true }
  assert.equal(fiveMProfileInitState(ready), 'ready')
  assert.equal(fiveMProfileInitState({ mods: true, citizen: false, plugins: false, hasCitizenFxIni: false }), 'partial')
  assert.equal(fiveMProfileInitState({ mods: false, citizen: false, plugins: false, hasCitizenFxIni: false }), 'missing')
})

test('fiveMMissingItems + fiveMInitLabel : feedback lisible de l\'assistant', () => {
  assert.deepEqual(fiveMMissingItems({ mods: false, citizen: true, plugins: false, hasCitizenFxIni: false }), ['mods/', 'plugins/', 'citizenfx.ini'])
  assert.equal(fiveMInitLabel('ready'), 'Environnement initialisé')
  assert.equal(fiveMInitLabel('partial'), 'Initialisation partielle')
  assert.equal(fiveMInitLabel('missing'), 'Premier lancement requis')
})

test('fiveMCopyActive : vrai seulement si au moins une option de copie', () => {
  assert.equal(fiveMCopyActive(DEFAULT_FIVE_M_COPY_OPTIONS), true) // copyConfig par défaut
  const none = { copyConfig: false, copyMods: false, copyReshade: false, copyPlugins: false, copyGraphics: false }
  assert.equal(fiveMCopyActive(none), false)
})

test('nextCleanFiveMProfileName : nom propre sans conflit, puis suffixé', () => {
  assert.equal(nextCleanFiveMProfileName([]), 'FiveM — Clean')
  assert.equal(nextCleanFiveMProfileName(['Default', 'fiveM — clean']), 'FiveM — Clean (2)')
  assert.equal(nextCleanFiveMProfileName(['FiveM — Clean', 'FiveM — Clean (2)']), 'FiveM — Clean (3)')
})

test('garde-fou source : assistant FiveM gated + action store avec options de copie', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  assert.ok(gamesView.includes('Assistant FiveM'), 'bouton Assistant FiveM présent')
  assert.ok(gamesView.includes('fiveMProfiles && selectedGame.provider === \'FiveM Client\' && <button onClick={() => setFivemAssistantOpen(true)}'), 'bouton gated par fivem.profiles + FiveM Client')

  const assistant = readFileSync(join(root, 'src/components/FiveMInstallAssistant.tsx'), 'utf8')
  assert.ok(assistant.includes('detectFiveMEnvironment'), 'détection disque réelle (jamais codée en dur)')
  assert.ok(assistant.includes('createFiveMProfile'), 'création via l\'action store dédiée')
  assert.ok(assistant.includes('fiveMProfileInitState'), 'état d\'initialisation via la lib pure')

  const store = readFileSync(join(root, 'src/store/useStore.ts'), 'utf8')
  assert.ok(store.includes('createFiveMProfile: (gameId, name, copyOptions)'), 'action store déclarée')
  assert.ok(store.includes('fivem_copy_mods'), 'options de copie mémorisées dans installOptions')
  assert.ok(store.includes('fivem_init'), 'état d\'initialisation mémorisé')
})
