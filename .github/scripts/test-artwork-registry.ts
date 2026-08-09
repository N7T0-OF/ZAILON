// Tests unitaires du moteur d'illustrations unifié (spec « Refonte Apparence » §1-14).
// Exécutés par Node 24 (type stripping natif) : aucun framework, aucune dépendance.
//   node --test .github/scripts/test-artwork-registry.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ARTWORK_PROVIDERS,
  artworkProvidersWithState,
  artworkProviderState,
  artworkSearchPlan,
  availableArtworkProviders,
  dedupeArtworkCandidates,
  resultSourceLabels,
} from '../../src/lib/artworkRegistry.ts'
import type { ArtworkCandidate } from '../../src/lib/native.ts'

const candidate = (overrides: Partial<ArtworkCandidate>): ArtworkCandidate => ({
  id: 'candidate-1',
  provider: 'steam',
  sourceLabel: 'Steam officiel',
  gameName: 'Cyberpunk 2077',
  kind: 'cover',
  url: 'https://cdn.example.com/apps/1091500/library_600x900_2x.jpg',
  attribution: 'test',
  ...overrides,
})

test('Steam officiel est toujours disponible sans clé', () => {
  assert.equal(artworkProviderState('steam', {}), 'available')
  assert.equal(artworkProviderState('steam', { steamgriddbApiKey: '' }), 'available')
})

test('SteamGridDB est non configuré sans clé, disponible avec', () => {
  assert.equal(artworkProviderState('steamgriddb', {}), 'not-configured')
  assert.equal(artworkProviderState('steamgriddb', { steamgriddbApiKey: '   ' }), 'not-configured')
  assert.equal(artworkProviderState('steamgriddb', { steamgriddbApiKey: 'abc123' }), 'available')
})

test('IGDB est non configuré sans Client Twitch, disponible avec les deux', () => {
  assert.equal(artworkProviderState('igdb', {}), 'not-configured')
  assert.equal(artworkProviderState('igdb', { igdbClientId: 'id' }), 'not-configured')
  assert.equal(artworkProviderState('igdb', { igdbClientId: 'id', igdbClientSecret: 'secret' }), 'available')
})

test('GameBanana est disponible sans aucune clé (API publique)', () => {
  assert.equal(artworkProviderState('gamebanana', {}), 'available')
  assert.equal(artworkProviderState('gamebanana', { steamgriddbApiKey: 'abc' }), 'available')
})

test('les connecteurs sans API de jaquettes restent honnêtement « non disponibles »', () => {
  for (const id of ['nexus', 'curseforge'] as const) {
    assert.equal(artworkProviderState(id, {}), 'not-implemented', id)
    assert.equal(artworkProviderState(id, { steamgriddbApiKey: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' }), 'not-implemented', id)
  }
})

test('la liste triée suit la priorité recommandée (SGDB 1, Steam 2, IGDB 3, GameBanana 4)', () => {
  const list = artworkProvidersWithState({ steamgriddbApiKey: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' })
  assert.deepEqual(list.map(provider => provider.id), ['steamgriddb', 'steam', 'igdb', 'gamebanana', 'nexus', 'curseforge'])
  assert.equal(list[0].state, 'available')
  assert.equal(list[1].state, 'available')
  assert.equal(list[2].state, 'available')
  assert.equal(list[3].state, 'available')
})

test('seuls les fournisseurs disponibles et capables répondent pour un type', () => {
  const covers = availableArtworkProviders({ steamgriddbApiKey: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' }, 'cover')
  assert.deepEqual(covers.map(provider => provider.id), ['steamgriddb', 'steam', 'igdb', 'gamebanana'])
  // Sans clé, SteamGridDB et IGDB disparaissent ; GameBanana reste (public).
  const coversNoKey = availableArtworkProviders({}, 'cover')
  assert.deepEqual(coversNoKey.map(provider => provider.id), ['steam', 'gamebanana'])
  // Un connecteur non branché ne peut jamais apparaître comme actif.
  assert.equal(availableArtworkProviders({}, 'background').some(provider => provider.id === 'curseforge'), false)
})

test('la déduplication élimine la même image venue de deux sources', () => {
  const a = candidate({ id: 'a', url: 'https://cdn.example.com/apps/1091500/library_600x900_2x.jpg' })
  const b = candidate({ id: 'b', provider: 'steamgriddb', sourceLabel: 'SteamGridDB', url: 'https://cdn.example.com/apps/1091500/library_600x900_2x.jpg' })
  const c = candidate({ id: 'c', url: 'https://cdn.example.com/apps/1091500/library_hero.jpg' })
  const result = dedupeArtworkCandidates([a, b, c])
  assert.deepEqual(result.map(item => item.id), ['a', 'c'])
})

test('la déduplication ignore les paramètres de cache CDN', () => {
  const a = candidate({ id: 'a', url: 'https://cdn.example.com/img/cover.webp?v=123' })
  const b = candidate({ id: 'b', url: 'https://cdn.example.com/img/cover.webp?v=999' })
  assert.equal(dedupeArtworkCandidates([a, b]).length, 1)
})

test('la déduplication garde deux images réellement différentes', () => {
  const a = candidate({ id: 'a', url: 'https://cdn.example.com/a.jpg' })
  const b = candidate({ id: 'b', url: 'https://cdn.example.com/b.jpg' })
  assert.equal(dedupeArtworkCandidates([a, b]).length, 2)
})

test('mode automatique : Steam d’abord, toutes les sources configurées en secours', () => {
  const noKey = artworkSearchPlan('automatic', {}, 'cover')
  assert.deepEqual(noKey.attempts.map(attempt => attempt.label), ['Steam officiel'])
  assert.deepEqual(noKey.attempts[0].apiKeys, {})

  const withSgdb = artworkSearchPlan('automatic', { steamgriddbApiKey: 'abc' }, 'cover')
  assert.deepEqual(withSgdb.attempts.map(attempt => attempt.label), ['Steam officiel', 'Toutes les sources configurées'])
  assert.deepEqual(withSgdb.attempts[1].apiKeys, { steamgriddb: 'abc' })

  const full = artworkSearchPlan('automatic', { steamgriddbApiKey: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' }, 'cover')
  assert.deepEqual(full.attempts[1].apiKeys, { steamgriddb: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' })
})

test('mode toutes les sources : une recherche fusionnée avec les clés configurées', () => {
  const plan = artworkSearchPlan('all', { steamgriddbApiKey: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' }, 'cover')
  assert.equal(plan.attempts.length, 1)
  assert.deepEqual(plan.attempts[0].apiKeys, { steamgriddb: 'abc', igdbClientId: 'id', igdbClientSecret: 'secret' })
})

test('les sources indisponibles sont listées sans bloquer la recherche', () => {
  const plan = artworkSearchPlan('all', {}, 'cover')
  const skippedIds = plan.skipped.map(source => source.id)
  // Sans config : SteamGridDB et IGDB sont « non configurés » ; Nexus/CurseForge
  // n'ont pas la capacité cover ; Steam et GameBanana restent actifs.
  assert.deepEqual(skippedIds, ['steamgriddb', 'igdb'])
  // Le plan contient quand même une tentative utilisable (Steam officiel + GameBanana).
  assert.equal(plan.attempts.length, 1)
  assert.equal(plan.attempts[0].label, 'Toutes les sources disponibles')
  assert.deepEqual(plan.attempts[0].apiKeys, {})
})

test('les types non supportés par un fournisseur ne le listent pas en secours', () => {
  // Seuls les fournisseurs capables de fournir un logo sont pertinents : avec la clé,
  // SteamGridDB + Steam officiel couvrent le type, aucune source de secours.
  const withKey = artworkSearchPlan('automatic', { steamgriddbApiKey: 'abc' }, 'logo')
  assert.deepEqual(withKey.skipped, [])
  // Sans clé, SteamGridDB devient la seule source de secours pour ce type.
  const noKey = artworkSearchPlan('automatic', {}, 'logo')
  assert.deepEqual(noKey.skipped.map(source => source.id), ['steamgriddb'])
})

test('les libellés de sources réellement présentes dans les résultats', () => {
  const candidates = [
    candidate({ id: 'a', sourceLabel: 'Steam officiel' }),
    candidate({ id: 'b', sourceLabel: 'SteamGridDB' }),
    candidate({ id: 'c', sourceLabel: 'Steam officiel' }),
  ]
  assert.deepEqual(resultSourceLabels(candidates), ['Steam officiel', 'SteamGridDB'])
})

test('le registre déclare une priorité et des capacités pour chaque fournisseur', () => {
  assert.equal(ARTWORK_PROVIDERS.length, 6)
  for (const provider of ARTWORK_PROVIDERS) {
    assert.ok(provider.priority >= 1)
    assert.ok(provider.capabilities.length > 0)
    assert.ok(provider.reason({}).length > 0)
  }
})
