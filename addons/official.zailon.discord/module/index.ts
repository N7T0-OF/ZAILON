// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Discord Presence
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19) : il est activé au premier besoin — la section Paramètres
// Discord est ouverte ou une session démarre avec la présence activée. Sans
// cet add-on installé ET activé (capacité `discord.presence`), aucune
// fonctionnalité Discord n'existe dans le Core : pas de section Paramètres,
// pas de contrôle panneau rapide, aucun appel au pont RPC natif.
//
// Le pont natif du Core (connexion IPC Discord locale, publication d'activité,
// nettoyage) n'est accessible QUE si cet add-on est installé et activé — le
// store vérifie la capacité avant chaque synchronisation de présence.
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
    remove?: (key: string) => void
  }
}

interface AddonModule {
  activate: (api: MinimalApi) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

const addon: AddonModule = {
  async activate(api) {
    api.log('Discord Presence activé — présence en jeu, réglages et diagnostic disponibles.')

    const onGameStarted = (payload?: unknown) => {
      const game = (payload as { gameId?: string; name?: string } | undefined)
      if (game?.name) api.log(`Discord Presence : présence à publier — ${game.name}`)
    }
    const onGameStopped = (payload?: unknown) => {
      const game = (payload as { gameId?: string; name?: string } | undefined)
      if (game?.name) api.log(`Discord Presence : activité nettoyée — ${game.name}`)
    }

    // Événements lazy uniquement (spec §69-71) : jamais OnZailonStarted.
    api.events.on('OnGameStarted', onGameStarted)
    api.events.on('OnGameStopped', onGameStopped)

    // Marqueurs pour l'UI/diagnostic : la présence Discord est disponible.
    api.storage.set('discordAvailable', true)
  },

  async deactivate(api) {
    // La publication/le nettoyage RPC sont gérés par la session de jeu — le
    // Core ne touche plus au pont Discord sans la capacité. On retire le
    // marqueur : l'UI ne propose plus rien de Discord.
    api?.storage?.remove?.('discordAvailable')
  },
}

export default addon
