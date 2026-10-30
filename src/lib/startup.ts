/**
 * Startup ZAILON (spec Startup Partie A §1-25).
 *
 * Règles :
 * - le réseau ne conditionne jamais Time To Interactive ;
 * - aucune page/provider/service secondaire n'est initialisé au boot ;
 * - le shell (sidebar, Accueil depuis cache) est interactif avant tout le reste ;
 * - la récupération de session passe AVANT les services distants ;
 * - les tâches lourdes sont différées (maintenance = idle).
 */

export type StartupPhase =
  | 'bootstrap'   // PHASE 0 : settings, thème, accent, langue, fenêtre — sans réseau
  | 'shell'       // PHASE 1 : sidebar + Accueil depuis cache, navigation cliquable
  | 'local'       // PHASE 2 : jeux configurés, favoris, profil actif, résumés
  | 'sessions'    // PHASE 3 : recovery des sessions actives (avant tout réseau)
  | 'services'    // PHASE 4 : Steam, health cache, update checker, tray
  | 'idle'        // PHASE 5 : maintenance différée (cache, deep scans, artwork refresh)

export type StartupPriority = 'critical' | 'interactive' | 'normal' | 'background' | 'idle'

export const PHASE_ORDER: readonly StartupPhase[] = ['bootstrap', 'shell', 'local', 'sessions', 'services', 'idle']

/** Priorité d'une phase (§11) : critical → idle. */
export function priorityForPhase(phase: StartupPhase): StartupPriority {
  switch (phase) {
    case 'bootstrap': return 'critical'
    case 'shell': return 'interactive'
    case 'local': return 'interactive'
    case 'sessions': return 'interactive'
    case 'services': return 'normal'
    case 'idle': return 'idle'
  }
}

export const PHASE_LABELS: Record<StartupPhase, string> = {
  bootstrap: 'Bootstrap minimal',
  shell: 'Shell',
  local: 'État local',
  sessions: 'Récupération de session',
  services: 'Services en arrière-plan',
  idle: 'Maintenance différée',
}

/** Délais d'exécution par phase (ms) — jamais bloquant au boot. */
export const PHASE_DELAY_MS: Record<StartupPhase, number> = {
  bootstrap: 0,
  shell: 0,
  local: 100,
  sessions: 150,
  services: 800,
  idle: 4000,
}

/**
 * StartupCoordinator : planifie une tâche dans une phase.
 * - `critical` / `interactive` : immédiat (après le rendu courant).
 * - `normal` / `background` : différé.
 * - `idle` : uniquement quand la machine est au repos (requestIdleCallback).
 */
export interface ScheduledStartupTask {
  phase: StartupPhase
  label: string
  runAt: number
  id: number
}

export class StartupCoordinator {
  private nextId = 1

  schedule(phase: StartupPhase, label: string, task: () => void): ScheduledStartupTask {
    const id = this.nextId++
    const runAt = Date.now() + PHASE_DELAY_MS[phase]
    const entry: ScheduledStartupTask = { phase, label, runAt, id }
    const delay = PHASE_DELAY_MS[phase]
    if (phase === 'idle') {
      const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback
      if (typeof idle === 'function') {
        idle(() => task(), { timeout: 10000 })
        return entry
      }
    }
    const timer = globalThis.setTimeout(() => task(), delay)
    // Le timeout est laissé en vie (délai court) ; le coordinator ne doit jamais
    // bloquer le thread UI — chaque tâche planifiée reste bornée.
    void timer
    return entry
  }
}

/** Liste de phases dans lesquelles il est interdit de lancer du réseau au boot. */
export const NETWORK_FREE_PHASES: readonly StartupPhase[] = ['bootstrap', 'shell', 'local']

export function isNetworkFreePhase(phase: StartupPhase): boolean {
  return NETWORK_FREE_PHASES.includes(phase)
}

/**
 * StartupProfiler (§24) : mesure timeToWindow / timeToShell / timeToInteractive.
 * Affiché uniquement en mode développeur.
 */
export interface StartupMetrics {
  windowAt: number
  shellAt?: number
  interactiveAt?: number
  libraryAt?: number
  backgroundReadyAt?: number
}

export function createStartupProfiler(now: number = Date.now()): {
  metrics: StartupMetrics
  mark: (stage: keyof Omit<StartupMetrics, 'windowAt'>) => void
} {
  const metrics: StartupMetrics = { windowAt: now }
  const marked = new Set<string>(['windowAt'])
  return {
    metrics,
    mark(stage) {
      if (marked.has(stage)) return
      marked.add(stage)
      metrics[stage] = Date.now()
    },
  }
}

export function startupSummary(metrics: StartupMetrics): string {
  const lines: string[] = []
  const fmt = (stage: keyof StartupMetrics, label: string) => {
    const at = metrics[stage]
    if (at === undefined) return
    lines.push(`${label}: ${at - metrics.windowAt} ms`)
  }
  fmt('shellAt', 'Shell')
  fmt('interactiveAt', 'Interactif')
  fmt('libraryAt', 'Bibliothèque')
  fmt('backgroundReadyAt', 'Services prêts')
  return lines.join(' · ') || '—'
}

/**
 * UIWatchdog (§13) : détecte les blocs de l'event loop > 250 ms.
 * En développement, chaque bloc long est enregistré avec sa durée.
 */
export interface LongUiTask {
  at: number
  durationMs: number
}

export function createUiWatchdog(thresholdMs = 250, onBlock?: (task: LongUiTask) => void): { stop: () => void } {
  let lastTick = Date.now()
  let running = true
  const timer = globalThis.setInterval(() => {
    if (!running) return
    const now = Date.now()
    const elapsed = now - lastTick
    if (elapsed > thresholdMs) {
      const task: LongUiTask = { at: now, durationMs: elapsed }
      if (onBlock) onBlock(task)
      else if (import.meta.env?.DEV) console.warn(`[zailon-startup] Long UI task detected · ${elapsed} ms`)
    }
    lastTick = now
  }, 1000)
  return {
    stop() {
      running = false
      globalThis.clearInterval(timer)
    },
  }
}

/**
 * LibraryStartupCache (§15) : résumé léger de bibliothèque affiché immédiatement
 * — jamais les listes complètes de mods.
 */
export interface LibraryStartupItem {
  gameId: string
  title: string
  coverThumb?: string
  favorite?: boolean
  running?: boolean
  playtime: number
  activeProfileName?: string
}

/** Construit le cache de démarrage depuis l'état local (synchrone, léger). */
export function buildLibraryStartupCache(games: Array<{
  id: string
  name: string
  favorite?: boolean
  backgroundArt?: string
  totalPlaytime?: number
  profiles?: Array<{ id: string; name: string }>
}>, runningGameIds: ReadonlySet<string>, selectedProfileByGame: Record<string, string>): LibraryStartupItem[] {
  return games.map(game => ({
    gameId: game.id,
    title: game.name,
    coverThumb: game.backgroundArt,
    favorite: game.favorite,
    running: runningGameIds.has(game.id),
    playtime: game.totalPlaytime || 0,
    activeProfileName: game.profiles?.find(profile => profile.id === selectedProfileByGame[game.id])?.name
      || game.profiles?.[0]?.name,
  }))
}

/** Décomposition d'une liste pour éviter les blocs UI (§14 : budget ~16-50 ms par tranche). */
export function chunkedWork<T>(items: T[], perChunk: number, process: (chunk: T[], index: number) => void, onDone?: () => void, delayMs = 8): () => void {
  let index = 0
  let cancelled = false
  const step = () => {
    if (cancelled) return
    const next = items.slice(index, index + perChunk)
    if (next.length === 0) {
      onDone?.()
      return
    }
    process(next, index)
    index += perChunk
    globalThis.setTimeout(step, delayMs)
  }
  globalThis.setTimeout(step, 0)
  return () => { cancelled = true }
}
