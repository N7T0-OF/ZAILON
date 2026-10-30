import type { VisualSettings } from './types'
import { NEUTRAL_SETTINGS } from './types'

export interface VisualPreset {
  id: string
  name: string
  description: string
  category: 'standard' | 'accessibility' | 'rust'
  settings: VisualSettings
}

const settings = (changes: Partial<VisualSettings>): VisualSettings => ({ ...NEUTRAL_SETTINGS, ...changes })

export const VISUAL_PRESETS: VisualPreset[] = [
  { id: 'neutral', name: 'Neutre', description: 'Valeurs d’origine, sans accentuation.', category: 'standard', settings: settings({}) },
  { id: 'clean', name: 'Couleurs propres', description: 'Couleurs légèrement plus présentes et contraste contenu.', category: 'standard', settings: settings({ saturation: 1.08, vibrance: 0.1, contrast: 1.04 }) },
  { id: 'night', name: 'Nuit lisible', description: 'Gamma relevé sans supprimer les noirs.', category: 'standard', settings: settings({ gamma: 1.12, contrast: 0.96, highlights: -0.08 }) },
  { id: 'desert', name: 'Désert', description: 'Température plus froide et saturation maîtrisée.', category: 'standard', settings: settings({ temperature: 6100, saturation: 0.96, contrast: 1.04 }) },
  { id: 'snow', name: 'Neige', description: 'Hautes lumières contenues et blanc neutre.', category: 'standard', settings: settings({ highlights: -0.12, contrast: 1.03 }) },
  { id: 'cinematic', name: 'Cinématique', description: 'Contraste modéré et couleurs plus sobres.', category: 'standard', settings: settings({ saturation: 0.93, contrast: 1.08 }) },
  { id: 'photo', name: 'Photo', description: 'Point de départ équilibré pour les captures.', category: 'standard', settings: settings({ vibrance: 0.05, contrast: 1.02 }) },
  { id: 'high-contrast', name: 'Accessibilité — contraste', description: 'Contraste renforcé, sans analyse de l’image.', category: 'accessibility', settings: settings({ contrast: 1.18, gamma: 1.05 }) },
  { id: 'warm', name: 'Accessibilité — lumière chaude', description: 'Température chaude et luminosité douce.', category: 'accessibility', settings: settings({ temperature: 4700, brightness: -0.04 }) },
  { id: 'grayscale', name: 'Accessibilité — niveaux de gris', description: 'Aperçu en niveaux de gris. Selon le backend, cet effet peut rester visuel uniquement.', category: 'accessibility', settings: settings({ saturation: 0 }) },
  { id: 'rust-neutral', name: 'Rust Neutre', description: 'Profil système neutre, sans avantage revendiqué.', category: 'rust', settings: settings({}) },
  { id: 'rust-natural', name: 'Rust Naturel', description: 'Transformation globale et uniforme de l’écran.', category: 'rust', settings: settings({ saturation: 1.04, vibrance: 0.06, contrast: 1.02 }) },
  { id: 'rust-winter', name: 'Rust Hiver', description: 'Hautes lumières légèrement réduites.', category: 'rust', settings: settings({ highlights: -0.08, temperature: 6400 }) },
  { id: 'rust-desert', name: 'Rust Désert', description: 'Couleurs contenues pour les scènes chaudes.', category: 'rust', settings: settings({ saturation: 0.97, temperature: 6200 }) },
  { id: 'rust-soft-night', name: 'Rust Nuit douce', description: 'Gamma modéré, sans traitement adaptatif.', category: 'rust', settings: settings({ gamma: 1.08, brightness: 0.02 }) },
  { id: 'rust-clean', name: 'Rust Couleurs propres', description: 'Saturation globale légère.', category: 'rust', settings: settings({ saturation: 1.06, vibrance: 0.06 }) },
  { id: 'rust-low-light', name: 'Rust Faible luminosité', description: 'Profil plus chaud et moins lumineux.', category: 'rust', settings: settings({ brightness: -0.08, temperature: 5200 }) },
]
