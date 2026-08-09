import type { ArtworkCandidate } from './native'

/**
 * Moteur d'illustrations unifié (spec « Refonte Apparence » §1-14, 58-61).
 *
 * Un seul registre décrit tous les fournisseurs d'illustrations : leur
 * disponibilité réelle, leur priorité et la raison de leur état. Aucun
 * fournisseur n'est affiché comme fonctionnel sans être réellement branché.
 *
 * Priorités (recommandation d'intégration) :
 * 1. SteamGridDB — spécialiste des assets de bibliothèque (grid/hero/logo/icon) ;
 * 2. Steam officiel — couverture/hero officiels sans aucune clé ;
 * 3. IGDB — covers/artworks/screenshots (client Twitch) ;
 * 4. GameBanana — API publique sans clé (images liées au modding) ;
 * 5. Nexus — réservé aux images de mods/galeries, pas de jaquettes de jeux ;
 * 6. CurseForge — pas de recherche publique de jeux par nom.
 */

export type ArtworkProviderId = 'steam' | 'steamgriddb' | 'igdb' | 'nexus' | 'gamebanana' | 'curseforge'

export type ArtworkProviderState = 'available' | 'not-configured' | 'not-implemented'

export type ArtworkKind = 'cover' | 'banner' | 'background' | 'logo' | 'icon'

export interface ArtworkProviderConfig {
  /** Clé API SteamGridDB (lue seule, transmise uniquement à SteamGridDB). */
  steamgriddbApiKey?: string
  /** Client ID de l'application Twitch (IGDB). */
  igdbClientId?: string
  /** Client Secret de l'application Twitch (IGDB) — non affiché. */
  igdbClientSecret?: string
}

export interface ArtworkProviderMeta {
  id: ArtworkProviderId
  label: string
  /** Priorité (1 = essayé en premier). */
  priority: number
  /** Types d'images réellement fournis par le connecteur. */
  capabilities: ArtworkKind[]
  /** Raison de l'état actuel — affichée dans la bulle ⓘ. */
  reason: (config: ArtworkProviderConfig) => string
}

export const ARTWORK_PROVIDERS: ArtworkProviderMeta[] = [
  {
    id: 'steamgriddb',
    label: 'SteamGridDB',
    priority: 1,
    capabilities: ['cover', 'banner', 'background', 'logo', 'icon'],
    reason: config => (config.steamgriddbApiKey?.trim() ? 'Clé enregistrée, source active.' : 'Une clé API SteamGridDB est nécessaire (gratuite, obtenue sur steamgriddb.com).'),
  },
  {
    id: 'steam',
    label: 'Steam officiel',
    priority: 2,
    capabilities: ['cover', 'banner', 'background', 'logo', 'icon'],
    reason: () => 'Toujours disponible, sans clé.',
  },
  {
    id: 'igdb',
    label: 'IGDB',
    priority: 3,
    capabilities: ['cover', 'banner', 'background'],
    reason: config =>
      config.igdbClientId?.trim() && config.igdbClientSecret?.trim()
        ? 'Client Twitch enregistré, source active (covers, artworks, screenshots).'
        : 'Une application Twitch gratuite est nécessaire : Client ID + Client Secret (dev.twitch.tv/console/apps).',
  },
  {
    id: 'gamebanana',
    label: 'GameBanana',
    priority: 4,
    capabilities: ['cover', 'banner', 'background'],
    reason: () => 'API publique sans clé : couvertures et images de jeux/mods.',
  },
  {
    id: 'nexus',
    label: 'Nexus',
    priority: 5,
    capabilities: ['background'],
    reason: () => 'Réservé aux images de mods (galeries) : Nexus ne fournit pas de jaquettes de jeux. Aucun résultat fictif n’est affiché.',
  },
  {
    id: 'curseforge',
    label: 'CurseForge',
    priority: 6,
    capabilities: ['background'],
    reason: () => 'Pas de recherche publique de jeux par nom dans l’API CurseForge ; le connecteur n’est pas branché. Aucun résultat fictif n’est affiché.',
  },
]

/** État honnête d'un fournisseur pour une configuration donnée. */
export function artworkProviderState(id: ArtworkProviderId, config: ArtworkProviderConfig): ArtworkProviderState {
  switch (id) {
    case 'steam':
    case 'gamebanana':
      return 'available'
    case 'steamgriddb':
      return config.steamgriddbApiKey?.trim() ? 'available' : 'not-configured'
    case 'igdb':
      return config.igdbClientId?.trim() && config.igdbClientSecret?.trim() ? 'available' : 'not-configured'
    default:
      return 'not-implemented'
  }
}

/** Tous les fournisseurs, triés par priorité, avec leur état calculé. */
export function artworkProvidersWithState(config: ArtworkProviderConfig) {
  return ARTWORK_PROVIDERS
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map(provider => ({ ...provider, state: artworkProviderState(provider.id, config) }))
}

/** Fournisseurs réellement capables de répondre pour le type demandé. */
export function availableArtworkProviders(config: ArtworkProviderConfig, kind: ArtworkKind): ArtworkProviderMeta[] {
  return ARTWORK_PROVIDERS
    .filter(provider => provider.capabilities.includes(kind))
    .filter(provider => artworkProviderState(provider.id, config) === 'available')
    .sort((a, b) => a.priority - b.priority)
}

function normalizeArtworkUrl(url: string): string {
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    // Ignorer les variations de cache (paramètres de signature CDN).
    return `${parsed.origin}${parsed.pathname}`.toLocaleLowerCase().replace(/\/+$/, '')
  } catch {
    return trimmed.toLocaleLowerCase().replace(/\/+$/, '')
  }
}

/**
 * Déduplication des candidats (spec §4). La même image revient parfois de
 * plusieurs sources : clé principale = URL normalisée (origine + chemin, sans
 * paramètres de cache). Les candidats identiques sont éliminés en gardant le
 * premier (l'ordre natif suit la priorité du registre).
 */
export function dedupeArtworkCandidates(candidates: ArtworkCandidate[]): ArtworkCandidate[] {
  const seenUrls = new Set<string>()
  const result: ArtworkCandidate[] = []
  for (const candidate of candidates) {
    if (!candidate.url) continue
    const key = normalizeArtworkUrl(candidate.url)
    if (seenUrls.has(key)) continue
    seenUrls.add(key)
    result.push(candidate)
  }
  return result
}

export type ArtworkSourceMode = 'automatic' | 'all'

export interface ArtworkSearchAttempt {
  /** Libellé affiché dans l'en-tête des résultats. */
  label: string
  /** Clés à passer au natif pour cette tentative. */
  apiKeys: Record<string, string>
}

export interface ArtworkSearchPlan {
  /** Tentatives dans l'ordre (la première qui renvoie des résultats gagne en mode automatique). */
  attempts: ArtworkSearchAttempt[]
  /** Sources sautées avec leur raison — affiché en pied de recherche. */
  skipped: Array<{ id: ArtworkProviderId; label: string; reason: string }>
}

/**
 * Plan de recherche multi-source (spec §3, §6, §61) :
 * - « Automatique » : Steam officiel d'abord (aucune clé requise) ; si aucune
 *   image, nouvelle tentative avec toutes les sources configurées.
 * - « Toutes les sources » : une seule recherche fusionnée avec toutes les
 *   sources disponibles (SteamGridDB en tête, puis Steam, IGDB, GameBanana).
 * Les fournisseurs indisponibles ne bloquent jamais la recherche : ils sont
 * listés dans `skipped` (1 source indisponible ⓘ).
 */
export function artworkSearchPlan(mode: ArtworkSourceMode, config: ArtworkProviderConfig, kind: ArtworkKind): ArtworkSearchPlan {
  const skipped = ARTWORK_PROVIDERS
    .filter(provider => provider.capabilities.includes(kind))
    .filter(provider => artworkProviderState(provider.id, config) !== 'available')
    .sort((a, b) => a.priority - b.priority)
    .map(provider => ({ id: provider.id, label: provider.label, reason: provider.reason(config) }))

  const apiKeys: Record<string, string> = {}
  if (config.steamgriddbApiKey?.trim()) apiKeys.steamgriddb = config.steamgriddbApiKey.trim()
  if (config.igdbClientId?.trim()) apiKeys.igdbClientId = config.igdbClientId.trim()
  if (config.igdbClientSecret?.trim()) apiKeys.igdbClientSecret = config.igdbClientSecret.trim()

  const attempts: ArtworkSearchAttempt[] = []
  if (mode === 'all') {
    attempts.push({ label: 'Toutes les sources disponibles', apiKeys })
  } else if (Object.keys(apiKeys).length > 0) {
    attempts.push({ label: 'Steam officiel', apiKeys: {} })
    attempts.push({ label: 'Toutes les sources configurées', apiKeys })
  } else {
    attempts.push({ label: 'Steam officiel', apiKeys: {} })
  }
  return { attempts, skipped }
}

/** Sources réellement représentées dans un lot de résultats (libellés uniques). */
export function resultSourceLabels(candidates: ArtworkCandidate[]): string[] {
  return Array.from(new Set(candidates.map(candidate => candidate.sourceLabel).filter(Boolean)))
}
