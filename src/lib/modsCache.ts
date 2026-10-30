/**
 * Cache mods intelligent (spec §37-38) — décisions PURES.
 *
 * Le re-scan complet du dossier Mods (lecture de chaque mod, hash, manifestes)
 * est coûteux. À la place, ZAILON calcule une empreinte LÉGÈRE du dossier
 * (métadonnées uniquement : noms, tailles, mtimes, nombre d'entrées — jamais
 * le contenu) et ne re-scanne QUE si elle a changé. L'affichage venu du store
 * persisté (`games[].installedMods`) est déjà exact quand l'empreinte n'a pas
 * bougé — même entre deux sessions.
 */

export type ModsScanDecision = 'rescan' | 'reuse'

export interface ModsScanDecisionInput {
  /** Empreinte LÉGÈRE courante du dossier Mods ('' = dossier absent). */
  fingerprint: string
  /** Empreinte du dernier scan en mémoire (même session). */
  memoryFingerprint?: string
  /** Empreinte du dernier scan persisté (session précédente). */
  persistedFingerprint?: string
  /** Le dossier Mods est-il configuré pour ce jeu ? */
  modsPathConfigured: boolean
}

/**
 * Décision de scan (spec §37-38) :
 * - pas de dossier configuré → rien à scanner (reuse) ;
 * - dossier absent alors qu'il était configuré → rescan (résultat vide +
 *   paquets staged relus) ;
 * - empreinte identique à la mémoire OU au persisté → reuse (instantané) ;
 * - sinon → rescan complet.
 */
export function modsScanDecision(input: ModsScanDecisionInput): ModsScanDecision {
  if (!input.modsPathConfigured) return 'reuse'
  if (input.fingerprint === '') return 'rescan'
  if (input.memoryFingerprint === input.fingerprint) return 'reuse'
  if (input.persistedFingerprint === input.fingerprint) return 'reuse'
  return 'rescan'
}
