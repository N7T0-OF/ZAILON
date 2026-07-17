import { Zap, Bug, ArrowUp, Trash2, Clock, Package } from 'lucide-react'
import { NewsItem } from '../../types'

const NEWS: NewsItem[] = [
  {
    version: '1.1.0',
    date: 'Coming Soon',
    items: [
      { type: 'add', text: 'Native desktop builds — Windows .exe, Linux .AppImage, macOS .dmg' },
      { type: 'add', text: 'Built-in auto-updater — check, download and install updates from Settings' },
      { type: 'add', text: 'Resources system — drag & drop custom artwork, backgrounds and videos per game (like Steam)' },
      { type: 'add', text: 'Real mod installation — automatic extraction and copy to game mods folder' },
      { type: 'add', text: 'Auto game detection — scans Steam, Epic Games, GOG, standalone installs' },
      { type: 'add', text: 'Conflict detector — visual warning when two mods overwrite the same file' },
      { type: 'add', text: 'Snapshot system — create restore points before installing mods' },
      { type: 'add', text: 'Safe mode — disable last installed mods if game crashes' },
      { type: 'add', text: 'Offline mode — full functionality without internet (except Explore)' },
      { type: 'improve', text: 'Migration system — updates never erase user data, mods, playtime or presets' },
      { type: 'improve', text: 'Portable mode — run entirely from a folder, no install required' },
    ],
  },
  {
    version: '1.0.0',
    date: '18 May 2026',
    items: [
      { type: 'add', text: 'Initial release of ZAILON Universal Mod Launcher' },
      { type: 'add', text: 'Support for UE5, GIMI, ZZMI, SRMI, WWMI, EFMI game profiles' },
      { type: 'add', text: 'GameBanana, Nexus Mods, CurseForge and AyakaMods integration in Explore' },
      { type: 'add', text: 'One-click mod install with automatic extraction' },
      { type: 'add', text: 'Profile system — multiple mod sets per game' },
      { type: 'add', text: 'Playtime tracking per game and profile' },
      { type: 'add', text: 'Discord Rich Presence support' },
      { type: 'add', text: 'NSFW filter (disabled by default)' },
      { type: 'add', text: 'Grid and list view for mod browser' },
      { type: 'add', text: 'Created by @souanpt' },
    ],
  },
]

const TYPE_META = {
  add: { icon: Zap, color: '#e8b84b', label: 'New', bg: 'rgba(232,184,75,0.07)' },
  fix: { icon: Bug, color: '#60d875', label: 'Fix', bg: 'rgba(96,216,117,0.07)' },
  improve: { icon: ArrowUp, color: '#60b4f7', label: 'Improved', bg: 'rgba(96,180,247,0.07)' },
  remove: { icon: Trash2, color: '#f76060', label: 'Removed', bg: 'rgba(247,96,96,0.07)' },
}

export function NewsView() {
  return (
    <div className="flex flex-col h-full p-4 overflow-y-auto scrollbar-hide">
      <div className="mb-4">
        <h1 className="font-display font-bold text-lg text-white tracking-wide">Release Notes</h1>
        <p className="text-[10px] text-white/30 font-mono">ZAILON Universal Mod Launcher · by @souanpt</p>
      </div>

      <div className="space-y-6">
        {NEWS.map((release, idx) => (
          <div key={release.version}>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm text-gold">{release.version}</span>
                {idx === 0 && (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-ink-400 bg-gold/80 px-2 py-0.5 rounded-full">
                    <Clock size={8} /> Planned
                  </span>
                )}
                {idx === 1 && (
                  <span className="text-[9px] font-mono text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Package size={8} /> Stable
                  </span>
                )}
              </div>
              <div className="flex-1 h-px bg-white/[0.05]" />
              <span className="text-[9px] text-white/25 font-mono">{release.date}</span>
            </div>

            <div className="space-y-1">
              {release.items.map((item, i) => {
                const meta = TYPE_META[item.type]
                const Icon = meta.icon
                return (
                  <div key={i} className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg"
                    style={{ backgroundColor: meta.bg }}>
                    <Icon size={11} className="flex-shrink-0 mt-0.5" style={{ color: meta.color }} />
                    <p className="text-[10px] font-body text-white/75 leading-relaxed">{item.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-white/[0.05]">
        <p className="text-[9px] text-white/20 text-center font-mono">
          Created by @souanpt · github.com/Sankaiii/ZAILON
        </p>
      </div>
    </div>
  )
}
