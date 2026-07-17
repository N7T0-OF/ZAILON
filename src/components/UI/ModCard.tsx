import { Trash2, RefreshCw, ExternalLink } from 'lucide-react'
import { Mod } from '../../types'
import { LOADER_COLORS, PLATFORM_COLORS } from '../../utils'
import { Toggle } from './Toggle'

interface ModCardProps {
  mod: Mod
  onToggle: () => void
  onDelete?: () => void
}

export function ModCard({ mod, onToggle, onDelete }: ModCardProps) {
  const loaderColor = LOADER_COLORS[mod.loader] || '#8888aa'
  const platformColor = mod.source ? PLATFORM_COLORS[mod.source] : '#8888aa'

  return (
    <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-150 ${
      mod.enabled
        ? 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.06] hover:border-gold/20'
        : 'bg-white/[0.02] border-white/[0.03] opacity-60 hover:opacity-80'
    }`}>
      {/* Loader badge */}
      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ color: loaderColor, backgroundColor: `${loaderColor}20`, border: `1px solid ${loaderColor}40` }}>
        {mod.loader}
      </span>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-body font-medium text-white/90 truncate leading-tight">{mod.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {mod.author && <span className="text-[10px] text-white/35">{mod.author}</span>}
          {mod.version && <span className="text-[10px] text-white/25">v{mod.version}</span>}
          {mod.size && <span className="text-[10px] text-white/25">{mod.size}</span>}
          {mod.source && (
            <span className="text-[9px] font-medium" style={{ color: platformColor }}>
              {mod.source === 'local' ? 'local' : mod.source}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {mod.autoUpdate && (
          <RefreshCw size={10} className="text-gold/40" />
        )}
        {mod.sourceUrl && (
          <button className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink size={11} className="text-white/30 hover:text-white/60" />
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 size={11} className="text-white/30 hover:text-red-400" />
          </button>
        )}
        <Toggle checked={mod.enabled} onChange={onToggle} size="sm" />
      </div>
    </div>
  )
}
