import { AlertCircle, CheckCircle2, Database, EyeOff, FileText, Info, KeyRound, Link2, RefreshCw, Settings2, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { appVersion, useStore } from '../../store/useStore'
import { native } from '../../lib/native'
import { formatTime } from '../../utils'
import { useUpdater } from '../UpdateProvider'

function formatDate(value?: number | string) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function SettingsView() {
  const games = useStore(state => state.games)
  const language = useStore(state => state.language)
  const nsfw = useStore(state => state.nsfw)
  const hideUnclassifiedNsfw = useStore(state => state.hideUnclassifiedNsfw)
  const toggleNSFW = useStore(state => state.toggleNSFW)
  const setHideUnclassifiedNsfw = useStore(state => state.setHideUnclassifiedNsfw)
  const setLanguage = useStore(state => state.setLanguage)
  const autoCheckUpdates = useStore(state => state.autoCheckUpdates)
  const autoInstallUpdates = useStore(state => state.autoInstallUpdates)
  const updateChannel = useStore(state => state.updateChannel)
  const lastUpdateCheck = useStore(state => state.lastUpdateCheck)
  const lastUpdateVersion = useStore(state => state.lastUpdateVersion)
  const lastUpdateError = useStore(state => state.lastUpdateError)
  const lastInstalledUpdate = useStore(state => state.lastInstalledUpdate)
  const setAutoCheckUpdates = useStore(state => state.setAutoCheckUpdates)
  const setAutoInstallUpdates = useStore(state => state.setAutoInstallUpdates)
  const setUpdateChannel = useStore(state => state.setUpdateChannel)
  const modUpdateFrequency = useStore(state => state.modUpdateFrequency)
  const autoDownloadModUpdates = useStore(state => state.autoDownloadModUpdates)
  const autoInstallModUpdates = useStore(state => state.autoInstallModUpdates)
  const setModUpdateFrequency = useStore(state => state.setModUpdateFrequency)
  const setAutoDownloadModUpdates = useStore(state => state.setAutoDownloadModUpdates)
  const setAutoInstallModUpdates = useStore(state => state.setAutoInstallModUpdates)
  const { status, update, error, checkUpdates, openLog } = useUpdater()
  const totalPlaytime = games.reduce((sum, game) => sum + game.totalPlaytime, 0)
  const isChecking = status === 'checking'
  const latestVersion = update?.version ?? lastUpdateVersion
  const [nexusKey, setNexusKey] = useState('')
  const [curseforgeKey, setCurseforgeKey] = useState('')
  const [secretStatus, setSecretStatus] = useState<Record<string, boolean>>({})
  const [nxmAssociated, setNxmAssociated] = useState(false)
  const [providerMessage, setProviderMessage] = useState<string>()

  useEffect(() => {
    if (!native.isDesktop()) return
    void native.providerSecretStatus().then(setSecretStatus).catch(() => undefined)
    void native.nxmAssociationStatus().then(setNxmAssociated).catch(() => undefined)
  }, [])

  const saveSecret = async (provider: 'nexus' | 'curseforge', secret: string) => {
    if (!secret.trim()) return
    try {
      await native.setProviderSecret(provider, secret.trim())
      setSecretStatus(current => ({ ...current, [provider]: true }))
      provider === 'nexus' ? setNexusKey('') : setCurseforgeKey('')
      setProviderMessage(`Identifiant ${provider} enregistré dans le coffre sécurisé du système.`)
    } catch (reason) { setProviderMessage(reason instanceof Error ? reason.message : String(reason)) }
  }

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-5"><h1 className="font-display text-lg font-bold text-white">Settings</h1><p className="text-[11px] text-white/35">Native launcher configuration, local data and signed updates</p></div>
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Settings2 size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Preferences</h2></div><label className="block text-[11px] text-white/45">Language<select value={language} onChange={event => setLanguage(event.target.value)} className="mt-1.5 block rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="en">English</option><option value="fr">Français</option></select></label><p className="mt-3 text-[11px] leading-relaxed text-white/25">Game entries, profiles and settings stay on this device. ZAILON never uploads game paths or mod files.</p></section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><EyeOff size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Contenu et confidentialité</h2></div>
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span><strong className="block text-white/75">Afficher le contenu adulte</strong><span className="mt-1 block leading-relaxed text-white/35">Désactivé par défaut. Les miniatures NSFW ne sont pas rendues quand ce réglage est coupé.</span></span><input type="checkbox" checked={nsfw} onChange={() => { if (!nsfw && !window.confirm('Afficher le contenu adulte ? Ce réglage peut révéler des images et des descriptions explicites.')) return; toggleNSFW() }} className="mt-1 accent-gold" /></label>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55"><span>Masquer aussi le contenu non classé</span><input type="checkbox" checked={hideUnclassifiedNsfw} onChange={event => setHideUnclassifiedNsfw(event.target.checked)} className="accent-gold" /></label>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><KeyRound size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Fournisseurs de mods</h2></div>
        <CredentialRow provider="Nexus Mods" connected={Boolean(secretStatus.nexus)} value={nexusKey} onChange={setNexusKey} onSave={() => void saveSecret('nexus', nexusKey)} onRevoke={() => void native.deleteProviderSecret('nexus').then(() => setSecretStatus(current => ({ ...current, nexus: false })))} />
        <CredentialRow provider="CurseForge" connected={Boolean(secretStatus.curseforge)} value={curseforgeKey} onChange={setCurseforgeKey} onSave={() => void saveSecret('curseforge', curseforgeKey)} onRevoke={() => void native.deleteProviderSecret('curseforge').then(() => setSecretStatus(current => ({ ...current, curseforge: false })))} />
        {providerMessage && <p className="mt-2 text-[11px] text-white/45">{providerMessage}</p>}
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-amber-100/50"><ShieldAlert size={13} className="mt-0.5 shrink-0" />Une application publique Nexus doit être enregistrée. Une clé personnelle est destinée aux tests ou à un usage personnel et n’est jamais incluse dans les exports.</p>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><Link2 size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Liens Nexus NXM</h2></div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3"><div><p className="text-[11px] font-medium text-white/70">Association nxm:// {nxmAssociated ? 'active' : 'inactive'}</p><p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/35">L’activation peut remplacer Vortex ou Mod Organizer comme gestionnaire NXM. ZAILON demande donc toujours votre consentement explicite.</p></div><button onClick={() => { if (!nxmAssociated && !window.confirm('Associer les liens nxm:// à ZAILON ? Cela peut remplacer le gestionnaire actuellement configuré.')) return; void native.setNxmAssociation(!nxmAssociated).then(setNxmAssociated).catch(reason => setProviderMessage(String(reason))) }} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/65 hover:bg-white/[0.06]">{nxmAssociated ? 'Désactiver' : 'Activer'}</button></div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><RefreshCw size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Mises à jour des mods</h2></div>
        <div className="grid gap-2 sm:grid-cols-3"><label className="text-[11px] text-white/55">Fréquence<select value={modUpdateFrequency} onChange={event => setModUpdateFrequency(event.target.value as typeof modUpdateFrequency)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/75"><option value="never">Jamais</option><option value="startup">Au démarrage</option><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option></select></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55">Télécharger automatiquement<input type="checkbox" checked={autoDownloadModUpdates} onChange={event => setAutoDownloadModUpdates(event.target.checked)} className="accent-gold" /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55">Installer automatiquement<input type="checkbox" checked={autoInstallModUpdates} onChange={event => { if (event.target.checked && !window.confirm('L’installation automatique reste limitée aux correspondances exactes et sauvegarde toujours la version précédente. Continuer ?')) return; setAutoInstallModUpdates(event.target.checked) }} className="accent-gold" /></label></div>
      </section>

      <section className="rounded-xl border border-gold/15 bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><RefreshCw size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Application updates</h2></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow label="Installed version" value={`v${appVersion}`} />
          <InfoRow label="Latest compatible version" value={latestVersion ? `v${latestVersion}` : status === 'upToDate' ? `v${appVersion} (up to date)` : 'Not checked yet'} />
          <InfoRow label="Last check" value={formatDate(lastUpdateCheck)} />
          <InfoRow label="Last installed update" value={lastInstalledUpdate ? `v${lastInstalledUpdate.version} · ${formatDate(lastInstalledUpdate.installedAt)}` : 'No in-app update installed yet'} />
        </div>
        <div className="mt-3 grid gap-2 rounded-lg bg-white/[0.025] p-2.5 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[11px] text-white/65"><span>Check automatically at startup</span><input aria-label="Check updates automatically" checked={autoCheckUpdates} onChange={event => setAutoCheckUpdates(event.target.checked)} type="checkbox" className="accent-gold" /></label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[11px] text-white/65"><span>Install automatically when available</span><input aria-label="Install updates automatically" checked={autoInstallUpdates} onChange={event => setAutoInstallUpdates(event.target.checked)} type="checkbox" className="accent-gold" /></label>
          <label className="flex items-center justify-between gap-3 text-[11px] text-white/65"><span>Update channel</span><select value={updateChannel} onChange={event => setUpdateChannel(event.target.value as 'stable' | 'beta')} className="rounded border border-white/[0.08] bg-ink-200 px-2 py-1 text-[11px] text-white/80"><option value="stable">Stable</option><option value="beta">Beta</option></select></label>
          <div className="flex items-center text-[11px] leading-relaxed text-white/30">The updater only accepts signed packages published by the official ZAILON GitHub release.</div>
        </div>
        {(status === 'upToDate' || status === 'available') && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-green-400"><CheckCircle2 size={12} />{status === 'available' ? `Update v${update?.version} is ready.` : 'ZAILON is up to date.'}</p>}
        {(error || lastUpdateError) && <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-red-300"><AlertCircle size={12} className="mt-0.5 shrink-0" />{error || lastUpdateError}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void checkUpdates()} disabled={isChecking} className="flex items-center gap-1.5 rounded bg-gold px-3 py-1.5 text-[11px] font-semibold text-ink-400 hover:bg-gold-light disabled:opacity-40"><RefreshCw size={11} className={isChecking ? 'animate-spin' : ''} />{isChecking ? 'Checking…' : 'Check for updates'}</button><button onClick={() => void openLog()} className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/70 hover:text-white"><FileText size={11} />Open update log</button></div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Database size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Library statistics</h2></div><div className="grid grid-cols-3 gap-2 text-center"><Stat label="Games" value={String(games.length)} /><Stat label="Mods" value={String(games.reduce((sum, game) => sum + game.installedMods.length, 0))} /><Stat label="Playtime" value={formatTime(totalPlaytime)} /></div></section>
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-2 flex items-center gap-2 text-gold/70"><Info size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">ZAILON</h2></div><p className="text-[11px] text-white/55">Universal Mod Launcher · v{appVersion}</p><p className="mt-1 text-[11px] text-white/25">Runtime: {native.isDesktop() ? 'Tauri native desktop application' : 'web preview (native game operations and updater disabled)'}</p></section>
    </div>
  </div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] px-3 py-2"><p className="text-[11px] font-mono text-white/30">{label}</p><p className="mt-0.5 truncate text-[11px] font-medium text-white/80" title={value}>{value}</p></div>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[11px] text-white/30">{label}</p><p className="mt-0.5 text-xs font-semibold text-white/80">{value}</p></div>
}

function CredentialRow({ provider, connected, value, onChange, onSave, onRevoke }: { provider: string; connected: boolean; value: string; onChange: (value: string) => void; onSave: () => void; onRevoke: () => void }) {
  return <div className="mb-2 rounded-lg bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-white/70">{provider}</p><span className={`text-[11px] ${connected ? 'text-emerald-300/70' : 'text-white/30'}`}>{connected ? 'Identifiant sécurisé présent' : 'Non connecté'}</span></div><div className="mt-2 flex gap-2"><input type="password" value={value} onChange={event => onChange(event.target.value)} autoComplete="off" placeholder="Coller l’identifiant API" className="min-w-0 flex-1 rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/30" /><button onClick={onSave} disabled={!value.trim()} className="rounded bg-gold px-3 text-[11px] font-semibold text-ink-400 disabled:opacity-30">Enregistrer</button>{connected && <button onClick={onRevoke} className="rounded border border-red-300/15 px-2 text-[11px] text-red-200/60">Révoquer</button>}</div></div>
}
