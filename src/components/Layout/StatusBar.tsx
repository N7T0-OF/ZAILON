import { CloudOff, Gamepad2, Radio, ShieldCheck, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { appVersion, getSelectedGame, getSelectedProfile, useStore } from '../../store/useStore'

export function StatusBar() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const discord = useStore(state => state.discordPresence)
  const lastUpdateError = useStore(state => state.lastUpdateError)
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected) }
  }, [])

  const activeMods = selectedProfile?.mods.filter(mod => mod.enabled).length ?? 0
  return <footer className="z-40 flex h-6 flex-shrink-0 items-center gap-1 border-t border-white/[0.04] bg-[#090b0b]/98 px-2 text-[11px] text-white/28">
    <StatusItem icon={Gamepad2} label={`${games.length} jeu${games.length !== 1 ? 'x' : ''}`} />
    <StatusItem icon={ShieldCheck} label={`${activeMods} mod${activeMods !== 1 ? 's' : ''} actif${activeMods !== 1 ? 's' : ''}`} />
    <StatusItem icon={Radio} label={selectedGame?.provider || 'Bibliothèque locale'} />
    <span className="flex-1" />
    <StatusItem icon={Radio} label={`Discord ${discord ? 'actif' : 'désactivé'}`} muted={!discord} />
    <StatusItem icon={lastUpdateError ? CloudOff : ShieldCheck} label={lastUpdateError ? 'Mise à jour en erreur' : `ZAILON ${appVersion}`} warning={Boolean(lastUpdateError)} />
    <StatusItem icon={online ? Wifi : CloudOff} label={online ? 'En ligne' : 'Hors ligne'} warning={!online} />
  </footer>
}

function StatusItem({ icon: Icon, label, muted = false, warning = false }: { icon: typeof Wifi; label: string; muted?: boolean; warning?: boolean }) {
  return <span className={`flex items-center gap-1 rounded px-1.5 py-1 ${warning ? 'text-amber-300/75' : muted ? 'text-white/22' : 'text-white/38'}`}><Icon size={9} /><span className="hidden sm:inline">{label}</span></span>
}
