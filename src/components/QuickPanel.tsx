import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Check, Gamepad2, Keyboard, MonitorDown, Palette, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { native } from '../lib/native'

/** Résumé de session reçu de la fenêtre principale (spec « Quick Overlay »
 * §24-25) : contenu adaptatif selon le jeu en cours (prioritaire). */
interface QuickPanelSessionState {
  gameName?: string
  profileName?: string
  activeMods?: number
  layoutLabel?: string
  bypassActive?: boolean
  red4extActive?: boolean
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

  // À l'ouverture : demander l'état de la session prioritaire à la fenêtre
  // principale (le panneau est une WebView séparée, sans accès au store).
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    void listen<QuickPanelSessionState>('quick-panel-state', event => setSession(event.payload)).then(dispose => { unlisten = dispose })
    void emit('quick-panel-ready')
    return () => unlisten?.()
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
      {/* En-tête compact */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">ZAILON · Panneau rapide</p>
        <button type="button" onClick={close} aria-label="Fermer" className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.07] hover:text-white"><X size={12} /></button>
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

        {/* Clavier */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white/35"><Keyboard size={10} />Clavier</p>
          <button type="button" onClick={toggleKeyboard} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] ${keyboardOn ? 'bg-emerald-300/12 text-emerald-100/90' : 'bg-white/[0.03] text-white/45'}`}>
            <span className="flex items-center gap-1.5">{keyboardOn ? <Check size={11} className="text-emerald-300/80" /> : <MonitorDown size={11} />}Disposition ZAILON</span>
            <span className={`font-mono text-[10px] uppercase tracking-widest ${keyboardOn ? 'text-emerald-200/70' : 'text-white/30'}`}>{keyboardOn ? 'Actif' : 'Inactif'}</span>
          </button>
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
