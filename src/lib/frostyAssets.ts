/**
 * Frosty Editor — Asset Browser (spec §14-18, §46, §95-96, §98).
 *
 * Pur (aucun DOM/fs) : index par jeu, recherche debounced, filtres, liste
 * virtualisée, sélection multiple, favoris et historique de recherche.
 * L'index réel est alimenté par le bridge Frosty (runtime officiel) ; ce
 * module fournit toute la logique de navigation sans jamais rendre des
 * centaines de milliers de lignes (§15).
 */

/** Types d'assets Frostbite (§14). */
export type FrostyAssetType = 'ebx' | 'res' | 'chunk' | 'texture' | 'mesh' | 'audio'

export interface FrostyAsset {
  id: string
  name: string
  path: string
  type: FrostyAssetType
  bundle: string
  /** Type de ressource Frostbite (ex. TextureAsset, MeshSetAsset…). */
  resourceType: string
  /** Taille estimée en octets (permet le tri et l'estimation de build). */
  size: number
}

export interface FrostyAssetIndex {
  gameKey: string
  gameVersion?: string
  profileVersion?: string
  frostyVersion: string
  /** Index complet (jamais rendu intégralement — §15). */
  assets: FrostyAsset[]
  builtAt: number
  /** Progression 0-1 de l'indexation en arrière-plan (§17). */
  progress: number
}

export interface FrostyAssetFilters {
  types: FrostyAssetType[]
  bundles: string[]
  /** Texte libre (recherche debounced côté appelant). */
  query: string
}

export interface FrostyAssetPage {
  items: FrostyAsset[]
  total: number
  offset: number
  limit: number
}

// ─────────────────────────────── Index ─────────────────────────────────

/** Clé d'index cache par jeu (spec §16) : gameVersion + profileVersion + frostyVersion. */
export function frostyIndexCacheKey(index: Pick<FrostyAssetIndex, 'gameKey' | 'gameVersion' | 'profileVersion' | 'frostyVersion'>): string {
  return [index.gameKey, index.gameVersion ?? '', index.profileVersion ?? '', index.frostyVersion].join('|')
}

/** Construit un index vide pour un jeu (état « not_started », §74). */
export function emptyFrostyIndex(gameKey: string, frostyVersion: string): FrostyAssetIndex {
  return { gameKey, frostyVersion, assets: [], builtAt: 0, progress: 0 }
}

/** Ajoute un lot d'assets à l'index (indexation incrémentale, §17). */
export function ingestFrostyAssets(index: FrostyAssetIndex, assets: FrostyAsset[]): FrostyAssetIndex {
  const seen = new Set(index.assets.map(a => a.id))
  const fresh = assets.filter(a => !seen.has(a.id))
  return { ...index, assets: [...index.assets, ...fresh] }
}

/** Marque la progression d'indexation ; >0 → 'indexing', >=1 → 'ready'. */
export function setFrostyIndexProgress(index: FrostyAssetIndex, progress: number): FrostyAssetIndex {
  const clamped = Math.max(0, Math.min(1, progress))
  return { ...index, progress: clamped, builtAt: clamped >= 1 ? Date.now() : index.builtAt }
}

/** Générateur d'assets synthétiques (démo/simulation, jamais utilisé en prod). */
export function synthFrostyAssets(gameKey: string, prefix: string, count: number): FrostyAsset[] {
  const types: FrostyAssetType[] = ['ebx', 'res', 'chunk', 'texture', 'mesh', 'audio']
  const out: FrostyAsset[] = []
  for (let i = 0; i < count; i += 1) {
    const type = types[i % types.length]
    const bundle = ['core', 'vehicle', 'world', 'ui', 'audio', 'character'][i % 6]
    out.push({
      id: `${gameKey}:${type}:${i}`,
      name: `${prefix}/${type}s/${prefix.toLowerCase()}_${i}`,
      path: `resources/${bundle}/${type}/${i}`,
      type,
      bundle,
      resourceType: type === 'texture' ? 'TextureAsset' : type === 'mesh' ? 'MeshSetAsset' : type === 'audio' ? 'SoundWaveAsset' : `${type.charAt(0).toUpperCase()}${type.slice(1)}Asset`,
      size: 1_000_000 + (i % 20) * 250_000,
    })
  }
  return out
}

// ─────────────────────────────── Recherche ──────────────────────────────

/**
 * Recherche avec priorité : nom exact > préfixe > sous-chaîne (insensible à la
 * casse). Retourne les assets triés par pertinence (§18).
 */
export function searchFrostyAssets(assets: FrostyAsset[], query: string, limit = 500): FrostyAsset[] {
  const q = query.trim().toLowerCase()
  if (!q) return assets.slice(0, limit)
  const exact: FrostyAsset[] = []
  const prefix: FrostyAsset[] = []
  const substring: FrostyAsset[] = []
  for (const asset of assets) {
    const name = asset.name.toLowerCase()
    if (name === q) exact.push(asset)
    else if (name.startsWith(q)) prefix.push(asset)
    else if (name.includes(q)) substring.push(asset)
  }
  return [...exact, ...prefix, ...substring].slice(0, limit)
}

/** Application des filtres (types + bundles) puis recherche. */
export function filterFrostyAssets(assets: FrostyAsset[], filters: FrostyAssetFilters, query: string, limit = 500): FrostyAsset[] {
  const byType = filters.types.length === 0 ? assets : assets.filter(a => filters.types.includes(a.type))
  const byBundle = filters.bundles.length === 0 ? byType : byType.filter(a => filters.bundles.includes(a.bundle))
  return searchFrostyAssets(byBundle, query, limit)
}

/**
 * Découpage en pages pour liste virtualisée : seule la fenêtre visible est
 * rendue (§15). `visibleCount` = fenêtre de rendu, `total` = nombre de
 * résultats (pour la hauteur du scroll virtuel).
 */
export function virtualizeFrostyAssets(results: FrostyAsset[], offset: number, visibleCount: number): FrostyAssetPage {
  const page = results.slice(offset, offset + visibleCount)
  return { items: page, total: results.length, offset, limit: visibleCount }
}

// ─────────────────────────────── Sélection ──────────────────────────────

/** Sélection multiple avec plage (shift) et toggle (ctrl) — §46. */
export function toggleAssetSelection(selected: string[], assetId: string, mode: 'toggle' | 'range', anchor?: string, allIds: string[] = []): string[] {
  if (mode === 'toggle') {
    return selected.includes(assetId) ? selected.filter(id => id !== assetId) : [...selected, assetId]
  }
  // Range : de l'ancre à l'asset courant, dans l'ordre de la liste.
  if (!anchor) return [assetId]
  const a = allIds.indexOf(anchor)
  const b = allIds.indexOf(assetId)
  if (a === -1 || b === -1) return [assetId]
  const [from, to] = a < b ? [a, b] : [b, a]
  return allIds.slice(from, to + 1)
}

// ─────────────────────────────── Favoris / historique ───────────────────

/** Bascule d'un favori local au projet (spec §95-96) — ne modifie jamais l'asset du jeu. */
export function toggleFavoriteAsset(favorites: string[], assetId: string): string[] {
  return favorites.includes(assetId) ? favorites.filter(id => id !== assetId) : [...favorites, assetId]
}

/** Historique de recherche borné (spec §98). */
export function pushSearchHistory(history: string[], query: string, max = 6): string[] {
  const q = query.trim()
  if (!q) return history
  return [q, ...history.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, max)
}

// ─────────────────────────────── Stats ──────────────────────────────────

/** Répartition par type (UI : compteurs des filtres). */
export function frostyAssetCounts(assets: FrostyAsset[]): Record<FrostyAssetType, number> {
  const counts: Record<FrostyAssetType, number> = { ebx: 0, res: 0, chunk: 0, texture: 0, mesh: 0, audio: 0 }
  for (const asset of assets) counts[asset.type] += 1
  return counts
}

/** Bundles présents dans l'index (pour le filtre, triés). */
export function frostyAssetBundles(assets: FrostyAsset[]): string[] {
  return [...new Set(assets.map(a => a.bundle))].sort()
}
