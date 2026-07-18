import { useEffect, useState } from 'react'
import { Download, ExternalLink, X } from 'lucide-react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { AppWindow } from './components/Layout/AppWindow'
import { UpdateProvider } from './components/UpdateProvider'
import { useStore } from './store/useStore'
import { native, type NxmRequest } from './lib/native'

export default function App() {
  const tick = useStore(s => s.tick)
  const notice = useStore(s => s.notice)
  const clearNotice = useStore(s => s.clearNotice)
  const games = useStore(s => s.games)
  const setSelectedGame = useStore(s => s.setSelectedGame)
  const setSelectedProfile = useStore(s => s.setSelectedProfile)
  const [externalInstalls, setExternalInstalls] = useState<NxmRequest[]>([])

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: UnlistenFn | undefined
    void native.pendingExternalInstalls().then(setExternalInstalls).catch(() => undefined)
    void listen<NxmRequest>('nxm-opened', event => setExternalInstalls(current => current.some(item => item.rawUrl === event.payload.rawUrl) ? current : [...current, event.payload])).then(dispose => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  const resolveExternalInstall = async (request: NxmRequest, gameId: string, profileId: string) => {
    setSelectedGame(gameId)
    await setSelectedProfile(profileId)
    const sourceUrl = `https://www.nexusmods.com/${request.gameDomain}/mods/${request.modId}?tab=files&file_id=${request.fileId}`
    await native.openExternalUrl(sourceUrl)
    await native.consumeExternalInstall(request.rawUrl)
    setExternalInstalls(current => current.filter(item => item.rawUrl !== request.rawUrl))
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050606]"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(219,232,229,0.025) 0%, transparent 70%)',
      }}>
      <UpdateProvider>
        <AppWindow />
      </UpdateProvider>
      {notice && (
        <button onClick={clearNotice} className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-gold/30 bg-ink-200 px-3 py-2 text-left text-xs text-white/75 shadow-2xl">
          {notice}
        </button>
      )}
      {externalInstalls[0] && <ExternalInstallDialog request={externalInstalls[0]} games={games} onCancel={() => void native.consumeExternalInstall(externalInstalls[0].rawUrl).finally(() => setExternalInstalls(current => current.slice(1)))} onContinue={(gameId, profileId) => void resolveExternalInstall(externalInstalls[0], gameId, profileId)} />}
    </div>
  )
}

function ExternalInstallDialog({ request, games, onCancel, onContinue }: { request: NxmRequest; games: ReturnType<typeof useStore.getState>['games']; onCancel: () => void; onContinue: (gameId: string, profileId: string) => void }) {
  const [gameId, setGameId] = useState(games[0]?.id || '')
  const game = games.find(item => item.id === gameId)
  const [profileId, setProfileId] = useState(game?.profiles[0]?.id || '')
  const selectGame = (nextGameId: string) => { setGameId(nextGameId); setProfileId(games.find(item => item.id === nextGameId)?.profiles[0]?.id || '') }
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"><section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111414] p-4 shadow-2xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold"><Download size={17} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/80">Lien Nexus reçu</h2><p className="mt-1 text-[11px] leading-relaxed text-white/40">{request.gameDomain} · mod {request.modId} · fichier {request.fileId}</p></div><button onClick={onCancel} title="Annuler" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={14} /></button></div>{games.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[11px] text-white/45">Jeu cible<select value={gameId} onChange={event => selectGame(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#0d1010] px-2 py-2 text-[11px] text-white/70">{games.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[11px] text-white/45">Profil cible<select value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#0d1010] px-2 py-2 text-[11px] text-white/70">{game?.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label></div> : <p className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[11px] text-amber-100/60">Ajoutez d’abord le jeu cible à la bibliothèque.</p>}<p className="mt-4 text-[11px] leading-relaxed text-white/35">Sans paramètres d’application Nexus enregistrés, ZAILON ouvre la page exacte du fichier au lieu de prétendre l’avoir téléchargé.</p><div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} className="rounded-lg px-3 py-2 text-[11px] text-white/45">Annuler</button><button disabled={!gameId || !profileId} onClick={() => onContinue(gameId, profileId)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-30"><ExternalLink size={12} /> Ouvrir le fichier Nexus</button></div></section></div>
}
