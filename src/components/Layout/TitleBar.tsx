import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  return (
    <div className="flex items-center justify-between h-7 px-3 bg-ink-400/80 border-b border-white/[0.05] flex-shrink-0 select-none">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-3.5 h-3.5 rounded-sm bg-gold flex items-center justify-center">
          <span className="text-[7px] font-display font-black text-ink-400">Z</span>
        </div>
        <span className="text-[10px] font-display font-bold tracking-[0.15em] text-gold/80 uppercase">
          ZAILON
        </span>
        <span className="text-[9px] text-white/20 font-mono">v1.0.0</span>
      </div>

      {/* Drag area */}
      <div className="flex-1 h-full cursor-default" />

      {/* Window controls */}
      <div className="flex items-center gap-0.5">
        <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors">
          <Minus size={9} className="text-white/40" />
        </button>
        <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors">
          <Square size={8} className="text-white/40" />
        </button>
        <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/80 transition-colors group">
          <X size={9} className="text-white/40 group-hover:text-white" />
        </button>
      </div>
    </div>
  )
}
