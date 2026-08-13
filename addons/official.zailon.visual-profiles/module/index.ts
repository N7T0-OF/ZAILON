// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Visual Profiles
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19) : il est activé uniquement au premier besoin — l'onglet Visuels
// est ouvert, le panneau rapide le demande, ou une session avec profil visuel
// démarre. Sans cet add-on installé et activé, aucune fonctionnalité visuelle
// n'existe dans le Core (spec « Visual Profiles en add-on » §57-58, §102).
//
// Le backend natif (réglages d'affichage système : Gamma Ramp, saturation,
// restauration) est fourni par le pont natif du Core et n'est accessible QUE
// si cet add-on est installé ET activé (capacité `visual.profiles`).
// ─────────────────────────────────────────────────────────────────────────────

// Typage minimal du SDK (ZailonAddonApi) — le SDK réel est fourni par ZAILON
// au runtime. Les permissions du manifest sont vérifiées par la gate à chaque
// appel de service (spec §11-13).
interface MinimalApi {
  apiVersion: string
  manifest: { id: string; name: string; version: string }
  log: (message: string) => void
  events: {
    on: (event: string, handler: (payload?: unknown) => void) => void
    off: (event: string, handler: (payload?: unknown) => void) => void
  }
  storage: {
    get: (key: string) => unknown
    set: (key: string, value: unknown) => void
  }
}

interface AddonModule {
  activate: (api: MinimalApi) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

const addon: AddonModule = {
  async activate(api) {
    api.log('Visual Profiles activé — onglet Visuels, panneau rapide et restauration automatique disponibles.')

    const onGameStarted = (payload?: unknown) => {
      const game = (payload as { gameId?: string; name?: string } | undefined)
      if (game?.name) api.log(`Visual Profiles : profil visuel à appliquer — ${game.name}`)
    }
    const onGameStopped = (payload?: unknown) => {
      const game = (payload as { gameId?: string; name?: string } | undefined)
      if (game?.name) api.log(`Visual Profiles : restauration système après — ${game.name}`)
    }

    // Événements lazy uniquement (spec §69-71) : jamais OnZailonStarted.
    api.events.on('OnGameStarted', onGameStarted)
    api.events.on('OnGameStopped', onGameStopped)

    // Marqueur pour l'UI/diagnostic : les profils visuels sont disponibles.
    api.storage.set('visualProfilesAvailable', true)
    api.storage.set('visualRestoreMode', 'automatic')
  },

  async deactivate() {
    // La restauration système est gérée par la session de jeu — rien à
    // nettoyer ici ; le Core n'appelle plus le pont visuel sans l'add-on.
  },
}

export default addon
