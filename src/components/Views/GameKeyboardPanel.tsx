import { Check, Copy, Download, Keyboard, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { AZERTY_TO_QWERTY, effectiveInputProfile, effectiveLayout, KEY_OPTIONS, LAYOUT_LABELS, presetForLayout, QWERTZ_TO_QWERTY, QWERTY_TO_AZERTY } from '../../lib/keyboardPresets'
import { useStore } from '../../store/useStore'
import type { Game, GameInputProfile, GameKeyboardLayout, GameKeyMapping } from '../../types'
import { Toggle } from '../UI/Toggle'

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function GameKeyboardPanel({ game, profile, embedded = false }: { game: Game; profile?: { id: string; name: string }; embedded?: boolean }) {
  const saveGameInputProfile = useStore(state => state.saveGameInputProfile)
  const deleteGameInputProfile = useStore(state => state.deleteGameInputProfile)
  const setGameKeyboardLayout = useStore(state => state.setGameKeyboardLayout)
  const [editingId, setEditingId] = useState<string | undefined>(game.keyboardProfiles?.[0]?.id)
  const [linkTarget, setLinkTarget] = useState('')

  const profiles = game.keyboardProfiles || []
  const editing = profiles.find(item => item.id === editingId) || profiles[0]
  const effective = effectiveInputProfile(game, profile?.id)
  const effectiveLayoutValue = effectiveLayout(game, profile?.id)

  const updateProfile = (patch: Partial<GameInputProfile>) => {
    if (!editing) return
    saveGameInputProfile({ ...editing, ...patch, updatedAt: Date.now() })
  }

  const createProfile = (profileId?: string) => {
    const targetName = profileId ? game.profiles.find(item => item.id === profileId)?.name : undefined
    const now = Date.now()
    const next: GameInputProfile = {
      id: createId(),
      gameId: game.id,
      profileId,
      name: targetName ? `Clavier · ${targetName}` : 'Clavier principal',
      layout: 'azerty',
      mapping: [...AZERTY_TO_QWERTY],
      enabled: true,
      activationMode: 'while-playing',
      restoreOnExit: true,
      createdAt: now,
      updatedAt: now,
    }
    saveGameInputProfile(next)
    setEditingId(next.id)
  }

  const duplicateProfile = (source: GameInputProfile) => {
    const now = Date.now()
    const next: GameInputProfile = {
      ...source,
      id: createId(),
      name: `${source.name} (copie)`,
      createdAt: now,
      updatedAt: now,
    }
    saveGameInputProfile(next)
    setEditingId(next.id)
  }

  const applyPreset = (mapping: GameKeyMapping[], layout: GameKeyboardLayout) => {
    updateProfile({ mapping: [...mapping], layout })
  }

  const exportProfile = (source: GameInputProfile) => {
    const blob = new Blob([JSON.stringify(source, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${game.name.replace(/[^\w-]+/g, '-')}-entrees-${source.name.replace(/[^\w-]+/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<GameInputProfile>
        const mapping = Array.isArray(parsed.mapping)
          ? (parsed.mapping as GameKeyMapping[]).filter(item => item && typeof item.physical === 'string' && typeof item.gameKey === 'string')
          : []
        const now = Date.now()
        saveGameInputProfile({
          id: createId(),
          gameId: game.id,
          profileId: typeof parsed.profileId === 'string' ? parsed.profileId : undefined,
          name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Clavier importé',
          layout: (['qwerty', 'azerty', 'qwertz', 'custom'] as const).includes(parsed.layout as GameKeyboardLayout) ? parsed.layout as GameKeyboardLayout : 'custom',
          mapping,
          enabled: parsed.enabled !== false,
          activationMode: 'while-playing',
          restoreOnExit: true,
          createdAt: now,
          updatedAt: now,
        })
      } catch {
        window.alert('Import impossible : le fichier JSON n’est pas un profil d’entrée ZAILON valide.')
      }
    }
    reader.readAsText(file)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  return <div className={embedded ? 'flex min-h-0 flex-1 flex-col gap-3' : 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4'}>
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-gold/75"><Keyboard size={16} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-white/80">Disposition virtuelle du jeu</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-white/38">Traduit les touches uniquement pour ce jeu (ex. AZERTY ↔ QWERTY). Aucune langue Windows n’est ajoutée ni modifiée : le bureau, Discord et ZAILON gardent leurs touches.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {(['qwerty', 'azerty', 'qwertz', 'custom'] as GameKeyboardLayout[]).map(layout => (
          <button key={layout} type="button" onClick={() => setGameKeyboardLayout(game.id, layout)} className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${game.keyboardLayout === layout ? 'border-gold/40 bg-gold/[0.08] text-gold' : 'border-white/[0.08] text-white/48 hover:border-white/18 hover:text-white/75'}`}>
            {game.keyboardLayout === layout && <Check size={12} />}{LAYOUT_LABELS[layout]}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-gold/12 bg-gold/[0.03] px-3 py-2 text-[11px] text-white/50">
        <span className="text-white/38">Valeur effective : </span><span className="font-semibold text-gold">{LAYOUT_LABELS[effectiveLayoutValue]}</span>
        <span className="text-white/38"> · Source : </span><span className="text-white/60">{effective ? (effective.profileId ? `Profil « ${game.profiles.find(item => item.id === effective.profileId)?.name || 'supprimé'} »` : 'Ce jeu') : 'Défaut (aucune traduction)'}</span>
      </div>
    </section>

    <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-white/80">Profils d’entrée</h2>
          <p className="mt-0.5 text-[11px] text-white/38">Priorité : profil de mods &gt; jeu &gt; défaut. Un profil d’entrée peut être lié à un profil de mods précis.</p>
        </div>
        <div className="flex gap-2">
          <select value={linkTarget} onChange={event => { const value = event.target.value; setLinkTarget(''); if (value) createProfile(value) }} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2.5 py-2 text-[11px] text-white/55">
            <option value="">Lier à un profil de mods…</option>
            {game.profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" onClick={() => createProfile()} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[#101313]"><Plus size={13} />Profil pour tout le jeu</button>
        </div>
      </div>

      {profiles.length === 0
        ? <div className="mt-3 flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.09] text-center">
          <Keyboard size={18} className="text-white/25" />
          <p className="mt-2 text-xs text-white/52">Aucun profil d’entrée. Créez « AZERTY → QWERTY » en un clic :</p>
          <button type="button" onClick={() => createProfile()} className="mt-3 flex items-center gap-1.5 rounded-lg border border-gold/25 px-3 py-2 text-[11px] font-semibold text-gold"><Plus size={13} />Créer un profil AZERTY → QWERTY</button>
        </div>
        : <div className="mt-3 space-y-2">{profiles.map(item => {
          const active = editing?.id === item.id
          return <div key={item.id} className={`rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-gold/25 bg-gold/[0.045]' : 'border-white/[0.06] bg-black/15'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input value={item.name} onChange={event => saveGameInputProfile({ ...item, name: event.target.value, updatedAt: Date.now() })} className="min-w-40 flex-1 bg-transparent text-xs font-medium text-white/80 outline-none" />
              <select value={item.profileId || ''} onChange={event => saveGameInputProfile({ ...item, profileId: event.target.value || undefined, updatedAt: Date.now() })} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-[11px] text-white/55">
                <option value="">Jeu entier</option>
                {game.profiles.map(profileItem => <option key={profileItem.id} value={profileItem.id}>{profileItem.name}</option>)}
              </select>
              <span className="rounded-full bg-white/[0.035] px-2 py-1 font-mono text-[10px] text-white/38">{item.layout.toUpperCase()} · {item.mapping.length} traduction(s)</span>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => setEditingId(active ? undefined : item.id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] ${active ? 'bg-gold/15 text-gold' : 'text-white/42 hover:bg-white/[0.06] hover:text-white/75'}`}>{active ? 'Fermer l’éditeur' : 'Modifier'}</button>
                <button type="button" onClick={() => duplicateProfile(item)} title="Dupliquer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Copy size={13} /></button>
                <button type="button" onClick={() => exportProfile(item)} title="Exporter (JSON)" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Download size={13} /></button>
                <button type="button" onClick={() => deleteGameInputProfile(game.id, item.id)} title="Supprimer" className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-white/[0.05] pt-2 text-[11px] text-white/38">
              <label className="flex items-center gap-2"><Toggle size="sm" checked={item.enabled} onChange={() => saveGameInputProfile({ ...item, enabled: !item.enabled, updatedAt: Date.now() })} />Actif</label>
              <label className="flex items-center gap-2"><Toggle size="sm" checked={item.restoreOnExit} onChange={() => saveGameInputProfile({ ...item, restoreOnExit: !item.restoreOnExit, updatedAt: Date.now() })} />Restaurer à la fermeture</label>
            </div>
          </div>
        })}</div>}
    </section>

    {editing && <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-white/80">Éditeur de touches — {editing.name}</h2>
          <p className="mt-0.5 text-[11px] text-white/38">Touche physique pressée → touche envoyée au jeu. L’application au lancement sera fournie par les backends Phase 2 (bindings du jeu, puis traduction runtime).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => applyPreset(AZERTY_TO_QWERTY, 'azerty')} className="rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold">Preset AZERTY → QWERTY</button>
          <button type="button" onClick={() => applyPreset(QWERTY_TO_AZERTY, 'custom')} className="rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold">Preset QWERTY → AZERTY</button>
          <button type="button" onClick={() => applyPreset(QWERTZ_TO_QWERTY, 'qwertz')} className="rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold">Preset QWERTZ → QWERTY</button>
          <button type="button" onClick={() => applyPreset([], 'custom')} className="flex items-center gap-1 rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold"><RefreshCw size={11} />Natif (aucune traduction)</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold"><Upload size={11} />Importer</button>
          <button type="button" onClick={() => exportProfile(editing)} className="flex items-center gap-1 rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold"><Download size={11} />Exporter</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = '' }} />
        </div>
      </div>

      {editing.mapping.length === 0
        ? <div className="mt-3 flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.09] text-center">
          <p className="text-xs text-white/45">Aucune traduction : le jeu reçoit les touches physiques telles quelles.</p>
          <button type="button" onClick={() => applyPreset(AZERTY_TO_QWERTY, 'azerty')} className="mt-2 text-[11px] font-semibold text-gold">Appliquer le preset AZERTY → QWERTY</button>
        </div>
        : <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">{editing.mapping.map((entry, index) => (
          <div key={`${entry.physical}-${index}`} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-2 py-2">
            <span className="text-[11px] text-white/34">Physique</span>
            <select value={entry.physical} onChange={event => { const next = [...editing.mapping]; next[index] = { ...next[index], physical: event.target.value }; updateProfile({ mapping: next }) }} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#101313] px-2 py-1.5 font-mono text-[11px] text-gold outline-none">
              {KEY_OPTIONS.map(key => <option key={key} value={key}>{key}</option>)}
            </select>
            <span className="text-white/34">→</span>
            <select value={entry.gameKey} onChange={event => { const next = [...editing.mapping]; next[index] = { ...next[index], gameKey: event.target.value }; updateProfile({ mapping: next }) }} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#101313] px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none">
              {KEY_OPTIONS.map(key => <option key={key} value={key}>{key}</option>)}
            </select>
            <button type="button" onClick={() => updateProfile({ mapping: editing.mapping.filter((_, itemIndex) => itemIndex !== index) })} className="rounded p-1 text-white/28 hover:text-red-300"><Trash2 size={12} /></button>
          </div>
        ))}</div>}
      <button type="button" onClick={() => updateProfile({ mapping: [...editing.mapping, { physical: 'Z', gameKey: 'W' }] })} className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55 hover:border-gold/25 hover:text-gold"><Plus size={12} />Ajouter une traduction</button>
    </section>}
  </div>
}
