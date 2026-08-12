import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BackgroundMediaSettings, GameBackgroundMedia, resolveAudioSettings, resolveMediaType } from '../../lib/backgroundMedia'
import { applyBackgroundAudio, registerBackgroundPlayer, unregisterBackgroundPlayer, type BackgroundPlayerCommands } from '../../lib/backgroundMediaPlayer'
import { youtubeEmbedUrl } from '../../lib/youtubeUrl'
import { useStore } from '../../store/useStore'

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
  settings: BackgroundMediaSettings
  /** Rendu du Hero actuel (object-fit / position / zoom). */
  heroStyle?: { objectFit: 'cover' | 'contain'; objectPosition: string; transform: string }
  /** Couche d'overlay sombre existante à conserver au-dessus de la vidéo. */
  overlay?: ReactNode
}

/**
 * Fond multimédia de l'Accueil (spec Accueil multimédia + correctifs §15-31).
 *
 * - Démarre TOUJOURS muet (politique d'autoplay des WebViews, spec §5, §44).
 * - Affiche d'abord l'image, puis fondu court quand la vidéo est prête (§28-29).
 * - YouTube : `videoReady` passe à true sur le message `onReady` du lecteur —
 *   sinon la vidéo ne serait jamais rendue (correctif §17-20). Une erreur
 *   (non embeddable / supprimée) → état Error + fallback image (§26-27).
 * - Alt+Tab : suspension temporaire (jamais userMuted), et au retour le son
 *   reprend à la valeur utilisateur si elle n'était pas muette (§9-13).
 * - Le contrôle audio vit dans HeroAudioControl (pont unifié) — plus aucun
 *   contrôle dupliqué ici (§36, §47-49).
 */
export function BackgroundMediaLayer({ playerKey, priority = 'hero', media, localVideoUrl, fallbackImageUrl, fallbackArtwork, paused, settings, heroStyle, overlay }: BackgroundMediaLayerProps) {
  const resolvedAudio = resolveAudioSettings(media, settings)
  const hasLocalVideo = Boolean(localVideoUrl)
  const type = resolveMediaType(media, settings, hasLocalVideo)

  // Muet local de SESSION (spec §44 : chaque lancement recommence 🔇 même si
  // l'utilisateur avait activé le son précédemment — jamais persisté).
  const [localMuted, setLocalMuted] = useState(true)
  const [videoReady, setVideoReady] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [windowActive, setWindowActive] = useState(() => typeof document === 'undefined' ? true : !document.hidden)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const playerReadyRef = useRef(false)

  // Lecture effective : vidéo seulement si tout est aligné (spec §15-16, §88).
  const pausedByWindow = paused || !windowActive
  const shouldPlay = !pausedByWindow && type !== 'none' && acquirePlayback(playerKey, priority)
  const holdsPlayback = playbackHolder.key === playerKey

  // Alt+Tab (correctif §9-11) : suspendre temporairement en perdant le focus ;
  // au retour, restaurer l'intention utilisateur (muet si elle était muette,
  // volume utilisateur sinon). Jamais de modification de userMuted ici.
  useEffect(() => {
    if (pausedByWindow) {
      if (!localMuted) setLocalMuted(true)
    } else {
      setLocalMuted(resolvedAudio.muted)
    }
  }, [pausedByWindow, resolvedAudio.muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Visibilité fenêtre : pause immédiate hors focus (spec §16, §89) — aucun
  // décodage en arrière-plan, aucun polling.
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

  // Arbitrage : libérer la main à la destruction (spec §49, §74).
  useEffect(() => {
    return () => { releasePlayback(playerKey) }
  }, [playerKey])

  // Remise à zéro du « prêt » quand la source change (nouveau jeu, type).
  useEffect(() => {
    setVideoReady(false)
    setVideoError(false)
    setLocalMuted(true)
    playerReadyRef.current = false
  }, [type, localVideoUrl, media?.youtubeVideoId])

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
        // Correctif §17-20 : onReady doit rendre la vidéo visible.
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
  useEffect(() => {
    const commands: BackgroundPlayerCommands = {
      mute: () => { if (type === 'youtube') postToPlayer('mute'); else if (localVideoRef.current) localVideoRef.current.muted = true },
      unmute: () => { if (type === 'youtube') postToPlayer('unMute'); else if (localVideoRef.current) localVideoRef.current.muted = false },
      setVolume: volume => { if (type === 'youtube') postToPlayer('setVolume', [Math.round(Math.min(1, Math.max(0, volume)) * 100)]); else if (localVideoRef.current) localVideoRef.current.volume = Math.min(1, Math.max(0, volume)) },
      pause: () => { if (type === 'youtube') postToPlayer('pauseVideo'); else void localVideoRef.current?.pause() },
      resume: () => { if (type === 'youtube') postToPlayer('playVideo'); else void localVideoRef.current?.play() },
    }
    registerBackgroundPlayer(commands)
    return () => unregisterBackgroundPlayer(commands)
  }, [type, postToPlayer])

  // Application audio au player quand le muet/volume de session change (§12).
  useEffect(() => {
    if (!shouldPlay || !holdsPlayback) return
    const player = { mute: () => postToPlayer('mute'), unmute: () => postToPlayer('unMute'), setVolume: (v: number) => postToPlayer('setVolume', [Math.round(v * 100)]), pause: () => postToPlayer('pauseVideo'), resume: () => postToPlayer('playVideo') }
    if (type === 'youtube') applyBackgroundAudio(player, { muted: localMuted, volume: resolvedAudio.volume })
  }, [localMuted, resolvedAudio.volume, shouldPlay, holdsPlayback, type, postToPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const muted = localMuted || !settings.bgAudioEnabled

  // Image affichée pendant le chargement, en cas d'erreur, et à la suspension.
  const showImage = !shouldPlay || !holdsPlayback || !videoReady || videoError
  const showVideo = shouldPlay && holdsPlayback && videoReady && !videoError

  return <div className="absolute inset-0 overflow-hidden">
    {fallbackImageUrl && <img src={fallbackImageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" style={{ objectFit: heroStyle?.objectFit ?? 'cover', objectPosition: heroStyle?.objectPosition ?? '50% 50%', transform: heroStyle?.transform ?? 'none' }} />}
    {!fallbackImageUrl && fallbackArtwork}

    {showVideo && type === 'youtube' && media?.youtubeVideoId && (
      <iframe
        ref={iframeRef}
        title="Fond vidéo YouTube"
        src={youtubeEmbedUrl(media.youtubeVideoId, { startSeconds: media.startSeconds })}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        className="pointer-events-none absolute inset-0 h-full w-full border-0"
      />
    )}
    {showVideo && type === 'video' && localVideoUrl && (
      <video
        key={localVideoUrl}
        ref={localVideoRef}
        src={localVideoUrl}
        autoPlay
        muted={muted}
        loop
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    )}

    {/* Préchargement vidéo locale : image → fondu quand prête (spec §28). */}
    {type === 'video' && localVideoUrl && !videoReady && !pausedByWindow && (
      <video key={`preload-${localVideoUrl}`} src={localVideoUrl} muted autoPlay loop playsInline preload="metadata" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0" onLoadedData={() => setVideoReady(true)} />
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
