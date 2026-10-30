import { BookOpen, Compass, Gamepad2, Layers, Play, Rocket } from 'lucide-react'
import type { ViewType } from '../types'

/** Version courante du tour (spec §23) : incrémenter lors d'une refonte majeure
 * pour proposer « Découvrir la nouvelle interface » — jamais relancer le tour
 * complet automatiquement. */
export const CURRENT_TOUR_VERSION = 1

export interface TourStep {
  id: string
  icon: typeof BookOpen
  title: string
  text: string
  view: ViewType
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'library',
    icon: Layers,
    title: 'Bibliothèque',
    text: 'Votre Bibliothèque regroupe vos jeux et applications. Utilisez « Détecter » pour retrouver vos jeux installés ou « Ajouter un jeu » pour ajouter un exécutable.',
    view: 'games',
  },
  {
    id: 'game',
    icon: Gamepad2,
    title: 'Jeu',
    text: 'Cliquez sur une couverture pour gérer sa configuration : mods, profils, lancement, apparence et diagnostic, réunis dans une seule page.',
    view: 'games',
  },
  {
    id: 'profiles',
    icon: Layers,
    title: 'Profils',
    text: 'Les profils isolent vos configurations de mods : ordre, versions et activations restent indépendants d’un profil à l’autre, sans dupliquer les fichiers.',
    view: 'games',
  },
  {
    id: 'explore',
    icon: Compass,
    title: 'Explorer',
    text: 'Recherchez des mods sur les plateformes connectées (Nexus, GameBanana…) puis installez-les directement dans un profil.',
    view: 'explore',
  },
  {
    id: 'play',
    icon: Play,
    title: 'Jouer',
    text: 'ZAILON prépare automatiquement votre profil avant le lancement : disposition du clavier, Visual Profile, mods actifs et session de jeu.',
    view: 'games',
  },
  {
    id: 'quick-panel',
    icon: Rocket,
    title: 'Quick Panel',
    text: 'Pendant un jeu compatible, votre raccourci (Ctrl+Alt+K par défaut) ouvre le panneau rapide : clavier, visuel, mods et performances, sans quitter le jeu.',
    view: 'games',
  },
]

export function tourSteps(): TourStep[] {
  return TOUR_STEPS
}
