/**
 * Design system ZAILON (spec « Refonte globale des toggles » §47-48) — logique
 * pure : contraste du texte sur la couleur d'accent.
 *
 * - `accentContrastText` : texte sombre sur un accent clair, texte clair sur un
 *   accent sombre — la même règle que la variable `--zailon-accent-text`
 *   (calculée côté App) est centralisée ici pour être testable.
 */

export interface RgbColor {
  r: number
  g: number
  b: number
}

/** Parse une couleur hexadécimale `#rrggbb` (tolère l'absence de `#`). */
export function parseHexColor(hex: string): RgbColor | null {
  const value = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

/** Luminance relative 0…1 (pondération perceptuelle sRGB, spec §47). */
export function relativeLuminance({ r, g, b }: RgbColor): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export const ACCENT_TEXT_DARK = '#090b0b'
export const ACCENT_TEXT_LIGHT = '#ffffff'

/** Texte lisible sur l'accent (spec §47 : contraste automatique). */
export function accentContrastText(hex: string): string {
  const rgb = parseHexColor(hex)
  if (!rgb) return ACCENT_TEXT_LIGHT
  return relativeLuminance(rgb) > 0.56 ? ACCENT_TEXT_DARK : ACCENT_TEXT_LIGHT
}
