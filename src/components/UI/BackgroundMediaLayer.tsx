import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BackgroundMediaSettings, GameBackgroundMedia, mediaDisposePolicy, resolveAudioSettings, resolveMediaType, shouldStartMuted } from '../../lib/backgroundMedia'
import { applyBackgroundAudio, publishBackgroundPlayerState, registerBackgroundPlayer, unregisterBackgroundPlayer, type BackgroundPlayerCommands } from '../../lib/backgroundMediaPlayer'
import { youtubeEmbedUrl } from '../../lib/youtubeUrl'

/** Délai avant dispose du player YouTube quand ZAILON reste en arrière-plan
 * (spec §52) : au-delà, la vidéo est démontée pour libérer la mémoire. */
const LONG_BLUR_DISPOSE_MS = 3 * 60_000

/**
 * MediaPlaybackArbiter (spec §49, §74) : un seul fond vidéo ZAILON actif à la
 * fois. Le Hero cède la place à un aperçu (mode preview), et tout lecteur
 * relâche la main à la destruction — jamais de lecteurs multiples invisibles.
 */
const playbackHolder: { key: string | null } = { key: null }

function acquirePlayback(key: string, priority: 'hero' | 'preview'): boolean {
  if (playbackHolder.key === null || playbackHolder.key === key || priority === 'preview') {
    playbackHolder.key = key
    return true
  }
  return false
}

function releasePlayback(key: string): void {
  if (playbackHolder.key === key) playbackHolder.key = null
}

interface BackgroundMediaLayerProps {
  /** Clé d'arbitrage (ex. `home-hero` ou `preview-<gameId>`). */
  playerKey: string
  priority?: 'hero' | 'preview'
  /** Configuration de fond du jeu (spec §11). */
  media?: GameBackgroundMedia
  /** Vidéo locale résolue (resources.videoPath → resourceUrl). */
  localVideoUrl?: string
  /** Image de repli immédiate : Hero / cover / artwork. */
  fallbackImageUrl?: string
  /** Artwork généré si aucune image. */
  fallbackArtwork?: ReactNode
  /** True quand le jeu se lance / tourne, ou la fenêtre est masquée (spec §17, §63). */
  paused: boolean
  /** Un jeu tourne réellement (session GameRunning) — déclenche le dispose §53. */
  gameRunning?: boolean
  /** Mode performance du jeu : performance/max → dispose, sinon pause (§53). */
  performanceMode?: string
  settings: BackgroundMediaSettings
  /** Rendu du Hero actuel (object-fit / position / zoom). */
  heroStyle?: { objectFit: 'cover' | 'contain'; objectPosition: string; transform: string }
  /** Couche d'overlay sombre existante à conserver au-dessus de la vidéo. */
  overlay?: ReactNode
}

/**
 * Fond multimédia de l'Accueil (spec Accueil multimédia + correctifs §15-31,
 * §51-53).
 *
 * - Démarre TOUJOURS muet (politique d'autoplay des WebViews, spec §5, §44).
 * - Affiche d'abord l'image, puis fondu court quand la vidéo est prête (§28-29).
 * - YouTube : l'iframe est montée AVANT `onReady` (sinon deadlock — l'événement
 *   ne peut jamais arriver) ; la visibilité suit `videoReady` (fondu). Une
 *   erreur (non embeddable / supprimée) → état Error + fallback image (§26-27).
 * - Alt+Tab (§9-13, §51) : suspension temporaire (jamais userMuted) ; le
 *   player reste MONTÉ et reçoit `pauseVideo` — au retour, reprise au même
 *   point, sans recharger la vidéo (§51).
 * - Jeu en cours (§53) : Équilibré → pause (player conservé) ; Performance/Max
 *   → player démonté (RAM/GPU libérés), remonté à la fin du jeu. Après
 *   plusieurs minutes en arrière-plan, dispose également (§52).
 * - Le contrôle audio vit dans HeroAudioControl (pont unifié) — plus aucun
 *   contrôle dupliqué ici (§36, §47-49).
 */
export function BackgroundMediaLayer({ playerKey, priority = 'hero', media, localVideoUrl, fallbackImageUrl, fallbackArtwork, paused, gameRunning = false, performanceMode = 'balanced', settings, heroStyle, overlay }: BackgroundMediaLayerProps) {
  const resolvedAudio = resolveAudioSettings(media, settings)
  const hasLocalVideo = Boolean(localVideoUrl)
  const type = resolveMediaType(media, settings, hasLocalVideo)

  // Muet local de SESSION (spec §44, §50) : le boot suit la politique
  // « Toujours démarrer muet » (`shouldStartMuted`), jamais l'intention
  // persistée seule — un lancement ne peut pas surprendre par du son.
  const [localMuted, setLocalMuted] = useState(() => shouldStartMuted(media, settings))
  const [videoReady, setVideoReady] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [windowActive, setWindowActive] = useState(() => typeof document === 'undefined' ? true : !document.hidden)
  const [longBlurDisposed, setLongBlurDisposed] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const playerReadyRef = useRef(false)

  // §53 : Performance → player démonté pendant le jeu ; Équilibré → pause.
  const disposeDuringGame = gameRunning && mediaDisposePolicy(performanceMode) === 'dispose'
  const disposed = disposeDuringGame || longBlurDisposed

  // Lecture effective : la source tient la main tant qu'elle est active (même
  // en pause — §51), elle est relâchée uniquement quand elle est démontée.
  const pausedByWindow = paused || !windowActive
  const shouldHold = type !== 'none' && !disposed && acquirePlayback(playerKey, priority)
  const holdsPlayback = playbackHolder.key === playerKey

  // Visibilité fenêtre : pause immédiate hors focus (spec §16, §89) — aucun
  // décodage en arrière-plan, aucun polling. Le muet de SESSION (`localMuted`)
  // survit à l'Alt+Tab (spec §13, §51) : la reprise restaure l'intention de la
  // session — jamais `resolvedAudio.muted` (persisté), qui ne décide que du
  // boot via `shouldStartMuted` (§50).
  useEffect(() => {
    const onVisibility = () => setWindowActive(!document.hidden)
    const onBlur = () => setWindowActive(false)
    const onFocus = () => setWindowActive(true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // §52 : ZAILON reste en arrière-plan plusieurs minutes → dispose du player.
  useEffect(() => {
    if (windowActive) {
      setLongBlurDisposed(false)
      return
    }
    const timer = window.setTimeout(() => setLongBlurDisposed(true), LONG_BLUR_DISPOSE_MS)
    return () => window.clearTimeout(timer)
  }, [windowActive])

  // Arbitrage : libérer la main à la destruction (spec §49, §74).
  useEffect(() => {
    return () => { releasePlayback(playerKey) }
  }, [playerKey])

  // Remise à zéro du « prêt » quand la source change (nouveau jeu, type) : la
  // nouvelle source applique la politique de démarrage (§44, §50).
  useEffect(() => {
    setVideoReady(false)
    setVideoError(false)
    setLocalMuted(shouldStartMuted(media, settings))
    setLongBlurDisposed(false)
    playerReadyRef.current = false
  }, [type, localVideoUrl, media?.youtubeVideoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Message API YouTube (onReady / onError) — uniquement depuis la fenêtre de
  // l'iframe, jamais une source arbitraire (spec §71-72).
  const postToPlayer = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com')
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        // Correctif §17-20 : onReady rend la vidéo visible (fondu).
        if (data?.event === 'onReady') {
          playerReadyRef.current = true
          setVideoReady(true)
        }
        if (data?.event === 'onError') setVideoError(true)
      } catch { /* message non-JSON ignoré */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Pont unifié (spec §22, §32, §36-37) : le HeroAudioControl pilote ce player.
  // mute/unmute synchronisent AUSSI le muet de SESSION — la bascule du Hero
  // (setBackgroundSessionMuted) passe par ces commandes, l'état reste cohérent.
  useEffect(() => {
    const commands: BackgroundPlayerCommands = {
      mute: () => { setLocalMuted(true); if (type === 'youtube') postToPlayer('mute'); else if (localVideoRef.current) localVideoRef.current.muted = true },
      unmute: () => { setLocalMuted(false); if (type === 'youtube') postToPlayer('unMute'); else if (localVideoRef.current) localVideoRef.current.muted = false },
      setVolume: volume => { if (type === 'youtube') postToPlayer('setVolume', [Math.round(Math.min(1, Math.max(0, volume)) * 100)]); else if (localVideoRef.current) localVideoRef.current.volume = Math.min(1, Math.max(0, volume)) },
      pause: () => { if (type === 'youtube') postToPlayer('pauseVideo'); else void localVideoRef.current?.pause() },
      resume: () => { if (type === 'youtube') postToPlayer('playVideo'); else void localVideoRef.current?.play() },
    }
    registerBackgroundPlayer(commands)
    return () => unregisterBackgroundPlayer(commands)
  }, [type, postToPlayer])

  // Pause/reprise SANS reload (§51) : Alt+Tab ou jeu en équilibré → le player
  // monté reçoit `pauseVideo` (jamais de démontage) ; au retour, reprise au
  // même point + volume effectif (§12). Le démontage n'a lieu que sur dispose.
  useEffect(() => {
    if (!shouldHold || !holdsPlayback) return
    const player: BackgroundPlayerCommands = {
      mute: () => postToPlayer('mute'),
      unmute: () => postToPlayer('unMute'),
      setVolume: v => postToPlayer('setVolume', [Math.round(Math.min(1, Math.max(0, v)) * 100)]),
      pause: () => { if (type === 'youtube') postToPlayer('pauseVideo'); else void localVideoRef.current?.pause() },
      resume: () => { if (type === 'youtube') postToPlayer('playVideo'); else void localVideoRef.current?.play() },
    }
    if (pausedByWindow) {
      player.pause()
    } else {
      applyBackgroundAudio(player, { muted: localMuted, volume: resolvedAudio.volume })
      player.resume()
    }
  }, [shouldHold, holdsPlayback, pausedByWindow, localMuted, resolvedAudio.volume, type, postToPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const muted = localMuted || !settings.bgAudioEnabled

  // Montage de la source : AVANT `videoReady` — sinon l'iframe ne serait jamais
  // montée et `onReady` ne pourrait jamais arriver (deadlock). La visibilité
  // suit `videoReady` : image → fondu vidéo (§28-29).
  const sourceMounted = shouldHold && holdsPlayback && !videoError && (type === 'youtube' ? Boolean(media?.youtubeVideoId) : type === 'video' ? Boolean(localVideoUrl) : false)
  const showImage = !sourceMounted || !videoReady || videoError

  // Publication de l'état de SESSION (spec §50) : le HeroAudioControl s'abonne
  // pour afficher la réalité (boot muet + bascules de session), pas seulement
  // l'intention persistée. `available` = un player est monté et pilotable.
  useEffect(() => {
    publishBackgroundPlayerState({
      muted: muted || !settings.bgAudioEnabled,
      volume: resolvedAudio.volume,
      available: sourceMounted && holdsPlayback,
    })
  }, [muted, settings.bgAudioEnabled, resolvedAudio.volume, sourceMounted, holdsPlayback]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="absolute inset-0 overflow-hidden">
    {fallbackImageUrl && <img src={fallbackImageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" style={{ objectFit: heroStyle?.objectFit ?? 'cover', objectPosition: heroStyle?.objectPosition ?? '50% 50%', transform: heroStyle?.transform ?? 'none' }} />}
    {!fallbackImageUrl && fallbackArtwork}

    {sourceMounted && type === 'youtube' && media?.youtubeVideoId && (
      <iframe
        ref={iframeRef}
        title="Fond vidéo YouTube"
        src={youtubeEmbedUrl(media.youtubeVideoId, { startSeconds: media.startSeconds })}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        className={`pointer-events-none absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
      />
    )}
    {sourceMounted && type === 'video' && localVideoUrl && (
      <video
        key={localVideoUrl}
        ref={localVideoRef}
        src={localVideoUrl}
        autoPlay
        muted={muted}
        loop
        playsInline
        onLoadedData={() => setVideoReady(true)}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
      />
    )}

    {/* Erreur YouTube (non embeddable / supprimée / hors ligne — spec §26-27). */}
    {type === 'youtube' && videoError && !pausedByWindow && (
      <div className="pointer-events-none absolute bottom-12 right-4 z-20 flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-black/45 px-3 py-1.5 backdrop-blur-md">
        <span className="text-[10px] text-amber-200/85">Vidéo indisponible ⚠</span>
      </div>
    )}

    {overlay}
  </div>
}

export { resolveAudioSettings }
