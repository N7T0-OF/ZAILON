import { Globe, Activity, EyeOff, Info, BarChart2, MessageSquare, RefreshCw, Download, FolderOpen, Image, CheckCircle, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { Toggle } from '../UI/Toggle'
import { formatTime } from '../../utils'

const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
]

type Section = 'general' | 'updates' | 'resources' | 'stats' | 'about'

export function SettingsView() {
  const { nsfw, toggleNSFW, language, setLanguage, discordPresence, toggleDiscord, games, selectedGame } = useStore()
  const [section, setSection] = useState<Section>('general')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'uptodate' | 'available'>('idle')

  const totalPlaytime = games.reduce((acc, g) => acc + g.totalPlaytime, 0)

  const checkUpdate = () => {
    setUpdateStatus('checking')
    setTimeout(() => setUpdateStatus('uptodate'), 2000)
  }

  const MOCK_RESOURCES = [
    { game: 'Neverness to Everness', bg: true, icon: true, logo: false },
    { game: 'Genshin Impact', bg: true, icon: false, logo: false },
  ]

  return (
    <div className="flex h-full">
      {/* Nav */}
      <div className="w-32 border-r border-white/[0.05] py-3 flex flex-col gap-0.5 px-2 flex-shrink-0">
        {[
          { id: 'general', icon: Activity, label: 'General' },
          { id: 'updates', icon: RefreshCw, label: 'Updates' },
          { id: 'resources', icon: Image, label: 'Resources' },
          { id: 'stats', icon: BarChart2, label: 'Stats' },
          { id: 'about', icon: Info, label: 'About' },
        ].map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setSection(id as Section)}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-body transition-all ${
              section === id
                ? 'bg-gold/12 text-gold border border-gold/20'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04] border border-transparent'
            }`}>
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">

        {/* GENERAL */}
        {section === 'general' && (
          <div className="space-y-5">
            <div>
              <SectionLabel icon={<Globe size={12} />} label="Language" />
              <div className="grid grid-cols-3 gap-1.5">
                {LANGS.map(l => (
                  <button key={l.code} onClick={() => setLanguage(l.code)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-body text-center transition-all ${
                      language === l.code
                        ? 'bg-gold/15 text-gold border border-gold/25'
                        : 'bg-white/[0.04] text-white/40 hover:text-white/70 border border-white/[0.05] hover:border-white/[0.1]'
                    }`}>{l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel icon={<Activity size={12} />} label="Preferences" />
              <div className="space-y-2">
                <ToggleRow icon={<MessageSquare size={12} />} label="Discord Presence"
                  sub="Show ZAILON activity in Discord"
                  checked={discordPresence} onChange={toggleDiscord} />
                <ToggleRow icon={<EyeOff size={12} />} label="NSFW Content"
                  sub="Show adult mods in Explore"
                  checked={nsfw} onChange={toggleNSFW} />
              </div>
            </div>
          </div>
        )}

        {/* UPDATES */}
        {section === 'updates' && (
          <div className="space-y-4">
            <SectionLabel icon={<RefreshCw size={12} />} label="Application Updates" />

            {/* Version card */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/40 font-mono">Current Version</p>
                <p className="font-display font-bold text-base text-white">v1.0.0</p>
                <p className="text-[9px] text-white/25 font-mono mt-0.5">Released 18 May 2026</p>
              </div>
              <div className="text-right">
                {updateStatus === 'uptodate' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                    <CheckCircle size={12} /> Up to date
                  </div>
                )}
                {updateStatus === 'available' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-gold">
                    <AlertCircle size={12} /> Update available
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button onClick={checkUpdate}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-body font-medium border transition-all ${
                  updateStatus === 'checking'
                    ? 'text-white/40 border-white/[0.06] bg-white/[0.02] cursor-not-allowed'
                    : 'text-white/80 border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] hover:text-white'
                }`}>
                <RefreshCw size={12} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
              </button>

              {updateStatus === 'available' && (
                <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-body font-medium bg-gold text-ink-400 hover:bg-gold-bright transition-all">
                  <Download size={12} /> Download & Install Update
                </button>
              )}
            </div>

            {/* Update info */}
            <div className="space-y-1.5">
              <Row label="Last checked" value="Never" />
              <Row label="Update channel" value="Stable" />
              <Row label="Auto-check" value="On startup" />
            </div>

            {/* Notice */}
            <div className="p-3 rounded-lg bg-gold/[0.05] border border-gold/10">
              <p className="text-[9px] text-gold/60 leading-relaxed font-mono">
                Updates are additive — your mods, profiles, playtime and resources are never erased during an update.
                A backup is created automatically before each install.
              </p>
            </div>
          </div>
        )}

        {/* RESOURCES */}
        {section === 'resources' && (
          <div className="space-y-4">
            <SectionLabel icon={<Image size={12} />} label="Game Resources" />

            <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[10px] text-white/50 leading-relaxed">
                Customize each game with your own background, icon, logo or animated video — just like Steam.
                Files are automatically copied to your local Resources folder and never affect the originals.
              </p>
            </div>

            {/* Game resource cards */}
            <div className="space-y-2">
              {games.map(game => (
                <div key={game.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.09] transition-all">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-6 rounded overflow-hidden bg-ink-50">
                        <img src={game.backgroundArt} alt="" className="w-full h-full object-cover opacity-70" />
                      </div>
                      <p className="text-[10px] font-body font-medium text-white/80">{game.name}</p>
                    </div>
                    <button className="text-[9px] text-gold/50 hover:text-gold transition-colors font-mono">Reset all</button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: 'Background', sub: '.jpg .png .mp4', key: 'bg' },
                      { label: 'Icon', sub: '.png .ico', key: 'icon' },
                      { label: 'Logo / Banner', sub: '.png .svg', key: 'logo' },
                    ].map(({ label, sub, key }) => (
                      <button key={key}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg border border-dashed border-white/[0.08] hover:border-gold/30 hover:bg-gold/[0.03] transition-all group">
                        <FolderOpen size={12} className="text-white/20 group-hover:text-gold/50 transition-colors" />
                        <span className="text-[9px] font-body text-white/40 group-hover:text-white/70">{label}</span>
                        <span className="text-[8px] text-white/20 font-mono">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[9px] text-white/25 font-mono">
                Resources stored in: <span className="text-white/40">Data/Resources/Games/</span>
              </p>
            </div>
          </div>
        )}

        {/* STATS */}
        {section === 'stats' && (
          <div className="space-y-4">
            <SectionLabel icon={<BarChart2 size={12} />} label="Play Stats" />
            <div className="flex items-center justify-between p-3 rounded-xl bg-gold/[0.06] border border-gold/15 mb-3">
              <div>
                <p className="text-[9px] text-gold/60 font-mono uppercase tracking-widest">Total Playtime</p>
                <p className="font-display font-bold text-xl text-gold">{formatTime(totalPlaytime)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/30">{games.length} games</p>
                <p className="text-[9px] text-white/30">{games.reduce((a, g) => a + g.profiles.reduce((b, p) => b + p.mods.length, 0), 0)} mods</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {games.sort((a, b) => b.totalPlaytime - a.totalPlaytime).map(game => {
                const pct = totalPlaytime > 0 ? (game.totalPlaytime / totalPlaytime) * 100 : 0
                return (
                  <div key={game.id} className="py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-body text-white/70">{game.name}</span>
                      <span className="text-[10px] font-mono text-gold/70">{formatTime(game.totalPlaytime)}</span>
                    </div>
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full bg-gold/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ABOUT */}
        {section === 'about' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-gold/[0.04] border border-gold/10">
              <div className="w-10 h-10 rounded-xl bg-gold flex items-center justify-center flex-shrink-0">
                <span className="font-display font-black text-ink-400 text-lg">Z</span>
              </div>
              <div>
                <p className="font-display font-bold text-base text-white">ZAILON</p>
                <p className="text-[10px] text-white/40">Universal Mod Launcher</p>
                <p className="text-[10px] text-gold/60 font-mono mt-0.5">v1.0.0 — Stable</p>
              </div>
            </div>
            <div className="space-y-2">
              <Row label="Author" value="@souanpt" />
              <Row label="GitHub" value="Sankaiii/ZAILON" />
              <Row label="License" value="Open Source" />
              <Row label="Built with" value="React · TypeScript · Vite" />
              <Row label="Desktop" value="Tauri (coming soon)" />
              <Row label="Platforms" value="Windows · Linux · macOS" />
            </div>
            <div className="pt-2 border-t border-white/[0.05]">
              <p className="text-[9px] text-white/20 font-mono text-center">
                ZAILON is not affiliated with any game studio or mod platform.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-gold/60">{icon}</span>
      <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{label}</span>
    </div>
  )
}

function ToggleRow({ icon, label, sub, checked, onChange }: { icon: React.ReactNode; label: string; sub: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
      <div className="flex items-center gap-2">
        <span className="text-white/40">{icon}</span>
        <div>
          <p className="text-[10px] font-body text-white/70">{label}</p>
          <p className="text-[9px] text-white/30">{sub}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} size="sm" />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
      <span className="text-[9px] font-mono text-white/30">{label}</span>
      <span className="text-[10px] font-body text-white/60">{value}</span>
    </div>
  )
}
