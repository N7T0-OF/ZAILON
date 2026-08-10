import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Check, ChevronDown, Gamepad2, Gauge, Keyboard, MonitorDown, Palette, Radio, RefreshCw, Settings2, Star, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { native } from '../lib/native'
import type { PerformanceMode } from '../lib/performanceProfiles'
import type { QuickPanelDiscordState, QuickPanelSessionEntry } from '../lib/quickPanelState'
import { ZailonSwitch } from './UI/ZailonSwitch'

const PERFORMANCE_LABELS: Record<PerformanceMode, string> = {
  auto: 'Automatique',
  balanced: 'Équilibré',
  performance: 'Performance',
  quality: 'Qualité',
  custom: 'Personnalisé',
}

/** Résumé de session reçu de la fenêtre principale (spec « Quick Overlay »
 * §24-25) : contenu adaptatif selon le jeu en cours (prioritaire). */
interface QuickPanelSessionState {
  gameId?: string
  gameName?: string
  profileName?: string
  activeMods?: number
  layoutLabel?: string
  bypassActive?: boolean
  red4extActive?: boolean
  /** Spec RuntimeSessionV3 §49 : état RÉEL d'activation de la session (source
   * de confiance) — jamais déduit de la configuration seule. */
  connected?: boolean
  inputActive?: boolean
  visualActive?: boolean
  runtimeActive?: boolean
  /** Spec §69 : les mods ont été préparés seulement si ZAILON a lancé le jeu
   * avec le déploiement actif — sinon « Mods ⚠ Non préparés ». */
  modsPrepared?: boolean
  /** Spec §24 : mode Performance effectif + politiques de pause réelles. */
  performanceMode?: PerformanceMode
  downloadsPaused?: boolean
  scansPaused?: boolean
  /** Spec §38 : état Discord honnête (✓ seulement si réellement publiée). */
  discord?: QuickPanelDiscordState
}

/**
 * Quick Game Panel — fenêtre native ZAILON affichée pendant le jeu (spec Phase 6,
 * §33-46). Ce n'est PAS une injection : la fenêtre est créée par
 * `quick_panel.rs` (toujours au-dessus, sans barre de titre, fermée à la perte
 * de focus). Le contenu reste extrêmement compact : visuel + clavier, rien
 * d'autre (pas de bibliothèque, Nexus, galeries ni navigation complète).
 */
export function QuickPanel() {
  const [status, setStatus] = useState<string>('')
  const [keyboardOn, setKeyboardOn] = useState(true)
  const [session, setSession] = useState<QuickPanelSessionState | null>(null)
  const [sessions, setSessions] = useState<QuickPanelSessionEntry[]>([])
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)

  // À l'ouverture : demander l'état de la session prioritaire à la fenêtre
  // principale (le panneau est une WebView séparée, sans accès au store).
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    void listen<QuickPanelSessionState>('quick-panel-state', event => {
      setSession(event.payload)
      // Synchronise l'état réel de la session (pas un état local optimiste).
      if (event.payload.inputActive !== undefined) setKeyboardOn(event.payload.inputActive)
    }).then(dispose => { unlisten = dispose })
    // Spec §14, §48 : liste des sessions actives pour le sélecteur multi-session.
    let sessionsUnlisten: UnlistenFn | undefined
    void listen<QuickPanelSessionEntry[]>('quick-panel-sessions', event => {
      setSessions(event.payload || [])
    }).then(dispose => { sessionsUnlisten = dispose })
    // Spec §24 : après un changement de Performance, la fenêtre principale
    // demande un rafraîchissement (re-émission de l'état actualisé).
    let refreshUnlisten: UnlistenFn | undefined
    void listen('quick-panel-refresh', () => {
      void emit('quick-panel-ready')
    }).then(dispose => { refreshUnlisten = dispose })
    void emit('quick-panel-ready')
    return () => {
      unlisten?.()
      sessionsUnlisten?.()
      refreshUnlisten?.()
    }
  }, [])

  const flash = (message: string) => {
    setStatus(message)
    window.setTimeout(() => setStatus(''), 1600)
  }

  const visual = async (action: 'toggle' | 'previous' | 'next' | 'restore') => {
    try {
      const result = await native.visualProfiles.shortcutAction(action)
      flash(result || 'Profil visuel appliqué')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Action visuelle indisponible')
    }
  }

  const toggleKeyboard = () => {
    const next = !keyboardOn
    setKeyboardOn(next)
    void emit('quick-panel-action', { action: 'toggle-keyboard' })
    flash(next ? 'Clavier ZAILON actif' : 'Clavier ZAILON désactivé')
  }

  const setPerformance = (mode: PerformanceMode) => {
    void emit('quick-panel-action', { action: 'set-performance', mode })
    flash(`Mode Performance : ${PERFORMANCE_LABELS[mode]}`)
  }

  // Spec §38 : bascule rapide de la Présence Discord depuis le panneau — la
  // fenêtre principale persiste le réglage et re-synchronise la présence.
  const toggleDiscord = () => {
    void emit('quick-panel-action', { action: 'set-discord' })
    flash(session?.discord?.enabled ? 'Présence Discord désactivée' : 'Présence Discord activée')
  }

  // Spec §38 : « Configurer » ouvre ZAILON > Paramètres > Intégrations > Discord.
  const openDiscordSettings = () => {
    void emit('quick-panel-action', { action: 'open-discord-settings' })
  }

  const selectSession = (gameId: string) => {
    setSessionMenuOpen(false)
    void emit('quick-panel-action', { action: 'set-target', gameId })
    void emit('quick-panel-ready')
  }

  const togglePin = (gameId: string) => {
    setSessionMenuOpen(false)
    void emit('quick-panel-action', { action: 'pin-target', gameId })
  }

  const focusMain = () => {
    void emit('quick-panel-action', { action: 'focus-main' })
  }

  const close = () => {
    void getCurrentWindow().close()
  }

  // Spec #41 : si le jeu passe en plein écran exclusif pendant que le panneau
  // est ouvert, la fenêtre externe n'est plus affichée au-dessus — on la ferme
  // proprement (sondage léger toutes les 2 s, pas de rendu à 144 FPS).
  useEffect(() => {
    let disposed = false
    const id = window.setInterval(() => {
      void native.exclusiveFullscreenActive()
        .then(exclusive => {
          if (exclusive && !disposed) close()
        })
        .catch(() => undefined)
    }, 2000)
    return () => {
      disposed = true
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0d1111]/95 text-white shadow-2xl backdrop-blur-md">
      {/* En-tête compact — sélecteur multi-session (spec §14-15, §48) */}
      <div className="relative flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {sessions.length > 1 ? (
            <button type="button" onClick={() => setSessionMenuOpen(value => !value)} className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/75 hover:bg-white/[0.06]">
              <span className="truncate">{session?.gameName ?? 'Session'}</span>
              <ChevronDown size={11} className={`shrink-0 text-white/40 transition-transform ${sessionMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">ZAILON · Panneau rapide</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {session?.gameId && (
            <button type="button" onClick={() => togglePin(session.gameId!)} title={sessions.find(entry => entry.gameId === session.gameId)?.pinned ? 'Désépingler cette session' : 'Épingler cette session (le raccourci continue de l’ouvrir)'} aria-label="Épingler la session" className={`flex h-6 w-6 items-center justify-center rounded-md ${sessions.find(entry => entry.gameId === session.gameId)?.pinned ? 'text-gold' : 'text-white/30 hover:text-white/60'}`}><Star size={12} fill={sessions.find(entry => entry.gameId === session.gameId)?.pinned ? 'currentColor' : 'none'} /></button>
          )}
          <button type="button" onClick={close} aria-label="Fermer" className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.07] hover:text-white"><X size={12} /></button>
        </div>
        {sessionMenuOpen && sessions.length > 1 && (
          <div className="absolute left-2 top-9 z-10 w-56 overflow-hidden rounded-lg border border-white/[0.1] bg-[#111515]/98 shadow-2xl backdrop-blur-md">
            {sessions.map(entry => (
              <button key={entry.gameId} type="button" onClick={() => selectSession(entry.gameId)} className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] hover:bg-white/[0.05] ${session?.gameId === entry.gameId ? 'text-gold' : 'text-white/70'}`}>
                {entry.pinned || entry.isPriority ? <Star size={10} className={entry.pinned ? 'shrink-0 text-gold' : 'shrink-0 text-white/30'} fill={entry.pinned ? 'currentColor' : 'none'} /> : <span className="w-[10px] shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{entry.gameName}</span>
                <span className="shrink-0 font-mono text-[9px] text-white/30">{entry.profileName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {/* Session en cours (adaptatif selon le jeu, spec §24-25) */}
        {session && (
          <section className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-200/70"><Gamepad2 size={10} />{session.gameName ?? 'Session'}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/55">
              <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5">Profil {session.profileName}</span>
              {session.activeMods !== undefined && <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5">{session.activeMods} mods actifs</span>}
              {session.layoutLabel && <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5">{session.layoutLabel}</span>}
              {session.bypassActive && <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5">Bypass</span>}
              {session.red4extActive && <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-amber-100/80" title="Loader actif — chargement à confirmer après lancement">RED4ext ⚠</span>}
              {session.modsPrepared === false && <span className="rounded-md bg-amber-300/12 px-1.5 py-0.5 text-amber-100/80" title="Le jeu a été lancé avant la préparation du profil (Steam, launcher externe ou UAC) — les mods n'ont pas été préparés par ZAILON.">Mods ⚠ Non préparés</span>}
            </div>
            {/* Spec §49 : statuts RÉELS de la session — source de confiance. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold">
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${session.connected ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{session.connected ? '✓' : '⚠'} Connexion ZAILON</span>
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${session.inputActive ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{session.inputActive ? '✓' : '⚠'} Clavier</span>
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${session.visualActive ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{session.visualActive ? '✓' : '⚠'} Visuel</span>
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${session.runtimeActive ? 'bg-emerald-300/10 text-emerald-200/85' : 'bg-amber-300/10 text-amber-100/80'}`}>{session.runtimeActive ? '✓' : '⚠'} Runtime</span>
            </div>
          </section>
        )}

        {/* Visuel */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white/35"><Palette size={10} />Visuel</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => void visual('toggle')} className="flex items-center justify-center gap-1.5 rounded-lg bg-[#dbe8e5]/90 px-2 py-1.5 text-[11px] font-semibold text-[#0d1111] hover:bg-white">Activer / désactiver</button>
            <button type="button" onClick={() => void visual('previous')} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06]">Profil précédent</button>
            <button type="button" onClick={() => void visual('next')} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06]">Profil suivant</button>
            <button type="button" onClick={() => void visual('restore')} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06]"><RefreshCw size={10} />Restaurer</button>
          </div>
        </section>

        {/* Clavier (spec §45 : même ZailonSwitch que partout, size compact). */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white/35"><Keyboard size={10} />Clavier</p>
          <div className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] ${keyboardOn ? 'bg-emerald-300/12 text-emerald-100/90' : 'bg-white/[0.03] text-white/45'}`}>
            <span className="flex items-center gap-1.5">{keyboardOn ? <Check size={11} className="text-emerald-300/80" /> : <MonitorDown size={11} />}Disposition ZAILON</span>
            <ZailonSwitch checked={keyboardOn} onChange={toggleKeyboard} size="compact" />
          </div>
        </section>

        {/* Performance (spec §24) : mode rapide + politiques de pause réelles. */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white/35"><Gauge size={10} />Performance</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={session?.performanceMode ?? 'auto'} onChange={event => setPerformance(event.target.value as PerformanceMode)} className="rounded-lg border border-white/[0.08] bg-[#141919] px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/35">
              {(Object.keys(PERFORMANCE_LABELS) as PerformanceMode[]).map(mode => <option key={mode} value={mode}>{PERFORMANCE_LABELS[mode]}</option>)}
            </select>
            {session?.downloadsPaused && <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] text-amber-100/80">Téléchargements : en pause</span>}
            {session?.scansPaused && <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] text-amber-100/80">Scans : en pause</span>}
          </div>
        </section>

        {/* Discord (spec §38, §45) : état honnête + bascule rapide + Configurer. */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white/35"><Radio size={10} />Discord</p>
          <div className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] ${session?.discord?.published ? 'bg-emerald-300/12 text-emerald-100/90' : 'bg-white/[0.03] text-white/45'}`}>
            <span className="flex items-center gap-1.5">{session?.discord?.published ? <Check size={11} className="text-emerald-300/80" /> : <Radio size={11} />}Présence Discord</span>
            <ZailonSwitch checked={Boolean(session?.discord?.enabled)} onChange={toggleDiscord} size="compact" />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${session?.discord?.published ? 'bg-emerald-300/80' : session?.discord?.enabled ? 'bg-amber-300/70' : 'bg-white/15'}`} />
              {session?.discord?.published
                ? `Présence active · ${session.discord.publishedGameName}`
                : session?.discord?.enabled
                  ? session?.discord?.connected ? 'En attente de session publiée' : 'En attente de Discord'
                  : 'Désactivé'}
            </span>
            <button type="button" onClick={openDiscordSettings} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-gold/70 hover:bg-white/[0.06]"><Settings2 size={10} />Configurer</button>
          </div>
        </section>

        {/* Actions */}
        <section className="mt-auto grid grid-cols-2 gap-1.5">
          <button type="button" onClick={focusMain} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-2 text-[11px] text-white/55 hover:bg-white/[0.06]">Ouvrir ZAILON</button>
          <button type="button" onClick={close} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-300/15 px-2 py-2 text-[11px] text-red-100/60 hover:bg-red-300/[0.06]">Fermer</button>
        </section>
      </div>

      {status && <p className="border-t border-white/[0.05] px-3 py-1.5 text-[10px] text-gold/80" role="status">{status}</p>}
    </div>
  )
}
