import { Activity, AlertTriangle, CheckCircle2, Clock3, Download, Loader2, Search, Trash2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { native, type BackgroundTaskSnapshot } from '../../lib/native'
import { useStore } from '../../store/useStore'
import type { DownloadRetention } from '../../types'

type StatusFilter = 'all' | 'running' | 'awaiting_user_decision' | 'completed' | 'failed'

const STATUS_TABS: Array<{ id: StatusFilter; label: string; match: (task: BackgroundTaskSnapshot) => boolean }> = [
  { id: 'all', label: 'Tous', match: () => true },
  { id: 'running', label: 'En cours', match: task => task.status === 'running' },
  { id: 'awaiting_user_decision', label: 'En attente', match: task => task.status === 'awaiting_user_decision' },
  { id: 'completed', label: 'Terminés', match: task => task.status === 'completed' || task.status === 'completed_with_warnings' },
  { id: 'failed', label: 'Erreurs', match: task => task.status === 'failed' || task.status === 'cancelled' || task.status === 'interrupted' },
]

export function DownloadsView() {
  const tasks = useStore(state => state.backgroundTasks)
  const clearBackgroundTasks = useStore(state => state.clearBackgroundTasks)
  const downloadRetention = useStore(state => state.downloadRetention)
  const setDownloadRetention = useStore(state => state.setDownloadRetention)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const kinds = [...new Set(tasks.map(task => task.kind))]
  const visible = useMemo(() => tasks.filter(task => {
    const tab = STATUS_TABS.find(item => item.id === status) || STATUS_TABS[0]
    const normalized = query.trim().toLocaleLowerCase()
    return tab.match(task)
      && (kind === 'all' || task.kind === kind)
      && (!normalized || `${task.title} ${task.message} ${task.error || ''}`.toLocaleLowerCase().includes(normalized))
  }), [kind, query, status, tasks])
  const running = tasks.filter(task => task.status === 'running').length

  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header><p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold/58">Centre des tâches et de l’activité</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Téléchargements et activité</h1><p className="mt-1 max-w-2xl text-xs text-white/42">Les transferts, analyses, imports, installations et déploiements réellement lancés par ZAILON restent consultables ici après leur fin.</p></header>
    <section className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher dans l’historique…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-white/72 outline-none" /></label>
      <select value={kind} onChange={event => setKind(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-3 py-2 text-xs text-white/68"><option value="all">Tous les types</option>{kinds.map(value => <option key={value} value={value}>{value}</option>)}</select>
      {running > 0 && <span className="flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/[0.05] px-3 py-1.5 text-[11px] font-semibold text-gold"><Loader2 size={11} className="animate-spin" />{running} en cours</span>}
    </section>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-[11px] text-white/38">Nettoyage des téléchargements
        <select value={downloadRetention} onChange={event => setDownloadRetention(event.target.value as DownloadRetention)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-[11px] text-white/68"><option value="startup">À chaque démarrage</option><option value="1d">Après 1 jour</option><option value="7d">Après 7 jours</option><option value="never">Jamais</option></select>
      </label>
      <button type="button" onClick={() => { const count = tasks.filter(task => task.status !== 'running' && task.status !== 'awaiting_user_decision').length; if (count && window.confirm(`Supprimer ${count} entrée(s) terminée(s) ou en erreur ?\n\nCela supprime uniquement l’historique des tâches. Les mods installés et les téléchargements utilisés ne sont pas supprimés.`)) clearBackgroundTasks() }} className="flex items-center gap-1.5 rounded-lg border border-red-300/15 px-3 py-1.5 text-[11px] font-semibold text-red-200/65 hover:bg-red-400/10"><Trash2 size={12} />Tout supprimer</button>
    </div>
    <nav className="mt-3 flex flex-wrap gap-1 border-b border-white/[0.05] pb-2" aria-label="Filtrer par état">
      {STATUS_TABS.map(tab => {
        const count = tasks.filter(tab.match).length
        return <button key={tab.id} type="button" onClick={() => setStatus(tab.id)} className={`rounded-lg px-3 py-1.5 text-[11px] ${status === tab.id ? 'bg-gold/15 font-semibold text-gold' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/70'}`}>{tab.label}<span className={`ml-1.5 ${status === tab.id ? 'text-gold/70' : 'text-white/28'}`}>{count}</span></button>
      })}
    </nav>
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
