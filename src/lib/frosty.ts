/**
 * Backend Frosty générique (spec Frosty Partie B §26-103).
 *
 * Principes :
 * - jamais initialisé au démarrage global de ZAILON (§96) ;
 * - version de runtime par jeu/profil — jamais « latest » imposé (§29-30, §77) ;
 * - `.fbmod` n'est jamais traité comme une archive générique (§33) ;
 * - DatapathFix / FrostyFix ne sont jamais activés aveuglément (§48-52) ;
 * - aucun téléchargement de binaires tiers depuis des miroirs inconnus (§85).
 */

export type FrostySupportLevel = 'supported' | 'experimental' | 'detected' | 'unsupported'

export interface FrostyGameAdapter {
  gameId: string
  displayName: string
  nexusDomain?: string
  executableCandidates: string[]
  engine: 'Frostbite' | string
  modBackend: 'frosty'
  /** Versions de runtime acceptables. Jamais « dernière version » par défaut (§29). */
  runtime: {
    preferred?: string
    minimum?: string
    /** Versions à ne PAS utiliser (ex. NFS 2015 Evolution déconseille 1.0.7). */
    blocked?: string[]
  }
  /** Stratégies de compat plateforme réellement éprouvées. */
  platformStrategies: FrostyCompatibilityStrategy[]
  testedStatus: FrostySupportLevel
  nexusDownloadBackend?: 'frosty'
}

export interface FrostyModMetadata {
  name: string
  version?: string
  author?: string
  provider?: string
  fileName?: string
  requiredFrostyVersion?: string
  loadOrderHints?: string[]
}

export type FrostyCompatibilityStrategy = 'native' | 'datapath-fix' | 'frosty-fix-legacy' | 'custom'
export type FrostyLaunchPlatform = 'ea-app' | 'steam' | 'epic' | 'origin' | 'unknown'

export const FROSTY_STRATEGY_LABELS: Record<FrostyCompatibilityStrategy, string> = {
  native: 'Natale',
  'datapath-fix': 'DatapathFix',
  'frosty-fix-legacy': 'FrostyFix (legacy)',
  custom: 'Personnalisée',
}

export const FROSTY_PLATFORM_LABELS: Record<FrostyLaunchPlatform, string> = {
  'ea-app': 'EA App',
  steam: 'Steam',
  epic: 'Epic',
  origin: 'Origin',
  unknown: 'Inconnue',
}

/** Registry des jeux Frosty (§75) — registry-driven, jamais de promesse non testée (§76). */
export const FROSTY_GAME_REGISTRY: FrostyGameAdapter[] = [
  {
    gameId: 'nfs-2015',
    displayName: 'Need for Speed (2015)',
    nexusDomain: 'needforspeed2016',
    executableCandidates: ['NFS16.exe'],
    engine: 'Frostbite',
    modBackend: 'frosty',
    runtime: {
      // NFS 2015 Evolution exige Frosty 1.0.6.3 et déconseille 1.0.7 pour ce jeu.
      preferred: '1.0.6.3',
      minimum: '1.0.6.0',
      blocked: ['1.0.7.0'],
    },
    platformStrategies: ['native', 'datapath-fix'],
    testedStatus: 'experimental',
    nexusDownloadBackend: 'frosty',
  },
]

export function findFrostyAdapter(gameId: string): FrostyGameAdapter | undefined {
  return FROSTY_GAME_REGISTRY.find(adapter => adapter.gameId === gameId)
}

export function frostyAdapterForExecutable(executableName?: string): FrostyGameAdapter | undefined {
  if (!executableName) return undefined
  const normalized = executableName.toLocaleLowerCase().split(/[\\/]/).pop() || ''
  return FROSTY_GAME_REGISTRY.find(adapter =>
    adapter.executableCandidates.some(candidate => candidate.toLocaleLowerCase() === normalized),
  )
}

/** Comparaison de versions sémantiques 1.0.6.3 — sans parser externe. */
export function compareFrostyVersions(left?: string, right?: string): number {
  const parse = (value?: string) => (value || '').split('.').map(part => Number.parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

export interface FrostyVersionResolution {
  version?: string
  reason: 'preferred' | 'profile' | 'minimum' | 'default' | 'blocked'
  blockedVersions: string[]
}

/** FrostyRuntimeVersionManager (§29-30, §77) : résout la version par jeu/profil. */
export function resolveFrostyVersion(
  adapter: FrostyGameAdapter,
  profileRequestedVersion?: string,
): FrostyVersionResolution {
  const blocked = adapter.runtime.blocked || []
  const requested = profileRequestedVersion && !blocked.includes(profileRequestedVersion)
    ? profileRequestedVersion
    : undefined
  if (requested) return { version: requested, reason: 'profile', blockedVersions: blocked }
  if (adapter.runtime.preferred) return { version: adapter.runtime.preferred, reason: 'preferred', blockedVersions: blocked }
  if (adapter.runtime.minimum) return { version: adapter.runtime.minimum, reason: 'minimum', blockedVersions: blocked }
  return { version: undefined, reason: 'default', blockedVersions: blocked }
}

/** Alerte : un mod déclaré pour la version préférée tourne sur une version bloquée ? */
export function frostyVersionCompatibilityAlert(adapter: FrostyGameAdapter, actualVersion?: string): string | undefined {
  if (!actualVersion) return undefined
  const blocked = adapter.runtime.blocked || []
  if (blocked.includes(actualVersion)) {
    return `${adapter.displayName} recommande Frosty ${adapter.runtime.preferred || 'compatible'} — la version ${actualVersion} est déconseillée pour ce jeu.`
  }
  if (adapter.runtime.minimum && compareFrostyVersions(actualVersion, adapter.runtime.minimum) < 0) {
    return `Frosty ${actualVersion} est antérieur au minimum requis (${adapter.runtime.minimum}).`
  }
  return undefined
}

export type FrostyPackageKind = 'modern-fbmod' | 'legacy-structure' | 'unsupported' | 'not-frosty'

/** FrostyPackageInspector (§33, §72-73) : reconnaît .fbmod, structures legacy, inconnu. */
export function classifyFrostyPackage(fileName?: string, containsFbmod = false): FrostyPackageKind {
  const name = (fileName || '').toLocaleLowerCase()
  if (name.endsWith('.fbmod') || containsFbmod) return 'modern-fbmod'
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return 'legacy-structure'
  if (/\.(pak|utoc|ucas|mod)$/.test(name)) return 'unsupported'
  return 'not-frosty'
}

export interface FrostyLoadOrderEntry {
  modId: string
  name: string
  position?: number
}

/** FrostyLoadOrderResolver (§42-43) : monter/descendre/tout en haut/tout en bas. */
export function reorderFrostyList<T>(items: T[], index: number, kind: 'up' | 'down' | 'top' | 'bottom'): T[] {
  if (index < 0 || index >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  if (kind === 'up' && index > 0) next.splice(index - 1, 0, item)
  else if (kind === 'down' && index < items.length) next.splice(index + 1, 0, item)
  else if (kind === 'top') next.unshift(item)
  else if (kind === 'bottom') next.push(item)
  else next.splice(index, 0, item)
  return next
}

/** Ordre recommandé depuis les hints du mod (« place at bottom » → bas de liste, §88). */
export function loadOrderHintPosition(hints?: string[]): 'bottom' | 'top' | 'any' {
  if (!hints?.length) return 'any'
  const joined = hints.join(' ').toLocaleLowerCase()
  if (joined.includes('bottom') || joined.includes('bas') || joined.includes('end')) return 'bottom'
  if (joined.includes('top') || joined.includes('haut')) return 'top'
  return 'any'
}

export interface FrostyPlatformResult {
  platform: FrostyLaunchPlatform
  strategy: FrostyCompatibilityStrategy
  datapathFixRecommended: boolean
  pluginConflict: boolean
}

/** FrostyPlatformCompatibility (§47-52) : ne jamais activer DatapathFix aveuglément. */
export function frostyPlatformStrategy(
  platform: FrostyLaunchPlatform,
  adapter: FrostyGameAdapter,
  pluginConfig: { datapathFix: boolean; launchPlatformPlugin: boolean },
): FrostyPlatformResult {
  const strategies = new Set(adapter.platformStrategies)
  const pluginConflict = pluginConfig.datapathFix && pluginConfig.launchPlatformPlugin
  if (platform === 'ea-app') {
    // EA App direct : DatapathFix souvent inutile (§48).
    return { platform, strategy: 'native', datapathFixRecommended: false, pluginConflict }
  }
  if (platform === 'steam' || platform === 'epic') {
    const strategy: FrostyCompatibilityStrategy = strategies.has('datapath-fix') ? 'datapath-fix' : 'native'
    return { platform, strategy, datapathFixRecommended: strategy === 'datapath-fix', pluginConflict }
  }
  return { platform, strategy: 'native', datapathFixRecommended: false, pluginConflict }
}

/** Configuration persistée des plugins de lancement Frosty (spec « Fix Frosty —
 * activation persistante » §1). Toujours validée avant écriture : DatapathFix et
 * Launch Platform Plugin ne sont jamais actifs ensemble. */
export interface FrostyPluginConfig {
  datapathFix: boolean
  launchPlatformPlugin: boolean
}

export const FROSTY_PLUGIN_CONFLICT_NOTICE =
  'Conflit Frosty : DatapathFix et Launch Platform Plugin ne peuvent pas être actifs ensemble. L\'activation a été refusée.'

export interface FrostyPluginToggleResult {
  config: FrostyPluginConfig
  /** Le changement a été refusé (conflit) — l'état reste inchangé. */
  rejected: boolean
  conflict: boolean
  notice?: string
}

/** Validation transactionnelle avant écriture (spec §1) : si le patch créerait
 * un conflit (les deux plugins actifs), le changement est REFUSÉ et l'état
 * précédent est conservé — jamais d'état « impossible » écrit silencieusement.
 * Désactiver un plugin (pour corriger un conflit hérité) reste accepté. */
export function applyFrostyPluginToggle(current: FrostyPluginConfig, patch: Partial<FrostyPluginConfig>): FrostyPluginToggleResult {
  const next = { ...current, ...patch }
  if (next.datapathFix && next.launchPlatformPlugin) {
    return { config: current, rejected: true, conflict: true, notice: FROSTY_PLUGIN_CONFLICT_NOTICE }
  }
  return { config: next, rejected: false, conflict: false }
}

/** Clé de stockage par jeu + profil (spec §1 : la config vit dans le profil). */
export function frostyPluginConfigKey(gameId: string, profileId: string): string {
  return `${gameId}:${profileId}`
}

/** FrostyConflictDetector (§41, §87) : gros overhauls concurrents dans le même profil. */
export const FROSTY_OVERHAUL_CONFLICTS: Array<{ names: string[]; warning: string }> = [
  {
    names: ['evolution', 'remastered'],
    warning: '« Evolution » et « Remastered » sont deux gros overhauls NFS 2015 — les activer ensemble dans le même profil risque des conflits de ressources. Séparer dans des profils dédiés.',
  },
]

export function frostyOverhaulConflict(modNames: string[]): string | undefined {
  const normalized = modNames.map(name => name.toLocaleLowerCase())
  for (const rule of FROSTY_OVERHAUL_CONFLICTS) {
    const hits = rule.names.filter(needle => normalized.some(name => name.includes(needle)))
    if (hits.length >= 2) return rule.warning
  }
  return undefined
}

/** FrostyDeploymentFingerprint (§78-80) : staging mis en cache, jamais reconstruit sans raison. */
export interface FrostyDeploymentFingerprint {
  profileRevision: number
  runtimeVersion?: string
  gameVersion?: string
  loadOrderSignature: string
  pluginSignature: string
}

export function frostyFingerprintKey(fingerprint: FrostyDeploymentFingerprint): string {
  return [
    fingerprint.profileRevision,
    fingerprint.runtimeVersion || '?',
    fingerprint.gameVersion || '?',
    fingerprint.loadOrderSignature,
    fingerprint.pluginSignature,
  ].join('|')
}

export function frostyFingerprintsEqual(left: FrostyDeploymentFingerprint, right: FrostyDeploymentFingerprint): boolean {
  return frostyFingerprintKey(left) === frostyFingerprintKey(right)
}

/** Signature de l'ordre de chargement (liste ordonnée des ids). */
export function loadOrderSignature(modIds: string[]): string {
  return modIds.join('>')
}

export interface FrostyProfileStaging {
  packageRefs: Array<{ modId: string; name: string; fileName?: string }>
  loadOrder: string[]
  runtimeVersion?: string
}

/** FrostyProfileStaging (§36) : préparation d'un profil pour le lancement Frosty. */
export function buildFrostyStaging(
  packages: Array<{ modId: string; name: string; fileName?: string }>,
  loadOrder: string[],
  adapter: FrostyGameAdapter,
  profileRequestedVersion?: string,
): FrostyProfileStaging {
  const ordered = loadOrder
    .map(id => packages.find(pkg => pkg.modId === id))
    .filter((pkg): pkg is NonNullable<typeof pkg> => Boolean(pkg))
  const remaining = packages.filter(pkg => !loadOrder.includes(pkg.modId))
  const version = resolveFrostyVersion(adapter, profileRequestedVersion).version
  return {
    packageRefs: [...ordered, ...remaining],
    loadOrder: [...loadOrder, ...remaining.map(pkg => pkg.modId)],
    runtimeVersion: version,
  }
}

/** Extension de stockage ZAILON pour les packages Frosty (jamais traités comme Cyberpunk). */
export const FROSTY_PACKAGE_EXTENSIONS = ['fbmod'] as const

export function isFrostyPackageFile(fileName: string): boolean {
  return FROSTY_PACKAGE_EXTENSIONS.some(extension => fileName.toLocaleLowerCase().endsWith(`.${extension}`))
}
