import { CheckCircle2, Database, Download, Info, RefreshCw, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { appVersion, useStore } from '../../store/useStore'
import { native } from '../../lib/native'
import { formatTime } from '../../utils'

type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'error'

export function SettingsView() {
  const games = useStore(state => state.games)
  const language = useStore(state => state.language)
  const setLanguage = useStore(state => state.setLanguage)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [latest, setLatest] = useState<string>()
  const totalPlaytime = games.reduce((sum, game) => sum + game.totalPlaytime, 0)

  const checkUpdates = async () => {
    setStatus('checking')
    try {
      const response = await fetch('https://api.github.com/repos/N7T0-OF/ZAILON/releases/latest', { signal: AbortSignal.timeout(5_000) })
      if (response.status === 404) { setStatus('uptodate'); return }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const release = await response.json() as { tag_name?: string }
      const version = release.tag_name?.replace(/^v/, '')
      setLatest(version)
      setStatus(version && version !== appVersion ? 'available' : 'uptodate')
    } catch {
      setStatus('error')
    }
  }

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-5"><h1 className="font-display text-lg font-bold text-white">Settings</h1><p className="text-[10px] text-white/35">Native launcher configuration and release updates</p></div>
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Settings2 size={13} /><h2 className="text-[10px] font-mono uppercase tracking-widest">Preferences</h2></div><label className="block text-[10px] text-white/45">Language<select value={language} onChange={event => setLanguage(event.target.value)} className="mt-1.5 block rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[10px] text-white/70"><option value="en">English</option><option value="fr">Français</option></select></label><p className="mt-3 text-[9px] leading-relaxed text-white/25">Game entries, profiles and settings are saved locally in this launcher. ZAILON does not upload your game paths or mod files.</p></section>
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><RefreshCw size={13} /><h2 className="text-[10px] font-mono uppercase tracking-widest">Application updates</h2></div><div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2"><div><p className="text-[9px] font-mono text-white/30">Installed version</p><p className="text-sm font-semibold text-white">v{appVersion}</p></div>{status === 'uptodate' && <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={12} /> Up to date</span>}{status === 'available' && <span className="text-[10px] text-gold">v{latest} available</span>}{status === 'error' && <span className="text-[10px] text-red-300">Unable to check</span>}</div><div className="mt-2 flex gap-2"><button onClick={() => void checkUpdates()} disabled={status === 'checking'} className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] text-white/70 hover:text-white disabled:opacity-40"><RefreshCw size={11} className={status === 'checking' ? 'animate-spin' : ''} /> Check for updates</button><a href="https://github.com/N7T0-OF/ZAILON/releases" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded bg-gold px-3 py-1.5 text-[10px] font-semibold text-ink-400"><Download size={11} /> Releases</a></div></section>
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Database size={13} /><h2 className="text-[10px] font-mono uppercase tracking-widest">Library statistics</h2></div><div className="grid grid-cols-3 gap-2 text-center"><Stat label="Games" value={String(games.length)} /><Stat label="Mods" value={String(games.reduce((sum, game) => sum + game.profiles.reduce((total, profile) => total + profile.mods.length, 0), 0))} /><Stat label="Playtime" value={formatTime(totalPlaytime)} /></div></section>
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-2 flex items-center gap-2 text-gold/70"><Info size={13} /><h2 className="text-[10px] font-mono uppercase tracking-widest">ZAILON</h2></div><p className="text-[10px] text-white/55">Universal Mod Launcher · v{appVersion}</p><p className="mt-1 text-[9px] text-white/25">Runtime: {native.isDesktop() ? 'Tauri native desktop application' : 'web preview (native game operations disabled)'}</p></section>
    </div>
  </div>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[9px] text-white/30">{label}</p><p className="mt-0.5 text-xs font-semibold text-white/80">{value}</p></div>
}
