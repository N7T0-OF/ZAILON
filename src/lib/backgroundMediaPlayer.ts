/**
 * Pont player du fond média (spec ZAILON correctifs §22, §32, §36-37).
 *
 * Un seul player vit dans `BackgroundMediaLayer` ; le contrôle audio du Hero
 * (`HeroAudioControl`) ne crée JAMAIS de player — il pilote celui-ci via ce
 * pont. Aucun DOM ici : le layer fournit les commandes concrètes.
 *
 * Ce pont expose aussi l'ÉTAT DE SESSION (spec §50) : muet effectif + volume
 * du player monté, publié par le layer. Le contrôle du Hero s'y abonne pour
 * afficher la réalité (le boot démarre toujours muet avec « toujours démarrer
 * muet », indépendamment de l'intention persistée) et pour basculer le son de
 * la SESSION sans toucher à la préférence persistée (qui est écrite à part,
 * par le store).
 */

export interface BackgroundPlayerCommands {
  mute(): void
  unmute(): void
  setVolume(volume: number): void
  pause(): void
  resume(): void
}

/** État de session du fond média — publié par le layer, lu par le Hero. */
export interface BackgroundPlayerState {
  /** Muet effectif de la SESSION (boot muet inclus, spec §44, §50). */
  muted: boolean
  /** Volume effectif appliqué (persisté par jeu sinon défaut global). */
  volume: number
  /** Un player est monté et répond aux commandes. */
  available: boolean
}

const holder: { player: BackgroundPlayerCommands | null } = { player: null }

let playerState: BackgroundPlayerState = { muted: true, volume: 0.07, available: false }
const stateListeners = new Set<() => void>()

/** Enregistre les commandes du player courant (au plus un actif, spec §23). */
export function registerBackgroundPlayer(player: BackgroundPlayerCommands): void {
  holder.player = player
}

export function unregisterBackgroundPlayer(player: BackgroundPlayerCommands): void {
  if (holder.player === player) holder.player = null
}

/** Commandes du player actif, ou null si aucun player monté. */
export function backgroundPlayer(): BackgroundPlayerCommands | null {
  return holder.player
}

/** Applique volume effectif + mute à un player via le pont (spec §12). */
export function applyBackgroundAudio(player: BackgroundPlayerCommands, opts: { muted: boolean; volume: number }): void {
  if (opts.muted || opts.volume <= 0) {
    player.mute()
    return
  }
  player.unmute()
  player.setVolume(opts.volume)
}

/** Publie l'état de session (appelé par le layer à chaque changement). */
export function publishBackgroundPlayerState(patch: Partial<BackgroundPlayerState>): void {
  playerState = { ...playerState, ...patch }
  for (const listener of stateListeners) listener()
}

/** S'abonne à l'état de session ; la callback est appelée immédiatement puis à
 * chaque publication. Renvoie la fonction de désabonnement. */
export function subscribeBackgroundPlayerState(listener: () => void): () => void {
  stateListeners.add(listener)
  listener()
  return () => { stateListeners.delete(listener) }
}

/** État de session courant (lecture ponctuelle, hors abonnement). */
export function backgroundPlayerState(): BackgroundPlayerState {
  return playerState
}

/**
 * Bascule muet / son de la SESSION (spec §10, §50) : commande le player actif.
 * Ne modifie PAS l'intention persistée — le store l'écrit séparément. Le
 * volume est restauré au dé-mute (volume persisté, spec §50).
 */
export function setBackgroundSessionMuted(muted: boolean): void {
  const player = holder.player
  if (!player) return
  if (muted) {
    player.mute()
  } else {
    player.unmute()
    player.setVolume(playerState.volume)
  }
  publishBackgroundPlayerState({ muted })
}

/** Volume de la SESSION (spec §12) : commande le player actif sans toucher à
 * l'intention persistée (écrite à part par le store). */
export function setBackgroundSessionVolume(volume: number): void {
  const player = holder.player
  if (!player) return
  player.setVolume(volume)
  publishBackgroundPlayerState({ volume })
}
