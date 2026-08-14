import { Activity, AlertCircle, CheckCircle2, ChevronRight, Compass, Database, ExternalLink, EyeOff, FileClock, FileText, Gamepad2, HardDrive, Heart, Info, KeyRound, Link2, MonitorUp, Palette, Radio, RefreshCw, Search, Settings2, ShieldAlert, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { GameTab } from '../../types'
import { appVersion, useStore } from '../../store/useStore'
import { DiscordConnectionStatus, native, ProviderConnectionStatus } from '../../lib/native'
import { cachedProviderStatuses, providerHealthCache } from '../../lib/lazyPages'
import { formatTime } from '../../utils'
import { useUpdater } from '../UpdateProvider'
import { CREATOR_LINKS } from '../../config/creatorLinks'
import { ZailonInfoPopover } from '../UI/ZailonInfoPopover'
import { ZailonSwitch } from '../UI/ZailonSwitch'
import { AccordionSection } from '../UI/AccordionSection'
import { artworkProvidersWithState } from '../../lib/artworkRegistry'
import { addonCapabilities, hasCapability, type ZailonCapability } from '../../lib/addonGating'
import { ScrollableModal } from '../UI/ScrollableModal'
import { SafeMarkdown } from '../UI/SafeMarkdown'
import { parseMarkdown, summarizeBlocks } from '../../lib/safeMarkdown'

function formatDate(value?: number | string) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const SETTINGS_INDEX: Array<{ id: string; label: string; path: string; keywords: string; tab?: GameTab; sectionLabel?: string }> = [
  { id: 'language', label: 'Langue', path: 'Paramètres > Préférences et lisibilité', keywords: 'langue language anglais français', sectionLabel: 'Préférences et lisibilité' },
  { id: 'text-size', label: 'Taille du texte', path: 'Paramètres > Préférences et lisibilité', keywords: 'texte taille text size lisibilité', sectionLabel: 'Préférences et lisibilité' },
  { id: 'density', label: 'Densité', path: 'Paramètres > Préférences et lisibilité', keywords: 'compact confortable densite', sectionLabel: 'Préférences et lisibilité' },
  { id: 'motion', label: 'Animations / Effet 3D des couvertures', path: 'Paramètres > Préférences et lisibilité', keywords: 'animations motion parallaxe 3d couvertures reduire reduit', sectionLabel: 'Préférences et lisibilité' },
  { id: 'reduce-explanations', label: 'Réduire les explications', path: 'Paramètres > Préférences et lisibilité', keywords: 'explications bulles descriptions aide', sectionLabel: 'Préférences et lisibilité' },
  { id: 'advanced-mode', label: 'Mode avancé', path: 'Paramètres > Préférences et lisibilité', keywords: 'avance technique', sectionLabel: 'Préférences et lisibilité' },
  { id: 'accent', label: 'Couleur d’accent', path: 'Paramètres > Apparence', keywords: 'accent couleur theme', sectionLabel: 'Couleur d’accent' },
  { id: 'artwork', label: 'Illustrations', path: 'Paramètres > Illustrations', keywords: 'illustrations images steam steamgriddb artwork couverture bannière logo icône sources', sectionLabel: 'Illustrations' },
  { id: 'tasks', label: 'Tâches et notifications', path: 'Paramètres > Tâches et notifications', keywords: 'taches notifications toasts progression', sectionLabel: 'Tâches et notifications' },
  { id: 'storage', label: 'Stockage', path: 'Paramètres > Stockage', keywords: 'stockage espace disque nettoyage', sectionLabel: 'Stockage' },
  { id: 'discord', label: 'Discord Rich Presence', path: 'Paramètres > Discord', keywords: 'discord presence activite', sectionLabel: 'Discord Rich Presence' },
  { id: 'providers', label: 'Fournisseurs de mods', path: 'Paramètres > Fournisseurs de mods', keywords: 'nexus curseforge cle api fournisseurs credentials', sectionLabel: 'Fournisseurs de mods' },
  { id: 'nxm', label: 'Liens Nexus NXM', path: 'Paramètres > Liens Nexus NXM', keywords: 'nxm liens association vortex', sectionLabel: 'Liens Nexus NXM' },
  { id: 'mod-updates', label: 'Mises à jour des mods', path: 'Paramètres > Mises à jour des mods', keywords: 'mises a jour mods frequence', sectionLabel: 'Mises à jour des mods' },
  { id: 'app-updates', label: 'Canal et mises à jour', path: 'Paramètres > Application updates', keywords: 'canal stable beta mise a jour application updater', sectionLabel: 'Application updates' },
  { id: 'about', label: 'À propos / version', path: 'Paramètres > À propos', keywords: 'version apropos support', sectionLabel: 'À propos' },
  { id: 'keyboard', label: 'Clavier / Commandes (AZERTY, QWERTY)', path: 'Bibliothèque > Jeu > Configuration > Commandes', keywords: 'clavier commandes azerty qwerty qwertz remapping touches disposition', tab: 'configuration' },
  { id: 'bypass', label: 'Dossier Bypass / Loader', path: 'Bibliothèque > Jeu > Configuration > Lancement (Avancé)', keywords: 'bypass loader asi paks chemins', tab: 'configuration' },
  { id: 'executable', label: 'Exécutable du jeu', path: 'Bibliothèque > Jeu > Configuration > Lancement', keywords: 'executable lancement chemin', tab: 'configuration' },
  { id: 'visual-profile', label: 'Profil visuel', path: 'Bibliothèque > Jeu > Configuration > Apparence', keywords: 'visuel visual profile apparence', tab: 'configuration' },
  { id: 'restore-points', label: 'Points de restauration', path: 'Bibliothèque > Jeu > Configuration > Sauvegardes', keywords: 'sauvegardes snapshots restauration points', tab: 'configuration' },
  { id: 'diagnostic', label: 'Santé / Diagnostic du jeu', path: 'Bibliothèque > Jeu > État & Diagnostic', keywords: 'sante diagnostic erreurs frameworks deploiement', tab: 'diagnostic' },
]

// Correspondance étiquette de section (SETTINGS_INDEX / open-settings-section)
// → id d'accordion (spec §31-36, §53-54) : la recherche et les liens internes
// ouvrent automatiquement la section repliée contenant le réglage.
const SETTINGS_SECTION_BY_LABEL: Record<string, string> = {
  'Préférences et lisibilité': 'preferences',
  'Apparence': 'appearance',
  'Tâches et notifications': 'notifications',
  'Illustrations': 'illustrations',
  'Discord Rich Presence': 'discord',
  'Mode jeu': 'game-mode',
  'Panneau rapide en jeu': 'quick-panel',
  'Contenu et confidentialité': 'content',
  'Fournisseurs de mods': 'providers',
  'Liens Nexus NXM': 'nxm',
  'Mises à jour des mods': 'mod-updates',
  'Application updates': 'app-updates',
  'Library statistics': 'library-stats',
  'Stockage': 'storage',
  'À propos': 'about',
}

export function SettingsView() {
  const games = useStore(state => state.games)
  const backgroundTasks = useStore(state => state.backgroundTasks)
  const restorePoints = useStore(state => state.restorePoints)
  const clearBackgroundTasks = useStore(state => state.clearBackgroundTasks)
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
  const discordMinimalPresence = useStore(state => state.discordMinimalPresence)
  const lastDiscordPublished = useStore(state => state.lastDiscordPublished)
  const nsfw = useStore(state => state.nsfw)
  const hideUnclassifiedNsfw = useStore(state => state.hideUnclassifiedNsfw)
  const toggleNSFW = useStore(state => state.toggleNSFW)
  const setHideUnclassifiedNsfw = useStore(state => state.setHideUnclassifiedNsfw)
  const quickPanelEnabled = useStore(state => state.quickPanelEnabled)
  const quickPanelShortcut = useStore(state => state.quickPanelShortcut)
  const setQuickPanelEnabled = useStore(state => state.setQuickPanelEnabled)
  const setQuickPanelShortcut = useStore(state => state.setQuickPanelShortcut)
  const reduceActivityDuringGame = useStore(state => state.reduceActivityDuringGame)
  const autoMinimizeOnGameStart = useStore(state => state.autoMinimizeOnGameStart)
  const restoreAfterGame = useStore(state => state.restoreAfterGame)
  const setReduceActivityDuringGame = useStore(state => state.setReduceActivityDuringGame)
  const setAutoMinimizeOnGameStart = useStore(state => state.setAutoMinimizeOnGameStart)
  const setRestoreAfterGame = useStore(state => state.setRestoreAfterGame)
  const setLanguage = useStore(state => state.setLanguage)
  const setTextSize = useStore(state => state.setTextSize)
  const setUiDensity = useStore(state => state.setUiDensity)
  const motionMode = useStore(state => state.motionMode)
  const setMotionMode = useStore(state => state.setMotionMode)
  const coverParallax = useStore(state => state.coverParallax)
  const setCoverParallax = useStore(state => state.setCoverParallax)
  const globalPerformanceMode = useStore(state => state.globalPerformanceMode)
  const setGlobalPerformanceMode = useStore(state => state.setGlobalPerformanceMode)
  const batteryPerformanceBehavior = useStore(state => state.batteryPerformanceBehavior)
  const setBatteryPerformanceBehavior = useStore(state => state.setBatteryPerformanceBehavior)
  const reduceExplanations = useStore(state => state.reduceExplanations)
  const setReduceExplanations = useStore(state => state.setReduceExplanations)
  const advancedMode = useStore(state => state.advancedMode)
  const setAdvancedMode = useStore(state => state.setAdvancedMode)
  const setView = useStore(state => state.setView)
  const setActiveGameTab = useStore(state => state.setActiveGameTab)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const selectedGame = useStore(state => state.games.find(game => game.id === state.selectedGameId))
  const setAutoArtwork = useStore(state => state.setAutoArtwork)
  const toggleDiscord = useStore(state => state.toggleDiscord)
  const setDiscordClientId = useStore(state => state.setDiscordClientId)
  const setDiscordLargeImageKey = useStore(state => state.setDiscordLargeImageKey)
  const setDiscordShowProfile = useStore(state => state.setDiscordShowProfile)
  const setDiscordShowModCount = useStore(state => state.setDiscordShowModCount)
  const setDiscordShowElapsed = useStore(state => state.setDiscordShowElapsed)
  const setDiscordMinimalPresence = useStore(state => state.setDiscordMinimalPresence)
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
  const notificationCenterEnabled = useStore(state => state.notificationCenterEnabled)
  const setNotificationCenterEnabled = useStore(state => state.setNotificationCenterEnabled)
  const toastRuntimeConnected = useStore(state => state.toastRuntimeConnected)
  const setToastRuntimeConnected = useStore(state => state.setToastRuntimeConnected)
  const toastSessionEnded = useStore(state => state.toastSessionEnded)
  const setToastSessionEnded = useStore(state => state.setToastSessionEnded)
  const setTaskAutoReduceImports = useStore(state => state.setTaskAutoReduceImports)
  const showSupportButton = useStore(state => state.showSupportButton)
  const accentColor = useStore(state => state.accentColor)
  const trackPlaytime = useStore(state => state.trackPlaytime)
  const trackExternalApps = useStore(state => state.trackExternalApps)
  const startWithSystem = useStore(state => state.startWithSystem)
  const startDiscreet = useStore(state => state.startDiscreet)
  const setTrackingSettings = useStore(state => state.setTrackingSettings)
  const setShowSupportButton = useStore(state => state.setShowSupportButton)
  const restartTour = useStore(state => state.restartTour)
  const resetTour = useStore(state => state.resetTour)
  const setAccentColor = useStore(state => state.setAccentColor)
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
  const [settingsQuery, setSettingsQuery] = useState('')
  // Gating réel (spec Add-ons §10-24, §75) : une section Paramètres n'existe
  // que si l'add-on correspondant est installé et activé. Sans l'add-on, ni
  // Discord, ni les clés providers, ni les sources d'illustrations n'apparaissent.
  const addonList = useStore(state => state.addons)
  const releaseNotesHistory = useStore(state => state.releaseNotesHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyVersion, setHistoryVersion] = useState<string>(appVersion)
  const capabilities = useMemo(() => addonCapabilities(addonList), [addonList])
  const hasCap = (capability: ZailonCapability) => hasCapability(capabilities, capability)
  const hasProviderCaps = (['provider.nexus', 'provider.gamebanana', 'provider.curseforge'] as ZailonCapability[]).some(capability => hasCapability(capabilities, capability))
  // Accordions des sections (spec §31-36) : repliées par défaut, état mémorisé
  // (localStorage) — la dernière section ouverte est restaurée au prochain
  // lancement (§33). La recherche et les liens internes ouvrent la section.
  const [openSection, setOpenSection] = useState<string | null>(() => {
    // Spec §62-64 : « Launcher Updates » est visible immédiatement — section
    // ouverte par défaut tant que l'utilisateur n'a pas choisi autre chose.
    try {
      const stored =      sessionStorage.getItem('zailon.settingsOpenSection')
      return stored && stored !== '' ? stored : 'app-updates'
    } catch {
      return 'app-updates'
    }
  })
  const toggleSection = (sectionId: string) => {
    const next = openSection === sectionId ? null : sectionId
    setOpenSection(next)
    try {
      if (next) sessionStorage.setItem('zailon.settingsOpenSection', next)
      else sessionStorage.removeItem('zailon.settingsOpenSection')
    } catch { /* stockage indisponible */ }
  }
  const revealSection = (label: string) => {
    const id = SETTINGS_SECTION_BY_LABEL[label]
    if (!id) return
    setOpenSection(id)
    try { sessionStorage.setItem('zailon.settingsOpenSection', id) } catch { /* ignore */ }
  }
  const artworkSteamGridDbKey = useStore(state => state.artworkSteamGridDbKey)
  const setArtworkSteamGridDbKey = useStore(state => state.setArtworkSteamGridDbKey)
  const artworkIgdbClientId = useStore(state => state.artworkIgdbClientId)
  const setArtworkIgdbClientId = useStore(state => state.setArtworkIgdbClientId)
  const artworkIgdbClientSecret = useStore(state => state.artworkIgdbClientSecret)
  const setArtworkIgdbClientSecret = useStore(state => state.setArtworkIgdbClientSecret)
  const artworkSourceMode = useStore(state => state.artworkSourceMode)
  const setArtworkSourceMode = useStore(state => state.setArtworkSourceMode)
  const [artworkGridDbDraft, setArtworkGridDbDraft] = useState('')
  const [igdbIdDraft, setIgdbIdDraft] = useState('')
  const [igdbSecretDraft, setIgdbSecretDraft] = useState('')
  const [artworkMessage, setArtworkMessage] = useState<string>()
  const [testingArtworkKey, setTestingArtworkKey] = useState(false)
  const settingsResults = useMemo(() => {
    const query = settingsQuery.trim().toLocaleLowerCase()
    if (!query) return []
    return SETTINGS_INDEX.filter(entry => `${entry.label} ${entry.keywords}`.toLocaleLowerCase().includes(query)).slice(0, 8)
  }, [settingsQuery])
  const goToSetting = (entry: (typeof SETTINGS_INDEX)[number]) => {
    setSettingsQuery('')
    if (entry.tab) {
      if (selectedGame) setSelectedGame(selectedGame.id)
      setView('games')
      setActiveGameTab(entry.tab)
    } else {
      // spec §53-54 : la recherche ouvre automatiquement la section repliée.
      if (entry.sectionLabel) revealSection(entry.sectionLabel)
      const section = Array.from(document.querySelectorAll<HTMLElement>('section')).find(element => element.textContent?.includes(entry.sectionLabel || ''))
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Spec Startup §20 : santé providers via le cache partagé (TTL 5 min) —
  // Intégrations n'appelle plus le getter natif si Explorer vient de le faire.
  useEffect(() => {
    if (!native.isDesktop()) return
    void cachedProviderStatuses(providerHealthCache, () => native.providerConnectionStatuses()).then(setProviderStatuses).catch(() => undefined)
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

  // Spec §38 : « Configurer » depuis le Quick Panel ouvre les Paramètres et
  // défile jusqu'à la section Discord Rich Presence.
  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    void listen<{ sectionLabel: string }>('open-settings-section', event => {
      const label = event.payload?.sectionLabel
      if (!label) return
      // spec §53-54 : le lien interne (Quick Panel, tutoriel, diagnostics)
      // ouvre la section repliée avant de défiler jusqu'à elle.
      revealSection(label)
      window.setTimeout(() => {
        const section = Array.from(document.querySelectorAll<HTMLElement>('section')).find(element => element.textContent?.includes(label))
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 120)
    }).then(listener => { unlisten = listener })
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

  const testArtworkConnection = async (provider: 'steamgriddb' | 'igdb' | 'gamebanana', keys: Record<string, string>) => {
    setTestingArtworkKey(true)
    setArtworkMessage(undefined)
    try {
      setArtworkMessage(await native.testArtworkProvider(provider, keys))
    } catch (reason) {
      setArtworkMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setTestingArtworkKey(false)
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
    <section className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-2 flex items-center gap-2 text-gold/70"><Search size={13} /><h2 className="text-[11px] font-mono uppercase tracking-widest">Rechercher un réglage</h2></div><input value={settingsQuery} onChange={event => setSettingsQuery(event.target.value)} placeholder="Ex. : clavier, stockage, images, canal…" className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/72 outline-none focus:border-gold/30" />{settingsResults.length > 0 && <div className="mt-2 space-y-1">{settingsResults.map(entry => <button key={entry.id} type="button" onClick={() => goToSetting(entry)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 text-left hover:border-gold/25"><span className="min-w-0"><span className="block truncate text-xs font-medium text-white/75">{entry.label}</span><span className="mt-0.5 block truncate text-[10px] text-white/35">{entry.path}</span></span><ChevronRight size={13} className="shrink-0 text-white/30" /></button>)}</div>}{settingsQuery.trim() && settingsResults.length === 0 && <p className="mt-2 text-[11px] text-white/34">Aucun réglage trouvé pour « {settingsQuery.trim()} ».</p>}</section>
    <div className="space-y-4">
      <AccordionSection id="preferences" title="Préférences et lisibilité" subtitle="Langue, texte, densité, animations" icon=<Settings2 size={13} /> open={openSection === 'preferences'} onToggle={() => toggleSection('preferences')}><div className="grid gap-3 md:grid-cols-3"><label className="block text-[11px] text-white/45">Langue<select value={language} onChange={event => setLanguage(event.target.value)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="en">English</option><option value="fr">Français</option></select></label><label className="block text-[11px] text-white/45">Taille du texte<select value={textSize} onChange={event => setTextSize(event.target.value as typeof textSize)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="small">Petite (minimum 14 px)</option><option value="normal">Normale</option><option value="large">Grande</option><option value="very-large">Très grande</option></select></label><label className="block text-[11px] text-white/45">Densité<select value={uiDensity} onChange={event => setUiDensity(event.target.value as typeof uiDensity)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="comfortable">Confortable</option><option value="compact">Compacte</option></select></label><label className="block text-[11px] text-white/45">Animations<select value={motionMode} onChange={event => setMotionMode(event.target.value as typeof motionMode)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="auto">Automatique (suit le système)</option><option value="enabled">Activées</option><option value="reduced">Réduites</option></select></label><label className="block text-[11px] text-white/45">Mode Performance par défaut<select value={globalPerformanceMode} onChange={event => setGlobalPerformanceMode(event.target.value as typeof globalPerformanceMode)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="auto">Automatique</option><option value="balanced">Équilibré</option><option value="performance">Performance</option><option value="quality">Qualité</option></select></label><label className="block text-[11px] text-white/45">Sur batterie<select value={batteryPerformanceBehavior} onChange={event => setBatteryPerformanceBehavior(event.target.value as typeof batteryPerformanceBehavior)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70"><option value="economy">Économie</option><option value="balanced">Équilibré</option></select></label></div>      <label className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/58"><span className="flex items-center gap-2"><strong className="text-white/76">Effet 3D des couvertures</strong><ZailonInfoPopover text="Incline légèrement les couvertures selon la position de la souris (max 4°, taille quasi inchangée). L'effet est automatiquement désactivé quand le mode économie d'énergie ou « Réduire les animations » est actif, et sur les écrans tactiles." /></span><ZailonSwitch checked={coverParallax} onChange={setCoverParallax} /></label><label className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/58"><span className="flex items-center gap-2"><strong className="text-white/76">Réduire les explications</strong><ZailonInfoPopover text="Un réglage = une ligne : les descriptions secondaires sont masquées et le détail passe dans les bulles ⓘ. Recommandé pour les utilisateurs habitués. (Par défaut après l’onboarding.)" /></span><ZailonSwitch checked={reduceExplanations} onChange={setReduceExplanations} /></label><label className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/58"><span className="flex items-center gap-2"><strong className="text-white/76">Mode avancé</strong><ZailonInfoPopover text="Affiche les réglages techniques des pages du jeu (dossier Bypass / Loader, chemins additionnels…) au lieu de les laisser repliés dans « Avancé »." /></span><ZailonSwitch checked={advancedMode} onChange={setAdvancedMode} /></label>{!reduceExplanations && <p className="mt-3 text-[11px] leading-relaxed text-white/35">Aucun texte essentiel ne descend sous 14 px. Ce réglage change les variables typographiques centrales, pas un zoom global. Les panneaux restent défilables quand l’espace manque.</p>}</AccordionSection>

      <AccordionSection id="appearance" title="Apparence · Couleur d’accent" subtitle="Couleur d’accent, aperçu des contrôles" icon=<Palette size={13} /> open={openSection === 'appearance'} onToggle={() => toggleSection('appearance')}>
        <div className="flex flex-wrap items-center gap-2">{['#f3faf8', '#38bdf8', '#2dd4bf', '#a78bfa', '#fb7185', '#fbbf24', '#f97316'].map(color => <button key={color} type="button" onClick={() => setAccentColor(color)} aria-label={`Accent ${color}`} className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-105 ${accentColor.toLowerCase() === color ? 'border-white shadow-[0_0_20px_var(--zailon-accent-muted)]' : 'border-white/15'}`} style={{ backgroundColor: color }} />)}<label className="ml-1 flex items-center gap-2 rounded-lg border border-white/[0.08] px-2 text-xs text-white/55">Libre<input type="color" value={accentColor} onChange={event => setAccentColor(event.target.value)} className="h-9 w-11 cursor-pointer border-0 bg-transparent" /></label><button type="button" onClick={() => setAccentColor('#f3faf8')} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/55 hover:bg-white/[0.05]">Réinitialiser</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" className="rounded-lg bg-gold px-3 py-2 font-semibold text-[var(--zailon-accent-text)]">Action principale</button><div className="rounded-lg border border-gold/35 bg-gold/[0.06] px-3 py-2 text-center text-xs text-gold">Sélection active</div><div className="rounded-lg border border-white/[0.08] px-3 py-2 text-center text-xs text-white/55">Les erreurs gardent leur rouge sémantique</div></div>
        {!reduceExplanations && <p className="mt-3 text-xs leading-relaxed text-white/38">La couleur est appliquée en direct aux actions principales, sélections et anneaux de focus. Le texte de bouton bascule automatiquement entre sombre et clair selon la luminance.</p>}
      </AccordionSection>


      <AccordionSection id="notifications" title="Tâches et notifications" subtitle="Cartes de progression, toasts de session" icon=<Settings2 size={13} /> open={openSection === 'notifications'} onToggle={() => toggleSection('notifications')}><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/58">Afficher les cartes de progression<ZailonSwitch checked={taskToastsEnabled} onChange={setTaskToastsEnabled} /></label><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/58">Réduire automatiquement l’import<ZailonSwitch checked={taskAutoReduceImports} onChange={setTaskAutoReduceImports} /></label></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/58">« En cours via ZAILON »<ZailonSwitch checked={toastRuntimeConnected} onChange={setToastRuntimeConnected} /></label><label className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/58">« Session terminée »<ZailonSwitch checked={toastSessionEnded} onChange={setToastSessionEnded} /></label></div><p className="mt-2 text-[11px] text-white/32">La bulle « En cours via ZAILON » apparaît uniquement quand le vrai processus du jeu est détecté et les fonctions runtime initialisées — jamais à l'ouverture du launcher ou de Steam. Elle rappelle le raccourci du panneau rapide (Ctrl+Alt+Z) seulement les 3 premières sessions.</p>{!reduceExplanations && <><p className="mt-2 text-[11px] text-white/32">Masquer une carte ne supprime jamais la tâche. L’historique complet reste disponible dans Téléchargements.</p><label className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/58"><span className="flex items-center gap-2"><strong className="text-white/76">Centre de notifications</strong><ZailonInfoPopover text="Désactivé : le bouton Historique, le badge et le centre disparaissent de toute l’interface, et son historique n’est pas rendu. Les erreurs critiques (corruption, sécurité, perte de données, action obligatoire) restent toujours affichées en dialogue ou toast (§23)." /></span><ZailonSwitch checked={notificationCenterEnabled} onChange={setNotificationCenterEnabled} /></label></>}</AccordionSection>

      {hasCap('artwork.plus') && <AccordionSection id="illustrations" title="Illustrations" subtitle="Images automatiques, sources, état" icon=<Palette size={13} /> open={openSection === 'illustrations'} onToggle={() => toggleSection('illustrations')}>
        <label className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/62"><span className="flex items-center gap-2"><strong className="text-white/76">Images automatiques pour les nouveaux jeux</strong><ZailonInfoPopover text="ZAILON peut proposer des illustrations pour les nouveaux jeux détectés. La copie locale reste toujours soumise à confirmation. Priorité : art officiel Steam d'abord, puis les sources configurées (SteamGridDB, IGDB, GameBanana)." /></span><ZailonSwitch checked={autoArtwork} onChange={setAutoArtwork} /></label>
        <div className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/62"><span className="flex items-center gap-2"><strong className="text-white/76">Source de recherche</strong><ZailonInfoPopover text="Automatique : essaie la première source fiable, puis les autres seulement si elle ne renvoie rien. Toutes les sources : une seule recherche fusionnée avec toutes les sources disponibles. Une source indisponible ne bloque jamais la recherche." /></span><select value={artworkSourceMode} onChange={event => setArtworkSourceMode(event.target.value as 'automatic' | 'all')} className="rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/72"><option value="automatic">Automatique</option><option value="all">Toutes les sources</option></select></div>
        <div className="mt-3 rounded-lg bg-white/[0.025] p-3">
          <p className="mb-2 text-[11px] font-semibold text-white/55">État des sources</p>
          <div className="space-y-1.5">{artworkProvidersWithState({ steamgriddbApiKey: artworkSteamGridDbKey, igdbClientId: artworkIgdbClientId, igdbClientSecret: artworkIgdbClientSecret }).map(provider => <div key={provider.id} className="flex items-center gap-2 text-[11px]"><span className="w-36 shrink-0 text-white/65">{provider.label}</span><span className={provider.state === 'available' ? 'text-emerald-300/72' : provider.state === 'not-configured' ? 'text-amber-200/70' : 'text-white/30'}>{provider.state === 'available' ? '✓ disponible' : provider.state === 'not-configured' ? 'Non configuré' : 'Connecteur non disponible'}</span><ZailonInfoPopover text={provider.reason({ steamgriddbApiKey: artworkSteamGridDbKey, igdbClientId: artworkIgdbClientId, igdbClientSecret: artworkIgdbClientSecret })} /></div>)}</div>
        </div>
        <div className="mt-2 rounded-lg bg-white/[0.025] p-3">
          <p className="mb-2 text-[11px] font-semibold text-white/55">SteamGridDB</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" value={artworkGridDbDraft} onChange={event => setArtworkGridDbDraft(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={artworkSteamGridDbKey ? 'Coller une nouvelle clé pour la remplacer' : 'Coller la clé API SteamGridDB (gratuite)'} className="min-w-[240px] flex-1 rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/30" />
            <button type="button" onClick={() => { if (!artworkGridDbDraft.trim()) return; setArtworkSteamGridDbKey(artworkGridDbDraft.trim()); setArtworkGridDbDraft(''); setArtworkMessage('Clé SteamGridDB enregistrée localement.') }} disabled={!artworkGridDbDraft.trim()} className="rounded bg-gold px-3 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-30">{artworkSteamGridDbKey ? 'Remplacer' : 'Enregistrer'}</button>
            {artworkSteamGridDbKey && <button type="button" onClick={() => void testArtworkConnection('steamgriddb', { steamgriddb: artworkSteamGridDbKey })} disabled={testingArtworkKey} className="rounded border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/64 disabled:opacity-35">{testingArtworkKey ? 'Test…' : 'Tester la connexion'}</button>}
            {artworkSteamGridDbKey && <button type="button" onClick={() => { setArtworkSteamGridDbKey(''); setArtworkMessage('Clé SteamGridDB supprimée.') }} className="rounded border border-red-300/15 px-2 py-1.5 text-[11px] text-red-200/60">Supprimer</button>}
          </div>
          {artworkMessage && <p className="mt-2 text-[11px] text-white/45">{artworkMessage}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-white/32">La clé est stockée localement et transmise uniquement à SteamGridDB, uniquement pour les illustrations.</p>
        </div>
        <div className="mt-2 rounded-lg bg-white/[0.025] p-3">
          <p className="mb-2 text-[11px] font-semibold text-white/55">IGDB — application Twitch gratuite</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="text" value={igdbIdDraft} onChange={event => setIgdbIdDraft(event.target.value)} spellCheck={false} placeholder={artworkIgdbClientId ? 'Client ID enregistré — coller pour remplacer' : 'Client ID (dev.twitch.tv/console/apps)'} className="rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/30" />
            <input type="password" value={igdbSecretDraft} onChange={event => setIgdbSecretDraft(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={artworkIgdbClientSecret ? 'Client Secret enregistré — coller pour remplacer' : 'Client Secret'} className="rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-gold/30" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { if (!igdbIdDraft.trim() || !igdbSecretDraft.trim()) return; setArtworkIgdbClientId(igdbIdDraft.trim()); setArtworkIgdbClientSecret(igdbSecretDraft.trim()); setIgdbIdDraft(''); setIgdbSecretDraft(''); setArtworkMessage('Client Twitch enregistré localement pour IGDB.') }} disabled={!igdbIdDraft.trim() || !igdbSecretDraft.trim()} className="rounded bg-gold px-3 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-30">{artworkIgdbClientId && artworkIgdbClientSecret ? 'Remplacer' : 'Enregistrer'}</button>
            {artworkIgdbClientId && artworkIgdbClientSecret && <button type="button" onClick={() => void testArtworkConnection('igdb', { igdbClientId: artworkIgdbClientId, igdbClientSecret: artworkIgdbClientSecret })} disabled={testingArtworkKey} className="rounded border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/64 disabled:opacity-35">{testingArtworkKey ? 'Test…' : 'Tester la connexion'}</button>}
            {(artworkIgdbClientId || artworkIgdbClientSecret) && <button type="button" onClick={() => { setArtworkIgdbClientId(''); setArtworkIgdbClientSecret(''); setArtworkMessage('Client Twitch supprimé (IGDB).') }} className="rounded border border-red-300/15 px-2 py-1.5 text-[11px] text-red-200/60">Supprimer</button>}
            <button type="button" onClick={() => void testArtworkConnection('gamebanana', {})} disabled={testingArtworkKey} className="rounded border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/64 disabled:opacity-35">{testingArtworkKey ? 'Test…' : 'Tester GameBanana (public)'}</button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/32">Le Client ID et le Client Secret sont stockés localement et transmis uniquement à Twitch/IGDB (échange Client Credentials pour obtenir un jeton). IGDB couvre les jeux absents de Steam : covers, artworks et screenshots.</p>
        </div>
      </AccordionSection>}

      {hasCap('discord.presence') && <AccordionSection id="discord" title="Discord Rich Presence réelle" subtitle="Présence en jeu, diagnostic" icon=<Radio size={13} /> open={openSection === 'discord'} onToggle={() => toggleSection('discord')}><label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Activer pendant le jeu</strong><span className="mt-1 block leading-relaxed text-white/36">ZAILON se connecte au canal IPC local de Discord au lancement du jeu, publie l’activité puis la nettoie quand le processus se ferme.</span></span><ZailonSwitch checked={discordPresence} onChange={() => toggleDiscord()} className="mt-0.5" /></label><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-[11px] text-white/48">Application ID ZAILON (prérempli)<input value={discordClientId} onChange={event => setDiscordClientId(event.target.value.replace(/\D/g, '').slice(0, 32))} inputMode="numeric" placeholder="Identifiant numérique Discord" className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-ink-200 px-3 py-2 text-[11px] text-white/72 outline-none focus:border-gold/30" /></label><label className="text-[11px] text-white/48">Clé de grande image (optionnelle)<input value={discordLargeImageKey} onChange={event => setDiscordLargeImageKey(event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128))} placeholder="zailon ou clé d’asset Discord" className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-ink-200 px-3 py-2 text-[11px] text-white/72 outline-none focus:border-gold/30" /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Afficher le profil<ZailonSwitch checked={discordShowProfile} onChange={setDiscordShowProfile} /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Afficher les mods actifs<ZailonSwitch checked={discordShowModCount} onChange={setDiscordShowModCount} /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Afficher le temps écoulé<ZailonSwitch checked={discordShowElapsed} onChange={setDiscordShowElapsed} /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/54">Mode minimal (jeu + « Via ZAILON »)<ZailonSwitch checked={discordMinimalPresence} onChange={setDiscordMinimalPresence} /></label></div><div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void testDiscord()} disabled={testingDiscord || !discordClientId.trim()} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/64 hover:bg-white/[0.05] disabled:opacity-35">{testingDiscord ? 'Test IPC…' : 'Tester avec Discord lancé'}</button>{discordStatus && <span className={`text-[11px] ${discordStatus.connected ? 'text-emerald-300/72' : 'text-amber-200/72'}`}>{discordStatus.message}</span>}</div><p className="mt-3 text-[11px] leading-relaxed text-white/30">L’Application ID `1509971526987022497` est prérempli — c’est l’identifiant de l’application ZAILON, centralisé et identique pour tous. Aucun OAuth, bot ou secret n’est nécessaire pour la présence locale.</p><div className="mt-3 rounded-lg bg-ink-200/60 p-3"><div className="mb-2 flex items-center justify-between text-[11px] text-white/48"><span className="font-mono uppercase tracking-widest">Diagnostic</span><span className="text-white/30">spec §40</span></div><div className="grid gap-1.5 text-[11px]"><div className="flex justify-between"><span className="text-white/40">Application ID</span><span className="font-mono text-white/72">1509971526987022497</span></div><div className="flex justify-between"><span className="text-white/40">Discord détecté</span><span className={discordStatus ? (discordStatus.connected ? 'text-emerald-300/72' : 'text-amber-200/72') : 'text-white/36'}>{discordStatus ? (discordStatus.connected ? '✓' : '○') : '○'}</span></div><div className="flex justify-between"><span className="text-white/40">RPC connecté</span><span className={discordStatus?.connected ? 'text-emerald-300/72' : 'text-white/36'}>{discordStatus?.connected ? '✓' : '—'}</span></div><div className="flex justify-between"><span className="text-white/40">Session publiée</span><span className="text-white/72">{lastDiscordPublished?.gameName || '—'}</span></div><div className="flex justify-between"><span className="text-white/40">Asset</span><span className="font-mono text-white/72">{lastDiscordPublished?.asset || '—'}</span></div><div className="flex justify-between"><span className="text-white/40">Dernière mise à jour</span><span className="text-white/72">{lastDiscordPublished ? new Date(lastDiscordPublished.at).toLocaleTimeString() : '—'}</span></div></div></div>      </AccordionSection>}

      <AccordionSection id="game-mode" title="Mode jeu" subtitle="Activité réduite, minimisation" icon=<Gamepad2 size={13} /> open={openSection === 'game-mode'} onToggle={() => toggleSection('game-mode')}><label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Réduire l’activité ZAILON pendant le jeu</strong><span className="mt-1 block leading-relaxed text-white/36">Suspend les scans lourds et les animations non nécessaires quand un jeu tourne, pour ne garder que la présence, le clavier, le visuel, Discord et le panneau rapide.</span></span><ZailonSwitch checked={reduceActivityDuringGame} onChange={setReduceActivityDuringGame} className="mt-0.5" /></label><label className="mt-2 flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Réduire ZAILON lorsque le jeu démarre</strong><span className="mt-1 block leading-relaxed text-white/36">Minimise automatiquement la fenêtre principale dès que le jeu est détecté (comme Steam).</span></span><ZailonSwitch checked={autoMinimizeOnGameStart} onChange={setAutoMinimizeOnGameStart} className="mt-0.5" /></label><label className="mt-2 flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Restaurer ZAILON après le jeu</strong><span className="mt-1 block leading-relaxed text-white/36">Restaure la fenêtre principale à la fin de la session de jeu.</span></span><ZailonSwitch checked={restoreAfterGame} onChange={setRestoreAfterGame} className="mt-0.5" /></label></AccordionSection>
      <AccordionSection id="quick-panel" title="Panneau rapide en jeu" subtitle="Fenêtre native, raccourci" icon=<MonitorUp size={13} /> open={openSection === 'quick-panel'} onToggle={() => toggleSection('quick-panel')}><label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/62"><span><strong className="block text-white/76">Afficher le panneau rapide ZAILON</strong><span className="mt-1 block leading-relaxed text-white/36">Fenêtre native ZAILON (jamais une injection) pour régler visuel et clavier pendant le jeu. Ouverte au raccourci, fermée automatiquement quand elle perd le focus. Indisponible en plein écran exclusif (utilisez Borderless).</span></span><ZailonSwitch checked={quickPanelEnabled} onChange={setQuickPanelEnabled} className="mt-0.5" /></label>{quickPanelEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[11px] text-white/48">Raccourci d’ouverture<input value={quickPanelShortcut} onChange={event => setQuickPanelShortcut(event.target.value)} placeholder="Ctrl+Alt+Z" className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-ink-200 px-3 py-2 font-mono text-[11px] text-white/72 outline-none focus:border-gold/30" /></label><div className="flex flex-col justify-end"><button type="button" onClick={() => native.isDesktop() && void native.quickPanel.toggle()} disabled={!native.isDesktop()} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] font-semibold text-white/60 hover:border-gold/25 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"><MonitorUp size={13} />Tester le panneau</button><p className="mt-1.5 text-[10px] leading-relaxed text-white/28">Ouvre la vraie fenêtre native, même sans jeu — vérifie création, taille et focus (spec Quick Panel §21).</p></div></div>}{!reduceExplanations && <p className="mt-3 text-[11px] leading-relaxed text-white/32">Le panneau est une fenêtre indépendante : il ne modifie aucun fichier du jeu et ne désactive jamais le clavier à sa fermeture (restauration du focus au jeu).</p>}</AccordionSection>

      <AccordionSection id="content" title="Contenu et confidentialité" subtitle="NSFW, exploration" icon=<EyeOff size={13} /> open={openSection === 'content'} onToggle={() => toggleSection('content')}>
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span><strong className="block text-white/75">Afficher le contenu adulte</strong><span className="mt-1 block leading-relaxed text-white/35">Désactivé par défaut. Les miniatures NSFW ne sont pas rendues quand ce réglage est coupé.</span></span><ZailonSwitch checked={nsfw} onChange={() => { if (!nsfw && !window.confirm('Afficher le contenu adulte ? Ce réglage peut révéler des images et des descriptions explicites.')) return; toggleNSFW() }} className="mt-0.5" /></label>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55"><span>Masquer aussi le contenu non classé</span><ZailonSwitch checked={hideUnclassifiedNsfw} onChange={setHideUnclassifiedNsfw} /></label>
      </AccordionSection>

      {hasProviderCaps && <AccordionSection id="providers" title="Fournisseurs de mods" subtitle="Clés API, état des fournisseurs" icon=<KeyRound size={13} /> open={openSection === 'providers'} onToggle={() => toggleSection('providers')}>
        {/* Feature removal (spec §57) : chaque ligne de fournisseur n'existe que
            si SON add-on est installé — jamais de saisie de clé fantôme. */}
        {hasCap('provider.nexus') && <CredentialRow provider="Nexus Mods" status={providerStatuses.nexus} value={nexusKey} busy={busyProvider === 'nexus'} onChange={setNexusKey} onSave={() => void saveSecret('nexus', nexusKey)} onTest={() => void testProvider('nexus')} onRevoke={() => void revokeProvider('nexus')} />}
        {hasCap('provider.curseforge') && <CredentialRow provider="CurseForge" status={providerStatuses.curseforge} value={curseforgeKey} busy={busyProvider === 'curseforge'} onChange={setCurseforgeKey} onSave={() => void saveSecret('curseforge', curseforgeKey)} onTest={() => void testProvider('curseforge')} onRevoke={() => void revokeProvider('curseforge')} />}
        {providerMessage && <p className="mt-2 text-[11px] text-white/45">{providerMessage}</p>}
        <div className="mt-3 rounded-lg border border-amber-300/18 bg-amber-300/[0.04] p-3 text-[11px] leading-relaxed text-amber-100/62"><p className="flex items-start gap-2"><ShieldAlert size={14} className="mt-0.5 shrink-0" /><span><strong className="text-amber-100/85">Sécurité :</strong> si une clé Nexus personnelle a été collée dans un chat, un ticket ou un dépôt, révoquez-la immédiatement dans Nexus puis générez-en une nouvelle. ZAILON ne peut pas révoquer la clé à votre place.</span></p><p className="mt-2 text-white/42">La clé complète n’est jamais renvoyée à l’interface, ni écrite dans les logs ou les exports. Elle reste dans le coffre du système. Une application publique Nexus doit être enregistrée auprès de Nexus Mods.</p></div>
      </AccordionSection>}

      {hasCap('provider.nexus') && <AccordionSection id="nxm" title="Liens Nexus NXM" subtitle="Association nxm://" icon=<Link2 size={13} /> open={openSection === 'nxm'} onToggle={() => toggleSection('nxm')}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3"><div><p className="text-[11px] font-medium text-white/70">Association nxm:// {nxmAssociated ? 'active' : 'inactive'}</p><p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/35">L’activation peut remplacer Vortex ou Mod Organizer comme gestionnaire NXM. ZAILON demande donc toujours votre consentement explicite.</p></div><button onClick={() => { if (!nxmAssociated && !window.confirm('Associer les liens nxm:// à ZAILON ? Cela peut remplacer le gestionnaire actuellement configuré.')) return; void native.setNxmAssociation(!nxmAssociated).then(setNxmAssociated).catch(reason => setProviderMessage(String(reason))) }} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/65 hover:bg-white/[0.06]">{nxmAssociated ? 'Désactiver' : 'Activer'}</button></div>
      </AccordionSection>}

      <AccordionSection id="mod-updates" title="Mises à jour des mods" subtitle="Fréquence, téléchargement" icon=<RefreshCw size={13} /> open={openSection === 'mod-updates'} onToggle={() => toggleSection('mod-updates')}>
        <div className="grid gap-2 sm:grid-cols-3"><label className="text-[11px] text-white/55">Fréquence<select value={modUpdateFrequency} onChange={event => setModUpdateFrequency(event.target.value as typeof modUpdateFrequency)} className="mt-1.5 block w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/75"><option value="never">Jamais</option><option value="startup">Au démarrage</option><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option></select></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55">Télécharger automatiquement<ZailonSwitch checked={autoDownloadModUpdates} onChange={setAutoDownloadModUpdates} /></label><label className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/55">Installer automatiquement<ZailonSwitch checked={autoInstallModUpdates} onChange={next => { if (next && !window.confirm('L’installation automatique reste limitée aux correspondances exactes et sauvegarde toujours la version précédente. Continuer ?')) return; setAutoInstallModUpdates(next) }} /></label></div>
      </AccordionSection>

      <AccordionSection id="app-updates" title="Application updates" subtitle="Canal, vérification, historique" icon=<RefreshCw size={13} /> open={openSection === 'app-updates'} onToggle={() => toggleSection('app-updates')} alert={Boolean(error || lastUpdateError || status === 'available')}>
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow label="Installed version" value={`v${appVersion}`} />
          <InfoRow label="Latest compatible version" value={latestVersion ? `v${latestVersion}` : status === 'upToDate' ? `v${appVersion} (up to date)` : 'Not checked yet'} />
          <InfoRow label="Last check" value={formatDate(lastUpdateCheck)} />
          <InfoRow label="Last installed update" value={lastInstalledUpdate ? `v${lastInstalledUpdate.version} · ${formatDate(lastInstalledUpdate.installedAt)}` : 'No in-app update installed yet'} />
        </div>
        <div className="mt-3 grid gap-2 rounded-lg bg-white/[0.025] p-2.5 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[11px] text-white/65"><span>Check automatically at startup</span><ZailonSwitch checked={autoCheckUpdates} onChange={setAutoCheckUpdates} aria-label="Check updates automatically" /></label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[11px] text-white/65"><span>Install automatically when available</span><ZailonSwitch checked={autoInstallUpdates} onChange={setAutoInstallUpdates} aria-label="Install updates automatically" /></label>
          <label className="flex items-center justify-between gap-3 text-[11px] text-white/65"><span>Update channel</span><select value={updateChannel} onChange={event => setUpdateChannel(event.target.value as 'stable' | 'beta')} className="rounded border border-white/[0.08] bg-ink-200 px-2 py-1 text-[11px] text-white/80"><option value="stable">Stable</option><option value="beta">Beta</option></select></label>
          <div className="flex items-center text-[11px] leading-relaxed text-white/30">The updater only accepts signed packages published by the official ZAILON GitHub release.</div>
        </div>
        {(status === 'upToDate' || status === 'available') && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-green-400"><CheckCircle2 size={12} />{status === 'available' ? `Update v${update?.version} is ready.` : 'ZAILON is up to date.'}</p>}
        {(error || lastUpdateError) && <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-red-300"><AlertCircle size={12} className="mt-0.5 shrink-0" />{error || lastUpdateError}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void checkUpdates()} disabled={isChecking} className="flex items-center gap-1.5 rounded bg-gold px-3 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold-light disabled:opacity-40"><RefreshCw size={11} className={isChecking ? 'animate-spin' : ''} />{isChecking ? 'Checking…' : 'Check for updates'}</button><button onClick={() => void openLog()} className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/70 hover:text-white"><FileText size={11} />Open update log</button></div>
      </AccordionSection>

      <AccordionSection id="tracking" title="Suivi & démarrage discret" subtitle="Statistiques locales, apps hors ZAILON" icon=<Activity size={13} /> open={openSection === 'tracking'} onToggle={() => toggleSection('tracking')}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span>Suivre le temps d’utilisation</span><ZailonSwitch checked={trackPlaytime} onChange={next => setTrackingSettings({ trackPlaytime: next })} /></label>
          <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span>Suivre les apps lancées hors ZAILON</span><ZailonSwitch checked={trackExternalApps} onChange={next => setTrackingSettings({ trackExternalApps: next })} /></label>
          <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span>Démarrer ZAILON avec le système</span><ZailonSwitch checked={startWithSystem} onChange={next => setTrackingSettings({ startWithSystem: next })} /></label>
          <label className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3 text-[11px] text-white/65"><span>Démarrer discrètement</span><ZailonSwitch checked={startDiscreet} onChange={next => setTrackingSettings({ startDiscreet: next })} disabled={!startWithSystem} /></label>
        </div>
        {!reduceExplanations && <p className="mt-2 text-[11px] leading-relaxed text-white/32">Les statistiques restent 100 % locales — aucun compte, aucune télémétrie. « Discrètement » lance ZAILON sans ouvrir la fenêtre principale : seul le suivi des sessions tourne (fenêtre réapparaît au double-clic). {!startDiscreet && trackExternalApps && 'ⓘ Le suivi des apps hors ZAILON commence uniquement lorsque ZAILON est ouvert.'}</p>}
      </AccordionSection>

      <AccordionSection id="library-stats" title="Library statistics" subtitle="Jeux, mods, temps de jeu" icon=<Database size={13} /> open={openSection === 'library-stats'} onToggle={() => toggleSection('library-stats')}><div className="grid grid-cols-3 gap-2 text-center"><Stat label="Games" value={String(games.length)} /><Stat label="Mods" value={String(games.reduce((sum, game) => sum + game.installedMods.length, 0))} /><Stat label="Playtime" value={formatTime(totalPlaytime)} /></div></AccordionSection>
      <AccordionSection id="storage" title="Stockage" subtitle="Espace, nettoyage" icon=<HardDrive size={13} /> open={openSection === 'storage'} onToggle={() => toggleSection('storage')}><div className="grid grid-cols-2 gap-2 xl:grid-cols-4"><Stat label="Mods (paquets ZAILON)" value={formatBytes(games.reduce((sum, game) => sum + game.installedMods.reduce((total, mod) => total + (mod.sizeBytes || 0), 0), 0))} /><Stat label="Tâches conservées" value={String(backgroundTasks.length)} /><Stat label="Points de restauration" value={String(restorePoints.length)} /><Stat label="Cache / temporaire" value="Non mesuré" /></div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { if (window.confirm('Nettoyer l’historique des tâches terminées et en erreur ? Les mods installés et les tâches en cours ne sont pas touchés.')) clearBackgroundTasks() }} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/64 hover:bg-white/[0.05]"><Trash2 size={12} />Nettoyer l’historique des tâches</button></div>{!reduceExplanations && <p className="mt-3 text-[11px] leading-relaxed text-white/32">Tailles réelles calculées depuis les paquets locaux. Cache, miniatures et fichiers temporaires : mesurables en Phase 3 — rien n’est supprimé sans confirmation, et jamais un fichier utilisé par un profil, un rollback ou une Collection.</p>}</AccordionSection>

      <AccordionSection id="about" title="ZAILON · À propos" subtitle="Version, visite guidée, liens" icon=<Info size={13} /> open={openSection === 'about'} onToggle={() => toggleSection('about')}><p className="text-xs text-white/55">Universal Mod Launcher · v{appVersion}</p><p className="mt-1 text-[11px] text-white/30">Runtime: {native.isDesktop() ? 'Application native Tauri' : 'aperçu web (opérations natives désactivées)'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setHistoryVersion(appVersion); setHistoryOpen(true) }} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]"><FileClock size={12} />Historique des versions</button><button type="button" onClick={() => { restartTour(); setView('home') }} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]"><Compass size={12} />Revoir la visite guidée</button><button type="button" onClick={() => { if (window.confirm('Réinitialiser les conseils et la visite guidée ?')) resetTour() }} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]"><RefreshCw size={12} />Réinitialiser les conseils</button></div><label className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs text-white/55"><span className="flex items-center gap-2"><Heart size={14} className="text-rose-200/70" />Afficher « Me soutenir » dans la barre latérale</span><ZailonSwitch checked={showSupportButton} onChange={setShowSupportButton} /></label><div className="mt-3 flex flex-wrap gap-2">{CREATOR_LINKS.map(link => <button key={link.id} type="button" onClick={() => void native.openExternalUrl(link.url)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]"><ExternalLink size={12} />{link.label}</button>)}</div><p className="mt-3 text-[11px] text-white/28">Les liens ouvrent des sites HTTPS autorisés. ZAILON ne collecte aucune donnée de paiement ni télémétrie associée.</p></AccordionSection>

      {historyOpen && <ReleaseNotesHistoryModal
        versions={[{ version: appVersion, notes: releaseNotesHistory.find(item => item.version === appVersion)?.notes, date: releaseNotesHistory.find(item => item.version === appVersion)?.date }, ...releaseNotesHistory.filter(item => item.version !== appVersion)]}
        selectedVersion={historyVersion}
        onSelectVersion={setHistoryVersion}
        onClose={() => setHistoryOpen(false)}
      />}
    </div>
  </div>
}

/** Modale « Historique des versions » (spec §7) : les notes de chaque version
 * restent consultables après fermeture de la popup de mise à jour. Scrollable,
 * header + footer fixes, jamais de blocage du launcher. */
function ReleaseNotesHistoryModal({ versions, selectedVersion, onSelectVersion, onClose }: {
  versions: Array<{ version: string; notes?: string; date?: string }>
  selectedVersion: string
  onSelectVersion: (version: string) => void
  onClose: () => void
}) {
  const entry = versions.find(item => item.version === selectedVersion)
  const notes = entry?.notes ?? ''
  const parsed = useMemo(() => {
    try {
      return parseMarkdown(notes)
    } catch {
      return []
    }
  }, [notes])
  const notesFailed = notes.trim() !== '' && parsed.length === 0
  const summary = summarizeBlocks(parsed, 40)
  return (
    <ScrollableModal
      title={`Historique des versions — ZAILON`}
      subtitle="Notes de mise à jour, consultables à tout moment"
      footer={
        <>
          <a href="https://github.com/N7T0-OF/ZAILON/releases" onClick={event => { event.preventDefault(); void native.openExternalUrl('https://github.com/N7T0-OF/ZAILON/releases') }} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]"><ExternalLink size={12} />Toutes les notes sur GitHub</a>
          <button type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90">Fermer</button>
        </>
      }
      onClose={onClose}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {versions.slice(0, 24).map(item => (
          <button key={item.version} type="button" onClick={() => onSelectVersion(item.version)} className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${item.version === selectedVersion ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/[0.08] text-white/50 hover:bg-white/[0.04] hover:text-white/75'}`}>{item.version === appVersion ? `${item.version} · actuelle` : item.version}</button>
        ))}
      </div>
      {notesFailed ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-xs leading-relaxed text-white/55">Les notes détaillées de la version {selectedVersion} sont indisponibles localement.</p>
          <button type="button" onClick={() => void native.openExternalUrl('https://github.com/N7T0-OF/ZAILON/releases')} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]"><FileText size={12} />Voir les notes sur GitHub</button>
        </div>
      ) : summary.truncated ? (
        <>
          <SafeMarkdown blocks={summary.blocks} />
          <p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] uppercase tracking-widest text-white/30">↓ Faire défiler pour la suite</p>
        </>
      ) : (
        <SafeMarkdown text={notes} />
      )}
    </ScrollableModal>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] px-3 py-2"><p className="text-[11px] font-mono text-white/30">{label}</p><p className="mt-0.5 truncate text-[11px] font-medium text-white/80" title={value}>{value}</p></div>
}

function formatBytes(size: number) {
  if (size <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
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
      <button onClick={onSave} disabled={busy || !value.trim()} className="rounded bg-gold px-3 py-1.5 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-30">{busy && value.trim() ? 'Vérification…' : status?.configured ? 'Remplacer' : 'Enregistrer'}</button>
      {status?.configured && <button onClick={onTest} disabled={busy} className="rounded border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/64 disabled:opacity-35">Tester la connexion</button>}
      {status?.configured && <button onClick={onRevoke} disabled={busy} className="rounded border border-red-300/15 px-2 py-1.5 text-[11px] text-red-200/60 disabled:opacity-35">Supprimer du coffre</button>}
    </div>
  </div>
}
