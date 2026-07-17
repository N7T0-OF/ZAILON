import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, RefreshCw, StickyNote, Trash2 } from 'lucide-react'
import { Mod } from '../../types'
import { LOADER_COLORS, PLATFORM_COLORS } from '../../utils'
import { Toggle } from './Toggle'

interface ModCardProps {
  mod: Mod
  onToggle: () => void
  onDelete?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onNoteChange?: (note: string) => void
}

const conflictLabel = { overwrites: 'Écrase', overwritten: 'Écrasé', mixed: 'Conflit mixte' } as const

export function ModCard({ mod, onToggle, onDelete, onMoveUp, onMoveDown, onNoteChange }: ModCardProps) {
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
        <div className="flex items-center gap-1.5"><p className="text-xs font-body font-medium text-white/90 truncate leading-tight">{mod.name}</p>{mod.conflict && mod.conflict !== 'none' && <span title={`${mod.conflictCount || 0} fichier(s) partagé(s) avec un autre mod actif`} className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] ${mod.conflict === 'overwrites' ? 'bg-amber-400/10 text-amber-200' : mod.conflict === 'overwritten' ? 'bg-red-400/10 text-red-200' : 'bg-purple-400/10 text-purple-200'}`}><AlertTriangle size={9} /> {conflictLabel[mod.conflict]}</span>}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-mono text-white/30">P{(mod.priority ?? 0) + 1}</span>
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
        {onNoteChange && <button onClick={() => { const note = window.prompt(`Note pour ${mod.name}`, mod.note || ''); if (note !== null) onNoteChange(note) }} title={mod.note ? `Note : ${mod.note}` : 'Ajouter une note'} className={`opacity-0 transition-opacity group-hover:opacity-100 ${mod.note ? 'text-gold/70' : 'text-white/30 hover:text-white/60'}`}><StickyNote size={11} /></button>}
        {(onMoveUp || onMoveDown) && <span className="flex items-center rounded border border-white/[0.07] opacity-0 transition-opacity group-hover:opacity-100"><button onClick={onMoveUp} disabled={!onMoveUp} title="Monter dans l’ordre" className="p-0.5 text-white/35 hover:text-gold disabled:opacity-20"><ArrowUp size={10} /></button><button onClick={onMoveDown} disabled={!onMoveDown} title="Descendre dans l’ordre" className="p-0.5 text-white/35 hover:text-gold disabled:opacity-20"><ArrowDown size={10} /></button></span>}
        <Toggle checked={mod.enabled} onChange={onToggle} size="sm" />
      </div>
    </div>
  )
}
