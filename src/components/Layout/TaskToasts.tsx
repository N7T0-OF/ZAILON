import { AlertTriangle, CheckCircle2, EyeOff, Loader2, X, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { BackgroundTaskSnapshot, native } from '../../lib/native'

const isTerminal = (task: BackgroundTaskSnapshot) => task.status !== 'running'
const terminalDelay = (status: BackgroundTaskSnapshot['status']) => status === 'completed' ? 4_000 : status === 'completed_with_warnings' ? 7_000 : status === 'cancelled' ? 3_000 : status === 'failed' ? 10_000 : 7_000

/** Toasts de tâches + historique compact (spec « Nettoyage » §4) : l'ancienne
 * barre fixe du bas (jeu actif, mods, profil, Discord, version, « En ligne »)
 * est SUPPRIMÉE — ces infos vivent dans leurs pages respectives. Seuls
 * restent ici les notifications de tâches (section Téléchargements/Activité)
 * et le panneau d'historique, sans aucun statut global permanent (§5). */
export function TaskToasts() {
  const tasks = useStore(state => state.backgroundTasks)
  const taskToastsEnabled = useStore(state => state.taskToastsEnabled)
  const setView = useStore(state => state.setView)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [hiddenRunning, setHiddenRunning] = useState<string[]>([])
  const [dismissedTerminal, setDismissedTerminal] = useState<string[]>([])
  const previousStatuses = useRef(new Map<string, string>())
  const mountedAt = useRef(Math.floor(Date.now() / 1000))

  useEffect(() => {
    const newlyTerminal = tasks.filter(task => isTerminal(task) && previousStatuses.current.get(task.id) === 'running')
    if (newlyTerminal.length) setHiddenRunning(current => current.filter(id => !newlyTerminal.some(task => task.id === id)))
    tasks.forEach(task => previousStatuses.current.set(task.id, task.status))
  }, [tasks])

  const runningTasks = tasks.filter(task => task.status === 'running')
  const toastTask = useMemo(() => {
    if (!taskToastsEnabled) return undefined
    return tasks.find(task => task.status === 'running'
      ? !hiddenRunning.includes(task.id)
      : task.updatedAt >= mountedAt.current && !dismissedTerminal.includes(`${task.id}:${task.updatedAt}`))
  }, [dismissedTerminal, hiddenRunning, taskToastsEnabled, tasks])

  useEffect(() => {
    if (!toastTask || !isTerminal(toastTask)) return
    const key = `${toastTask.id}:${toastTask.updatedAt}`
    const timeout = window.setTimeout(() => setDismissedTerminal(current => current.includes(key) ? current : [...current, key]), terminalDelay(toastTask.status))
    return () => window.clearTimeout(timeout)
  }, [toastTask])

  const hideToast = () => {
    if (!toastTask) return
    if (toastTask.status === 'running') setHiddenRunning(current => [...new Set([...current, toastTask.id])])
    else setDismissedTerminal(current => [...new Set([...current, `${toastTask.id}:${toastTask.updatedAt}`])])
  }

  return <>
    {toastTask && <TaskToast task={toastTask} onHide={hideToast} onHistory={() => { setTasksOpen(true); setView('downloads') }} />}
    {tasksOpen && <section className="fixed bottom-3 right-3 z-[230] max-h-[60vh] w-[min(460px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#101313] p-3 shadow-2xl" aria-label="Historique des tâches">
      <div className="mb-2 flex items-center justify-between gap-2"><div><h2 className="text-xs font-semibold text-white/72">Tâches en arrière-plan</h2><p className="mt-0.5 text-[11px] text-white/34">{runningTasks.length} active(s) · historique persistant</p></div><button type="button" onClick={() => setTasksOpen(false)} aria-label="Fermer" className="rounded p-1.5 text-white/35 hover:bg-white/[0.06]"><X size={14} /></button></div>
      {tasks.length ? <div className="space-y-2">{tasks.slice(0, 20).map(task => <TaskRow key={task.id} task={task} />)}</div> : <p className="rounded-lg border border-dashed border-white/[0.08] p-4 text-center text-[11px] text-white/34">Aucune tâche enregistrée.</p>}
      <button type="button" onClick={() => { setView('downloads'); setTasksOpen(false) }} className="mt-3 w-full rounded-lg border border-white/[0.09] px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/[0.05]">Ouvrir l’historique complet</button>
    </section>}
  </>
}

function TaskToast({ task, onHide, onHistory }: { task: BackgroundTaskSnapshot; onHide: () => void; onHistory: () => void }) {
  const progress = task.total ? Math.min(100, Math.round(task.processed / task.total * 100)) : 0
  const Icon = task.status === 'running' ? Loader2 : task.status === 'completed' ? CheckCircle2 : task.status === 'completed_with_warnings' || task.status === 'awaiting_user_decision' ? AlertTriangle : XCircle
  return <aside className="fixed bottom-4 right-4 z-[235] w-[min(390px,calc(100vw-32px))] rounded-xl border border-white/[0.11] bg-[#101414]/95 p-3 shadow-2xl backdrop-blur-xl" aria-live="polite">
    <div className="flex items-start gap-2"><Icon size={16} className={`mt-0.5 shrink-0 ${task.status === 'running' ? 'animate-spin text-gold' : task.status === 'completed' ? 'text-emerald-300' : 'text-amber-200'}`} /><button type="button" onClick={onHistory} className="min-w-0 flex-1 text-left"><p className="truncate text-xs font-semibold text-white/78">{task.title}</p><p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/44">{task.message}</p></button><button type="button" onClick={onHide} title="Masquer cette notification" aria-label="Masquer cette notification" className="rounded p-1.5 text-white/34 hover:bg-white/[0.07] hover:text-white"><EyeOff size={14} /></button></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full transition-[width] ${task.status === 'failed' ? 'bg-red-300' : task.status === 'completed' ? 'bg-emerald-300' : 'bg-amber-300'}`} style={{ width: `${progress}%` }} /></div>
    <p className="mt-1 text-right font-mono text-[11px] text-white/30">{task.processed} / {task.total || '?'} · {task.status}</p>
  </aside>
}

function TaskRow({ task }: { task: BackgroundTaskSnapshot }) {
  const progress = task.total ? Math.min(100, Math.round(task.processed / task.total * 100)) : 0
  const Icon = task.status === 'running' ? Loader2 : task.status === 'completed' ? CheckCircle2 : task.status === 'completed_with_warnings' || task.status === 'awaiting_user_decision' ? AlertTriangle : XCircle
  return <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-start gap-2"><Icon size={14} className={`mt-0.5 shrink-0 ${task.status === 'running' ? 'animate-spin text-gold' : task.status === 'completed' ? 'text-emerald-300/70' : 'text-amber-200/70'}`} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white/68">{task.title}</p><p className="mt-1 text-[11px] leading-relaxed text-white/38">{task.message}</p></div>{task.status === 'running' && <button type="button" onClick={() => void native.cancelBackgroundTask(task.id)} className="rounded border border-red-300/15 px-2 py-1 text-[11px] text-red-200/60">Annuler</button>}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-gold transition-[width]" style={{ width: `${progress}%` }} /></div></div>
}
