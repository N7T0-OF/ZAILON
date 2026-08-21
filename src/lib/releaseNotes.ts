/** Aide pure pour la fenêtre « Nouveautés » (spec « Fix changelog de mise à
 * jour » §1). Aucune dépendance React/store : testable isolément. */

export interface Semver {
  major: number
  minor: number
  patch: number
}

/** SemVer (major, minor, patch). Retourne null si la version n'est pas
 * exploitable (« v1.2.3 », « 1.2.3-beta » → 1.2.3). */
export function parseSemver(version: string): Semver | null {
  const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  return match
    ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
    : null
}

/** 1 si `a` > `b`, -1 si `a` < `b`, 0 si égal. Versions non exploitables :
 * traitées comme « inconnu » (comparaison lexicographique de repli). */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (left && right) {
    if (left.major !== right.major) return left.major > right.major ? 1 : -1
    if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1
    if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1
    return 0
  }
  if (a === b) return 0
  return a > b ? 1 : -1
}

export interface ReleaseNotesDecision {
  installedVersion: string
  lastSeenVersion?: string
  enabled: boolean
}

/**
 * Doit-on afficher la fenêtre « Nouveautés » au démarrage ?
 *
 * - `enabled` à false → jamais (préférence utilisateur).
 * - aucune version déjà vue (`lastSeenVersion` vide) → non : c'est une
 *   première installation, pas une mise à jour.
 * - `installedVersion` > `lastSeenVersion` → oui (nouvelle version installée).
 * - sinon (même version ou retour arrière) → non.
 */
export function shouldShowReleaseNotes({ installedVersion, lastSeenVersion, enabled }: ReleaseNotesDecision): boolean {
  if (!enabled) return false
  if (!lastSeenVersion || lastSeenVersion.trim() === '') return false
  return compareSemver(installedVersion, lastSeenVersion) > 0
}
