import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, Download, ExternalLink, Info, MonitorX, X } from 'lucide-react'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { AppWindow } from './components/Layout/AppWindow'
import { CommandPalette } from './components/CommandPalette'
import { GuidedTour } from './components/GuidedTour'
import { UpdateProvider } from './components/UpdateProvider'
import { resolveProfileMods, useStore } from './store/useStore'
import { native, type BackgroundTaskSnapshot, type GameProcessDetectedEvent, type GameProcessEvent, type LearnedProcessSignature, type NxmRequest, type ShortcutLaunchRequest } from './lib/native'
import { adapterFor, FALLBACK_ADAPTER } from './lib/launchAdapters'
import { AUTO_ATTACH_THRESHOLD, presenceRequestFor, shouldScanExternalGame, STEAM_BACKED_ATTACH_THRESHOLD, windowRequestFor } from './lib/gamePresence'
import { pickPrioritySession } from './lib/sessionPriority'
import { effectiveInputProfile, effectiveLayout, LAYOUT_LABELS } from './lib/keyboardPresets'
import { isRed4extActive } from './lib/frameworkValidator'
import { register, unregister, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVisualShortcutConfig, VISUAL_SHORTCUTS_CHANGED } from './visual-profiles/application/shortcuts'

export default function App() {
  const tick = useStore(s => s.tick)
  const notice = useStore(s => s.notice)
  const clearNotice = useStore(s => s.clearNotice)
  const recordNotice = useStore(s => s.recordNotice)
  const notificationHistory = useStore(s => s.notificationHistory)
  const sessionToast = useStore(s => s.sessionToast)
  const setSessionToast = useStore(s => s.setSessionToast)
  const dismissNotification = useStore(s => s.dismissNotification)
  const clearCompletedNotifications = useStore(s => s.clearCompletedNotifications)
  const clearNotificationHistory = useStore(s => s.clearNotificationHistory)
  const games = useStore(s => s.games)
  const isLaunching = useStore(s => s.isLaunching)
  const isPlaying = useStore(s => s.isPlaying)
  const setSelectedGame = useStore(s => s.setSelectedGame)
  const setSelectedProfile = useStore(s => s.setSelectedProfile)
  const textSize = useStore(s => s.textSize)
  const uiDensity = useStore(s => s.uiDensity)
  const accentColor = useStore(s => s.accentColor)
  const quickPanelEnabled = useStore(s => s.quickPanelEnabled)
  const quickPanelShortcut = useStore(s => s.quickPanelShortcut)
  const gameSessions = useStore(s => s.gameSessions)
  const reduceActivityDuringGame = useStore(s => s.reduceActivityDuringGame)
  const performanceModes = useStore(s => s.performanceModes)
  const performanceCustom = useStore(s => s.performanceCustom)
  const globalPerformanceMode = useStore(s => s.globalPerformanceMode)
  const batteryPerformanceBehavior = useStore(s => s.batteryPerformanceBehavior)
  const reconcileRuntimeActivity = useStore(s => s.reconcileRuntimeActivity)
  const refreshStagedCatalogs = useStore(s => s.refreshStagedCatalogs)
  const flushPendingSettings = useStore(s => s.flushPendingSettings)
  const tourCompleted = useStore(s => s.tourCompleted)
  const tourSkipped = useStore(s => s.tourSkipped)
  const autoMinimizeOnGameStart = useStore(s => s.autoMinimizeOnGameStart)
  const restoreAfterGame = useStore(s => s.restoreAfterGame)
  const [externalInstalls, setExternalInstalls] = useState<NxmRequest[]>([])
  const [exclusiveNoticeOpen, setExclusiveNoticeOpen] = useState(false)

  // Game Mode (spec §11-13, §36) : à chaque changement de session ou de profil
  // Performance, les politiques effectives (téléchargements/scans) sont
  // recalculées — dérivées des sessions vivantes, elles reviennent à « normal »
  // automatiquement quand le jeu ferme (aucune restauration nécessaire).
  useEffect(() => {
    reconcileRuntimeActivity()
  }, [gameSessions, performanceModes, performanceCustom, globalPerformanceMode, batteryPerformanceBehavior, reconcileRuntimeActivity])

  // Fiabilité des profils (spec §9-10) : au démarrage, le catalogue installé
  // de chaque jeu est réconcilié avec le store staged — un cache UI vide
  // persisté ne fait plus afficher « 0 mods » à un profil qui référence des
  // paquets (toast « Profil restauré automatiquement » si réparation).
  useEffect(() => {
    void refreshStagedCatalogs()
  }, [refreshStagedCatalogs])

  // Persistance UI (spec §17) : les réglages debouncés (accent, sliders) sont
  // écrits immédiatement à la fermeture — aucune valeur récente n'est perdue.
  useEffect(() => {
    const flush = () => flushPendingSettings()
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flushPendingSettings])

  // Tutoriel première visite (spec §18, §54) : affiché au premier lancement
  // (jamais vu, jamais passé), après un court délai pour laisser l'interface
  // se charger — « Passer » est respecté et persisté, « Revoir la visite
  // guidée » (Paramètres) le relance.
  const [showTour, setShowTour] = useState(false)
  useEffect(() => {
    if (tourCompleted || tourSkipped) return
    const timer = window.setTimeout(() => setShowTour(true), 1200)
    return () => window.clearTimeout(timer)
  }, [tourCompleted, tourSkipped])

  // GamePresenceEngine : un seul watcher léger suit (a) les sessions en attente
  // de leur processus final, (b) les jeux configurés lancés hors ZAILON, et
  // (c) la preuve Steam (registre RunningAppID) — Steam n'est jamais la seule
  // source, mais il déclenche la recherche du processus final au lieu de
  // terminer la session.
  const steamAppIdsRef = useRef<number[]>([])
  // Pendant une PossibleExit (jeu disparu, vérification de fermeture), le scan
  // repasse à 3 s pour terminer la session vite (spec RuntimeSessionV3 §3).
  const exitCheckRef = useRef(false)
  useEffect(() => {
    let scanning = false
    let lastScan = 0
    let lastSteamCheck = 0
    let recovering = false
    const id = setInterval(() => {
      const state = useStore.getState()
      tick()
      if (!native.isDesktop()) return
      const now = Date.now()
      // Mode jeu (spec #50-51, Performance §8) : quand un jeu tourne, le
      // watcher ralentit (6 s au lieu de 3 s) — la présence reste suivie sans
      // activité lourde. La politique effective des profils Performance (scans
      // en pause/réduits) pilote aussi cette cadence.
      const gameModeActive = (state.reduceActivityDuringGame || state.runtimeActivity.scans !== 'normal' || state.runtimeActivity.downloads === 'paused')
        && state.gameSessions.some(session => session.state === 'GameRunning')
      const installed = state.games.filter(game => game.installDirectory)
      const appIds = [...new Set(installed.map(game => adapterFor(game).steamAppId).filter((id): id is number => id !== undefined))]
      // Preuve Steam (registre RunningAppID) : le jeu est-il « En cours » ?
      const steamRunningForGame = (gameId: string) => {
        const game = useStore.getState().games.find(item => item.id === gameId)
        const appId = game ? adapterFor(game).steamAppId : undefined
        return appId !== undefined && steamAppIdsRef.current.includes(appId)
      }
      const attach = (results: Array<{ gameId: string; score: number; processName?: string; evidence: string[] }>) => {
        const storeNow = useStore.getState()
        for (const result of results) {
          // Sessions déjà En cours : leur preuve alimente la fin de session
          // (sessionPresenceReport), jamais un ré-attachement — sinon le toast
          // et la timeline seraient répétés à chaque scan.
          if (storeNow.gameSessions.some(session => session.gameId === result.gameId && session.state === 'GameRunning')) continue
          // Spec UAC §5-6, §10 : quand Steam confirme que l'AppID tourne, le
          // seuil baisse (60) — un processus élevé qui refuse son chemin reste
          // rattachable via nom + contexte + Steam (65 ≥ 60). Sinon : 80.
          const threshold = steamRunningForGame(result.gameId) ? STEAM_BACKED_ATTACH_THRESHOLD : AUTO_ATTACH_THRESHOLD
          if (result.score < threshold) continue
          const waiting = storeNow.gameSessions.some(session => session.gameId === result.gameId && (session.state === 'WaitingForGame' || session.state === 'WaitingForElevation' || session.state === 'GameLost'))
          if (waiting) {
            storeNow.sessionGameDetected(result.gameId, result.processName ?? '', result.score, result.evidence)
          } else {
            storeNow.attachDetectedGame(result.gameId, result.processName ?? '', result.score, result.evidence)
          }
        }
      }
      // Apprentissage des signatures (spec NTE §7 / #36) : un processus final
      // confirmé (score ≥ 80) devient la référence de détection — au prochain
      // lancement, même exe renommé par une mise à jour du jeu.
      const learnFromPresence = (results: Array<{ gameId: string; score: number; processName?: string; processPath?: string }>) => {
        for (const result of results) {
          if (result.score < AUTO_ATTACH_THRESHOLD || !result.processName) continue
          const game = useStore.getState().games.find(item => item.id === result.gameId)
          const root = game?.installDirectory
          const relative = root && result.processPath?.toLowerCase().startsWith(root.toLowerCase())
            ? result.processPath.slice(root.length).replace(/^[\\/]+/, '').replace(/\\/g, '/')
            : undefined
          useStore.getState().learnGameProcessSignature(result.gameId, result.processName, relative || undefined)
        }
      }
      // Spec UAC §5, §16 : récupération de présence IMMÉDIATE. ZAILON n'attend
      // jamais de confirmation UAC explicite — dès que Steam passe « En cours »,
      // les sessions en attente sont rescannées tout de suite (processus +
      // fenêtre), sans attendre le tick suivant.
      const recoverWaitingSessions = (runningAppIds: number[]) => {
        if (recovering) return
        recovering = true
        void (async () => {
          try {
            const storeNow = useStore.getState()
            const targets = storeNow.gameSessions
              .filter(session => session.state === 'WaitingForGame' || session.state === 'WaitingForElevation' || session.state === 'GameLost')
              .map(session => ({ session, game: storeNow.games.find(item => item.id === session.gameId) }))
              .filter((entry): entry is { session: (typeof entry.session) & {}; game: NonNullable<typeof entry.game> } => {
                if (!entry.game) return false
                const appId = adapterFor(entry.game).steamAppId
                return appId !== undefined && runningAppIds.includes(appId)
              })
            if (!targets.length) return
            const [presence, windows] = await Promise.all([
              native.scanGamePresence(targets.map(({ game }) => presenceRequestFor(game, true, learnedSignaturesFor(game.id), true))),
              native.scanGameWindows(targets.map(({ game }) => windowRequestFor(game, true))),
            ])
            attach(presence.map(result => ({ gameId: result.gameId, score: result.score, processName: result.processName, evidence: ['processus', 'installation'] })))
            attach(windows.map(result => ({ gameId: result.gameId, score: result.score, evidence: ['fenêtre', 'processus'] })))
            learnFromPresence(presence)
          } catch { /* la récupération échoue silencieusement — le tick périodique reprendra */ }
          finally { recovering = false }
        })()
      }
      if (appIds.length > 0 && now - lastSteamCheck >= 3000) {
        lastSteamCheck = now
        void native.steamRunningState(appIds)
          .then(result => {
            steamAppIdsRef.current = result.running_app_ids ?? []
            recoverWaitingSessions(steamAppIdsRef.current)
          })
          .catch(() => undefined)
      }
      state.sessionWatchdog(steamAppIdsRef.current)
      if (scanning || now - lastScan < (gameModeActive && !exitCheckRef.current ? 6000 : 3000)) return
      const waiters = state.gameSessions.filter(session => session.state === 'WaitingForGame' || session.state === 'GameLost' || session.state === 'WaitingForElevation')
      const activeIds = state.gameSessions.filter(session => session.state !== 'Ended' && session.state !== 'Failed').map(session => session.gameId)
      const external = installed.filter(game => shouldScanExternalGame(game, steamAppIdsRef.current, state.autoAttachGames ?? [], activeIds))
      // Sessions en cours : leur fenêtre est scannée pour la PRIORITÉ par
      // premier plan (Alt+Tab réel) — jamais passées par `attach` (déjà Running).
      const runningSessions = state.gameSessions.filter(session => session.state === 'GameRunning')
      const attachTargets = [
        ...waiters.flatMap(session => {
          const game = state.games.find(item => item.id === session.gameId)
          return game ? [{ game, reattachContext: true }] : []
        }),
        ...external.map(game => ({ game, reattachContext: false })),
      ]
      const foregroundTargets = runningSessions.flatMap(session => {
        const game = state.games.find(item => item.id === session.gameId)
        return game ? [{ game, reattachContext: false }] : []
      })
      const runningTargets = runningSessions.flatMap(session => {
        const game = state.games.find(item => item.id === session.gameId)
        return game ? [{ game, reattachContext: false }] : []
      })
      if (!attachTargets.length && !foregroundTargets.length && !runningTargets.length) return
      scanning = true
      lastScan = now
      const targets = [...attachTargets, ...foregroundTargets]
      // Preuves du PROCESSUS FINAL par session en cours — alimentent la fin de
      // session (PossibleExit) : un launcher encore ouvert ne compte jamais
      // (isLauncherProcess, spec RuntimeSessionV3 §2).
      const runningPresence = new Map<string, { score: number; evidence: string[] }>()
      const windowPresence = new Map<string, { score: number; evidence: string[] }>()
      // Deux preuves complémentaires scannées en parallèle : processus (chemin +
      // exécutable, +20 si Steam Running) et fenêtre principale (visible /
      // premier plan) — la fenêtre survit aux launchers, UAC et relances internes.
      void Promise.all([
        native.scanGamePresence(attachTargets.map(({ game, reattachContext }) => presenceRequestFor(game, reattachContext, learnedSignaturesFor(game.id), steamRunningForGame(game.id))))
          .then(results => {
            attach(results.map(result => ({ gameId: result.gameId, score: result.score, processName: result.processName, evidence: ['processus', 'installation'] })))
            learnFromPresence(results)
          }),
        native.scanGamePresence(runningTargets.map(({ game, reattachContext }) => presenceRequestFor(game, reattachContext, learnedSignaturesFor(game.id), steamRunningForGame(game.id))))
          .then(results => {
            for (const result of results) {
              if (result.isLauncherProcess) continue
              const threshold = steamRunningForGame(result.gameId) ? STEAM_BACKED_ATTACH_THRESHOLD : AUTO_ATTACH_THRESHOLD
              if (result.score >= threshold) {
                const current = runningPresence.get(result.gameId)
                if (!current || result.score > current.score) runningPresence.set(result.gameId, { score: result.score, evidence: ['processus', 'installation'] })
              }
            }
          }),
        native.scanGameWindows(targets.map(({ game, reattachContext }) => windowRequestFor(game, reattachContext)))
          .then(results => {
            attach(results.map(result => ({ gameId: result.gameId, score: result.score, evidence: ['fenêtre', 'processus'] })))
            // Priorité par premier plan : si la fenêtre d'une session EN COURS
            // est au premier plan, cette session devient prioritaire (Alt+Tab).
            const foreground = results.find(result => {
              const session = useStore.getState().gameSessions.find(item => item.gameId === result.gameId && item.state === 'GameRunning')
              return result.foreground && Boolean(session)
            })
            if (foreground) useStore.getState().setForegroundGame(foreground.gameId)
            for (const result of results) {
              if (result.score < AUTO_ATTACH_THRESHOLD) continue
              const current = windowPresence.get(result.gameId)
              if (!current || result.score > current.score) windowPresence.set(result.gameId, { score: result.score, evidence: ['fenêtre', 'processus'] })
            }
          }),
      ])
        .catch(() => undefined)
        .finally(() => {
          // Fin de session (spec RuntimeSessionV3 §1-5) : la présence du jeu
          // final combine processus (hors launcher) + fenêtre + Steam. Sans
          // preuve, la période PossibleExit s'ouvre, puis la session se termine
          // réellement (déploiement restauré, timer arrêté, remapping rétabli).
          let anyPossibleExit = false
          for (const session of runningSessions) {
            const sessionNow = useStore.getState().gameSessions.find(item => item.id === session.id)
            if (!sessionNow || sessionNow.state !== 'GameRunning') continue
            const hit = runningPresence.get(session.gameId)
            const windowHit = windowPresence.get(session.gameId)
            const present = Boolean(hit) || Boolean(windowHit) || steamRunningForGame(session.gameId)
            useStore.getState().sessionPresenceReport(session.gameId, present, hit?.evidence ?? windowHit?.evidence)
            if (!present) anyPossibleExit = true
          }
          exitCheckRef.current = anyPossibleExit
          scanning = false
        })
    }, 1000)
    return () => clearInterval(id)
  }, [tick])

  useEffect(() => {
    if (!notice) return
    recordNotice(notice)
    clearNotice()
  }, [clearNotice, notice, recordNotice])

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize
    document.documentElement.dataset.density = uiDensity
  }, [textSize, uiDensity])

  useEffect(() => {
    const hex = accentColor.replace('#', '')
    const [red, green, blue] = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    const mix = (value: number, target: number, amount: number) => Math.round(value + (target - value) * amount)
    const rgb = (r: number, g: number, b: number) => `rgb(${r} ${g} ${b})`
    const root = document.documentElement
    root.style.setProperty('--zailon-accent', accentColor)
    root.style.setProperty('--zailon-accent-hover', rgb(mix(red, 255, .18), mix(green, 255, .18), mix(blue, 255, .18)))
    root.style.setProperty('--zailon-accent-active', rgb(mix(red, 0, .16), mix(green, 0, .16), mix(blue, 0, .16)))
    root.style.setProperty('--zailon-accent-muted', `rgb(${red} ${green} ${blue} / .14)`)
    root.style.setProperty('--zailon-accent-text', luminance > .56 ? '#090b0b' : '#ffffff')
    root.style.setProperty('--zailon-focus-ring', `rgb(${red} ${green} ${blue} / .78)`)
  }, [accentColor])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void native.pendingExternalInstalls().then(setExternalInstalls).catch(() => undefined)
    void listen<NxmRequest>('nxm-opened', event => setExternalInstalls(current => current.some(item => item.requestId === event.payload.requestId) ? current : [...current, event.payload])).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  // Quick Game Panel : raccourci global (Ctrl+Alt+Z par défaut) qui ouvre la
  // fenêtre native du panneau — il doit rester actif PENDANT le jeu.
  useEffect(() => {
    if (!native.isDesktop() || !quickPanelEnabled) return
    const shortcut = quickPanelShortcut.trim()
    if (!shortcut) return
    let disposed = false
    void register(shortcut, event => {
      if (event.state !== 'Pressed') return
      // Spec #41 : en plein écran exclusif, une fenêtre externe ne peut pas
      // s'afficher au-dessus du jeu — on montre le message « Utiliser
      // Borderless » au lieu d'ouvrir le panneau (aucune injection).
      void native.exclusiveFullscreenActive()
        .then(exclusive => {
          if (disposed) return
          if (exclusive) {
            setExclusiveNoticeOpen(true)
            return
          }
          void native.quickPanel.toggle().catch(() => undefined)
        })
        .catch(() => void native.quickPanel.toggle().catch(() => undefined))
    }).catch(() => undefined)
    return () => {
      disposed = true
      void unregister(shortcut).catch(() => undefined)
    }
    // Re-enregistré après chaque transition de jeu (l'effet des raccourcis
    // visuels repasse par unregisterAll à ces moments-là).
  }, [quickPanelEnabled, quickPanelShortcut, isLaunching, isPlaying])

  // Actions émises par le panneau rapide (fenêtre séparée) vers la fenêtre
  // principale : bascule du clavier, retour à ZAILON.
  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void listen<{ action: 'toggle-keyboard' | 'focus-main' }>('quick-panel-action', event => {
      const store = useStore.getState()
      if (event.payload.action === 'toggle-keyboard') {
        // Spec multi-sessions : le panneau rapide cible la session PRIORITAIRE.
        const priorityGameId = pickPrioritySession(store.gameSessions, store.pinnedPriorityGameId)
        const session = store.gameSessions.find(item => item.gameId === priorityGameId && item.state === 'GameRunning')
        if (session) store.setSessionInputActive(session.gameId, !session.inputProfileActive)
      } else if (event.payload.action === 'focus-main') {
        store.setView('home')
        const window = getCurrentWindow()
        void window.unminimize().catch(() => undefined)
        void window.setFocus().catch(() => undefined)
      }
    }).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  // Quick Panel adaptatif (spec « Quick Overlay » §24-25) : quand la fenêtre du
  // panneau s'ouvre, elle demande l'état de la session prioritaire — ZAILON
  // répond avec le résumé compact (jeu, profil, mods, clavier, bypass, RED4ext).
  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void listen('quick-panel-ready', () => {
      const store = useStore.getState()
      const priorityGameId = pickPrioritySession(store.gameSessions, store.pinnedPriorityGameId)
      const session = store.gameSessions.find(item => item.gameId === priorityGameId && item.state === 'GameRunning')
      if (!session) return
      const game = store.games.find(item => item.id === session.gameId)
      if (!game) return
      const profile = game.profiles.find(item => item.id === session.profileId)
      const profileMods = profile ? resolveProfileMods(game, profile) : []
      const activeMods = profileMods.filter(mod => mod.enabled).length
      void emit('quick-panel-state', {
        gameName: game.name,
        profileName: profile?.name ?? 'Défaut',
        activeMods,
        layoutLabel: effectiveInputProfile(game, profile?.id) ? LAYOUT_LABELS[effectiveLayout(game, profile?.id)] : undefined,
        bypassActive: Boolean(game.bypassPath),
        red4extActive: isRed4extActive(profileMods),
        // Spec RuntimeSessionV3 §49 : le panneau affiche l'état RÉEL d'activation
        // de la session (source de confiance), pas seulement la configuration.
        connected: true,
        inputActive: session.inputProfileActive,
        visualActive: session.visualProfileActive,
        runtimeActive: session.runtimeToolsActive,
      }).catch(() => undefined)
    }).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  // Fermeture automatique du panneau quand plus aucune session n'est en cours.
  useEffect(() => {
    if (!native.isDesktop()) return
    const running = gameSessions.some(session => session.state === 'GameRunning')
    if (!running) void native.quickPanel.close().catch(() => undefined)
  }, [gameSessions])

  // Mode jeu ZAILON (spec #49-51) : quand un jeu passe en cours, on réduit
  // l'activité (attribut data-game-mode → animations décoratives suspendues,
  // watcher ralenti) et on peut minimiser ZAILON ; à la fin de session on
  // restaure la fenêtre si l'option est active.
  const runningGameCount = gameSessions.filter(session => session.state === 'GameRunning').length
  const wasRunningRef = useRef(false)
  useEffect(() => {
    const running = runningGameCount > 0
    document.documentElement.dataset.gameMode = running && reduceActivityDuringGame ? 'true' : ''
    if (running === wasRunningRef.current) return
    wasRunningRef.current = running
    if (!native.isDesktop()) return
    const mainWindow = getCurrentWindow()
    if (running && autoMinimizeOnGameStart) {
      void mainWindow.minimize().catch(() => undefined)
    } else if (!running && restoreAfterGame) {
      void mainWindow.unminimize().catch(() => undefined)
    }
  }, [runningGameCount, reduceActivityDuringGame, autoMinimizeOnGameStart, restoreAfterGame])

  useEffect(() => {
    if (!native.isDesktop()) return
    let disposed = false
    const configure = async () => {
      await unregisterAll().catch(() => undefined)
      const config = getVisualShortcutConfig()
      if (!config.enabled || disposed || isLaunching || isPlaying) return
      const actions = {
        [config.restore.toLocaleLowerCase()]: 'restore',
        [config.toggle.toLocaleLowerCase()]: 'toggle',
        [config.previous.toLocaleLowerCase()]: 'previous',
        [config.next.toLocaleLowerCase()]: 'next',
      } as const
      const shortcuts = [...new Set([config.restore, config.toggle, config.previous, config.next].filter(Boolean))]
      if (!shortcuts.length) return
      await register(shortcuts, event => {
        if (event.state !== 'Pressed') return
        const action = actions[event.shortcut.toLocaleLowerCase() as keyof typeof actions]
        if (action) void native.visualProfiles.shortcutAction(action).catch(() => undefined)
      })
      if (disposed) await unregisterAll().catch(() => undefined)
    }
    const changed = () => { void configure().catch(() => undefined) }
    window.addEventListener(VISUAL_SHORTCUTS_CHANGED, changed)
    void configure().catch(() => undefined)
    return () => {
      disposed = true
      window.removeEventListener(VISUAL_SHORTCUTS_CHANGED, changed)
      void unregisterAll().catch(() => undefined)
    }
  }, [isLaunching, isPlaying])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void native.backgroundTasks().then(tasks => {
      useStore.getState().replaceBackgroundTasks(tasks)
      useStore.getState().cleanupBackgroundTasks()
    }).catch(() => undefined)
    void listen<BackgroundTaskSnapshot>('background-task-changed', event => useStore.getState().upsertBackgroundTask(event.payload)).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void listen<GameProcessEvent>('game-process-stopped', event => useStore.getState().onGameProcessStopped({ gameId: event.payload.gameId, profileId: event.payload.profileId, cleanupError: event.payload.cleanupError, processName: event.payload.gameName })).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    // Émis par la Phase 6 native (GamePresenceScanner / DetachedProcessReattacher).
    void listen<GameProcessDetectedEvent>('game-process-detected', event => useStore.getState().sessionGameDetected(event.payload.gameId, event.payload.processName, event.payload.confidence)).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    const launchFromShortcut = async (request: ShortcutLaunchRequest) => {
      const state = useStore.getState()
      const game = state.games.find(item => item.id === request.gameId)
      const profile = game?.profiles.find(item => item.id === request.profileId)
      if (game && profile) {
        state.setSelectedGame(game.id)
        await useStore.getState().setSelectedProfile(profile.id)
        await useStore.getState().launchSelectedGame()
      }
      await native.consumeShortcutLaunch(request.rawUrl).catch(() => undefined)
    }
    void native.pendingShortcutLaunches().then(requests => requests.forEach(request => void launchFromShortcut(request))).catch(() => undefined)
    void listen<ShortcutLaunchRequest>('zailon-launch', event => void launchFromShortcut(event.payload)).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  const resolveExternalInstall = async (request: NxmRequest, gameId: string, profileId: string) => {
    setSelectedGame(gameId)
    await setSelectedProfile(profileId)
    const sourceUrl = `https://www.nexusmods.com/${request.gameDomain}/mods/${request.modId}?tab=files&file_id=${request.fileId}`
    await native.openExternalUrl(sourceUrl)
    await native.consumeExternalInstall(request.requestId)
    setExternalInstalls(current => current.filter(item => item.requestId !== request.requestId))
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(219,232,229,0.025) 0%, transparent 70%)',
      }}>
      <UpdateProvider>
        <AppWindow />
        {showTour && <GuidedTour />}
      </UpdateProvider>
      <CommandPalette />
      <SessionToast toast={sessionToast} onDismiss={() => setSessionToast(undefined)} />
      <NotificationCenter history={notificationHistory} onDismiss={dismissNotification} onClear={clearCompletedNotifications} onClearAll={clearNotificationHistory} />
      {externalInstalls[0] && <ExternalInstallDialog request={externalInstalls[0]} games={games} onCancel={() => void native.consumeExternalInstall(externalInstalls[0].requestId).finally(() => setExternalInstalls(current => current.slice(1)))} onContinue={(gameId, profileId) => void resolveExternalInstall(externalInstalls[0], gameId, profileId)} />}
      {exclusiveNoticeOpen && <QuickPanelExclusiveNotice onClose={() => setExclusiveNoticeOpen(false)} />}
    </div>
  )
}

/** Signatures apprises d'un jeu pour la requête de présence (spec NTE §7 / #36).
 * Lecture directe du store persisté — au prochain lancement, la détection est
 * instantanée même si l'exécutable final a changé (mise à jour du jeu). */
function learnedSignaturesFor(gameId: string): LearnedProcessSignature[] | undefined {
  const signature = useStore.getState().gameProcessSignatures?.[gameId]
  if (!signature) return undefined
  return [{ filename: signature.filename, relativePath: signature.relativePath, publisher: signature.publisher }]
}

// Spec « Correctif NTE » §21-24 — notification « jeu en cours » : affichée en
// haut à droite (2,5 s) uniquement quand le PROCESSUS FINAL est détecté, jamais
// au lancement d'un launcher intermédiaire. Trois états : lancé par ZAILON,
// détecté hors ZAILON, session récupérée après redémarrage.
const SESSION_TOAST_TITLES = {
  started: 'En cours via ZAILON',
  detected: 'Jeu détecté par ZAILON',
  recovered: 'Session récupérée',
  ended: 'Session terminée',
} as const

function SessionToast({ toast, onDismiss }: { toast: ReturnType<typeof useStore.getState>['sessionToast']; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(onDismiss, 2500)
    return () => window.clearTimeout(timeout)
  }, [toast, onDismiss])
  if (!toast) return null
  const ended = toast.kind === 'ended'
  return <div className={`fixed right-4 top-4 z-[240] flex w-[min(340px,calc(100vw-2rem))] items-start gap-3 rounded-xl border bg-[#0e1212]/95 p-3 shadow-2xl backdrop-blur-xl ${ended ? 'border-white/[0.09]' : 'border-emerald-300/25'}`}>
    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ended ? 'bg-white/[0.06] text-white/55' : 'bg-emerald-300/15 text-emerald-200'}`}>{ended ? <Info size={14} /> : <CheckCircle2 size={14} />}</span>
    <div className="min-w-0 flex-1">
      <p className={`font-mono text-[10px] uppercase tracking-widest ${ended ? 'text-white/45' : 'text-emerald-200/85'}`}>{SESSION_TOAST_TITLES[toast.kind]}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-white/85">{toast.gameName}</p>
      {toast.detail && <p className="mt-0.5 text-[11px] text-white/40">{toast.detail}</p>}
    </div>
    <button type="button" onClick={onDismiss} aria-label="Fermer" className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={13} /></button>
  </div>
}

// Spec #41 — plein écran exclusif : le panneau rapide (fenêtre externe) ne
// peut pas s'afficher au-dessus du jeu. Message honnête + actions, aucune
// injection pour contourner la limite.
function QuickPanelExclusiveNotice({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="exclusive-notice-title" className="w-full max-w-sm rounded-2xl border border-white/[0.11] bg-[#111414] p-5 shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><MonitorX size={18} /></span><div className="min-w-0 flex-1"><h2 id="exclusive-notice-title" className="font-display text-base font-bold text-white">Plein écran exclusif détecté</h2><p className="mt-1 text-xs leading-relaxed text-white/45">Le panneau rapide n'est pas disponible en plein écran exclusif : une fenêtre ZAILON ne peut pas s'afficher au-dessus du jeu dans ce mode. Aucune injection n'est utilisée pour contourner cette limite.</p></div><button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/36 hover:bg-white/[0.06]"><X size={15} /></button></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.05]">Utiliser Borderless</button><button type="button" onClick={onClose} className="rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400">Fermer</button></div></section></div>
}

function NotificationCenter({ history, onDismiss, onClear, onClearAll }: {
  history: ReturnType<typeof useStore.getState>['notificationHistory']
  onDismiss: (id: string) => void
  onClear: () => void
  onClearAll: () => void
}) {
  const [paused, setPaused] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const active = [...history].reverse().find(item => !item.dismissed)
  useEffect(() => {
    if (!active?.durationMs || paused || showHistory) return
    const timeout = window.setTimeout(() => onDismiss(active.id), active.durationMs)
    return () => window.clearTimeout(timeout)
  }, [active?.durationMs, active?.id, onDismiss, paused, showHistory])
  const Icon = active?.kind === 'success' ? CheckCircle2 : active?.kind === 'error' || active?.kind === 'warning' ? AlertTriangle : Info
  const tone = active?.kind === 'error' ? 'border-red-300/25 text-red-100' : active?.kind === 'warning' || active?.kind === 'action' ? 'border-amber-200/25 text-amber-50' : active?.kind === 'success' ? 'border-emerald-200/20 text-emerald-50' : 'border-gold/25 text-white'
  return <div className="fixed bottom-4 right-4 z-[220] flex max-w-[min(420px,calc(100vw-2rem))] flex-col items-end gap-2">
    {showHistory && <section className="max-h-[55vh] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#101313]/95 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2"><div><p className="text-xs font-semibold text-white/78">Historique des notifications</p><p className="text-[11px] text-white/35">{history.length} événement(s), doublons regroupés</p></div><div className="flex gap-1"><button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] text-white/42 hover:bg-white/[0.05]">Masquer les terminées</button><button type="button" onClick={() => { if (window.confirm('Effacer tout l’historique de notifications ? Aucun mod, profil ou point de restauration n’est supprimé.')) onClearAll() }} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-200/60 hover:bg-red-400/10">Tout supprimer</button></div></header>
      <div className="max-h-[45vh] space-y-1 overflow-y-auto p-2">{[...history].reverse().map(item => <button key={item.id} type="button" onClick={() => onDismiss(item.id)} className="flex w-full items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.018] p-2 text-left hover:bg-white/[0.04]"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.kind === 'error' ? 'bg-red-400' : item.kind === 'warning' ? 'bg-amber-300' : item.kind === 'success' ? 'bg-emerald-300' : 'bg-gold'}`} /><span className="min-w-0"><span className="block text-xs leading-relaxed text-white/64">{item.message}</span><span className="mt-1 block text-[11px] text-white/28">{new Date(item.createdAt).toLocaleTimeString()}</span></span></button>)}</div>
    </section>}
    {active && !showHistory && <article onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className={`flex w-full items-start gap-3 rounded-xl border bg-[#101313]/95 p-3 shadow-2xl backdrop-blur-xl ${tone}`}>
      <Icon size={17} className="mt-0.5 shrink-0 opacity-75" /><div className="min-w-0 flex-1"><p className="text-xs leading-relaxed">{active.message}</p><p className="mt-1 text-[11px] opacity-45">{paused ? 'Minuteur en pause' : active.durationMs ? `Fermeture automatique · ${Math.round(active.durationMs / 1000)} s` : 'Action requise'}</p></div><button type="button" onClick={() => onDismiss(active.id)} aria-label="Fermer la notification" className="rounded p-1 opacity-55 hover:bg-white/10 hover:opacity-100"><X size={14} /></button>
    </article>}
    <button type="button" onClick={() => setShowHistory(value => !value)} className="relative flex h-10 items-center gap-2 rounded-full border border-white/[0.1] bg-[#101313]/95 px-3 text-xs text-white/55 shadow-xl backdrop-blur hover:text-white"><Bell size={15} />Historique{history.some(item => !item.dismissed) && <span className="h-2 w-2 rounded-full bg-gold" />}</button>
  </div>
}

function ExternalInstallDialog({ request, games, onCancel, onContinue }: { request: NxmRequest; games: ReturnType<typeof useStore.getState>['games']; onCancel: () => void; onContinue: (gameId: string, profileId: string) => void }) {
  const [gameId, setGameId] = useState(games[0]?.id || '')
  const game = games.find(item => item.id === gameId)
  const [profileId, setProfileId] = useState(game?.profiles[0]?.id || '')
  const selectGame = (nextGameId: string) => { setGameId(nextGameId); setProfileId(games.find(item => item.id === nextGameId)?.profiles[0]?.id || '') }
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"><section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-4 shadow-2xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold"><Download size={17} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/80">Lien Nexus reçu</h2><p className="mt-1 text-[11px] leading-relaxed text-white/40">{request.gameDomain} · mod {request.modId} · fichier {request.fileId}</p></div><button onClick={onCancel} title="Annuler" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={14} /></button></div>{games.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[11px] text-white/45">Jeu cible<select value={gameId} onChange={event => selectGame(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#0d1010] px-2 py-2 text-[11px] text-white/70">{games.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[11px] text-white/45">Profil cible<select value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#0d1010] px-2 py-2 text-[11px] text-white/70">{game?.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label></div> : <p className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[11px] text-amber-100/60">Ajoutez d’abord le jeu cible à la bibliothèque.</p>}<p className="mt-4 text-[11px] leading-relaxed text-white/35">Sans paramètres d’application Nexus enregistrés, ZAILON ouvre la page exacte du fichier au lieu de prétendre l’avoir téléchargé.</p><div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} className="rounded-lg px-3 py-2 text-[11px] text-white/45">Annuler</button><button disabled={!gameId || !profileId} onClick={() => onContinue(gameId, profileId)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-30"><ExternalLink size={12} /> Ouvrir le fichier Nexus</button></div></section></div>
}
