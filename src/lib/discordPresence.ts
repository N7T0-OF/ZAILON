/**
 * Discord Rich Presence — logique pure (spec « Discord Rich Presence complète »).
 *
 * L'Application ID de ZAILON est centralisé ici (spec §5) : il n'est dupliqué
 * nulle part ailleurs et l'utilisateur normal n'a pas à le modifier — la
 * présence locale fonctionne sans OAuth ni bot (spec §6).
 */
export const DISCORD_APPLICATION_ID = '1509971526987022497'

/** Asset générique ZAILON : fallback quand aucun asset spécifique n'est défini
 * (spec §50) — la présence ne doit jamais échouer à cause d'une image. */
export const DISCORD_FALLBACK_ASSET = 'zailon'

export type DiscordGameKind = 'game' | 'software' | undefined

export interface DiscordActivityInput {
  gameName: string
  gameKind: DiscordGameKind
  /** Nom du profil actif (spec §22) — peut être absent (app sans profil). */
  profileName: string | undefined
  /** Compteur canonique de mods activés (`resolveProfileMods`). */
  enabledModCount: number
  /** Nombre de références du profil — sert à détecter un compteur incertain
   * (spec §23, §60 : ne jamais publier « 0 mods » si le profil est incohérent). */
  referencedModCount: number
  showProfile: boolean
  showModCount: boolean
  showElapsed: boolean
  /** Mode présence minimal (spec §36) : seulement le jeu + « Via ZAILON ». */
  minimal: boolean
  /** Asset Discord uploadé (jeu) ou undefined → fallback `zailon`. */
  largeImageKey: string | undefined
}

export interface DiscordActivityModel {
  details: string
  state: string
  largeImage: string
  largeImageText: string
  smallImage: string
  smallImageText: string
}

/** Un compteur est « incertain » quand le profil référence des mods mais que le
 * catalogue n'en résout aucun (cache vide, scan jamais fait, incohérence en
 * attente de recovery) — publier « 0 mods » serait un mensonge (spec §60). */
export function modCountIsUncertain(input: Pick<DiscordActivityInput, 'referencedModCount' | 'enabledModCount'>): boolean {
  return input.referencedModCount > 0 && input.enabledModCount === 0
}

/** Variantes de state (spec §25) — jamais de ligne vide, jamais « 0 mods »
 * incertain, wording adapté aux applications non-jeux (spec §9-11). */
export function buildDiscordState(input: DiscordActivityInput): string {
  if (input.minimal) return 'Via ZAILON'
  const parts: string[] = []
  if (input.showProfile && input.profileName) parts.push(`Profil ${input.profileName}`)
  const uncertain = modCountIsUncertain(input)
  if (input.showModCount && !uncertain && input.enabledModCount > 0) {
    parts.push(`${input.enabledModCount} mod(s) actif(s)`)
  }
  if (parts.length > 0) return parts.join(' · ')
  // Aucune donnée affichable : wording par type.
  return input.gameKind === 'software' ? 'Session créative' : 'Via ZAILON'
}

/** Construit le modèle d'activité complet (spec §7, §17-21). L'horodatage de
 * session n'est pas calculé ici : le natif le pose à l'appel quand
 * `showElapsed` est actif — et ZAILON n'appelle cette fonction qu'au vrai
 * `GameRunning` (spec §12), jamais au launcher intermédiaire. */
export function buildDiscordActivity(input: DiscordActivityInput): DiscordActivityModel {
  const state = buildDiscordState(input)
  return {
    details: input.gameName,
    state,
    largeImage: input.largeImageKey?.trim() || DISCORD_FALLBACK_ASSET,
    largeImageText: input.gameName,
    smallImage: DISCORD_FALLBACK_ASSET,
    smallImageText: 'Via ZAILON',
  }
}

/**
 * Décision de bascule anti-flap (spec §15) : un simple changement de premier
 * plan (Alt+Tab) ne doit pas remplacer l'activité toutes les 2 secondes.
 *
 * - `publishedGameId` absent → première publication : immédiate.
 * - la session publiée n'est plus en cours → remplacement immédiat (spec §13).
 * - la session publiée tourne encore mais a perdu la priorité (Alt+Tab) → la
 *   bascule est différée (debounce) ; si la priorité revient avant l'échéance,
 *   l'appelant annule le timer et ne change rien.
 */
export function shouldDelayPrioritySwitch(
  publishedGameId: string | undefined,
  newPriorityGameId: string | undefined,
  publishedStillRunning: boolean,
): boolean {
  if (!newPriorityGameId) return false
  if (publishedGameId === undefined || publishedGameId === newPriorityGameId) return false
  return publishedStillRunning
}

/** Durée du debounce de bascule de priorité (spec §15 : 3 à 5 secondes). */
export const DISCORD_PRIORITY_DEBOUNCE_MS = 3500
