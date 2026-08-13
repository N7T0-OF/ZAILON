/**
 * Tests de l'orchestration d'installation d'add-ons (spec §14-15, §65).
 * — machine à états : phases, succès, échec, rollback ;
 * — URLs : catalogue officiel uniquement, HTTPS sans identifiants ;
 * — fusion catalogue : distant prime, fallback complète ;
 * — fetch : cache d'abord, réseau validé, fallback hors ligne ;
 * — rapport de stockage.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADDON_INSTALL_INITIAL_STATE,
  addonInstallReducer,
  addonStorageReport,
  describeAddonDownloadError,
  fetchAddonCatalog,
  isOfficialCatalogUrl,
  isSafeDownloadUrl,
  mergeCatalogs,
  OFFICIAL_CATALOG_URL,
} from '../../src/lib/addonsInstall.ts'
import { OFFICIAL_ADDON_CATALOG } from '../../src/lib/addons.ts'

test('addonInstallReducer: avance phase par phase puis termine', () => {
  let state = ADDON_INSTALL_INITIAL_STATE
  assert.equal(state.phase, 'download')
  state = addonInstallReducer(state, { type: 'phase', phase: 'verify', message: 'Vérification…' })
  assert.equal(state.phase, 'verify')
  state = addonInstallReducer(state, { type: 'phase', phase: 'staging', message: 'Extraction…' })
  state = addonInstallReducer(state, { type: 'phase', phase: 'swap', message: 'Installation…' })
  state = addonInstallReducer(state, { type: 'phase', phase: 'health', message: 'Vérification santé…' })
  assert.equal(state.status, 'running')
  state = addonInstallReducer(state, { type: 'done' })
  assert.equal(state.status, 'done')
  assert.equal(state.progress, 1)
})

test('addonInstallReducer: échec et rollback sont terminaux', () => {
  const failed = addonInstallReducer(ADDON_INSTALL_INITIAL_STATE, { type: 'failed', message: 'SHA-256 incorrect.' })
  assert.equal(failed.status, 'failed')
  const rolled = addonInstallReducer(ADDON_INSTALL_INITIAL_STATE, { type: 'rolled_back', message: 'Restauration…' })
  assert.equal(rolled.status, 'rolled_back')
})

test('isOfficialCatalogUrl: seule la source officielle est acceptée', () => {
  assert.equal(isOfficialCatalogUrl(OFFICIAL_CATALOG_URL), true)
  assert.equal(isOfficialCatalogUrl('https://github.com/N7T0-OF/zailon-addons/releases'), true)
  assert.equal(isOfficialCatalogUrl('http://example.com/catalog.json'), false)
  assert.equal(isOfficialCatalogUrl('https://evil.com/catalog.json'), false)
})

test('isSafeDownloadUrl: HTTPS sans identifiants', () => {
  assert.equal(isSafeDownloadUrl('https://github.com/x/y/releases/download/1/a.zip'), true)
  assert.equal(isSafeDownloadUrl('http://example.com/a.zip'), false)
  assert.equal(isSafeDownloadUrl('https://user:pass@example.com/a.zip'), false)
  assert.equal(isSafeDownloadUrl('not a url'), false)
})

test('mergeCatalogs: le distant prime, le fallback complète', () => {
  const remote = {
    schema: 1 as const,
    addons: [
      { ...OFFICIAL_ADDON_CATALOG.addons[0], version: '2.0.0' },
    ],
  }
  const merged = mergeCatalogs(remote, OFFICIAL_ADDON_CATALOG)
  assert.equal(merged.addons.length, OFFICIAL_ADDON_CATALOG.addons.length, 'fallback complète le distant')
  const updated = merged.addons.find(entry => entry.id === OFFICIAL_ADDON_CATALOG.addons[0].id)
  assert.equal(updated?.version, '2.0.0', 'la version distante prime')
})

test('fetchAddonCatalog: cache frais d’abord, réseau sinon, fallback hors ligne', async () => {
  const fallback = OFFICIAL_ADDON_CATALOG
  let fetched = 0
  const options = {
    url: OFFICIAL_CATALOG_URL,
    fallback,
    fetchJson: async () => { fetched += 1; return fallback },
    readCache: () => undefined,
    writeCache: () => undefined,
  }
  const first = await fetchAddonCatalog(options)
  assert.equal(first.source, 'remote')
  assert.equal(fetched, 1)

  // Cache frais (fetchedAt récent) → réponse instantanée, aucun re-fetch.
  const freshCache = { ...fallback, fetchedAt: Date.now() }
  const cached = await fetchAddonCatalog({ ...options, readCache: () => freshCache })
  assert.equal(cached.source, 'cache')
  assert.equal(fetched, 1, 'pas de re-fetch quand le cache est frais')

  // Cache périmé (> 6 h) → revalidation réseau (spec §34, §45).
  const staleCache = { ...fallback, fetchedAt: Date.now() - 7 * 60 * 60 * 1000 }
  const revalidated = await fetchAddonCatalog({ ...options, readCache: () => staleCache })
  assert.equal(revalidated.source, 'remote')
  assert.equal(fetched, 2, 'cache périmé → re-fetch')

  // force (bouton « Actualiser », spec §34) → re-fetch même cache frais.
  const forced = await fetchAddonCatalog({ ...options, readCache: () => freshCache, force: true })
  assert.equal(forced.source, 'remote')
  assert.equal(fetched, 3, 'force → re-fetch')

  const offline = await fetchAddonCatalog({ ...options, readCache: () => undefined, fetchJson: async () => { throw new Error('offline') } })
  assert.equal(offline.source, 'fallback')
  assert.equal(offline.catalog, fallback)
})

test('addonStorageReport: tailles par add-on + cache', () => {
  const installed = [{ manifest: { id: 'a.b', name: 'A', version: '1.0.0', minZailonVersion: '1.0.0', permissions: [], category: 'utilities' as const }, source: 'official' as const, installedAt: 1, enabled: true, dataKept: false }]
  const report = addonStorageReport(installed, { knownSizes: { 'a.b': 4_000_000 }, cacheEntries: [{ id: 'cache', bytes: 2_000_000 }] })
  assert.equal(report.totalBytes, 10_000_000)
  assert.equal(report.cacheBytes, 2_000_000)
})

test('describeAddonDownloadError: 404 = Erreur de publication, jamais de retry (spec §20-21, §40)', () => {
  const missing = describeAddonDownloadError('Add-on download failed: 404 Not Found')
  assert.equal(missing.title, 'Erreur de publication')
  assert.equal(missing.retryable, false)
  assert.match(missing.detail || '', /404/)
})

test('describeAddonDownloadError: 403/429 = GitHub limité, retry plus tard (spec §41)', () => {
  const limited = describeAddonDownloadError('HTTP status 403 Forbidden (rate limit)')
  assert.equal(limited.retryable, true)
  assert.match(limited.title, /GitHub/)
  const tooMany = describeAddonDownloadError('429 Too Many Requests')
  assert.equal(tooMany.retryable, true)
})

test('describeAddonDownloadError: erreur réseau générique retryable', () => {
  const network = describeAddonDownloadError('error sending request for url (connection refused)')
  assert.equal(network.retryable, true)
  assert.equal(network.title, 'Impossible d’installer l’add-on')
})

test('fetchAddonCatalog: fetchedAt renseigné sur synchronisation réseau (spec §35)', async () => {
  const options = {
    url: OFFICIAL_CATALOG_URL,
    fallback: OFFICIAL_ADDON_CATALOG,
    fetchJson: async () => OFFICIAL_ADDON_CATALOG,
    readCache: () => undefined,
    writeCache: () => undefined,
  }
  const remote = await fetchAddonCatalog(options)
  assert.ok(remote.fetchedAt !== undefined && remote.fetchedAt > 0)
})
