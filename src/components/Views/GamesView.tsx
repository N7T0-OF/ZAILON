import { FolderOpen, FolderPlus, Plus, Radar, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getSelectedGame, getSelectedProfile, useStore } from '../../store/useStore'
import { pickExecutable, pickFolder } from '../../lib/native'
import { ModCard } from '../UI/ModCard'
import { formatTime, timeAgo } from '../../utils'

type Tab = 'mods' | 'profiles' | 'settings'

export function GamesView() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const setSelectedProfile = useStore(state => state.setSelectedProfile)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const addDetectedGames = useStore(state => state.addDetectedGames)
  const removeGame = useStore(state => state.removeGame)
  const setGamePath = useStore(state => state.setGamePath)
  const setModsPath = useStore(state => state.setModsPath)
  const addProfile = useStore(state => state.addProfile)
  const scanMods = useStore(state => state.scanMods)
  const toggleMod = useStore(state => state.toggleMod)
  const deleteMod = useStore(state => state.deleteMod)
  const [tab, setTab] = useState<Tab>('mods')
  const [search, setSearch] = useState('')
  const [profileName, setProfileName] = useState('')

  const filteredMods = selectedProfile?.mods.filter(mod => mod.name.toLowerCase().includes(search.toLowerCase())) ?? []

  if (!selectedGame || !selectedProfile) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-white/50">Add a game to start managing real mod files.</p><button onClick={() => void addGameFromExecutable()} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-ink-400">Add a game</button></div>
  }

  const browseExecutable = async () => {
    const path = await pickExecutable()
    if (path) await setGamePath(selectedGame.id, path)
  }
  const browseModsFolder = async () => {
    const path = await pickFolder()
    if (path) setModsPath(selectedGame.id, path)
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-40 flex-col border-r border-white/[0.05]">
        <div className="flex items-center justify-between px-2.5 pb-2 pt-3"><span className="text-[9px] font-mono uppercase tracking-widest text-white/30">Games</span><button onClick={() => void addGameFromExecutable()} className="text-white/40 hover:text-gold"><Plus size={13} /></button></div>
        <div className="flex-1 space-y-1 overflow-y-auto px-1.5">
          {games.map(game => <button key={game.id} onClick={() => setSelectedGame(game.id)} className={`w-full rounded-md px-2 py-2 text-left text-[10px] ${game.id === selectedGame.id ? 'border border-gold/20 bg-gold/10 text-gold' : 'text-white/55 hover:bg-white/[0.04]'}`}><p className="truncate font-medium">{game.name}</p><p className="mt-0.5 font-mono text-[8px] text-white/25">{game.profiles.length} profile{game.profiles.length !== 1 ? 's' : ''} · {formatTime(game.totalPlaytime)}</p></button>)}
        </div>
        <button onClick={() => void addDetectedGames()} className="m-2 flex items-center justify-center gap-1 rounded border border-white/[0.08] py-1.5 text-[9px] text-white/45 hover:text-white/75"><Radar size={10} /> Detect games</button>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/[0.05] px-3 pb-2 pt-3">
          <div className="flex items-start justify-between"><div><h1 className="font-display text-base font-bold text-white">{selectedGame.name}</h1>{selectedGame.lastPlayed && <p className="text-[9px] text-white/30">Played {timeAgo(selectedGame.lastPlayed)}</p>}</div><div className="flex gap-1"><button onClick={() => void scanMods(selectedGame.id)} title="Scan mods folder" className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-gold"><RefreshCw size={12} /></button><button onClick={() => void browseModsFolder()} title="Choose mods folder" className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-gold"><FolderOpen size={12} /></button><button onClick={() => removeGame(selectedGame.id)} title="Remove from library" className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-red-400"><Trash2 size={12} /></button></div></div>
          <div className="mt-2 flex items-center gap-1">{selectedGame.profiles.map(profile => <button key={profile.id} onClick={() => void setSelectedProfile(profile.id)} className={`rounded px-2 py-1 text-[9px] ${profile.id === selectedProfile.id ? 'bg-gold/15 text-gold' : 'text-white/40 hover:bg-white/[0.04]'}`}>{profile.name} <span className="opacity-60">{profile.mods.filter(mod => mod.enabled).length}</span></button>)}</div>
        </header>
        <nav className="flex items-center border-b border-white/[0.05] px-3"><div className="flex gap-1">{(['mods', 'profiles', 'settings'] as Tab[]).map(item => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-2 py-1.5 text-[10px] capitalize ${tab === item ? 'border-gold text-gold' : 'border-transparent text-white/35 hover:text-white/70'}`}>{item}</button>)}</div>{tab === 'mods' && <div className="relative ml-auto"><Search size={10} className="absolute left-2 top-1.5 text-white/30" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search" className="w-28 rounded border border-white/[0.07] bg-white/[0.03] py-1 pl-5 pr-2 text-[10px] text-white/70 outline-none focus:border-gold/30" /></div>}</nav>
        {tab === 'mods' && <div className="flex-1 space-y-1 overflow-y-auto p-3">{filteredMods.length ? filteredMods.map(mod => <ModCard key={mod.id} mod={mod} onToggle={() => void toggleMod(mod.id)} onDelete={() => void deleteMod(mod.id)} />) : <div className="flex h-32 flex-col items-center justify-center gap-2 text-[10px] text-white/35"><FolderPlus size={17} /><span>No mod found. Select a folder and scan it.</span></div>}</div>}
        {tab === 'profiles' && <div className="flex-1 p-3"><p className="mb-3 text-[10px] text-white/45">A profile keeps a named set of mod states. Applying it updates the real files in the selected mods folder.</p><div className="flex gap-2"><input value={profileName} onChange={event => setProfileName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { addProfile(profileName); setProfileName('') } }} placeholder="New profile name" className="flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[10px] text-white/70 outline-none focus:border-gold/30" /><button onClick={() => { addProfile(profileName); setProfileName('') }} className="rounded bg-gold px-2 text-[10px] font-semibold text-ink-400">Create</button></div></div>}
        {tab === 'settings' && <div className="flex-1 space-y-3 p-3"><Field label="Game executable" value={selectedGame.execPath || ''} placeholder="Select the game executable" onChange={value => void setGamePath(selectedGame.id, value)} onBrowse={() => void browseExecutable()} /><Field label="Mods folder" value={selectedGame.modsPath || ''} placeholder="Select the mods folder" onChange={value => setModsPath(selectedGame.id, value)} onBrowse={() => void browseModsFolder()} /><p className="pt-1 text-[10px] font-mono text-white/35">Total playtime: {formatTime(selectedGame.totalPlaytime)}</p></div>}
      </section>
    </div>
  )
}

function Field({ label, value, placeholder, onChange, onBrowse }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onBrowse: () => void }) {
  return <div><label className="mb-1 block text-[9px] font-mono uppercase tracking-widest text-white/30">{label}</label><div className="flex gap-1.5"><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="flex-1 rounded border border-white/[0.07] bg-white/[0.04] px-2 py-1.5 text-[10px] text-white/70 outline-none focus:border-gold/30" /><button onClick={onBrowse} className="rounded border border-white/[0.08] bg-white/[0.05] px-2 text-[10px] text-white/55 hover:text-white">Browse</button></div></div>
}
