/**
 * Association jeu ↔ add-on (spec « Mise à niveau Bibliothèque / Add-ons /
 * Détection » §4). Une étiquette sur un jeu indique l'add-on qui le concerne :
 * « ● Cyberpunk Advanced · installé », « ● Frosty Support · disponible »…
 *
 * Règle absolue : AUCUNE étiquette si aucun add-on n'est associé. L'association
 * repose sur des signaux d'identité STABLES (nom/fournisseur/exécutable — via
 * le registre Frosty pour les jeux Frostbite), jamais sur une liste d'IDs
 * arbitraire. Logique pure — aucun DOM : testable sous node --test.
 */

import type { Game } from '../types'
import { frostyAdapterForExecutable } from './frosty.ts'
import type { ZailonCapability } from './addonGating.ts'
import { CAPABILITY_ADDON } from './addonGating.ts'
import type { AddonCatalogEntry, InstalledAddon } from './addons.ts'
import { catalogAddonAvailability } from './addons.ts'

export interface GameAddonAssociation {
  capability: ZailonCapability
  addonId: string
  /** Nom d'affichage de l'add-on associé (ex. « Cyberpunk Advanced »). */
  addonName: string
}

/** Noms d'affichage des add-ons par famille de jeu — le catalogue reste la
 * source de vérité pour l'UI, ce mapping ne sert qu'au lib pur. */
const GAME_ADDON_NAMES: Record<string, string> = {
  'official.zailon.game.cyberpunk': 'Cyberpunk Advanced',
  'official.zailon.game.nte': 'NTE Support',
  'official.zailon.game.fivem': 'FiveM Profiles',
  'official.zailon.frosty': 'Frosty Support',
}

/**
 * Add-ons pertinents pour un jeu donné (0, 1 ou plus — jamais d'étiquette si
 * aucun). Signaux stables, jamais le seul `name` pour les familles ambigües :
 * - Cyberpunk 2077 → Cyberpunk Advanced ;
 * - FiveM (client) → FiveM Profiles ;
 * - Neverness to Everness (NTE) → NTE Support ;
 * - jeux Frostbite (ex. NFS 2015, exécutable du registre Frosty) → Frosty Support.
 */
export function gameAddonAssociations(game: Partial<Pick<Game, 'name' | 'provider' | 'execPath'>>): GameAddonAssociation[] {
  const lowerName = (game.name || '').toLocaleLowerCase()
  const associations: GameAddonAssociation[] = []
  const add = (capability: ZailonCapability) => {
    const addonId = CAPABILITY_ADDON[capability]
    if (!addonId) return
    associations.push({ capability, addonId, addonName: GAME_ADDON_NAMES[addonId] || addonId })
  }
  if (lowerName.includes('cyberpunk')) add('cyberpunk.frameworks')
  if (lowerName.includes('fivem') || game.provider === 'FiveM Client') add('fivem.profiles')
  if (lowerName.includes('neverness')) add('nte.modloader')
  if (frostyAdapterForExecutable(game.execPath)) add('frosty.backend')
  return associations
}

export type GameAddonLabelStatus = 'installed' | 'available' | 'development'

export interface GameAddonLabel {
  addonId: string
  addonName: string
  status: GameAddonLabelStatus
  /** Texte lisible de l'état (spec §4 : « Add-on installé », « Add-on disponible »…). */
  statusLabel: string
}

const STATUS_LABELS: Record<GameAddonLabelStatus, string> = {
  installed: 'Add-on installé',
  available: 'Add-on disponible',
  development: 'Add-on en développement',
}

/**
 * Étiquettes prêtes à afficher pour un jeu : association + statut réel de
 * l'add-on (installé ET activé > disponible dans le catalogue > en
 * développement). Une entrée sans package installable n'a JAMAIS le statut
 * « disponible ».
 */
export function gameAddonLabels(
  game: Partial<Pick<Game, 'name' | 'provider' | 'execPath'>>,
  installed: readonly InstalledAddon[],
  catalogEntries: readonly AddonCatalogEntry[],
): GameAddonLabel[] {
  const installedIds = new Set(installed.filter(item => item.enabled !== false).map(item => item.manifest.id))
  const catalogById = new Map(catalogEntries.map(entry => [entry.id, entry]))
  return gameAddonAssociations(game).map(association => {
    if (installedIds.has(association.addonId)) {
      return { ...association, status: 'installed', statusLabel: STATUS_LABELS.installed }
    }
    const entry = catalogById.get(association.addonId)
    const status: GameAddonLabelStatus = entry && catalogAddonAvailability(entry).installable ? 'available' : 'development'
    return { ...association, status, statusLabel: STATUS_LABELS[status] }
  })
}
