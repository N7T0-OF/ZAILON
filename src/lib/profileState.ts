import type { Mod } from '../types'

/**
 * ProfileStateRepository — helpers purs de l'état canonique d'un profil
 * (spec « compteur de mods fiable »).
 *
 * Tous les écrans (Accueil, Bibliothèque, Quick Panel, Diagnostic) doivent
 * lire la MÊME source de vérité : la liste des mods résolue du profil. Ces
 * fonctions garantissent qu'une liste installée stale ou des ids ré-importés
 * ne font jamais disparaître des mods réellement référencés — le compteur ne
 * peut plus afficher « 0 mods actifs » alors que le déploiement contient des
 * mods.
 */

/** Union de deux catalogues de mods par id. Le catalogue installé (source
 * vivante) gagne sur les champs ; les références du profil absentes de la liste
 * installée sont conservées. */
export function mergeModCatalogs(installed: Mod[], profileMods: Mod[]): Mod[] {
  const byId = new Map<string, Mod>()
  for (const mod of [...installed, ...profileMods]) {
    if (!byId.has(mod.id)) byId.set(mod.id, mod)
  }
  return [...byId.values()]
}

/** Réconciliation profil ↔ catalogue : toute clé de `modStates` absente du
 * catalogue reçoit un enregistrement minimal (le fichier/paquet est encore
 * référencé, on ne le fait pas disparaître silencieusement). */
export function reconcileModStates(
  catalog: Mod[],
  states: Record<string, { enabled?: boolean; priority?: number } | undefined>,
): Mod[] {
  const present = new Set(catalog.map(mod => mod.id))
  const reconciled = [...catalog]
  for (const id of Object.keys(states || {})) {
    if (present.has(id)) continue
    const state = states[id]
    reconciled.push({
      id,
      name: id,
      files: [],
      enabled: state?.enabled ?? false,
      priority: state?.priority ?? 999_999,
      loader: 'Manual',
      autoUpdate: false,
    } as unknown as Mod)
  }
  return reconciled
}

/** Nombre de mods actifs d'un profil résolu — la seule source du compteur
 * (jamais la longueur d'une liste rendue, jamais un cache périmé). */
export function countActiveMods(mods: Mod[]): number {
  return mods.filter(mod => mod.enabled).length
}

export interface ProfileModCounts {
  /** Mods référencés par le profil (état résolu complet). */
  referenced: number
  /** Mods actifs (activés). */
  active: number
  /** Mods présents mais désactivés. */
  disabled: number
}

/** Les trois compteurs affichés ensemble (« X référencé(s) · Y actif(s) »)
 * calculés depuis UNE seule liste résolue — jamais deux passes qui pourraient
 * diverger. À appeler avec `countProfileMods(resolveProfileMods(game,
 * profile))`. */
export function countProfileMods(profileMods: Mod[]): ProfileModCounts {
  const active = countActiveMods(profileMods)
  return { referenced: profileMods.length, active, disabled: profileMods.length - active }
}
