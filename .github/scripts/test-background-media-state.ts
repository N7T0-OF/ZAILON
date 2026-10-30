import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeMediaState, createAudioSession, effectiveVolume, mediaDisposePolicy, onFocusLost, onFocusRestored,
  onGameStarted, onGameStopped, onManualPause, setUserMuted, setUserVolume,
} from '../../src/lib/backgroundMedia.ts'

const base = { sourceActive: true, playerReady: true, focused: true, gameRunning: false, arbiterSuspended: false }

test('effectiveVolume — 0 dès qu\'une suspension s\'applique, sinon userVolume §12', () => {
  let session = createAudioSession(false, 0.07)
  assert.equal(effectiveVolume(session), 0.07)
  session = setUserMuted(session, true)
  assert.equal(effectiveVolume(session), 0)
  session = setUserMuted(session, false)
  assert.equal(effectiveVolume(session), 0.07)
  session = onFocusLost(session)
  assert.equal(effectiveVolume(session), 0)
  session = onFocusRestored(session, { sourceActive: true, gameRunning: false })
  assert.equal(effectiveVolume(session), 0.07)
})

test('Alt+Tab — vidéo muette reste muette §16', () => {
  let session = createAudioSession(true, 0.07) // muet
  session = onFocusLost(session)
  assert.equal(session.userMuted, true) // intention intacte
  session = onFocusRestored(session, { sourceActive: true, gameRunning: false })
  assert.equal(session.userMuted, true)
  assert.equal(computeMediaState(session, base), 'PlayingMuted')
})

test('Alt+Tab — audio actif 7% revient à 7% §16', () => {
  let session = createAudioSession(false, 0.07)
  const before = effectiveVolume(session)
  session = onFocusLost(session)
  assert.equal(effectiveVolume(session), 0) // silencieux hors focus
  session = onFocusRestored(session, { sourceActive: true, gameRunning: false })
  assert.equal(session.userMuted, false)
  assert.equal(effectiveVolume(session), before)
  assert.equal(computeMediaState(session, base), 'PlayingAudible')
})

test('Alt+Tab — volume 12% revient à 12% §16', () => {
  let session = createAudioSession(false, 0.12)
  session = onFocusLost(session)
  session = onFocusRestored(session, { sourceActive: true, gameRunning: false })
  assert.equal(effectiveVolume(session), 0.12)
})

test('jeu lancé — retour ZAILON ne réactive pas l\'audio §14, §16', () => {
  let session = createAudioSession(false, 0.07)
  session = onGameStarted(session, { performanceMode: 'balanced' })
  assert.equal(session.suspendedBecauseGameRunning, true)
  assert.equal(effectiveVolume(session), 0)
  // Retour ZAILON pendant que le jeu tourne : reste suspendu.
  session = onFocusRestored(session, { sourceActive: true, gameRunning: true })
  assert.equal(effectiveVolume(session), 0)
  assert.equal(computeMediaState(session, base), 'SuspendedGameRunning')
  // Fin du jeu → reprise autorisée.
  session = onGameStopped(session)
  assert.equal(effectiveVolume(session), 0.07)
})

test('performance mode — suspension totale du player §53', () => {
  const session = onGameStarted(createAudioSession(false, 0.07), { performanceMode: 'performance' })
  assert.equal(session.temporarilySuspended, true)
  assert.equal(effectiveVolume(session), 0)
})

test('pause manuelle — reste en pause après Alt+Tab §16', () => {
  let session = createAudioSession(false, 0.07)
  session = onManualPause(session)
  session = onFocusLost(session)
  session = onFocusRestored(session, { sourceActive: true, gameRunning: false })
  assert.equal(session.temporarilySuspended, true)
  assert.equal(effectiveVolume(session), 0)
})

test('machine à états — Loading/Playing/Error/Inactive §15', () => {
  assert.equal(computeMediaState(createAudioSession(true), { ...base, sourceActive: false }), 'Inactive')
  assert.equal(computeMediaState(createAudioSession(true), { ...base, playerReady: false }), 'Loading')
  assert.equal(computeMediaState(createAudioSession(true), base), 'PlayingMuted')
  assert.equal(computeMediaState(createAudioSession(false), base), 'PlayingAudible')
  assert.equal(computeMediaState(createAudioSession(false), { ...base, focused: false }), 'SuspendedUnfocused')
  assert.equal(computeMediaState(createAudioSession(false), { ...base, error: true }), 'Error')
})

test('clampVolume — volume hors bornes ramené au défaut §7', () => {
  const session = setUserVolume(createAudioSession(false, 1.5), 0.2)
  assert.equal(session.userVolume, 0.2)
  assert.equal(createAudioSession(false, Number.NaN).userVolume, 0.07)
})

test('mediaDisposePolicy — Performance/Max → dispose, sinon pause §53', () => {
  assert.equal(mediaDisposePolicy('performance'), 'dispose')
  assert.equal(mediaDisposePolicy('max'), 'dispose')
  assert.equal(mediaDisposePolicy('balanced'), 'pause')
  assert.equal(mediaDisposePolicy('quality'), 'pause')
  assert.equal(mediaDisposePolicy('auto'), 'pause')
  assert.equal(mediaDisposePolicy('custom'), 'pause')
  assert.equal(mediaDisposePolicy(undefined), 'pause')
})
