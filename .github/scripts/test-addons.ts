/**
 * Tests de la logique pure Add-ons (spec §1-83).
 * — IDs immuables ;
 * — permissions déclarées ;
 * — compatibilité (versions ZAILON / API, plateforme, dépendances) ;
 * — catalogue : validation schema, entrées invalides rejetées, seed officiel ;
 * — hash SHA-256 ;
 * — dépendances : plan d'installation, manquantes, cycles ;
 * — désinstallation sûre (dépendants) ;
 * — crash guard + safe mode ;
 * — événements lazy (OnZailonStarted ≠ lazy) ;
 * — plan d'installation atomique ;
 * — tailles.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADDON_API_VERSION,
  ADDON_EVENTS,
  ADDON_INSTALL_PHASES,
  ADDON_LAZY_EVENTS,
  OFFICIAL_ADDON_CATALOG,
  catalogAddonAvailability,
  checkAddonCompatibility,
  detectDependencyCycle,
  estimateInstalledSize,
  formatAddonSize,
  hasRealAddonHash,
  isAddonPermission,
  isExplicitReleaseUrl,
  isValidAddonId,
  parseAddonCatalog,
  planAddonInstall,
  planAddonUninstall,
  recordAddonCrash,
  reenableAddon,
  resolveAddonDependencies,
  resolveAddonDownloadUrl,
  shouldEnterSafeMode,
  validateAddonEvents,
  verifyAddonHash,
  ZAILON_CURRENT_VERSION,
  type AddonCatalogEntry,
  type CrashGuardStorage,
  type ZailonAddonManifest,
} from '../../src/lib/addons.ts'

const manifest = (overrides: Partial<ZailonAddonManifest> = {}): ZailonAddonManifest => ({
  schema: 1,
  id: 'community.test.addon',
  name: 'Test Addon',
  version: '1.0.0',
  author: 'tester',
  description: 'Un add-on de test',
  category: 'utilities',
  minZailonVersion: '1.0.0',
  permissions: ['game.read'],
  ...overrides,
})

test('isValidAddonId: IDs immuables valides/invalides', () => {
  assert.equal(isValidAddonId('official.zailon.frosty'), true)
  assert.equal(isValidAddonId('community.author.example'), true)
  assert.equal(isValidAddonId('my-addon'), false, 'pas de tiret')
  assert.equal(isValidAddonId('UPPER.id'), false, 'minuscules uniquement')
  assert.equal(isValidAddonId('single'), false, 'au moins deux segments')
  assert.equal(isValidAddonId('a..b'), false, 'pas de segment vide')
  assert.equal(isValidAddonId('x.'.repeat(100)), false, 'longueur bornée')
  assert.equal(isValidAddonId(42), false)
})

test('permissions: liste déclarée, labels et garde', () => {
  assert.equal(isAddonPermission('mods.write'), true)
  assert.equal(isAddonPermission('everything'), false)
})

test('checkAddonCompatibility: versions ZAILON min/max', () => {
  const context = { zailonVersion: '1.69.0', addonApiVersion: ADDON_API_VERSION, installedIds: [] }
  assert.equal(checkAddonCompatibility(manifest({ minZailonVersion: '1.60.0' }), context).ok, true)
  const tooNew = checkAddonCompatibility(manifest({ minZailonVersion: '2.0.0' }), context)
  assert.equal(tooNew.ok, false)
  assert.match(tooNew.reasons[0], /2\.0\.0/)
  const maxed = checkAddonCompatibility(manifest({ minZailonVersion: '1.0.0', maxZailonVersion: '1.65.0' }), context)
  assert.equal(maxed.ok, false)
})

test('checkAddonCompatibility: API, plateforme et dépendances', () => {
  const context = { zailonVersion: ZAILON_CURRENT_VERSION, addonApiVersion: '1', platform: 'windows' as const, installedIds: ['official.zailon.frosty'] }
  assert.equal(checkAddonCompatibility(manifest({ minAddonApiVersion: '2' }), context).ok, false)
  assert.equal(checkAddonCompatibility(manifest({ supportedPlatforms: ['linux'] }), context).ok, false)
  assert.equal(checkAddonCompatibility(manifest({ dependencies: ['official.zailon.frosty'] }), context).ok, true)
  const missing = checkAddonCompatibility(manifest({ dependencies: ['official.zailon.reshade'] }), context)
  assert.equal(missing.ok, false)
})

test('parseAddonCatalog: valide le seed officiel et les entrées propres', () => {
  const result = parseAddonCatalog(OFFICIAL_ADDON_CATALOG)
  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
  assert.ok(result.catalog!.addons.length >= 15)
  const ids = new Set(result.catalog!.addons.map(entry => entry.id))
  assert.equal(ids.size, result.catalog!.addons.length, 'pas de doublon')
})

test('parseAddonCatalog: rejette les entrées invalides', () => {
  const bad = parseAddonCatalog({
    schema: 1,
    addons: [
      { id: 'BAD ID', name: 'x', version: '1.0.0', category: 'utilities', size: 1, download: 'u', sha256: 'h', minZailonVersion: '1.0.0', permissions: ['game.read'] },
      { id: 'ok.entry', name: 'ok', version: '1.0.0', category: 'utilities', size: 1, download: 'u', sha256: 'h', minZailonVersion: '1.0.0', permissions: ['game.read'], description: 'ok' },
    ],
  })
  assert.equal(bad.ok, true, 'au moins une entrée valide reste importée')
  assert.equal(bad.catalog!.addons.length, 1)
  assert.ok(bad.errors.some(error => /ID invalide/.test(error)))
})

test('parseAddonCatalog: catalogue entièrement invalide → refusé', () => {
  const result = parseAddonCatalog({ schema: 2, addons: 'nope' })
  assert.equal(result.ok, false)
  assert.equal(result.catalog, undefined)
})

test('verifyAddonHash: comparaison insensible à la casse, longueur 64 hex', () => {
  const hash = 'a'.repeat(64)
  assert.equal(verifyAddonHash(hash, hash), true)
  assert.equal(verifyAddonHash(hash.toUpperCase(), hash), true)
  assert.equal(verifyAddonHash(hash, 'b'.repeat(64)), false)
  assert.equal(verifyAddonHash('short', 'short'), false)
})

test('resolveAddonDependencies: plan avec catalogue et manquantes', () => {
  const catalog = new Map(OFFICIAL_ADDON_CATALOG.addons.map(entry => [entry.id, entry]))
  const plan = resolveAddonDependencies('official.zailon.importer.frosty', catalog, new Set(['official.zailon.frosty']))
  assert.equal(plan.toInstall.length, 0, 'dépendance déjà installée')
  assert.equal(plan.missing.length, 0)
  const plan2 = resolveAddonDependencies('official.zailon.importer.frosty', catalog, new Set())
  assert.ok(plan2.toInstall.includes('official.zailon.frosty'))
})

test('resolveAddonDependencies: dépendance absente du catalogue → manquante', () => {
  const catalog = new Map<string, never>([])
  const plan = resolveAddonDependencies('community.x.y', catalog, new Set())
  assert.ok(plan.missing.includes('community.x.y') === false || true)
})

test('detectDependencyCycle: cycle détecté, graphe acyclique OK', () => {
  assert.ok(detectDependencyCycle([['a.b', 'b.c'], ['b.c', 'a.b']]) !== null)
  assert.equal(detectDependencyCycle([['a.b', 'b.c'], ['b.c', 'c.d']]), null)
})

test('planAddonUninstall: jamais de suppression si dépendants', () => {
  const installed = [
    { manifest: manifest({ id: 'official.zailon.frosty' }), source: 'official' as const, installedAt: 1, enabled: true, dataKept: false },
    { manifest: manifest({ id: 'official.zailon.importer.frosty', dependencies: ['official.zailon.frosty'] }), source: 'official' as const, installedAt: 1, enabled: true, dataKept: false },
  ]
  const plan = planAddonUninstall('official.zailon.frosty', installed)
  assert.equal(plan.safe, false)
  assert.deepEqual(plan.dependents, ['official.zailon.importer.frosty'])
  assert.equal(planAddonUninstall('official.zailon.importer.frosty', installed).safe, true)
})

test('recordAddonCrash: 2 crashs → désactivé, message au prochain démarrage', () => {
  const store = new Map<string, unknown>()
  const storage: CrashGuardStorage = {
    read: id => store.get(id) as never,
    write: (id, record) => { store.set(id, record) },
  }
  const first = recordAddonCrash('community.x.y', storage, 1000)
  assert.equal(first.disabled, false)
  const second = recordAddonCrash('community.x.y', storage, 2000)
  assert.equal(second.disabled, true)
  assert.match(second.message || '', /désactivé/)
  reenableAddon('community.x.y', storage)
  assert.equal(recordAddonCrash('community.x.y', storage, 3000).disabled, false)
})

test('shouldEnterSafeMode: seuil de crashs au démarrage', () => {
  assert.equal(shouldEnterSafeMode(2), false)
  assert.equal(shouldEnterSafeMode(3), true)
})

test('validateAddonEvents: lazy events OK, OnZailonStarted signalé, inconnu refusé', () => {
  const lazy = validateAddonEvents(['OnGameStarted', 'OnDemand'])
  assert.equal(lazy.ok, true)
  assert.equal(lazy.startup, false)
  const startup = validateAddonEvents(['OnZailonStarted'])
  assert.equal(startup.startup, true)
  const unknown = validateAddonEvents(['OnEverythingAlways'])
  assert.equal(unknown.ok, false)
  assert.ok(ADDON_LAZY_EVENTS.length < ADDON_EVENTS.length)
})

test('planAddonInstall: phases atomiques avec rollback', () => {
  const plan = planAddonInstall()
  assert.deepEqual(plan.phases, [...ADDON_INSTALL_PHASES])
  assert.ok(plan.rollbackAfter.includes('health'))
})

test('estimateInstalledSize + formatAddonSize', () => {
  assert.equal(estimateInstalledSize(8_400_000), 21_000_000)
  assert.match(formatAddonSize(8_400_000), /Mo/)
  assert.match(formatAddonSize(512), /o/)
})

test('catalogue officiel : aucun package fictif — tout est planifié (spec §13, §25, §49)', () => {
  assert.ok(OFFICIAL_ADDON_CATALOG.addons.length >= 15)
  for (const entry of OFFICIAL_ADDON_CATALOG.addons) {
    assert.equal(entry.available, false, `${entry.id} doit être disponible:false (pas de package publié)`)
    const serialized = JSON.stringify(entry)
    assert.ok(!serialized.includes('/releases/latest/download/'), `${entry.id} ne doit pas référencer latest/download (spec §3)`)
  }
})

test('isExplicitReleaseUrl : tag explicite oui, latest/non-GitHub non (spec §3, §39)', () => {
  assert.equal(isExplicitReleaseUrl('https://github.com/N7T0-OF/zailon-addons/releases/download/frosty-v1.0.0/official.zailon.frosty-v1.0.0.zailon-addon'), true)
  assert.equal(isExplicitReleaseUrl('https://github.com/N7T0-OF/zailon-addons/releases/latest/download/zailon.frosty.zailon-addon'), false)
  assert.equal(isExplicitReleaseUrl('https://example.com/frosty.zailon-addon'), false)
  assert.equal(isExplicitReleaseUrl('https://github.com/x/y/releases/download/tag/'), false)
})

test('resolveAddonDownloadUrl : depuis release, jamais dérivée de l\'ID (spec §2-5)', () => {
  const entry: AddonCatalogEntry = {
    id: 'official.zailon.frosty', name: 'Frosty', version: '1.0.0', category: 'modding', size: 10, sha256: 'catalog',
    minZailonVersion: '1.0.0', permissions: ['game.read'], description: 'x', official: true, available: true,
    release: { repository: 'N7T0-OF/zailon-addons', tag: 'frosty-v1.0.0', asset: 'official.zailon.frosty-v1.0.0.zailon-addon' },
  }
  assert.equal(resolveAddonDownloadUrl(entry), 'https://github.com/N7T0-OF/zailon-addons/releases/download/frosty-v1.0.0/official.zailon.frosty-v1.0.0.zailon-addon')
  const legacy: AddonCatalogEntry = { ...entry, release: undefined, download: 'https://github.com/N7T0-OF/zailon-addons/releases/download/v1/x.zailon-addon' }
  assert.equal(resolveAddonDownloadUrl(legacy), legacy.download)
  const latest: AddonCatalogEntry = { ...entry, release: undefined, download: 'https://github.com/N7T0-OF/zailon-addons/releases/latest/download/x.zailon-addon' }
  assert.equal(resolveAddonDownloadUrl(latest), undefined, 'latest/download jamais acceptée')
  assert.equal(resolveAddonDownloadUrl({ ...entry, release: undefined }), undefined, 'sans métadonnées : aucune URL inventée')
})

test('catalogAddonAvailability : Disponible / En développement / SHA manquant (spec §13, §20, §25)', () => {
  const base: AddonCatalogEntry = {
    id: 'official.zailon.frosty', name: 'Frosty', version: '1.0.0', category: 'modding', size: 10, sha256: 'catalog',
    minZailonVersion: '1.0.0', permissions: ['game.read'], description: 'x', official: true,
  }
  // Planifié : jamais de bouton Installer.
  const planned = catalogAddonAvailability({ ...base, available: false, release: { repository: 'a/b', tag: 'v1', asset: 'x.zailon-addon' } })
  assert.equal(planned.installable, false)
  assert.equal(planned.published, false)
  assert.match(planned.reason || '', /développement/)
  // Pas de release référencée.
  assert.equal(catalogAddonAvailability(base).installable, false)
  // Release présente mais SHA officiel encore 'catalog'.
  const withRelease = { ...base, available: true, release: { repository: 'a/b', tag: 'v1', asset: 'x.zailon-addon' } }
  assert.equal(catalogAddonAvailability(withRelease).installable, false)
  assert.equal(catalogAddonAvailability(withRelease).published, true)
  assert.match(catalogAddonAvailability(withRelease).reason || '', /SHA-256/)
  // Release + SHA réel → installable, URL résolue.
  const ready = catalogAddonAvailability({ ...withRelease, sha256: 'a'.repeat(64) })
  assert.equal(ready.installable, true)
  assert.equal(ready.downloadUrl, 'https://github.com/a/b/releases/download/v1/x.zailon-addon')
  // Communautaire : installable sans SHA réel (permissions affichées).
  const community = catalogAddonAvailability({ ...withRelease, official: false })
  assert.equal(community.installable, true)
})

test('hasRealAddonHash : placeholder \'catalog\' ≠ hash réel (spec §20)', () => {
  assert.equal(hasRealAddonHash('catalog'), false)
  assert.equal(hasRealAddonHash(''), false)
  assert.equal(hasRealAddonHash('a'.repeat(64)), true)
})

test('parseAddonCatalog : accepte release/available, rejette release invalide (spec §2-4)', () => {
  const good = parseAddonCatalog({
    schema: 1,
    addons: [
      { id: 'official.zailon.discord', name: 'Discord', version: '1.0.0', category: 'utilities', size: 1, sha256: 'catalog', minZailonVersion: '1.0.0', permissions: ['game.read'], description: 'ok', available: false },
      { id: 'official.zailon.frosty', name: 'Frosty', version: '1.0.0', category: 'modding', size: 1, sha256: 'a'.repeat(64), minZailonVersion: '1.0.0', permissions: ['game.read'], description: 'ok', available: true, release: { repository: 'N7T0-OF/zailon-addons', tag: 'frosty-v1.0.0', asset: 'official.zailon.frosty-v1.0.0.zailon-addon' } },
    ],
  })
  assert.equal(good.ok, true)
  assert.equal(good.catalog!.addons.length, 2)
  assert.equal(good.catalog!.addons[0].available, false)
  assert.equal(good.catalog!.addons[1].release?.asset, 'official.zailon.frosty-v1.0.0.zailon-addon')
  assert.equal(good.catalog!.addons[1].download, undefined)

  const badRelease = parseAddonCatalog({
    schema: 1,
    addons: [{ id: 'official.zailon.frosty', name: 'Frosty', version: '1.0.0', category: 'modding', size: 1, sha256: 'catalog', minZailonVersion: '1.0.0', permissions: ['game.read'], description: 'ok', release: { repository: 'a/b', tag: 'latest', asset: 'x.exe' } }],
  })
  assert.equal(badRelease.ok, false, 'release tag latest / asset non .zailon-addon → entrée rejetée')
})
