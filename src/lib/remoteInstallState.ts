/**
 * RemoteModInstallState (spec « État d'installation Explorer » §15-23).
 *
 * Règle (spec §16) : l'état installé d'un mod distant est **dérivé des packages
 * locaux réels** (`Mod.externalReferences`), jamais deviné depuis la carte du
 * catalogue — un cache ou un refresh manuel ne peuvent plus diverger (§18).
 *
 * - `remoteModKey` : identité stable `provider:modId[:fileId]` ;
 * - `remoteIdentityFromCatalog` : identité distante d'un résultat Explorer
 *   (modId numérique sinon id) ;
 * - `modMatchesRemote` : un Mod local correspond-il à cette identité distante ?
 * - `collectRemotePackages` : état canonique agrégé (clé → ids de packages) ;
 * - `classifyRemoteInstall` : Install / Installé / Installation… / Suppression…
 *   (§21).
 */

import type { Mod } from '../types'

export interface RemoteModIdentity {
  provider: string
  remoteModId: string
  fileId?: string
}

export function remoteModKey(provider: string, remoteModId: string, fileId?: string): string {
  return fileId ? `${provider}:${remoteModId}:${fileId}` : `${provider}:${remoteModId}`
}

/** Identité distante d'un résultat du catalogue (ExplodMod) : le modId
 * numérique du provider quand il existe, sinon l'id de la carte. */
export function remoteIdentityFromCatalog(provider: string, catalogId: string | number, modId?: number): RemoteModIdentity {
  return { provider, remoteModId: String(modId ?? catalogId) }
}

export function modMatchesRemote(mod: Pick<Mod, 'externalReferences'>, identity: RemoteModIdentity): boolean {
  const refs = mod.externalReferences || []
  return refs.some(reference =>
    reference.provider === identity.provider
    && String(reference.modId) === String(identity.remoteModId)
    && (identity.fileId === undefined || reference.fileId === undefined || String(reference.fileId) === String(identity.fileId)),
  )
}

/** État installé canonique (spec §16, §23) : agrège les packages locaux par
 * identité distante. Seules les références confirmées (import par l'utilisateur
 * ou correspondance exacte) comptent — jamais une devinette depuis la carte. */
export function collectRemotePackages(mods: Pick<Mod, 'id' | 'externalReferences'>[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const mod of mods) {
    for (const reference of mod.externalReferences || []) {
      if (!reference.confirmedByUser && reference.confidence !== 'exact') continue
      const key = remoteModKey(reference.provider, String(reference.modId), reference.fileId)
      const list = result.get(key) || []
      if (!list.includes(mod.id)) list.push(mod.id)
      result.set(key, list)
    }
  }
  return result
}

export type RemoteInstallStatus = 'install' | 'installed' | 'installing' | 'removing'

export function classifyRemoteInstall(installed: boolean, installing: boolean, removing: boolean): RemoteInstallStatus {
  if (removing) return 'removing'
  if (installing) return 'installing'
  return installed ? 'installed' : 'install'
}
