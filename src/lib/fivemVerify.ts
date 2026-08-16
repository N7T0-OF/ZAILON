import type { FiveMProfileCheck } from './native'

/**
 * FiveM Profiles (spec §20) — logique PURE de la vérification d'intégrité.
 * Le natif (`verify_fivem_profile`) fait les constats disque (racine,
 * FiveM.app, CitizenFX.ini, mods/, plugins/, ReShade) ; ici on dérive le
 * verdict et les libellés. Aucun accès disque, testable sous node --test.
 */

export type FiveMProfileVerdict = 'ok' | 'attention' | 'missing'

/** Contrôles facultatifs (leur absence n'est pas un problème). */
const OPTIONAL_CHECKS = new Set(['reshade'])

/**
 * Verdict :
 * - `missing` : racine introuvable (FiveM.exe absent) → l'installation n'est
 *   pas reconnue ;
 * - `ok` : tous les contrôles passent (les éléments facultatifs comptent
 *   quand même dans `ok` s'ils sont présents, mais leur absence n'alerte pas) ;
 * - `attention` : au moins un élément obligatoire manque.
 */
export function fiveMProfileVerdict(checks: FiveMProfileCheck[]): FiveMProfileVerdict {
  if (checks.length === 0) return 'missing'
  const root = checks.find(check => check.id === 'root')
  if (root && !root.ok) return 'missing'
  const failed = checks.filter(check => !check.ok && !OPTIONAL_CHECKS.has(check.id))
  return failed.length === 0 ? 'ok' : 'attention'
}

const CHECK_LABELS: Record<string, string> = {
  root: 'Installation FiveM',
  app: 'FiveM.app',
  citizenfx: 'CitizenFX.ini',
  mods: 'Dossier mods',
  plugins: 'Dossier plugins',
  reshade: 'ReShade',
}

/** Libellé lisible d'un contrôle. */
export function fiveMCheckLabel(id: string): string {
  return CHECK_LABELS[id] || id
}

/** Résumé lisible pour l'UI (spec §20 : « Profil fonctionnel » ou éléments manquants). */
export function fiveMVerifySummary(checks: FiveMProfileCheck[]): string {
  const verdict = fiveMProfileVerdict(checks)
  if (verdict === 'missing') {
    return 'Profil FiveM introuvable — lancez FiveM une première fois pour générer sa structure.'
  }
  if (verdict === 'ok') return 'Profil fonctionnel — tous les éléments sont présents.'
  const missing = checks.filter(check => !check.ok && !OPTIONAL_CHECKS.has(check.id))
  const names = missing.map(check => fiveMCheckLabel(check.id)).join(', ')
  return missing.length === 1
    ? `1 élément à vérifier : ${names}.`
    : `${missing.length} éléments à vérifier : ${names}.`
}
