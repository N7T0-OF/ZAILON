import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBackgroundAudio,
  backgroundPlayerState,
  publishBackgroundPlayerState,
  registerBackgroundPlayer,
  setBackgroundSessionMuted,
  setBackgroundSessionVolume,
  subscribeBackgroundPlayerState,
  unregisterBackgroundPlayer,
  type BackgroundPlayerCommands,
} from '../../src/lib/backgroundMediaPlayer.ts'

interface FakePlayer extends BackgroundPlayerCommands {
  muted: boolean
  volume: number
  pauses: number
  resumes: number
}

function makePlayer(): FakePlayer {
  const player: FakePlayer = {
    muted: true,
    volume: 0.07,
    pauses: 0,
    resumes: 0,
    mute: () => { player.muted = true },
    unmute: () => { player.muted = false },
    setVolume: volume => { player.volume = volume },
    pause: () => { player.pauses += 1 },
    resume: () => { player.resumes += 1 },
  }
  return player
}

test('publishBackgroundPlayerState notifie les abonnés et préserve le reste', () => {
  const seen: Array<{ muted: boolean; volume: number; available: boolean }> = []
  const unsubscribe = subscribeBackgroundPlayerState(() => seen.push(backgroundPlayerState()))
  publishBackgroundPlayerState({ available: true })
  publishBackgroundPlayerState({ muted: false, volume: 0.2 })
  unsubscribe()
  publishBackgroundPlayerState({ muted: true })
  assert.equal(seen.length, 3) // appel immédiat + 2 publications
  assert.equal(seen[1].available, true)
  assert.equal(seen[2].muted, false)
  assert.equal(seen[2].volume, 0.2)
  assert.equal(backgroundPlayerState().muted, true) // dernière publication (après unsubscribe) appliquée
})

test('setBackgroundSessionMuted commande le player actif et publie l’état', () => {
  publishBackgroundPlayerState({ muted: true, volume: 0.07, available: true })
  const player = makePlayer()
  registerBackgroundPlayer(player)
  const seen: boolean[] = []
  const unsubscribe = subscribeBackgroundPlayerState(() => seen.push(backgroundPlayerState().muted))
  try {
    setBackgroundSessionMuted(false) // unmute : volume restauré
    assert.equal(player.muted, false)
    assert.equal(player.volume, 0.07)
    setBackgroundSessionMuted(true)
    assert.equal(player.muted, true)
    assert.equal(seen[seen.length - 1], true)
  } finally {
    unregisterBackgroundPlayer(player)
    unsubscribe()
  }
})

test('setBackgroundSessionVolume commande le player sans toucher à l’intention muette', () => {
  publishBackgroundPlayerState({ muted: true, volume: 0.07, available: true })
  const player = makePlayer()
  registerBackgroundPlayer(player)
  try {
    setBackgroundSessionVolume(0.12)
    assert.equal(player.volume, 0.12)
    assert.equal(backgroundPlayerState().volume, 0.12)
  } finally {
    unregisterBackgroundPlayer(player)
  }
})

test('aucune commande si aucun player monté (pas de crash, état inchangé)', () => {
  publishBackgroundPlayerState({ muted: true, volume: 0.07, available: false })
  setBackgroundSessionMuted(false)
  setBackgroundSessionVolume(0.2)
  assert.equal(backgroundPlayerState().muted, true)
  assert.equal(backgroundPlayerState().volume, 0.07)
})

test('applyBackgroundAudio : muet ou volume nul → mute ; sinon unmute + volume', () => {
  const player = makePlayer()
  applyBackgroundAudio(player, { muted: true, volume: 0.5 })
  assert.equal(player.muted, true)
  assert.equal(player.volume, 0.07)
  applyBackgroundAudio(player, { muted: false, volume: 0.4 })
  assert.equal(player.muted, false)
  assert.equal(player.volume, 0.4)
  applyBackgroundAudio(player, { muted: false, volume: 0 })
  assert.equal(player.muted, true)
})

test('le dernier player enregistré remplace le précédent (un seul actif)', () => {
  const first = makePlayer()
  const second = makePlayer()
  registerBackgroundPlayer(first)
  registerBackgroundPlayer(second)
  try {
    setBackgroundSessionMuted(false)
    assert.equal(second.muted, false)
    assert.equal(first.muted, true)
  } finally {
    unregisterBackgroundPlayer(second)
    unregisterBackgroundPlayer(first)
  }
})
