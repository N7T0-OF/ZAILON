/**
 * Pont player du fond média (spec ZAILON correctifs §22, §32, §36-37).
 *
 * Un seul player vit dans `BackgroundMediaLayer` ; le contrôle audio du Hero
 * (`HeroAudioControl`) ne crée JAMAIS de player — il pilote celui-ci via ce
 * pont. Aucun DOM ici : le layer fournit les commandes concrètes.
 */

export interface BackgroundPlayerCommands {
  mute(): void
  unmute(): void
  setVolume(volume: number): void
  pause(): void
  resume(): void
}

const holder: { player: BackgroundPlayerCommands | null } = { player: null }

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
