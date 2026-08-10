/**
 * ZailonInfoPopover — logique pure (spec « Refonte globale des toggles »
 * §40-42) :
 *
 * - `INFO_POPOVER_OPEN_DELAY_MS` : ouverture au survol après ~200 ms (§42) ;
 * - `INFO_POPOVER_CLOSE_DELAY_MS` : fermeture après sortie (rapide) ;
 * - `popoverHasMore` : un contenu long (ou un bloc `details` fourni) affiche le
 *   bouton « En savoir plus » qui ouvre la petite modale scrollable (§41).
 */

export const INFO_POPOVER_OPEN_DELAY_MS = 200
export const INFO_POPOVER_CLOSE_DELAY_MS = 120

/** Au-delà de cette longueur, le texte est tronqué dans la bulle et un bouton
 * « En savoir plus » ouvre la modale complète (§41). */
export const INFO_POPOVER_LONG_TEXT_CHARS = 220

export function popoverHasMore(text: string, details?: unknown): boolean {
  return Boolean(details) || text.length > INFO_POPOVER_LONG_TEXT_CHARS
}

/** Extrait court affiché dans la bulle pour un texte long (avec « … »). */
export function popoverShortText(text: string): string {
  if (text.length <= INFO_POPOVER_LONG_TEXT_CHARS) return text
  return `${text.slice(0, 180).trimEnd()}…`
}
