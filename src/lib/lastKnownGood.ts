/**
 * Last Known Good des frameworks (spec « Correctif critique Cyberpunk RED4ext »
 * §41-42).
 *
 * Quand un jeu fonctionne (processus final détecté), ZAILON enregistre
 * l'empreinte des frameworks actifs (RED4ext, redscript, ArchiveXL, TweakXL).
 * Au lancement suivant, si l'empreinte a changé alors qu'un lancement avait
 * réussi avant, ZAILON peut avertir (« La configuration des frameworks a
 * changé depuis le dernier lancement réussi ») — et, si le profil est
 * « verrouillé » (§42), empêcher le remplacement silencieux.
 *
 * Logique pure et testable : aucun accès au store.
 */

export const KNOWN_FRAMEWORKS = ['RED4ext', 'redscript', 'ArchiveXL', 'TweakXL'] as const

export interface FrameworkCheckLkgInput {
  name: string
  enabled: boolean
  version?: string
  files?: string[]
  framework?: string
}

export interface FrameworkSnapshotEntry {
  /** Version déclarée du mod framework, si disponible. */
  version?: string
  /** Empreinte déterministe des fichiers triés + version (FNV-1a 32 bits). */
  fingerprint: string
}

/** Empreinte par framework : `Record<frameworkName, SnapshotEntry>`. */
export type FrameworkSnapshot = Record<string, FrameworkSnapshotEntry>

export interface FrameworkChange {
  framework: string
  kind: 'added' | 'removed' | 'updated'
  previousVersion?: string
  currentVersion?: string
}

/** FNV-1a 32 bits — petit hash déterministe, sans dépendance. */
export function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeFile(path: string): string {
  return path.replace(/\\/g, '/').toLocaleLowerCase()
}

/** Nom du framework d'un mod : `framework` déclaré, sinon inféré par chemin. */
export function frameworkNameOf(mod: FrameworkCheckLkgInput): string | undefined {
  const declared = (mod.framework ?? '').trim()
  if (declared) return declared
  const files = (mod.files ?? []).map(normalizeFile)
  // Les plugins précis AVANT le préfixe générique red4ext/ (ordre important :
  // red4ext/plugins/TweakXL/… matche aussi red4ext/).
  if (files.some(file => file.startsWith('red4ext/plugins/tweakxl/'))) return 'TweakXL'
  if (files.some(file => file.startsWith('red4ext/plugins/archivexl/'))) return 'ArchiveXL'
  if (files.some(file => file.startsWith('engine/tools/') || file.includes('scc.exe'))) return 'redscript'
  if (files.some(file => file.startsWith('red4ext/') || file === 'red4ext.dll')) return 'RED4ext'
  return undefined
}

/** Empreinte du framework pour un jeu : union des mods actifs par framework.
 * La version retenue est la première non vide (généralement celle du core) ;
 * l'empreinte couvre l'union des fichiers de tous les mods du framework. */
export function fingerprintFrameworkSet(mods: FrameworkCheckLkgInput[]): FrameworkSnapshot {
  const byFramework: Record<string, { version?: string; files: string[] }> = {}
  for (const mod of mods) {
    if (!mod.enabled) continue
    const name = frameworkNameOf(mod)
    if (!name) continue
    const normalized = name.toLocaleLowerCase()
    const entry = byFramework[normalized] ?? (byFramework[normalized] = { files: [] })
    if (!entry.version && mod.version) entry.version = mod.version
    entry.files.push(...(mod.files ?? []))
  }
  const snapshot: FrameworkSnapshot = {}
  for (const [name, entry] of Object.entries(byFramework)) {
    const files = [...new Set(entry.files.map(normalizeFile))].sort()
    snapshot[name] = { version: entry.version, fingerprint: fnv1a(`${files.join('|')}::${entry.version ?? ''}`) }
  }
  return snapshot
}

/** Différences entre deux empreintes (ajout, retrait, mise à jour). */
export function compareFrameworkSets(
  previous: FrameworkSnapshot | undefined,
  current: FrameworkSnapshot | undefined,
): FrameworkChange[] {
  const changes: FrameworkChange[] = []
  const previousKeys = new Set(Object.keys(previous ?? {}))
  const currentKeys = new Set(Object.keys(current ?? {}))
  for (const key of currentKeys) {
    if (!previousKeys.has(key)) {
      changes.push({ framework: key, kind: 'added', currentVersion: current?.[key]?.version })
    }
  }
  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      changes.push({ framework: key, kind: 'removed', previousVersion: previous?.[key]?.version })
    }
  }
  for (const key of currentKeys) {
    if (!previousKeys.has(key)) continue
    const before = previous?.[key]
    const after = current?.[key]
    if (!before || !after) continue
    if (before.fingerprint !== after.fingerprint) {
      changes.push({
        framework: key,
        kind: 'updated',
        previousVersion: before.version,
        currentVersion: after.version,
      })
    }
  }
  return changes
}

/** Vrai si la configuration des frameworks a changé depuis la référence. */
export function hasFrameworkChanges(
  previous: FrameworkSnapshot | undefined,
  current: FrameworkSnapshot | undefined,
): boolean {
  return compareFrameworkSets(previous, current).length > 0
}
