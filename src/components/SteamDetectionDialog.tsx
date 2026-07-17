import { AlertTriangle, Check, ChevronDown, FolderSearch, Loader2, Radar, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DetectedGame, SteamScanDiagnostics, native, pickFolder } from '../lib/native'

interface SteamDetectionDialogProps {
  onClose: () => void
  onImport: (games: DetectedGame[]) => number
}

const keyFor = (game: DetectedGame) => game.providerGameId || game.installDirectory

export function SteamDetectionDialog({ onClose, onImport }: SteamDetectionDialogProps) {
  const [manualPath, setManualPath] = useState<string>()
  const [scanning, setScanning] = useState(false)
  const [stage, setStage] = useState('Prêt à rechercher Steam')
  const [progress, setProgress] = useState<{ current: number; total: number }>()
  const [games, setGames] = useState<DetectedGame[]>()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [diagnostics, setDiagnostics] = useState<SteamScanDiagnostics>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !scanning) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, scanning])

  const selectedGames = useMemo(
    () => (games || []).filter(game => selected[keyFor(game)] && !game.needsExecutable),
    [games, selected],
  )

  const scan = async (path = manualPath) => {
    setScanning(true)
    setError(undefined)
    setGames(undefined)
    setDiagnostics(undefined)
    setProgress(undefined)
    setStage('Recherche de Steam…')
    try {
      const result = await native.scanSteamGames(path, event => {
        if (event.event === 'Stage') setStage(event.data.detail)
        if (event.event === 'Progress') setProgress(event.data)
      })
      setGames(result.games)
      setDiagnostics(result.diagnostics)
      setSelected(Object.fromEntries(result.games.map(game => [keyFor(game), !game.needsExecutable])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setStage('La détection n’a pas pu être terminée.')
    } finally {
      setScanning(false)
    }
  }

  const chooseSteamFolder = async () => {
    const path = await pickFolder('Sélectionnez le dossier d’installation Steam')
    if (!path) return
    setManualPath(path)
    await scan(path)
  }

  const chooseExecutable = (gameKey: string, executablePath: string) => {
    setGames(current => current?.map(game => keyFor(game) !== gameKey ? game : {
      ...game,
      execPath: executablePath,
      needsExecutable: false,
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !scanning) onClose() }}>
      <section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-300 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="steam-detection-title">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-2"><Radar size={17} className="text-gold" /><div><h2 id="steam-detection-title" className="font-display text-sm font-bold text-white">Détecter les jeux Steam</h2><p className="text-[10px] text-white/40">Bibliothèques Steam et manifestes locaux uniquement — aucune analyse de disque globale.</p></div></div>
          <button onClick={onClose} disabled={scanning} aria-label="Fermer" className="rounded p-1 text-white/40 hover:bg-white/[0.08] hover:text-white disabled:opacity-30"><X size={16} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!games && <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            {scanning ? <Loader2 size={28} className="animate-spin text-gold" /> : <Radar size={28} className="text-gold/70" />}
            <div><p className="text-sm text-white/80">{stage}</p><p className="mt-1 max-w-md text-[11px] text-white/40">ZAILON utilise le chemin Steam du système, puis lit <code className="text-white/55">libraryfolders.vdf</code> et les manifestes <code className="text-white/55">appmanifest_*.acf</code>.</p></div>
            {progress && <Progress value={progress} />}
            {error && <p className="max-w-lg rounded border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{error}</p>}
          </div>}

          {games && <>
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2">
              <div><p className="text-xs text-white/75">{games.length} jeu{games.length !== 1 ? 'x' : ''} installé{games.length !== 1 ? 's' : ''} trouvé{games.length !== 1 ? 's' : ''}</p><p className="mt-0.5 text-[10px] text-white/35">{diagnostics?.libraries.length || 0} bibliothèque(s), {diagnostics?.manifestErrors || 0} manifeste(s) invalide(s) ignoré(s), {diagnostics?.skippedNonGames || 0} outil(s) Steam ignoré(s).</p></div>
              <button onClick={() => setSelected(Object.fromEntries(games.map(game => [keyFor(game), !game.needsExecutable])))} className="rounded border border-white/[0.1] px-2 py-1 text-[10px] text-white/65 hover:bg-white/[0.07]">Tout prêt</button>
            </div>
            <div className="space-y-2">
              {games.map(game => {
                const gameKey = keyFor(game)
                const checked = Boolean(selected[gameKey])
                return <article key={gameKey} className={`rounded-lg border p-3 ${checked ? 'border-gold/25 bg-gold/[0.045]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => !game.needsExecutable && setSelected(state => ({ ...state, [gameKey]: !checked }))} disabled={game.needsExecutable} aria-label={`Sélectionner ${game.name}`} className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-gold bg-gold text-ink-400' : 'border-white/30'} disabled:cursor-not-allowed disabled:border-white/15`}>
                      {checked && <Check size={11} strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-xs font-semibold text-white/90">{game.name}</h3><span className="rounded bg-[#1b2838] px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide text-[#66c0f4]">Steam {game.providerGameId}</span>{game.needsExecutable && <span className="flex items-center gap-1 text-[9px] text-amber-300"><AlertTriangle size={10} /> Exécutable à choisir</span>}</div>
                      <p className="mt-1 truncate font-mono text-[9px] text-white/35" title={game.installDirectory}>{game.installDirectory}</p>
                      {game.executableCandidates.length > 1 && <label className="relative mt-2 block max-w-xl"><span className="sr-only">Exécutable pour {game.name}</span><select value={game.execPath} onChange={event => chooseExecutable(gameKey, event.target.value)} className="w-full appearance-none rounded border border-white/[0.09] bg-black/20 px-2 py-1 pr-6 text-[10px] text-white/70 outline-none focus:border-gold/40"><option value="">Choisir un exécutable</option>{game.executableCandidates.map(candidate => <option key={candidate.path} value={candidate.path}>{candidate.name} — {candidate.path}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2 top-1.5 text-white/40" /></label>}
                      {game.executableCandidates.length === 1 && <p className="mt-1.5 text-[10px] text-white/45">Exécutable : <span className="text-white/65">{game.executableCandidates[0].name}</span></p>}
                      {!game.executableCandidates.length && <p className="mt-1.5 text-[10px] text-amber-200/80">Aucun exécutable de jeu sûr n’a été identifié. Ajoutez ce jeu manuellement après vérification.</p>}
                    </div>
                  </div>
                </article>
              })}
              {!games.length && <p className="rounded border border-white/[0.07] bg-white/[0.02] p-5 text-center text-xs text-white/45">Aucun jeu Steam installé n’a été trouvé dans les bibliothèques accessibles.</p>}
            </div>
          </>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
          <button onClick={() => void chooseSteamFolder()} disabled={scanning} className="flex items-center gap-1.5 rounded border border-white/[0.1] px-2.5 py-1.5 text-[10px] text-white/65 hover:bg-white/[0.07] disabled:opacity-40"><FolderSearch size={12} /> Choisir le dossier Steam</button>
          <div className="flex gap-2"><button onClick={onClose} disabled={scanning} className="rounded px-3 py-1.5 text-[10px] text-white/50 hover:text-white disabled:opacity-40">Annuler</button>{games ? <button onClick={() => { if (onImport(selectedGames) >= 0) onClose() }} disabled={!selectedGames.length} className="rounded bg-gold px-3 py-1.5 text-[10px] font-semibold text-ink-400 hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40">Ajouter {selectedGames.length || ''} sélectionné{selectedGames.length !== 1 ? 's' : ''}</button> : <button onClick={() => void scan()} disabled={scanning} className="rounded bg-gold px-3 py-1.5 text-[10px] font-semibold text-ink-400 hover:bg-gold-bright disabled:opacity-40">{scanning ? 'Recherche…' : 'Rechercher Steam'}</button>}</div>
        </footer>
      </section>
    </div>
  )
}

function Progress({ value }: { value: { current: number; total: number } }) {
  const percentage = value.total ? Math.round((value.current / value.total) * 100) : 0
  return <div className="w-60"><div className="h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-gold transition-all" style={{ width: `${percentage}%` }} /></div><p className="mt-1 text-[9px] font-mono text-white/35">Bibliothèque {Math.min(value.current + 1, value.total)}/{value.total}</p></div>
}
