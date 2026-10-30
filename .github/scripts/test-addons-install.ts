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
  mirrorAddonUrl,
  OFFICIAL_CATALOG_URL,
} from '../../src/lib/addonsInstall.ts'
import { OFFICIAL_ADDON_CATALOG, ZAILON_CURRENT_VERSION } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

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
    schema: 2 as const,
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

test('describeAddonDownloadError: 404 = Package introuvable, jamais de retry (spec §48)', () => {
  const missing = describeAddonDownloadError('Add-on download failed: 404 Not Found')
  assert.equal(missing.title, 'Package introuvable')
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

test('describeAddonDownloadError: archive non-ZIP → « Archive invalide » explicite (spec pipeline §1)', () => {
  const html = describeAddonDownloadError('Add-on archive is invalid — the downloaded file is not a ZIP archive (error page or corrupt download).')
  assert.equal(html.title, 'Archive invalide')
  assert.match(html.detail || '', /n’a pas renvoyé une archive ZIP/)
  assert.equal(html.retryable, true)
  const page = describeAddonDownloadError('Add-on download returned an error page (HTML/JSON) instead of the package — archive invalide.')
  assert.equal(page.title, 'Archive invalide')
  // La classification ZIP prime sur la détection 404/not found embarquée dans le message.
  const corrupt = describeAddonDownloadError('zip::result::ZipError: invalid zip archive')
  assert.equal(corrupt.title, 'Archive invalide')
})

test('mirrorAddonUrl: miroir jsDelivr depuis raw.githubusercontent (spec §7)', () => {
  const url = 'https://raw.githubusercontent.com/N7T0-OF/ZAILON/zailon-addons-stable/zailon-addons/packages/frosty/official.zailon.frosty-v1.0.0.zailon-addon'
  assert.equal(
    mirrorAddonUrl(url),
    'https://cdn.jsdelivr.net/gh/N7T0-OF/ZAILON@zailon-addons-stable/zailon-addons/packages/frosty/official.zailon.frosty-v1.0.0.zailon-addon',
  )
  assert.equal(mirrorAddonUrl('https://example.com/x.zailon-addon'), undefined)
  assert.equal(mirrorAddonUrl(''), undefined)
})

test('ZAILON_CURRENT_VERSION = version RÉELLE du package (spec §2 — régression « 1.69 vs 1.78 »)', () => {
  // Le bug historique : une version codée en dur ('1.69.0') faisait dire au
  // launcher qu'il était plus ancien que ce que les add-ons exigeaient.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(ZAILON_CURRENT_VERSION, pkg.version, 'version dérivée de package.json, jamais figée')
  assert.ok(!ZAILON_CURRENT_VERSION.includes('1.69'), 'plus aucun reste de la version figée')
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
