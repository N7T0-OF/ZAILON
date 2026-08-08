import { Check, Copy, Download, Keyboard, Play, Plus, RefreshCw, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { INPUT_BACKENDS, planInputBackend } from '../../lib/inputBackends'
import { AZERTY_TO_QWERTY, effectiveInputProfile, effectiveLayout, KEY_OPTIONS, LAYOUT_LABELS, presetForLayout, PRESET_GROUPS, QWERTZ_TO_QWERTY, QWERTY_TO_AZERTY } from '../../lib/keyboardPresets'
import { useStore } from '../../store/useStore'
import type { Game, GameInputProfile, GameKeyboardLayout, GameKeyMapping } from '../../types'
import { Toggle } from '../UI/Toggle'

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function GameKeyboardPanel({ game, profile, embedded = false }: { game: Game; profile?: { id: string; name: string }; embedded?: boolean }) {
  const saveGameInputProfile = useStore(state => state.saveGameInputProfile)
  const deleteGameInputProfile = useStore(state => state.deleteGameInputProfile)
  const setGameKeyboardLayout = useStore(state => state.setGameKeyboardLayout)
  const remapSuspendShortcut = useStore(state => state.remapSuspendShortcut)
  const setRemapSuspendShortcut = useStore(state => state.setRemapSuspendShortcut)
  const remapKillSwitchShortcut = useStore(state => state.remapKillSwitchShortcut)
  const setRemapKillSwitchShortcut = useStore(state => state.setRemapKillSwitchShortcut)
  const [editingId, setEditingId] = useState<string | undefined>(game.keyboardProfiles?.[0]?.id)
  const [linkTarget, setLinkTarget] = useState('')
  const [testOpen, setTestOpen] = useState(false)

  const profiles = game.keyboardProfiles || []
  const editing = profiles.find(item => item.id === editingId) || profiles[0]
  const effective = effectiveInputProfile(game, profile?.id)
  const effectiveLayoutValue = effectiveLayout(game, profile?.id)
  const inputPlan = planInputBackend(game, effectiveLayoutValue)
  const isNte = game.name.toLocaleLowerCase().includes('neverness')

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
        <button type="button" onClick={() => setTestOpen(true)} className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-gold/25 px-2.5 py-1 font-semibold text-gold hover:bg-gold/10"><Play size={11} />Tester</button>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
          <p className="text-[11px] font-semibold text-white/58">Méthode d’application (backends)</p>
          <ul className="mt-1.5 space-y-1">{inputPlan.chain.map(item => {
            const chosen = item.backend.id === inputPlan.chosen
            return <li key={item.backend.id} className="flex items-start gap-1.5 text-[11px]"><span className={`mt-0.5 shrink-0 ${item.available ? (chosen ? 'text-gold' : 'text-emerald-300/70') : 'text-white/22'}`}>{chosen ? <Check size={11} /> : item.available ? <span className="block h-[3px] w-[3px] rounded-full bg-current" /> : <X size={11} />}</span><span className="min-w-0"><span className={`${item.available ? (chosen ? 'font-semibold text-gold' : 'text-white/62') : 'text-white/28 line-through'}`}>{item.backend.label}</span><span className="mt-0.5 block leading-relaxed text-[10px] text-white/30">{item.reason}</span></span></li>
          })}</ul>
          {inputPlan.constraints.length > 0 && <ul className="mt-2 space-y-1 rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2 text-[10px] leading-relaxed text-white/36">{inputPlan.constraints.map((item, index) => <li key={`${index}:${item}`}>• {item}</li>)}</ul>}
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
          <p className="text-[11px] font-semibold text-white/58">Raccourcis (backends Phase 2)</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-white/40">Suspendre le remapping<input value={remapSuspendShortcut} onChange={event => setRemapSuspendShortcut(event.target.value)} placeholder="Ctrl+Alt+K" className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#101313] px-2 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-gold/30" /></label>
            <label className="text-[11px] text-white/40">Tout désactiver (kill switch)<input value={remapKillSwitchShortcut} onChange={event => setRemapKillSwitchShortcut(event.target.value)} placeholder="Ctrl+Alt+Backspace" className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#101313] px-2 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-gold/30" /></label>
          </div>
        </div>
      </div>
      {isNte && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-amber-100/65"><ShieldAlert size={13} className="mt-0.5 shrink-0" /><span>Neverness to Everness utilise <strong>Anti-Cheat Expert</strong> : aucun hook, injection ou driver. La disposition ne peut passer que par un remapping externe limité à la fenêtre du jeu — à valider sur la vraie version Steam, un simple changement de layout logique ne suffit pas pour ce jeu.</span></div>}
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
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_GROUPS.map(group => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/[0.07] bg-black/15 px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/30">{group.label}</span>
              {group.presets.map(preset => <button key={preset.label} type="button" onClick={() => applyPreset(preset.mapping, preset.layout)} title={`${preset.label} — ${preset.mapping.length} traduction(s)`} className="rounded-md px-2 py-1 text-[11px] text-white/58 hover:bg-white/[0.06] hover:text-gold">{preset.label}</button>)}
            </div>
          ))}
          <button type="button" onClick={() => applyPreset([], 'custom')} className="flex items-center gap-1 rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold"><RefreshCw size={11} />Natif</button>
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
    {testOpen && <RemapTestDialog game={game} profileName={profile?.name} layout={effectiveLayoutValue} mapping={effective?.mapping || presetForLayout(effectiveLayoutValue)} onClose={() => setTestOpen(false)} />}
  </div>
}

function RemapTestDialog({ game, profileName, layout, mapping, onClose }: { game: Game; profileName?: string; layout: GameKeyboardLayout; mapping: GameKeyMapping[]; onClose: () => void }) {
  const [pressed, setPressed] = useState<string>()
  const translate = (key: string) => mapping.find(entry => entry.physical === key)?.gameKey
  return <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={onClose}>
    <section tabIndex={0} className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111414] p-4 shadow-2xl outline-none" onMouseDown={event => event.stopPropagation()} onKeyDown={event => { const key = event.key.toUpperCase(); if (/^[A-Z0-9;,.:/]$/.test(key)) setPressed(key) }}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white/82">Tester le remapping</h2>
          <p className="mt-1 text-[11px] text-white/38">{game.name}{profileName ? ` · ${profileName}` : ''} · {LAYOUT_LABELS[layout]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={14} /></button>
      </header>
      <p className="mt-3 text-[11px] leading-relaxed text-white/42">Appuyez sur une touche de cette fenêtre : ZAILON affiche la traduction prévue. Aperçu uniquement — l’interception réelle (Phase 2) restera limitée à la fenêtre du jeu et ne sera jamais active sur le bureau.</p>
      <div className="mt-3 rounded-xl border border-gold/20 bg-gold/[0.04] p-3 text-center">
        {pressed
          ? <p className="text-xs text-white/60">Touche physique <strong className="font-mono text-lg text-gold">{pressed}</strong> → envoyée au jeu <strong className="font-mono text-lg text-white">{translate(pressed) || pressed}</strong></p>
          : <p className="text-[11px] text-white/38">Appuyez sur une touche (A–Z, 0–9, ; , . / :)</p>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {mapping.length
          ? mapping.map((entry, index) => <div key={`${entry.physical}-${index}`} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 font-mono text-[11px] text-white/55"><span className="text-gold">{entry.physical}</span><span>→</span><span className="text-white/80">{entry.gameKey}</span></div>)
          : <p className="col-span-2 text-[11px] text-white/34">Aucune traduction active pour cette disposition.</p>}
      </div>
      <footer className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[#101313]">Fermer</button></footer>
    </section>
  </div>
}
