/**
 * Préférences d'animation (spec « Library Polish + Parallax » §11-13, §50).
 *
 * - `motionReduced` : vrai si les animations doivent être réduites, selon le
 *   mode choisi (auto = suit le réglage système « Réduire les animations »).
 * - `parallaxActive` : vrai si le parallaxe 3D des couvertures doit tourner
 *   (toggle Apparence + animations non réduites).
 *
 * Logique pure et testable : l'accès à `matchMedia` reste à l'appelant.
 */

import type { MotionMode } from '../types'

/** Vrai si le système demande « Réduire les animations » (à appeler dans un
 * contexte navigateur : `window.matchMedia`). */
export function systemReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Résolution du mode d'animation : réduit si le mode le demande, ou en auto
 * quand le système le demande. */
export function motionReduced(mode: MotionMode, systemReduced: boolean): boolean {
  if (mode === 'reduced') return true
  if (mode === 'enabled') return false
  return systemReduced
}

/** Le parallaxe des couvertures tourne seulement si activé ET animations non
 * réduites (spec §11-12). */
export function parallaxActive(coverParallax: boolean, reduced: boolean): boolean {
  return coverParallax && !reduced
}

/** Vrai sur un périphérique tactile : jamais de parallaxe (spec §10). */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: none), (pointer: coarse)').matches === true
}

/** Inclinaison normalisée (‑1 … 1) depuis la position du pointeur dans un
 * élément (spec §4-5) : bord gauche = ‑1, bord droit = +1, centre = 0. */
export function tiltFromPointer(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  const x = ((clientX - rect.left) / rect.width) * 2 - 1
  const y = ((clientY - rect.top) / rect.height) * 2 - 1
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
}

/** Amplitude du parallaxe (spec §5) : rotation max 4°, scale max 1.012 —
 * jamais un zoom, la carte s'incline seulement. */
export const PARALLAX_MAX_DEG = 4
export const PARALLAX_MAX_SCALE = 1.012

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
