import { Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BackgroundMediaSettings, GameBackgroundMedia, resolveAudioSettings, resolveMediaType } from '../../lib/backgroundMedia'
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
 * Fond multimédia de l'Accueil (spec Accueil multimédia).
 *
 * - Démarre TOUJOURS muet (politique d'autoplay des WebViews, spec §5, §44).
 * - Affiche d'abord l'image, puis fondu court quand la vidéo est prête (§28).
 * - Pause/destruction hors focus, minimisé, ou quand un jeu démarre (§16-17, §63).
 * - Seul l'identifiant extrait entre dans l'URL du lecteur — jamais l'URL brute
 *   utilisateur, et le domaine est une whitelist stricte (§2, §71-72).
 */
export function BackgroundMediaLayer({ playerKey, priority = 'hero', media, localVideoUrl, fallbackImageUrl, fallbackArtwork, paused, settings, heroStyle, overlay }: BackgroundMediaLayerProps) {
  const setBackgroundMediaSettings = useStore(state => state.setBackgroundMediaSettings)

  const hasLocalVideo = Boolean(localVideoUrl)
  const type = resolveMediaType(media, settings, hasLocalVideo)
  const resolvedAudio = resolveAudioSettings(media, settings)
  // Muet local de SESSION (spec §44 : chaque lancement recommence 🔇 même si
  // l'utilisateur avait activé le son précédemment — jamais persisté).
  const [localMuted, setLocalMuted] = useState(true)
  const [videoReady, setVideoReady] = useState(false)
  const [windowActive, setWindowActive] = useState(() => typeof document === 'undefined' ? true : !document.hidden)
  const [showVolume, setShowVolume] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const playerReadyRef = useRef(false)

  // Lecture effective : vidéo seulement si tout est aligné (spec §15-16, §88).
  const pausedByWindow = paused || !windowActive
  const shouldPlay = !pausedByWindow && type !== 'none' && acquirePlayback(playerKey, priority)
  const holdsPlayback = playbackHolder.key === playerKey

  // Retour muet après toute interruption (spec §44, §65) : blur, minimisé, jeu.
  useEffect(() => {
    if (pausedByWindow && !localMuted) setLocalMuted(true)
  }, [pausedByWindow]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setLocalMuted(true)
  }, [type, localVideoUrl, media?.youtubeVideoId])

  // Message API YouTube (unMute / mute / setVolume) — uniquement depuis la
  // fenêtre de l'iframe, jamais une source arbitraire (spec §71-72).
  const postToPlayer = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com')
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.event === 'onReady') playerReadyRef.current = true
      } catch { /* message non-JSON ignoré */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const toggleMute = useCallback(() => {
    const next = !localMuted
    setLocalMuted(next)
    // Le lecteur doit être prêt pour recevoir les commandes (spec §6, §39).
    setTimeout(() => {
      if (!playerReadyRef.current) return
      if (next) postToPlayer('mute')
      else { postToPlayer('unMute'); postToPlayer('setVolume', [Math.round(Math.min(1, Math.max(0, resolvedAudio.volume)) * 100)]) }
    }, 150)
  }, [localMuted, postToPlayer, resolvedAudio.volume])

  const changeVolume = useCallback((value: number) => {
    const v = Math.min(1, Math.max(0, value))
    // Volume global persisté (spec §9, §81) — survit au redémarrage.
    setBackgroundMediaSettings({ bgVolume: v })
    if (v > 0) postToPlayer('setVolume', [Math.round(v * 100)])
  }, [setBackgroundMediaSettings, postToPlayer])

  const volumeLabel = Math.round(resolvedAudio.volume * 100)
  const muted = localMuted || !settings.bgAudioEnabled

  // Image affichée pendant le chargement ET quand la lecture est suspendue.
  const showImage = !shouldPlay || !holdsPlayback || !videoReady
  const showVideo = shouldPlay && holdsPlayback && videoReady

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
        ref={node => { if (node) node.volume = resolvedAudio.volume }}
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

    {overlay}

    {/* Contrôle audio discret (spec §6, §42-43) : seulement quand le fond a une
        piste et que la lecture est possible. */}
    {shouldPlay && holdsPlayback && (type === 'youtube' || type === 'video') && (
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMute}
          onContextMenu={event => { event.preventDefault(); setShowVolume(value => !value) }}
          title={muted ? 'Activer le son du fond' : 'Couper le son du fond'}
          aria-label={muted ? 'Activer le son du fond' : 'Couper le son du fond'}
          className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${muted ? 'border-white/[0.14] bg-black/30 text-white/55 hover:bg-white/[0.09] hover:text-white' : 'border-[var(--zailon-accent)]/30 bg-[var(--zailon-accent)]/15 text-[var(--zailon-accent)] hover:bg-[var(--zailon-accent)]/25'}`}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        {showVolume && (
          <div className="flex h-8 items-center gap-2 rounded-full border border-white/[0.14] bg-black/55 px-3 backdrop-blur-md">
            <VolumeX size={11} className="text-white/40" />
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.01}
              value={resolvedAudio.volume}
              onChange={event => changeVolume(Number(event.target.value))}
              aria-label="Volume du fond"
              className="h-1 w-24 accent-[var(--zailon-accent)]"
            />
            <span className="w-7 text-right font-mono text-[10px] text-white/60">{volumeLabel}%</span>
          </div>
        )}
      </div>
    )}
  </div>
}

export { resolveAudioSettings }
