// ─────────────────────────────────────────────────────────────────────────────
// addonCreator.ts — Créateur d'addon (spec « Refonte — système addons » §14)
//
// Génère un manifest ZAILON VALIDE sans obliger le développeur à écrire du
// JSON : le formulaire remplit les champs, `buildAddonManifest` produit le
// manifest, et `validateAddonManifest` (addons.ts) le garantit — le créateur
// ne peut pas produire un manifest invalide. Pur et testable (aucun fs, aucun
// Buffer), il reste importable dans le navigateur.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ADDON_API_VERSION,
  ZAILON_CURRENT_VERSION,
  type AddonCategory,
  type AddonPermission,
  type ZailonAddonManifest,
} from './addons.ts'

export interface AddonCreatorInput {
  /** ID immuable (`community.<author>.<slug>` recommandé) — déjà validé. */
  id: string
  name: string
  author: string
  /** Version sémantique `x.y.z` (exigée par la validation). */
  version: string
  description: string
  category: AddonCategory
  /** Permissions déclarées — jamais vides (la validation l'exige). */
  permissions: AddonPermission[]
  /** Jeux cibles (IDs ZAILON, ex. `neverness-to-everness`) — optionnel. */
  games?: string[]
}

/** Normalise un fragment en segment d'ID : `[a-z0-9][a-z0-9-]*[a-z0-9]`. */
function slugSegment(raw: string): string {
  const cleaned = raw
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return cleaned.slice(0, 32) || 'addon'
}

/** Suggère un ID valide depuis un nom (pur, testable) : au moins 2 segments
 * (`community.<author>.<slug>`), jamais d'ID inventé ni d'unicité devinée. */
export function suggestAddonId(name: string, author = 'community'): string {
  const authorSegment = slugSegment(author) || 'community'
  const nameSegments = slugSegment(name).split('-').filter(Boolean)
  const slug = nameSegments.slice(0, 3).join('-') || 'addon'
  return `community.${authorSegment}.${slug}`
}

/**
 * Construit un manifest qui passe TOUJOURS `validateAddonManifest` : version
 * ZAILON réelle (jamais codée en dur), API courante, permissions jamais vides.
 * Le résultat doit être sérialisé en JSON pour l'export/le manifest.json.
 */
export function buildAddonManifest(input: AddonCreatorInput): ZailonAddonManifest {
  const permissions: AddonPermission[] = input.permissions.length
    ? [...new Set(input.permissions)]
    : ['game.read']
  const supportedGames = input.games?.map(game => game.trim()).filter(Boolean)
  return {
    schema: 1,
    id: input.id,
    name: input.name.trim(),
    version: input.version.trim(),
    author: input.author.trim(),
    description: input.description.trim(),
    category: input.category,
    minZailonVersion: ZAILON_CURRENT_VERSION,
    minAddonApiVersion: ADDON_API_VERSION,
    permissions,
    ...(supportedGames?.length ? { supportedGames } : {}),
  }
}

/** Nom de fichier d'export recommandé : `<id>-<version>.zip` (spec §16). */
export function suggestedExportName(id: string, version: string): string {
  const safe = `${id}-${version}`.toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  return `${safe}.zip`
}
