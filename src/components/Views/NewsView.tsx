import { ArrowUp, Package, Zap } from 'lucide-react'

const RELEASE = [
  { icon: Package, color: '#e8b84b', text: 'Native installer pipeline for Windows, Linux and macOS GitHub Releases.' },
  { icon: Zap, color: '#60d875', text: 'Real local game library: executable picker, Steam scan, mod-folder configuration and launch.' },
  { icon: Zap, color: '#60d875', text: 'Real mod filesystem actions: scan, enable, disable, delete and secure ZIP extraction.' },
  { icon: ArrowUp, color: '#60b4f7', text: 'GameBanana browsing uses live API data instead of placeholder mod cards.' },
  { icon: ArrowUp, color: '#60b4f7', text: 'Profiles and launcher preferences persist locally on the device.' },
]

export function NewsView() {
  return <div className="h-full overflow-y-auto p-4"><div className="mb-4"><h1 className="font-display text-lg font-bold tracking-wide text-white">Release notes</h1><p className="text-[10px] font-mono text-white/30">ZAILON Universal Mod Launcher · v1.0.0</p></div><section><div className="mb-3 flex items-center gap-2"><span className="font-display text-sm font-bold text-gold">1.0.0</span><span className="rounded-full bg-gold/80 px-2 py-0.5 text-[9px] font-mono text-ink-400">Native release</span></div><div className="space-y-1">{RELEASE.map(({ icon: Icon, color, text }) => <div key={text} className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2"><Icon size={11} className="mt-0.5 shrink-0" style={{ color }} /><p className="text-[10px] leading-relaxed text-white/75">{text}</p></div>)}</div></section><p className="mt-6 border-t border-white/[0.05] pt-4 text-center text-[9px] font-mono text-white/20">github.com/N7T0-OF/ZAILON</p></div>
}
