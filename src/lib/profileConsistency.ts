import type { Mod, Profile } from '../types'

/**
 * ProfileConsistency — garde-fous purs du bug « profil affichant 0 mods »
 * (spec Fiabilité profils §1-11, §56-60).
 *
 * - `enabledCountFromState` : le compteur canonique d'un profil, calculé
 *   UNIQUEMENT depuis ses modStates (spec §2 : enabledPackageIds) — jamais
 *   depuis une liste rendue ou un cache.
 * - `isSilentClear` : invariant anti-« 84 → 0 sans opération explicite »
 *   (spec §8) — une transaction qui ferait passer un profil de > 0 à 0 actifs
 *   sans être une désactivation massive explicite est rejetée.
 * - `needsStagedRefresh` : détecte un profil dont les références existent
 *   mais dont le catalogue installé est vide — signe d'un cache UI vide
 *   (spec §9-10) : le re-scan staged au boot doit repeupler le catalogue.
 */

/** Compteur canonique d'un profil depuis ses modStates (spec §2, §10). */
export function enabledCountFromState(profile?: Profile): number {
  if (!profile?.modStates) return 0
  return Object.values(profile.modStates).filter(state => state?.enabled).length
}

/** Nombre de références d'un profil (clés de modStates). */
export function referenceCountFromState(profile?: Profile): number {
  if (!profile?.modStates) return 0
  return Object.keys(profile.modStates).length
}

/**
 * Invariant anti-clear silencieux (spec §8) : une mutation qui ferait passer
 * un profil de > 0 actifs à 0 actifs est rejetée SAUF si l'opération était une
 * désactivation massive explicite (`explicitDisableAll`) ou une suppression
 * explicite de tous les mods (`allowEmpty`, ex. retirer tous les mods d'un
 * profil ou restaurer un snapshot antérieur volontairement vide).
 */
export function isSilentClear(
  beforeEnabled: number,
  afterEnabled: number,
  opts: { explicitDisableAll?: boolean; allowEmpty?: boolean } = {},
): boolean {
  if (beforeEnabled <= 0 || afterEnabled !== 0) return false
  return !opts.explicitDisableAll && !opts.allowEmpty
}

/**
 * Spec §9-10 : un jeu a besoin d'un re-scan staged au boot quand au moins un
 * profil possède des références (modStates) alors que son catalogue installé
 * est vide — un cache vide ne doit jamais être la source de vérité.
 */
export function needsStagedRefresh(game: { installedMods?: Mod[]; profiles?: Profile[] } | undefined): boolean {
  if (!game) return false
  if ((game.installedMods || []).length > 0) return false
  return (game.profiles || []).some(profile => referenceCountFromState(profile) > 0)
}

/**
 * Rapport de réparation (spec §5-6, §57) : après le re-scan staged, compare
 * le nombre de références du profil au catalogue résolu pour indiquer ce qui
 * a été restauré. `null` si aucune incohérence.
 */
export function repairReport(
  game: { installedMods?: Mod[]; profiles?: Profile[] } | undefined,
): { profileId: string; profileName: string; restoredReferences: number; enabledRestored: number } | null {
  if (!game) return null
  const installedIds = new Set((game.installedMods || []).map(mod => mod.id))
  for (const profile of game.profiles || []) {
    const references = Object.keys(profile.modStates || {})
    const missing = references.filter(id => !installedIds.has(id))
    if (missing.length > 0) {
      const enabled = missing.filter(id => profile.modStates?.[id]?.enabled).length
      return {
        profileId: profile.id,
        profileName: profile.name || 'Default',
        restoredReferences: missing.length,
        enabledRestored: enabled,
      }
    }
  }
  return null
}
