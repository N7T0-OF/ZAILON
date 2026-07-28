import { AlertTriangle, ExternalLink, Monitor, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { native } from '../../lib/native'
import { useStore } from '../../store/useStore'
import type { Game, Profile } from '../../types'
import type { VisualProfile, VisualSafetyReport } from '../domain/types'
import { visualBackend } from '../infrastructure/nativeBackend'
import { SafetyPanel } from './SafetyPanel'

const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

export function VisualGamePanel({ game, zailonProfile }: { game: Game; zailonProfile: Profile }) {
  const setView = useStore(state => state.setView)
  const [profiles, setProfiles] = useState<VisualProfile[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [safety, setSafety] = useState<VisualSafetyReport>()
  const [status, setStatus] = useState('Chargement…')
  const [busy, setBusy] = useState(false)
  const isRust = game.name.toLocaleLowerCase().includes('rust')
  const selected = profiles.find(item => item.id === selectedId)

  const refresh = useCallback(async () => {
    if (!native.isDesktop()) return
    try {
      const [items, association] = await Promise.all([
        visualBackend.list(),
        visualBackend.association(game.id, zailonProfile.id),
      ])
      setProfiles(items)
      setSelectedId(association || '')
      const backendId = items.find(item => item.id === association)?.backendId || 'windows-gamma-ramp'
      setSafety(await visualBackend.safetyReport(game.id, game.name, game.installDirectory, backendId))
      setStatus(association ? 'Ce profil visuel sera appliqué uniquement lors d’un lancement depuis ZAILON.' : 'Aucun profil visuel n’est associé à ce profil de jeu.')
    } catch (reason) {
      setStatus(messageOf(reason))
    }
  }, [game.id, game.installDirectory, game.name, zailonProfile.id])

  useEffect(() => { void refresh() }, [refresh])

  const associate = async (id: string) => {
    setSelectedId(id)
    setBusy(true)
    try {
      await visualBackend.setAssociation(game.id, zailonProfile.id, id || undefined)
      const backendId = profiles.find(item => item.id === id)?.backendId || 'windows-gamma-ramp'
      setSafety(await visualBackend.safetyReport(game.id, game.name, game.installDirectory, backendId))
      setStatus(id ? 'Association enregistrée. Le réglage sera restauré automatiquement à la fermeture du jeu.' : 'Association supprimée. Aucun réglage visuel ne sera appliqué automatiquement.')
    } catch (reason) {
      setStatus(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await visualBackend.apply(selected.id, selected.monitorId)
      setStatus(result.applied ? 'Profil appliqué à l’écran. Utilisez Restaurer pour revenir à l’état précédent.' : 'Ce profil est disponible uniquement dans l’aperçu avec le backend actuel.')
    } catch (reason) {
      setStatus(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex-1 overflow-y-auto p-4">
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-4">
        <div className="flex flex-wrap items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/18 bg-gold/[0.04] text-gold"><Monitor size={19} /></div><div className="min-w-0 flex-1"><p className="text-[11px] uppercase tracking-[0.18em] text-gold/58">{isRust ? 'Visuels système' : 'Visuels'}</p><h2 className="mt-1 text-lg font-bold text-white/82">{game.name} · {zailonProfile.name}</h2><p className="mt-1 text-xs leading-relaxed text-white/42">Association facultative à un réglage Windows externe au jeu. Aucun preset n’est activé sans votre choix.</p></div><button type="button" onClick={() => setView('visuals')} className="flex items-center gap-2 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:border-gold/25 hover:text-gold">Éditeur complet<ExternalLink size={13} /></button></div>
      </header>

      {isRust && <div className="flex gap-3 rounded-xl border border-amber-300/18 bg-amber-300/[0.035] p-3"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-200/70" /><p className="text-xs leading-relaxed text-amber-100/65"><strong>Rust interdit ReShade et les méthodes d’injection graphique.</strong> Cette page n’installe rien dans Rust, n’ouvre pas EAC et n’accède pas à la mémoire du jeu. Les profils Rust restent des transformations globales et uniformes de l’affichage.</p></div>}

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4">
        <label className="text-xs font-semibold text-white/68">Profil visuel au lancement<select value={selectedId} disabled={busy} onChange={event => void associate(event.target.value)} className="mt-2 w-full rounded-lg border border-white/[0.09] bg-[#111515] px-3 py-2.5 text-xs text-white/72 outline-none focus:border-gold/30"><option value="">Aucun — ne rien appliquer</option>{profiles.map(item => <option key={item.id} value={item.id}>{item.favorite ? '★ ' : ''}{item.name} · {item.backendId}</option>)}</select></label>
        <p className="mt-3 rounded-lg border border-white/[0.06] bg-black/15 p-2.5 text-[11px] leading-relaxed text-white/40">{status}</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!selected || busy} onClick={() => void test()} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[#101313] disabled:opacity-30"><Play size={13} />Tester le profil</button><button type="button" disabled={busy} onClick={() => void visualBackend.restore(selected?.monitorId).then(result => setStatus(`${result.restored} écran(s) restauré(s).`)).catch(reason => setStatus(messageOf(reason)))} className="flex items-center gap-2 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58"><RotateCcw size={13} />Restaurer maintenant</button></div>
      </section>

      <SafetyPanel report={safety} />

      {isRust && safety?.detectedComponents.length ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => game.installDirectory && void native.openPath(game.installDirectory)} disabled={!game.installDirectory} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 disabled:opacity-30">Afficher les fichiers</button><button type="button" onClick={() => void native.openExternalUrl('https://support.facepunchstudios.com/hc/en-us/articles/24444483513373-Failed-to-initialize-Reshade')} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58">Instructions officielles Facepunch</button></div> : null}
    </div>
  </div>
}
