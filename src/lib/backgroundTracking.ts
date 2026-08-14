/**
 * Mode discret — notifications de session (spec « Accueil modulaire » §120) :
 * ZAILON tourne en `--background` (fenêtre cachée) → le toast in-app est
 * invisible ; une NOTIFICATION SYSTÈME native annonce qu'une session est
 * suivie. Décision PURE, testable sous node --test : même règle que le toast
 * runtime (« si Runtime Toast activé »), appliquée au mode discret.
 */

export type TrackedToastKind = 'started' | 'detected' | 'recovered' | 'ended'

/** La session a réellement commencé à être suivie (démarrage via ZAILON,
 * détection hors ZAILON ou récupération après redémarrage). */
export function isTrackedSessionStart(kind: string | undefined): boolean {
  return kind === 'started' || kind === 'detected' || kind === 'recovered'
}

/** Notification système à afficher en mode discret (§120) : uniquement si le
 * mode discret est actif ET le toast runtime est activé (même réglage que
 * l'UI) ET le kind est un début de suivi. */
export function shouldNotifyBackgroundSession(
  kind: string | undefined,
  backgroundMode: boolean,
  toastRuntimeConnected: boolean,
): boolean {
  if (!backgroundMode || !toastRuntimeConnected) return false
  return isTrackedSessionStart(kind)
}

/** Contenu de la bulle système (petite, puis disparition — §120). */
export function backgroundSessionNotification(
  kind: string | undefined,
  gameName: string,
): { title: string; message: string } | undefined {
  if (!isTrackedSessionStart(kind)) return undefined
  return { title: 'ZAILON', message: `✓ Suivi par ZAILON — ${gameName}` }
}
