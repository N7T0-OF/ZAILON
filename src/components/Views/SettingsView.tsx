import { AlertCircle, Battery, CheckCircle2, Database, ExternalLink, EyeOff, FileText, Heart, Info, KeyRound, Link2, Radio, RefreshCw, Settings2, ShieldAlert, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { appVersion, useStore } from '../../store/useStore'
import { DiscordConnectionStatus, native, ProviderConnectionStatus } from '../../lib/native'
import { formatTime } from '../../utils'
import { useUpdater } from '../UpdateProvider'
import { CREATOR_LINKS } from '../../config/creatorLinks'

function formatDate(value?: number | string) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function SettingsView() {
  const games = useStore(state => state.games)
  const language = useStore(state => state.language)
  const textSize = useStore(state => state.textSize)
  const uiDensity = useStore(state => state.uiDensity)
  const autoArtwork = useStore(state => state.autoArtwork)
  const discordPresence = useStore(state => state.discordPresence)
  const discordClientId = useStore(state => state.discordClientId)
  const discordLargeImageKey = useStore(state => state.discordLargeImageKey)
  const discordShowProfile = useStore(state => state.discordShowProfile)
  const discordShowModCount = useStore(state => state.discordShowModCount)
  const discordShowElapsed = useStore(state => state.discordShowElapsed)
  const nsfw = useStore(state => state.nsfw)
  const hideUnclassifiedNsfw = useStore(state => state.hideUnclassifiedNsfw)
  const toggleNSFW = useStore(state => state.toggleNSFW)
  const setHideUnclassifiedNsfw = useStore(state => state.setHideUnclassifiedNsfw)
  const setLanguage = useStore(state => state.setLanguage)
  const setTextSize = useStore(state => state.setTextSize)
  const setUiDensity = useStore(state => state.setUiDensity)
  const setAutoArtwork = useStore(state => state.setAutoArtwork)
  const toggleDiscord = useStore(state => state.toggleDiscord)
  const setDiscordClientId = useStore(state => state.setDiscordClientId)
  const setDiscordLargeImageKey = useStore(state => state.setDiscordLargeImageKey)
  const setDiscordShowProfile = useStore(state => state.setDiscordShowProfile)
  const setDiscordShowModCount = useStore(state => state.setDiscordShowModCount)
  const setDiscordShowElapsed = useStore(state => state.setDiscordShowElapsed)
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
  const taskToastsEnabled = useStore(state => state.taskToastsEnabled)
  const taskAutoReduceImports = useStore(state => state.taskAutoReduceImports)
  const setTaskToastsEnabled = useStore(state => state.setTaskToastsEnabled)
  const setTaskAutoReduceImports = useStore(state => state.setTaskAutoReduceImports)
  const liquidGlassMode = useStore(state => state.liquidGlassMode)
  const liquidGlassSettings = useStore(state => state.liquidGlassSettings)
  const energySaver = useStore(state => state.energySaver)
  const showSupportButton = useStore(state => state.showSupportButton)
  const setLiquidGlassMode = useStore(state => state.setLiquidGlassMode)
  const setLiquidGlassSettings = useStore(state => state.setLiquidGlassSettings)
  const setEnergySaver = useStore(state => state.setEnergySaver)
  const setShowSupportButton = useStore(state => state.setShowSupportButton)
  const { status, update, error, checkUpdates, openLog } = useUpdater()
  const totalPlaytime = games.reduce((sum, game) => sum + game.totalPlaytime, 0)
  const isChecking = status === 'checking'
  const latestVersion = update?.version ?? lastUpdateVersion
  const [nexusKey, setNexusKey] = useState('')
  const [curseforgeKey, setCurseforgeKey] = useState('')
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderConnectionStatus>>({})
  const [nxmAssociated, setNxmAssociated] = useState(false)
  const [providerMessage, setProviderMessage] = useState<string>()
  const [busyProvider, setBusyProvider] = useState<string>()
  const [discordStatus, setDiscordStatus] = useState<DiscordConnectionStatus>()
  const [testingDiscord, setTestingDiscord] = useState(false)

  useEffect(() => {
    if (!native.isDesktop()) return
    void native.providerConnectionStatuses().then(setProviderStatuses).catch(() => undefined)
    void native.nxmAssociationStatus().then(setNxmAssociated).catch(() => undefined)
    let unlisten: (() => void) | undefined
    void listen<ProviderConnectionStatus>('provider-status-changed', event => {
      setProviderStatuses(current => ({ ...current, [event.payload.provider]: event.payload }))
    }).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    void listen<DiscordConnectionStatus>('discord-status-changed', event => setDiscordStatus(event.payload)).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [])

  const testDiscord = async () => {
    if (!discordClientId.trim()) return
    setTestingDiscord(true)
    try {
      setDiscordStatus(await native.testDiscordConnection(discordClientId.trim()))
    } catch (reason) {
      setDiscordStatus({ connected: false, message: reason instanceof Error ? reason.message : String(reason) })
    } finally {
      setTestingDiscord(false)
    }
  }

  const saveSecret = async (provider: 'nexus' | 'curseforge', secret: string) => {
    if (!secret.trim()) return
    setBusyProvider(provider)
    setProviderMessage(undefined)
    try {
      const status = await native.setProviderSecret(provider, secret.trim())
      setProviderStatuses(current => ({ ...current, [provider]: status }))
      provider === 'nexus' ? setNexusKey('') : setCurseforgeKey('')
      setProviderMessage(status.message)
    } catch (reason) {
      setProviderMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyProvider(undefined)
    }
  }

  const testProvider = async (provider: 'nexus' | 'curseforge') => {
    setBusyProvider(provider)
    setProviderMessage(undefined)
    try {
      const status = await native.testProviderConnection(provider)
      setProviderStatuses(current => ({ ...current, [provider]: status }))
      setProviderMessage(status.message)
    } catch (reason) {
      setProviderMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyProvider(undefined)
    }
  }

  const revokeProvider = async (provider: 'nexus' | 'curseforge') => {
    setBusyProvider(provider)
    try {
      const status = await native.deleteProviderSecret(provider)
      setProviderStatuses(current => ({ ...current, [provider]: status }))
      setProviderMessage(`Identifiant ${provider} supprimé du coffre système.`)
    } catch (reason) {
      setProviderMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyProvider(undefined)
    }
  }

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-5"><h1 className="font-display text-lg font-bold text-white">Paramètres</h1><p className="text-[11px] text-white/35">Configuration native, données locales et mises à jour signées</p></div>
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Settings2 size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Préférences et lisibilité</h2></div><div className="grid gap-3 md:grid-cols-3"><label className="block text-[11px] text-white/45">Langue<select value={language} onChange={event => setLanguage(event.target.value)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="en">English</option><option value="fr">Français</option></select></label><label className="block text-[11px] text-white/45">Taille du texte<select value={textSize} onChange={event => setTextSize(event.target.value as typeof textSize)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="small">Petite (minimum 14 px)</option><option value="normal">Normale</option><option value="large">Grande</option><option value="very-large">Très grande</option></select></label><label className="block text-[11px] text-white/45">Densité<select value={uiDensity} onChange={event => setUiDensity(event.target.value as typeof uiDensity)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="comfortable">Confortable</option><option value="compact">Compacte</option></select></label></div><p className="mt-3 text-[11px] leading-relaxed text-white/35">Aucun texte essentiel ne descend sous 14 px. Ce réglage change les variables typographiques centrales, pas un zoom global. Les panneaux restent défilables quand l’espace manque.</p></section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Sparkles size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Apparence · Liquid Glass</h2></div><div className="grid grid-cols-2 gap-1 sm:grid-cols-5">{(['off', 'light', 'normal', 'intense', 'custom'] as const).map(mode => <button key={mode} type="button" onClick={() => setLiquidGlassMode(mode)} className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize ${liquidGlassMode === mode ? 'bg-gold text-ink-400' : 'border border-white/[0.07] text-white/48 hover:bg-white/[0.04]'}`}>{mode === 'off' ? 'Désactivé' : mode === 'light' ? 'Léger' : mode === 'normal' ? 'Normal' : mode === 'intense' ? 'Intense' : 'Personnalisé'}</button>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><EffectSlider label="Opacité" value={liquidGlassSettings.opacity} min={0.55} max={1} step={0.01} onChange={opacity => setLiquidGlassSettings({ opacity })} /><EffectSlider label="Flou" value={liquidGlassSettings.blur} min={0} max={40} step={1} suffix=" px" onChange={blur => setLiquidGlassSettings({ blur })} /><EffectSlider label="Saturation" value={liquidGlassSettings.saturation} min={0.8} max={1.4} step={0.01} onChange={saturation => setLiquidGlassSettings({ saturation })} /><EffectSlider label="Bordure" value={liquidGlassSettings.border} min={0} max={0.3} step={0.01} onChange={border => setLiquidGlassSettings({ border })} /><EffectSlider label="Teinte sombre" value={liquidGlassSettings.darkTint} min={0.2} max={0.9} step={0.01} onChange={darkTint => setLiquidGlassSettings({ darkTint })} /><EffectSlider label="Reflet" value={liquidGlassSettings.reflection} min={0} max={0.25} step={0.01} onChange={reflection => setLiquidGlassSettings({ reflection })} /><EffectSlider label="Ombre" value={liquidGlassSettings.shadow} min={0} max={0.8} step={0.01} onChange={shadow => setLiquidGlassSettings({ shadow })} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/55">Animations<input type="checkbox" checked={liquidGlassSettings.animations} onChange={event => setLiquidGlassSettings({ animations: event.target.checked })} className="accent-gold" /></label><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/55">Réduire hors focus<input type="checkbox" checked={liquidGlassSettings.reduceWhenUnfocused} onChange={event => setLiquidGlassSettings({ reduceWhenUnfocused: event.target.checked })} className="accent-gold" /></label><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/55">Préférer l’effet natif s’il devient disponible<input type="checkbox" checked={liquidGlassSettings.preferNative} onChange={event => setLiquidGlassSettings({ preferNative: event.target.checked })} className="accent-gold" /></label><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/55"><span className="flex items-center gap-2"><Battery size={14} />Économiseur ZAILON</span><input type="checkbox" checked={energySaver} onChange={event => setEnergySaver(event.target.checked)} className="accent-gold" /></label></div><div className="mt-3 overflow-hidden rounded-xl border border-white/[0.09] bg-gradient-to-br from-white/[0.08] to-transparent p-4"><p className="text-xs font-semibold text-white/72">Aperçu en direct</p><p className="mt-1 text-xs text-white/42">{energySaver ? 'Préférence conservée, effet temporairement suspendu par l’économiseur.' : liquidGlassMode === 'off' ? 'Effet désactivé.' : 'Backend SimulatedCss actif : flou interne sûr, sans injection DWM.'}</p></div><p className="mt-3 text-[11px] leading-relaxed text-white/32">Aucun binaire DWMBlurGlass n’est intégré ou lancé. La fenêtre Tauri actuelle n’est pas transparente : ZAILON utilise donc un fallback CSS honnête et portable. Les préférences restent distinctes de l’état d’exécution.</p></section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Settings2 size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Tâches et notifications</h2></div><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/58">Afficher les cartes de progression<input type="checkbox" checked={taskToastsEnabled} onChange={event => setTaskToastsEnabled(event.target.checked)} className="accent-gold" /></label><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/58">Réduire automatiquement l’import<input type="checkbox" checked={taskAutoReduceImports} onChange={event => setTaskAutoReduceImports(event.target.checked)} className="accent-gold" /></label></div><p className="mt-2 text-[11px] text-white/32">Masquer une carte ne supprime jamais la tâche. L’historique complet reste disponible dans Téléchargements.</p></section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Settings2 size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Illustrations automatiques</h2></div><label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Proposer automatiquement les images Steam</strong><span className="mt-1 block leading-relaxed text-white/36">Désactivé par défaut. Quand il est activé, ZAILON peut proposer des images officielles aux nouveaux jeux Steam ; leur copie locale reste soumise à confirmation.</span></span><input type="checkbox" checked={autoArtwork} onChange={event => setAutoArtwork(event.target.checked)} className="mt-1 accent-gold" /></label><p className="mt-2 text-[11px] leading-relaxed text-white/32">Fournisseur actif : Steam officiel, sans clé. SteamGridDB, IGDB et autres sources resteront indisponibles tant qu’un connecteur et ses conditions d’utilisation ne sont pas configurés.</p></section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-3 flex items-center gap-2 text-gold/70"><Radio size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Discord Rich Presence réelle</h2></div><label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Activer pendant le jeu</strong><span className="mt-1 block leading-relaxed text-white/36">ZAILON se connecte au canal IPC local de Discord au lancement du jeu, publie l’activité puis la nettoie quand le processus se ferme.</span></span><input type="checkbox" checked={discordPresence} onChange={toggleDiscord} className="mt-1 accent-gold" /></label><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-[11px] text-white/48">Application ID / Client ID public<input value={discordClientId} onChange={event => setDiscordClientId(event.target.value.replace(/\D/g, '').slice(0, 32))} inputMode="numeric" placeholder="Identifiant numérique Discord" className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-ink-200 px-3 py-2 text-[11px] text-white/72 outline-none focus:border-gold/30" /></label><label className="text-[11px] text-white/48">Clé de grande image (optionnelle)<input value={discordLargeImageKey} onChange={event => setDiscordLargeImageKey(event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128))} placeholder="zailon ou clé d’asset Discord" className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-ink-200 px-3 py-2 text-[11px] text-white/72 outline-none focus:border-gold/30" /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Afficher le profil<input type="checkbox" checked={discordShowProfile} onChange={event => setDiscordShowProfile(event.target.checked)} className="accent-gold" /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Afficher les mods actifs<input type="checkbox" checked={discordShowModCount} onChange={event => setDiscordShowModCount(event.target.checked)} className="accent-gold" /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Afficher le temps écoulé<input type="checkbox" checked={discordShowElapsed} onChange={event => setDiscordShowElapsed(event.target.checked)} className="accent-gold" /></label></div><div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void testDiscord()} disabled={testingDiscord || !discordClientId.trim()} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/64 hover:bg-white/[0.05] disabled:opacity-35">{testingDiscord ? 'Test IPC…' : 'Tester avec Discord lancé'}</button>{discordStatus && <span className={`text-[11px] ${discordStatus.connected ? 'text-emerald-300/72' : 'text-amber-200/72'}`}>{discordStatus.message}</span>}</div><p className="mt-3 text-[11px] leading-relaxed text-white/30">Aucun client secret n’est nécessaire ni accepté. Le Client ID est public et sert uniquement à identifier l’application Discord.</p></section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><EyeOff size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Contenu et confidentialité</h2></div>
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span><strong className="block text-white/75">Afficher le contenu adulte</strong><span className="mt-1 block leading-relaxed text-white/35">Désactivé par défaut. Les miniatures NSFW ne sont pas rendues quand ce réglage est coupé.</span></span><input type="checkbox" checked={nsfw} onChange={() => { if (!nsfw && !window.confirm('Afficher le contenu adulte ? Ce réglage peut révéler des images et des descriptions explicites.')) return; toggleNSFW() }} className="mt-1 accent-gold" /></label>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55"><span>Masquer aussi le contenu non classé</span><input type="checkbox" checked={hideUnclassifiedNsfw} onChange={event => setHideUnclassifiedNsfw(event.target.checked)} className="accent-gold" /></label>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center gap-2 text-gold/70"><KeyRound size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Fournisseurs de mods</h2></div>
        <CredentialRow provider="Nexus Mods" status={providerStatuses.nexus} value={nexusKey} busy={busyProvider === 'nexus'} onChange={setNexusKey} onSave={() => void saveSecret('nexus', nexusKey)} onTest={() => void testProvider('nexus')} onRevoke={() => void revokeProvider('nexus')} />
        <CredentialRow provider="CurseForge" status={providerStatuses.curseforge} value={curseforgeKey} busy={busyProvider === 'curseforge'} onChange={setCurseforgeKey} onSave={() => void saveSecret('curseforge', curseforgeKey)} onTest={() => void testProvider('curseforge')} onRevoke={() => void revokeProvider('curseforge')} />
        {providerMessage && <p className="mt-2 text-[11px] text-white/45">{providerMessage}</p>}
        <div className="mt-3 rounded-lg border border-amber-300/18 bg-amber-300/[0.04] p-3 text-[11px] leading-relaxed text-amber-100/62"><p className="flex items-start gap-2"><ShieldAlert size={14} className="mt-0.5 shrink-0" /><span><strong className="text-amber-100/85">Sécurité :</strong> si une clé Nexus personnelle a été collée dans un chat, un ticket ou un dépôt, révoquez-la immédiatement dans Nexus puis générez-en une nouvelle. ZAILON ne peut pas révoquer la clé à votre place.</span></p><p className="mt-2 text-white/42">La clé complète n’est jamais renvoyée à l’interface, ni écrite dans les logs ou les exports. Elle reste dans le coffre du système. Une application publique Nexus doit être enregistrée auprès de Nexus Mods.</p></div>
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
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-2 flex items-center gap-2 text-gold/70"><Info size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">ZAILON · À propos</h2></div><p className="text-xs text-white/55">Universal Mod Launcher · v{appVersion}</p><p className="mt-1 text-[11px] text-white/30">Runtime: {native.isDesktop() ? 'Application native Tauri' : 'aperçu web (opérations natives désactivées)'}</p><label className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/55"><span className="flex items-center gap-2"><Heart size={14} className="text-rose-200/70" />Afficher « Me soutenir » dans la barre latérale</span><input type="checkbox" checked={showSupportButton} onChange={event => setShowSupportButton(event.target.checked)} className="accent-gold" /></label><div className="mt-3 flex flex-wrap gap-2">{CREATOR_LINKS.map(link => <button key={link.id} type="button" onClick={() => void native.openExternalUrl(link.url)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]"><ExternalLink size={12} />{link.label}</button>)}</div><p className="mt-3 text-[11px] text-white/28">Les liens ouvrent des sites HTTPS autorisés. ZAILON ne collecte aucune donnée de paiement ni télémétrie associée.</p></section>
    </div>
  </div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] px-3 py-2"><p className="text-[11px] font-mono text-white/30">{label}</p><p className="mt-0.5 truncate text-[11px] font-medium text-white/80" title={value}>{value}</p></div>
}

function EffectSlider({ label, value, min, max, step, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="text-[11px] text-white/46"><span className="flex items-center justify-between gap-2"><span>{label}</span><span className="font-mono text-white/64">{value.toFixed(step < 0.1 ? 2 : 0)}{suffix}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="mt-2 w-full accent-gold" /></label>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[11px] text-white/30">{label}</p><p className="mt-0.5 text-xs font-semibold text-white/80">{value}</p></div>
}

function CredentialRow({ provider, status, value, busy, onChange, onSave, onTest, onRevoke }: {
  provider: string
  status?: ProviderConnectionStatus
  value: string
  busy: boolean
  onChange: (value: string) => void
  onSave: () => void
  onTest: () => void
  onRevoke: () => void
}) {
  const stateLabel = status?.connected ? 'Connecté' : status?.configured ? 'À vérifier' : 'Non connecté'
  const stateColor = status?.connected ? 'text-emerald-300/78' : status?.configured ? 'text-amber-200/74' : 'text-white/32'
  const checkedAt = status?.lastCheckedAt ? formatDate(status.lastCheckedAt * 1_000) : 'Jamais'
  return <div className="mb-2 rounded-lg bg-white/[0.025] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-[11px] font-medium text-white/74">{provider}</p><p className="mt-0.5 font-mono text-[11px] text-white/34">{status?.maskedSecret || 'Aucun identifiant enregistré'}</p></div>
      <span className={`text-[11px] font-semibold ${stateColor}`}>{stateLabel}</span>
    </div>
    {status?.configured && <div className="mt-2 grid gap-1 rounded-md bg-black/15 p-2 text-[11px] text-white/42 sm:grid-cols-2 xl:grid-cols-4">
      <span>Compte : <strong className="text-white/65">{status.accountName || 'Non disponible'}</strong></span>
      <span>Dernier test : <strong className="text-white/65">{checkedAt}</strong></span>
      <span>Quota heure : <strong className="text-white/65">{status.hourlyRemaining ?? '—'}{status.hourlyLimit ? ` / ${status.hourlyLimit}` : ''}</strong></span>
      <span>Quota jour : <strong className="text-white/65">{status.dailyRemaining ?? '—'}{status.dailyLimit ? ` / ${status.dailyLimit}` : ''}</strong></span>
    </div>}
    {status?.message && <p className="mt-2 text-[11px] leading-relaxed text-white/40">{status.message}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <input type="password" value={value} onChange={event => onChange(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={status?.configured ? 'Coller une nouvelle clé pour la remplacer' : 'Coller l’identifiant API'} className="min-w-[220px] flex-1 rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/30" />
      <button onClick={onSave} disabled={busy || !value.trim()} className="rounded bg-gold px-3 py-1.5 text-[11px] font-semibold text-ink-400 disabled:opacity-30">{busy && value.trim() ? 'Vérification…' : status?.configured ? 'Remplacer' : 'Enregistrer'}</button>
      {status?.configured && <button onClick={onTest} disabled={busy} className="rounded border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/64 disabled:opacity-35">Tester la connexion</button>}
      {status?.configured && <button onClick={onRevoke} disabled={busy} className="rounded border border-red-300/15 px-2 py-1.5 text-[11px] text-red-200/60 disabled:opacity-35">Supprimer du coffre</button>}
    </div>
  </div>
}
