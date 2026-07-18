import { Activity, CheckCircle2, CloudOff, Gamepad2, Loader2, Radio, ShieldCheck, Wifi, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { appVersion, getSelectedGame, getSelectedProfile, resolveProfileMods, useStore } from '../../store/useStore'
import { BackgroundTaskSnapshot, DiscordConnectionStatus, native } from '../../lib/native'

export function StatusBar() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const discord = useStore(state => state.discordPresence)
  const lastUpdateError = useStore(state => state.lastUpdateError)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [tasks, setTasks] = useState<BackgroundTaskSnapshot[]>([])
  const [tasksOpen, setTasksOpen] = useState(false)
  const [discordConnection, setDiscordConnection] = useState<DiscordConnectionStatus>()

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected) }
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    void listen<DiscordConnectionStatus>('discord-status-changed', event => setDiscordConnection(event.payload)).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    void native.backgroundTasks().then(setTasks).catch(() => undefined)
    let unlisten: (() => void) | undefined
    void listen<BackgroundTaskSnapshot>('background-task-changed', event => {
      setTasks(current => [event.payload, ...current.filter(task => task.id !== event.payload.id)].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 100))
    }).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [])

  const activeMods = resolveProfileMods(selectedGame, selectedProfile).filter(mod => mod.enabled).length
  const runningTasks = tasks.filter(task => task.status === 'running')
  return <>
  {tasksOpen && <section className="fixed bottom-9 right-3 z-[230] max-h-[60vh] w-[min(460px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#101313] p-3 shadow-2xl" aria-label="Tâches en arrière-plan"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-[11px] font-semibold text-white/72">Tâches en arrière-plan</h2><span className="text-[11px] text-white/34">{runningTasks.length} active(s) · état persisté</span></div>{tasks.length ? <div className="space-y-2">{tasks.slice(0, 20).map(task => { const progress = task.total ? Math.min(100, Math.round(task.processed / task.total * 100)) : 0; const Icon = task.status === 'running' ? Loader2 : task.status === 'completed' ? CheckCircle2 : XCircle; return <div key={task.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-start gap-2"><Icon size={14} className={`mt-0.5 shrink-0 ${task.status === 'running' ? 'animate-spin text-gold' : task.status === 'completed' ? 'text-emerald-300/70' : 'text-amber-200/70'}`} /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white/68">{task.title}</p><p className="mt-1 text-[11px] leading-relaxed text-white/38">{task.message}</p></div>{task.status === 'running' && <button type="button" onClick={() => void native.cancelBackgroundTask(task.id)} className="rounded border border-red-300/15 px-2 py-1 text-[11px] text-red-200/60">Annuler</button>}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-gold transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-right font-mono text-[11px] text-white/28">{task.processed} / {task.total || '?'} · {task.status}</p></div>})}</div> : <p className="rounded-lg border border-dashed border-white/[0.08] p-4 text-center text-[11px] text-white/34">Aucune tâche enregistrée.</p>}</section>}
  <footer className="z-40 flex h-8 flex-shrink-0 items-center gap-1 border-t border-white/[0.04] bg-[#090b0b]/98 px-2 text-[11px] text-white/28">
    <StatusItem icon={Gamepad2} label={`${games.length} jeu${games.length !== 1 ? 'x' : ''}`} />
    <StatusItem icon={ShieldCheck} label={`${activeMods} mod${activeMods !== 1 ? 's' : ''} actif${activeMods !== 1 ? 's' : ''}`} />
    <StatusItem icon={Radio} label={selectedProfile ? `Profil ${selectedProfile.name}` : 'Aucun profil'} />
    <StatusItem icon={Radio} label={selectedGame?.provider || 'Bibliothèque locale'} />
    <span className="flex-1" />
    <button type="button" onClick={() => setTasksOpen(value => !value)} className={`flex items-center gap-1 rounded px-1.5 py-1 ${runningTasks.length ? 'text-gold/76' : 'text-white/32'}`}><Activity size={11} /><span className="hidden sm:inline">{runningTasks.length ? `${runningTasks.length} tâche(s)` : 'Tâches'}</span></button>
    <StatusItem icon={Radio} label={discordConnection?.connected ? 'Discord connecté' : `Discord ${discord ? 'prêt' : 'désactivé'}`} muted={!discordConnection?.connected} warning={Boolean(discord && discordConnection && !discordConnection.connected)} />
    <StatusItem icon={lastUpdateError ? CloudOff : ShieldCheck} label={lastUpdateError ? 'Mise à jour en erreur' : `ZAILON ${appVersion}`} warning={Boolean(lastUpdateError)} />
    <StatusItem icon={online ? Wifi : CloudOff} label={online ? 'En ligne' : 'Hors ligne'} warning={!online} />
  </footer>
  </>
}

function StatusItem({ icon: Icon, label, muted = false, warning = false }: { icon: typeof Wifi; label: string; muted?: boolean; warning?: boolean }) {
  return <span className={`flex items-center gap-1 rounded px-1.5 py-1 ${warning ? 'text-amber-300/75' : muted ? 'text-white/22' : 'text-white/38'}`}><Icon size={9} /><span className="hidden sm:inline">{label}</span></span>
}
