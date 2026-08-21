/**
 * DesignTokenService (spec « Persistance globale + Accent Color universel »
 * §6-14) — LA source unique des couleurs d'action de ZAILON.
 *
 * Règle d'architecture (spec §9, rappel utilisateur) : **aucun composant
 * principal n'a le droit de choisir sa propre couleur d'action** — il demande
 * ses couleurs aux tokens CSS (`--zailon-accent*`, `--zailon-danger*`).
 *
 * - `applyAccentTokens` : injecte tous les tokens dérivés d'une couleur
 *   d'accent (hover, active, muted, border, text, contrast, focus) — logique
 *   pure et testable (mock `style.setProperty`) ;
 * - `applyDangerTokens` : palette danger indépendante de l'accent (spec §14,
 *   §70 — un accent rouge ne doit pas absorber le Danger) ;
 * - `bootstrapTheme` : spec §7 — applique les tokens AVANT le premier rendu
 *   (lecture du réglage persisté, aucun flash du thème par défaut).
 *
 * La clé de persistance du store (`zailon-v1`) est centralisée ici pour que le
 * bootstrap lise exactement la même source que le store.
 */

import { parseHexColor, relativeLuminance } from './designSystem.ts'

/** Clé localStorage du store persisté (zustand persist, `useStore`). */
export const ZAILON_PERSIST_KEY = 'zailon-v1'

/** Surface minimale requise : un élément DOM ou un mock testable. */
export type TokenRoot = { style: { setProperty: (name: string, value: string) => void } }

const mix = (value: number, target: number, amount: number) => Math.round(value + (target - value) * amount)
const rgb = (r: number, g: number, b: number) => `rgb(${r} ${g} ${b})`

/** Injecte les tokens d'accent dérivés d'une couleur hexadécimale. */
export function applyAccentTokens(root: TokenRoot, accentColor: string): boolean {
  const parsed = parseHexColor(accentColor)
  if (!parsed) return false
  const { r, g, b } = parsed
  const text = relativeLuminance(parsed) > 0.56 ? '#090b0b' : '#ffffff'
  root.style.setProperty('--zailon-accent', accentColor)
  root.style.setProperty('--zailon-accent-hover', rgb(mix(r, 255, 0.18), mix(g, 255, 0.18), mix(b, 255, 0.18)))
  root.style.setProperty('--zailon-accent-active', rgb(mix(r, 0, 0.16), mix(g, 0, 0.16), mix(b, 0, 0.16)))
  root.style.setProperty('--zailon-accent-muted', `rgb(${r} ${g} ${b} / 0.14)`)
  root.style.setProperty('--zailon-accent-border', `rgb(${r} ${g} ${b} / 0.35)`)
  root.style.setProperty('--zailon-accent-text', text)
  root.style.setProperty('--zailon-accent-contrast', text)
  root.style.setProperty('--zailon-focus-ring', `rgb(${r} ${g} ${b} / 0.78)`)
  return true
}

/** Palette danger (spec §14, §70-71) : indépendante de l'accent, toujours
 * distincte — jamais remplacée par une couleur d'accent rouge. */
export const ZAILON_DANGER = '#f87171'
export const ZAILON_DANGER_HOVER = '#ef4444'
export const ZAILON_DANGER_MUTED = 'rgb(248 113 113 / 0.12)'

export function applyDangerTokens(root: TokenRoot): void {
  root.style.setProperty('--zailon-danger', ZAILON_DANGER)
  root.style.setProperty('--zailon-danger-hover', ZAILON_DANGER_HOVER)
  root.style.setProperty('--zailon-danger-muted', ZAILON_DANGER_MUTED)
}

/** Spec §7 : lire les réglages persistés et appliquer les tokens AVANT le
 * premier rendu — aucune étape « blanc par défaut puis couleur » visible. */
export function bootstrapTheme(root: TokenRoot, storage?: Pick<Storage, 'getItem'>): void {
  applyDangerTokens(root)
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(ZAILON_PERSIST_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { state?: { accentColor?: unknown } }
    const accent = parsed?.state?.accentColor
    if (typeof accent === 'string') applyAccentTokens(root, accent)
  } catch {
    // stockage indisponible ou JSON invalide → tokens par défaut (index.css).
  }
}
