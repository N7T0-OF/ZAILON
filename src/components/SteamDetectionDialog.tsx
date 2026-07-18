import { AlertTriangle, Check, ChevronDown, Gamepad2, HardDrive, Loader2, Monitor, Radar, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DetectedGame, DiscoveryProviderDiagnostic, native, pickExecutable } from '../lib/native'

interface SteamDetectionDialogProps {
  onClose: () => void
  onImport: (games: DetectedGame[]) => number
}

const keyFor = (game: DetectedGame) => `${game.provider}:${game.providerGameId || game.execPath || game.installDirectory}:${game.name}`

export function SteamDetectionDialog({ onClose, onImport }: SteamDetectionDialogProps) {
  const [mode, setMode] = useState<'quick' | 'full'>('quick')
  const [scanning, setScanning] = useState(false)
  const [stage, setStage] = useState({ provider: 'Prêt', detail: 'Choisissez un mode de détection.' })
  const [progress, setProgress] = useState<{ current: number; total: number }>()
  const [games, setGames] = useState<DetectedGame[]>()
  const [diagnostics, setDiagnostics] = useState<DiscoveryProviderDiagnostic[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [kind, setKind] = useState<'all' | 'game' | 'software'>('all')
  const [provider, setProvider] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !scanning) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, scanning])

  const providers = useMemo(() => [...new Set((games || []).map(game => game.provider))].sort(), [games])
  const filtered = useMemo(() => (games || []).filter(game => {
    if (kind !== 'all' && game.itemKind !== kind) return false
    if (provider !== 'all' && game.provider !== provider) return false
    const query = search.trim().toLocaleLowerCase()
    return !query || `${game.name} ${game.publisher || ''} ${game.provider}`.toLocaleLowerCase().includes(query)
  }), [games, kind, provider, search])
  const selectedGames = useMemo(() => (games || []).filter(game => selected[keyFor(game)] && !game.needsExecutable), [games, selected])

  const scan = async () => {
    setScanning(true)
    setError(undefined)
    setGames(undefined)
    setDiagnostics([])
    setProgress(undefined)
    setStage({ provider: 'Initialisation', detail: 'Préparation des fournisseurs locaux…' })
    try {
      const result = await native.scanLibrary(mode, event => {
        if (event.event === 'Stage') setStage(event.data)
        if (event.event === 'Progress') setProgress(event.data)
      })
      setGames(result.games)
      setDiagnostics(result.diagnostics)
      setSelected(Object.fromEntries(result.games.map(game => [keyFor(game), game.itemKind === 'game' && !game.needsExecutable])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setScanning(false)
    }
  }

  const chooseExecutable = async (gameKey: string, candidate?: string) => {
    const executablePath = candidate || await pickExecutable()
    if (!executablePath) return
    setGames(current => current?.map(game => keyFor(game) !== gameKey ? game : { ...game, execPath: executablePath, needsExecutable: false, confidence: 'high' }))
    setSelected(current => ({ ...current, [gameKey]: true }))
  }

  return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/76 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !scanning) onClose() }}>
    <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101116] shadow-[0_30px_100px_rgba(0,0,0,0.72)]" role="dialog" aria-modal="true" aria-labelledby="discovery-title">
      <header className="flex items-center justify-between border-b border-white/[0.065] px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/22 bg-gold/[0.07] text-gold"><Radar size={17} /></div><div><p className="font-mono text-[7px] uppercase tracking-[0.22em] text-gold/55">Bibliothèque locale</p><h2 id="discovery-title" className="mt-0.5 font-display text-lg font-bold text-white">Détecter jeux et logiciels</h2></div></div><button type="button" onClick={onClose} disabled={scanning} aria-label="Fermer" className="rounded-lg p-1.5 text-white/38 hover:bg-white/[0.07] hover:text-white disabled:opacity-30"><X size={16} /></button></header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 thin-scroll">
        {!games && <div className="mx-auto max-w-3xl py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard active={mode === 'quick'} onClick={() => setMode('quick')} icon={Radar} title="Détection rapide" time="Quelques secondes" text="Lit les index Steam, Epic Games et le Registre Windows. Aucun parcours global du disque." />
            <ModeCard active={mode === 'full'} onClick={() => setMode('full')} icon={HardDrive} title="Détection complète" time="Plus lente" text="Complète les index avec une recherche limitée aux dossiers d’installation déjà déclarés." />
          </div>
          <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.018] p-4 text-center">
            {scanning ? <Loader2 size={25} className="mx-auto animate-spin text-gold" /> : <Radar size={25} className="mx-auto text-gold/64" />}
            <p className="mt-3 text-xs font-semibold text-white/72">{stage.provider}</p><p className="mt-1 text-[10px] text-white/36">{stage.detail}</p>
            {progress && <Progress value={progress} />}
            {error && <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-200">{error}</p>}
          </div>
        </div>}

        {games && <>
          <div className="grid gap-2 sm:grid-cols-3">
            {diagnostics.map(item => <article key={item.provider} className="rounded-lg border border-white/[0.065] bg-white/[0.018] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold text-white/66">{item.provider}</span><span className={`h-1.5 w-1.5 rounded-full ${item.status === 'ok' ? 'bg-emerald-400' : item.status === 'warning' ? 'bg-amber-400' : 'bg-white/20'}`} /></div><p className="mt-1 font-display text-xl font-bold text-white/82">{item.found}</p><p className="mt-1 line-clamp-2 text-[8px] leading-relaxed text-white/28" title={item.detail}>{item.detail}</p></article>)}
          </div>
          <div className="sticky top-0 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-[#101116]/95 p-2 backdrop-blur-xl">
            <div className="relative min-w-44 flex-1"><Search size={11} className="absolute left-2.5 top-2 text-white/27" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un nom, éditeur…" className="w-full rounded-lg border border-white/[0.07] bg-white/[0.025] py-1.5 pl-7 pr-2 text-[9px] text-white/66 outline-none focus:border-gold/28" /></div>
            <select value={kind} onChange={event => setKind(event.target.value as typeof kind)} className="rounded-lg border border-white/[0.07] bg-[#17181e] px-2 py-1.5 text-[9px] text-white/54"><option value="all">Tout type</option><option value="game">Jeux</option><option value="software">Logiciels</option></select>
            <select value={provider} onChange={event => setProvider(event.target.value)} className="rounded-lg border border-white/[0.07] bg-[#17181e] px-2 py-1.5 text-[9px] text-white/54"><option value="all">Toutes sources</option>{providers.map(value => <option key={value} value={value}>{value}</option>)}</select>
            <button type="button" onClick={() => setSelected(Object.fromEntries((games || []).map(game => [keyFor(game), !game.needsExecutable])))} className="rounded-lg border border-white/[0.08] px-2 py-1.5 text-[8px] text-white/43 hover:bg-white/[0.05] hover:text-white">Tout ce qui est prêt</button>
          </div>
          <div className="mt-2 space-y-1.5">
            {filtered.map(game => <DetectedRow key={keyFor(game)} game={game} checked={Boolean(selected[keyFor(game)])} onToggle={() => !game.needsExecutable && setSelected(current => ({ ...current, [keyFor(game)]: !current[keyFor(game)] }))} onExecutable={value => void chooseExecutable(keyFor(game), value)} onBrowse={() => void chooseExecutable(keyFor(game))} />)}
            {!filtered.length && <p className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-7 text-center text-[10px] text-white/34">Aucun résultat ne correspond à ces filtres.</p>}
          </div>
        </>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.065] px-4 py-3"><p className="text-[8px] text-white/27">{games ? `${games.length} détecté(s) · ${selectedGames.length} sélectionné(s)` : mode === 'quick' ? 'Index locaux uniquement' : 'Dossiers connus uniquement'}</p><div className="flex gap-2"><button type="button" onClick={onClose} disabled={scanning} className="rounded-lg px-3 py-1.5 text-[9px] text-white/42 hover:bg-white/[0.05] hover:text-white disabled:opacity-30">Annuler</button>{games ? <><button type="button" onClick={() => void scan()} disabled={scanning} className="rounded-lg border border-white/[0.09] px-3 py-1.5 text-[9px] text-white/52 hover:bg-white/[0.05]">Relancer</button><button type="button" onClick={() => { onImport(selectedGames); onClose() }} disabled={!selectedGames.length} className="rounded-lg bg-gold px-3 py-1.5 text-[9px] font-semibold text-[#0a0b0e] hover:bg-gold-bright disabled:opacity-35">Ajouter {selectedGames.length || ''}</button></> : <button type="button" onClick={() => void scan()} disabled={scanning} className="rounded-lg bg-gold px-3 py-1.5 text-[9px] font-semibold text-[#0a0b0e] hover:bg-gold-bright disabled:opacity-35">{scanning ? 'Détection…' : 'Lancer la détection'}</button>}</div></footer>
    </section>
  </div>, document.body)
}

function ModeCard({ active, onClick, icon: Icon, title, time, text }: { active: boolean; onClick: () => void; icon: typeof Radar; title: string; time: string; text: string }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left transition-colors ${active ? 'border-gold/30 bg-gold/[0.055]' : 'border-white/[0.07] bg-white/[0.015] hover:bg-white/[0.035]'}`}><div className="flex items-start justify-between"><Icon size={16} className={active ? 'text-gold' : 'text-white/34'} /><span className="font-mono text-[7px] uppercase tracking-wide text-white/24">{time}</span></div><h3 className="mt-3 text-xs font-semibold text-white/75">{title}</h3><p className="mt-1 text-[9px] leading-relaxed text-white/32">{text}</p></button>
}

function DetectedRow({ game, checked, onToggle, onExecutable, onBrowse }: { game: DetectedGame; checked: boolean; onToggle: () => void; onExecutable: (path: string) => void; onBrowse: () => void }) {
  const TypeIcon = game.itemKind === 'game' ? Gamepad2 : Monitor
  return <article className={`rounded-xl border p-3 transition-colors ${checked ? 'border-gold/24 bg-gold/[0.035]' : 'border-white/[0.065] bg-white/[0.012]'}`}>
    <div className="flex items-start gap-3"><button type="button" onClick={onToggle} disabled={game.needsExecutable} aria-label={`Sélectionner ${game.name}`} className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border ${checked ? 'border-gold bg-gold text-black' : 'border-white/24'} disabled:cursor-not-allowed disabled:opacity-25`}>{checked && <Check size={10} strokeWidth={3} />}</button><TypeIcon size={14} className="mt-0.5 flex-none text-white/30" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h3 className="truncate text-[10px] font-semibold text-white/78">{game.name}</h3><Badge>{game.provider}</Badge><Badge>{game.itemKind === 'game' ? 'Jeu' : 'Logiciel'}</Badge><Badge>{game.confidence}</Badge>{game.needsExecutable && <span className="flex items-center gap-1 text-[8px] text-amber-300/72"><AlertTriangle size={9} /> exécutable requis</span>}</div><p className="mt-1 truncate font-mono text-[8px] text-white/26" title={game.installDirectory}>{game.installDirectory || 'Emplacement non déclaré'}{game.version ? ` · v${game.version}` : ''}</p>{game.executableCandidates.length > 1 && <label className="relative mt-2 block max-w-2xl"><select value={game.execPath} onChange={event => onExecutable(event.target.value)} className="w-full rounded-md border border-white/[0.07] bg-[#17181e] py-1 pl-2 pr-6 text-[8px] text-white/52"><option value="">Choisir un exécutable</option>{game.executableCandidates.map(candidate => <option key={candidate.path} value={candidate.path}>{candidate.name} — {candidate.path}</option>)}</select><ChevronDown size={10} className="pointer-events-none absolute right-2 top-1.5 text-white/28" /></label>}{game.needsExecutable && <button type="button" onClick={onBrowse} className="mt-2 rounded-md border border-amber-300/16 bg-amber-300/[0.025] px-2 py-1 text-[8px] text-amber-200/62 hover:bg-amber-300/[0.06]">Choisir manuellement</button>}</div></div>
  </article>
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[6px] uppercase tracking-wide text-white/31">{children}</span>
}

function Progress({ value }: { value: { current: number; total: number } }) {
  const percentage = value.total ? Math.round((value.current / value.total) * 100) : 0
  return <div className="mx-auto mt-3 w-64"><div className="h-1 overflow-hidden rounded bg-white/[0.08]"><div className="h-full bg-gold transition-all" style={{ width: `${percentage}%` }} /></div><p className="mt-1 text-[8px] font-mono text-white/25">{value.current}/{value.total} sources</p></div>
}
