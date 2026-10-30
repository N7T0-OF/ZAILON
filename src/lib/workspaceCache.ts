import { useEffect, useRef, useState } from 'react'
import { resolveProfileMods, useStore } from '../store/useStore'
import type { Game, Profile } from '../types'

/**
 * GameWorkspaceCache (Phase 3, spec #44) : résumé léger par jeu (compteurs de
 * profils, santé) conservé en localStorage pour une ouverture instantanée de la
 * Bibliothèque et du sélecteur de profils, rafraîchi en arrière-plan.
 * La lecture ne bloque jamais : en cas d'absence ou d'expiration, l'appelant
 * retombe sur le calcul réel.
 */

export interface WorkspaceProfileCounts {
  /** Mods réellement actifs pour ce profil. */
  active: number
  /** Références de mods déclarées par le profil. */
  referenced: number
}

export interface WorkspaceHealth {
  activeMods: number
  errors: number
  warnings: number
  frameworks: string[]
  verdict: 'ok' | 'vigilance' | 'attention'
}

export interface WorkspaceSummary {
  gameId: string
  updatedAt: number
  /** Change quand la structure des profils ou le catalogue de mods change. */
  fingerprint: string
  profileCounts: Record<string, WorkspaceProfileCounts>
  health: WorkspaceHealth
}

const STORAGE_KEY = 'zailon:workspace-cache'
const TTL_MS = 60_000

export function getWorkspaceCache(): Record<string, WorkspaceSummary> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, WorkspaceSummary>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeWorkspaceCache(cache: Record<string, WorkspaceSummary>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota ou stockage indisponible : le cache reste en mémoire pour la session.
  }
}

function computeHealth(game: Game, profile: Profile): WorkspaceHealth {
  const profileMods = resolveProfileMods(game, profile)
  const activeMods = profileMods.filter(mod => mod.enabled).length
  const errors = profileMods.filter(mod => mod.deploymentStatus === 'failed').length
  const warnings = profileMods.filter(mod => mod.deploymentStatus === 'warning' || (mod.diagnostics?.length || 0) > 0).length
  const frameworks = [...new Set(game.installedMods.map(mod => mod.framework).filter((value): value is string => Boolean(value)))]
  return { activeMods, errors, warnings, frameworks, verdict: errors > 0 ? 'attention' : warnings > 0 ? 'vigilance' : 'ok' }
}

export function fingerprintFor(game: Game): string {
  return `${game.profiles.map(profile => profile.id).join(',')}|${game.installedMods.length}`
}

export function buildWorkspaceSummary(game: Game): WorkspaceSummary {
  const profileCounts: Record<string, WorkspaceProfileCounts> = {}
  for (const profile of game.profiles) {
    const mods = resolveProfileMods(game, profile)
    profileCounts[profile.id] = { active: mods.filter(mod => mod.enabled).length, referenced: Object.keys(profile.modStates).length }
  }
  const selected = game.profiles[0]
  return {
    gameId: game.id,
    updatedAt: Date.now(),
    fingerprint: fingerprintFor(game),
    profileCounts,
    health: selected ? computeHealth(game, selected) : { activeMods: 0, errors: 0, warnings: 0, frameworks: [], verdict: 'ok' },
  }
}

/**
 * Lit le cache (immédiat) puis le rafraîchit en arrière-plan dès que les jeux
 * changent ou que l'empreinte d'un jeu a évolué. Le calcul lourd reste donc
 * hors du rendu : la Bibliothèque s'ouvre instantanément.
 */
export function useWorkspaceCache(): Record<string, WorkspaceSummary> {
  const games = useStore(state => state.games)
  const cacheRef = useRef(getWorkspaceCache())
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = getWorkspaceCache()
      let changed = false
      for (const game of games) {
        const cached = current[game.id]
        const fingerprint = fingerprintFor(game)
        const stale = !cached || cached.fingerprint !== fingerprint || Date.now() - cached.updatedAt > TTL_MS
        if (stale) {
          current[game.id] = buildWorkspaceSummary(game)
          changed = true
        }
      }
      if (changed) {
        writeWorkspaceCache(current)
        cacheRef.current = current
        setVersion(value => value + 1)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [games])

  void version
  return cacheRef.current
}
