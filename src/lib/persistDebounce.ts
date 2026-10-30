/**
 * persistDebounce — sauvegarde debounced des réglages modifiés en continu
 * (spec Persistance UI §17) : le color picker d'accent, les sliders et les
 * redimensionnements ne doivent pas écrire sur disque à chaque pixel de
 * mouvement. 250-500 ms de coalescence, puis flush forcé à la fermeture.
 */

export interface Debouncer<T> {
  /** Planifie une écriture coalescée. `commit` est appelé au plus une fois
   * par fenêtre de délai avec la DERNIÈRE valeur. */
  push: (value: T) => void
  /** Écrit immédiatement la dernière valeur en attente (fermeture de l'app,
   * démontage de composant). Retourne true si une écriture a eu lieu. */
  flush: () => boolean
  /** Annule toute écriture en attente sans committer. */
  cancel: () => void
  /** Nombre d'écritures réellement committées (tests). */
  commitCount: () => number
}

export function createDebouncer<T>(commit: (value: T) => void, delayMs: number): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: T | undefined
  let hasPending = false
  let commits = 0

  const fire = () => {
    timer = undefined
    if (!hasPending) return
    const value = pending as T
    pending = undefined
    hasPending = false
    commits += 1
    commit(value)
  }

  return {
    push(value) {
      pending = value
      hasPending = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(fire, delayMs)
    },
    flush() {
      if (timer) clearTimeout(timer)
      timer = undefined
      if (!hasPending) return false
      const value = pending as T
      pending = undefined
      hasPending = false
      commits += 1
      commit(value)
      return true
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = undefined
      pending = undefined
      hasPending = false
    },
    commitCount: () => commits,
  }
}
