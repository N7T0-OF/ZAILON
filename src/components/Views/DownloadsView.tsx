import { Activity, AlertTriangle, CheckCircle2, Clock3, Download, Loader2, Search, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { native, type BackgroundTaskSnapshot } from '../../lib/native'
import { useStore } from '../../store/useStore'

type StatusFilter = 'all' | BackgroundTaskSnapshot['status']

export function DownloadsView() {
  const tasks = useStore(state => state.backgroundTasks)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const kinds = [...new Set(tasks.map(task => task.kind))]
  const visible = useMemo(() => tasks.filter(task => {
    const normalized = query.trim().toLocaleLowerCase()
    return (status === 'all' || task.status === status)
      && (kind === 'all' || task.kind === kind)
      && (!normalized || `${task.title} ${task.message} ${task.error || ''}`.toLocaleLowerCase().includes(normalized))
  }), [kind, query, status, tasks])

  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header><p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold/58">Activité persistante</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Téléchargements et tâches</h1><p className="mt-1 max-w-2xl text-xs text-white/42">Les transferts, analyses, imports et déploiements réellement lancés par ZAILON restent consultables ici après leur fin.</p></header>
    <section className="mt-5 flex flex-wrap gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher dans l’historique…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-white/72 outline-none" /></label>
      <select value={status} onChange={event => setStatus(event.target.value as StatusFilter)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-3 py-2 text-xs text-white/68"><option value="all">Tous les états</option><option value="running">En cours</option><option value="awaiting_user_decision">En attente de décision</option><option value="completed">Terminées</option><option value="completed_with_warnings">Terminées avec avertissements</option><option value="failed">Échouées</option><option value="cancelled">Annulées</option><option value="interrupted">Interrompues</option></select>
      <select value={kind} onChange={event => setKind(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-3 py-2 text-xs text-white/68"><option value="all">Tous les types</option>{kinds.map(value => <option key={value} value={value}>{value}</option>)}</select>
    </section>
    <div className="mt-3 flex items-center justify-between text-[11px] text-white/34"><span>{visible.length} tâche(s) affichée(s)</span><span>{tasks.filter(task => task.status === 'running').length} en cours</span></div>
    {visible.length ? <section className="mt-3 space-y-2">{visible.map(task => <HistoryTask key={task.id} task={task} />)}</section> : <section className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] text-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/28"><Download size={19} /></div><h2 className="mt-3 text-sm font-semibold text-white/66">Aucune tâche correspondante</h2><p className="mt-1 max-w-sm text-xs leading-relaxed text-white/36">Modifiez les filtres ou lancez une analyse, un import ou un téléchargement réel.</p></section>}
  </div>
}

function HistoryTask({ task }: { task: BackgroundTaskSnapshot }) {
  const progress = task.total ? Math.min(100, Math.round(task.processed / task.total * 100)) : 0
  const Icon = task.status === 'running' ? Loader2 : task.status === 'completed' ? CheckCircle2 : task.status === 'completed_with_warnings' || task.status === 'awaiting_user_decision' ? AlertTriangle : task.status === 'failed' ? XCircle : Activity
  const timestamp = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(task.updatedAt * (task.updatedAt < 10_000_000_000 ? 1000 : 1))
  return <article className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4"><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] ${task.status === 'completed' ? 'text-emerald-300' : task.status === 'failed' ? 'text-red-300' : 'text-gold'}`}><Icon size={15} className={task.status === 'running' ? 'animate-spin' : ''} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white/76">{task.title}</h2><span className="flex items-center gap-1 font-mono text-[11px] text-white/30"><Clock3 size={11} />{timestamp}</span></div><p className="mt-1 text-xs leading-relaxed text-white/42">{task.message}</p>{task.error && <p className="mt-2 rounded-lg border border-red-300/12 bg-red-300/[0.035] p-2 text-[11px] text-red-200/64">{task.error}</p>}<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full ${task.status === 'failed' ? 'bg-red-300' : task.status === 'completed' ? 'bg-emerald-300' : 'bg-gold'}`} style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between text-[11px] text-white/30"><span>{task.kind} · {task.status}</span><span>{task.processed} / {task.total || '?'}</span></div></div>{task.status === 'running' && <button type="button" onClick={() => void native.cancelBackgroundTask(task.id)} className="rounded-lg border border-red-300/15 px-3 py-2 text-[11px] text-red-200/65">Annuler</button>}</div></article>
}
