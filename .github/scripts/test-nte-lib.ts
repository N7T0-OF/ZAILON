import test from 'node:test'
import assert from 'node:assert/strict'
import { addonCapabilities } from '../../src/lib/addonGating.ts'
import {
  detectNteDistribution,
  detectNteVersion,
  isNteDisabledModFile,
  isNteGame,
  isNteLauncher,
  isNteModFile,
  isNtePakFile,
  nteDisplayName,
  nteLaunchArgs,
  nteModsChangeDecision,
  nteModsPathFor,
  nteValidationMarkers,
  parseNteModJson,
  NTE_EPIC_AUTH_ARGS,
} from '../../src/lib/nte.ts'

// ── Monitoring de session (spec §16-17) ─────────────────────────────────────

test('nteModsChangeDecision : capture au premier tick, notifie UNE fois par changement', () => {
  // Premier tick de session : pas de baseline → capturer l'état actuel.
  assert.equal(nteModsChangeDecision({ current: 'abc', notified: false }), 'capture')
  // Fingerprint identique → rien.
  assert.equal(nteModsChangeDecision({ baseline: 'abc', current: 'abc', notified: false }), 'wait')
  // Fingerprint différent + jamais notifié → notifier.
  assert.equal(nteModsChangeDecision({ baseline: 'abc', current: 'def', notified: false }), 'notify')
  // Déjà notifié → jamais de seconde notification (spec §16 : une fois par session).
  assert.equal(nteModsChangeDecision({ baseline: 'abc', current: 'def', notified: true }), 'wait')
  // Changement après notification → silence (pas de spam).
  assert.equal(nteModsChangeDecision({ baseline: 'abc', current: 'ghi', notified: true }), 'wait')
})

// ── mod.json (Aurora « Display file ») ───────────────────────────────────────

test('parseNteModJson lit un Display file Aurora complet', () => {
  const raw = JSON.stringify({
    name: 'Dress Up',
    version: '1.2.3',
    author: 'Someone',
    icon: '2.9',
    optionals: {
      'support link': 'discord.gg/example',
      'custom image url': 'https://i.imgur.com/abc.png',
    },
  })
  const parsed = parseNteModJson(raw)
  assert.deepEqual(parsed, {
    name: 'Dress Up',
    version: '1.2.3',
    author: 'Someone',
    icon: '2.9',
    // Schéma https:// ajouté si absent (Aurora `with_scheme`).
    supportLink: 'https://discord.gg/example',
    imageUrl: 'https://i.imgur.com/abc.png',
  })
})

test('parseNteModJson est insensible à la casse et tolère le BOM', () => {
  const raw = '\uFEFF{ "NAME": "X", "VERSION": "2.0.0", "Optionals": { "SUPPORT LINK": "example.com" } }'
  const parsed = parseNteModJson(raw)
  assert.equal(parsed?.name, 'X')
  assert.equal(parsed?.version, '2.0.0')
  assert.equal(parsed?.author, undefined)
  assert.equal(parsed?.supportLink, 'https://example.com')
})

test('parseNteModJson rejette le JSON invalide (repli sur le nom du dossier)', () => {
  assert.equal(parseNteModJson('not json'), null)
  assert.equal(parseNteModJson(''), null)
  assert.equal(parseNteModJson('[1,2]'), null)
})

// ── Affichage / fichiers ─────────────────────────────────────────────────────

test('nteDisplayName retire le suffixe _P (convention des mods NTE)', () => {
  assert.equal(nteDisplayName('DressUp_P'), 'DressUp')
  assert.equal(nteDisplayName('DressUp'), 'DressUp')
})

test('classifieurs de fichiers NTE (.pak/.utoc/.ucas et .disabled)', () => {
  assert.ok(isNteModFile('a.pak'))
  assert.ok(isNteModFile('a.utoc'))
  assert.ok(isNteModFile('a.UCAS'))
  assert.ok(!isNteModFile('a.txt'))
  assert.ok(isNteDisabledModFile('a.pak.disabled'))
  assert.ok(!isNteDisabledModFile('a.pak'))
  assert.ok(isNtePakFile('a.pak'))
  assert.ok(!isNtePakFile('a.utoc'))
})

test('isNteLauncher reconnaît les trois launchers officiels', () => {
  assert.ok(isNteLauncher('NTEGlobalLauncher.exe'))
  assert.ok(isNteLauncher('NTELauncher.exe'))
  assert.ok(isNteLauncher('NTETWLauncher.exe'))
  assert.ok(!isNteLauncher('NTEGame.exe'))
  assert.ok(!isNteLauncher(''))
})

// ── Versions et distributions ────────────────────────────────────────────────

test('detectNteVersion suit LAUNCHER_MAP (Global, CN, TW)', () => {
  const has = (marker: string) => (path: string) => path.endsWith(marker)
  assert.equal(detectNteVersion('C:/Jeux/NTE', has('NTEGlobalLauncher.exe')), 'global')
  assert.equal(detectNteVersion('C:/Jeux/NTE', has('NTELauncher.exe')), 'cn')
  assert.equal(detectNteVersion('C:/Jeux/NTE', has('NTETWLauncher.exe')), 'tw')
  assert.equal(detectNteVersion('C:/Jeux/NTE', () => false), 'unknown')
  assert.equal(detectNteVersion(undefined, () => true), 'unknown')
  // L'ordre du LAUNCHER_MAP prime : Global d'abord, même si CN est présent.
  assert.equal(detectNteVersion('C:/Jeux/NTE', path => path.endsWith('Launcher.exe')), 'global')
})

test('detectNteDistribution : marqueur Epic, plateforme, standalone', () => {
  const hasEpicSdk = (path: string) => path.endsWith('NTEGlobal/EOSSDK-Win64-Shipping.dll')
  assert.equal(detectNteDistribution('C:/Jeux/NTE', undefined, hasEpicSdk), 'epic')
  assert.equal(detectNteDistribution('C:/Jeux/NTE', 'epic', () => false), 'epic')
  assert.equal(detectNteDistribution('C:/Jeux/NTE', 'steam', hasEpicSdk), 'steam')
  assert.equal(detectNteDistribution('C:/Jeux/NTE', undefined, () => false), 'standalone')
})

test('nteLaunchArgs : Epic exige les args d’auth, sinon aucun', () => {
  assert.deepEqual(nteLaunchArgs('epic'), NTE_EPIC_AUTH_ARGS)
  assert.deepEqual(nteLaunchArgs('steam'), [])
  assert.deepEqual(nteLaunchArgs('standalone'), [])
})

test('nteModsPathFor et marqueurs de validation', () => {
  assert.equal(
    nteModsPathFor('C:\\Jeux\\Neverness To Everness'),
    'C:/Jeux/Neverness To Everness/Client/WindowsNoEditor/HT/Content/Paks/AuroraMods',
  )
  const markers = nteValidationMarkers('C:/Jeux/NTE', path => path.endsWith('NTEGlobalLauncher.exe'))
  assert.equal(markers.length, 5)
  assert.ok(markers.some(marker => marker.label === 'Launcher global' && marker.found))
  assert.ok(markers.some(marker => marker.label === 'Launcher cn' && !marker.found))
})

// ── Gating add-on (feature removal §57) ─────────────────────────────────────

test('isNteGame est fermé sans la gate nte.modloader', () => {
  const caps = addonCapabilities([])
  assert.equal(caps.has('nte.modloader'), false)
  assert.equal(isNteGame({ gameName: 'Neverness to Everness', nteAllowed: false }), false)
  assert.equal(isNteGame({ execPath: 'X:/Games/NTE/ntegloballauncher.exe', nteAllowed: false }), false)
  assert.equal(isNteGame({ gameName: 'Neverness to Everness', nteAllowed: true }), true)
})
