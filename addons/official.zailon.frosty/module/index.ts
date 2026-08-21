// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Frosty Support
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// §19) : il est activé uniquement au premier besoin — un jeu Frostbite est
// sélectionné, un .fbmod est importé, l'espace Création est ouvert, ou un
// lancement de jeu Frosty démarre. Aucun service ne tourne au boot.
//
// Les fonctionnalités lourdes (détection du runtime officiel, scan des
// données, Worker natif, parsing .cat) sont fournies par le pont natif du
// Core et NE SONT accessibles QUE si cet add-on est installé ET activé
// (capacité `frosty.backend`, spec §10, §18, §34).
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
    api.log('Frosty Support activé — runtime, scan et Worker disponibles à la demande.')

    const onGameSelected = (payload?: unknown) => {
      const game = (payload as { gameId?: string; name?: string } | undefined)
      if (game?.name) api.log(`Frosty Support : jeu sélectionné — ${game.name}`)
    }
    const onGameStarted = (payload?: unknown) => {
      const game = (payload as { gameId?: string; name?: string } | undefined)
      if (game?.name) api.log(`Frosty Support : jeu lancé — ${game.name}`)
    }

    // Événements lazy uniquement (spec §69-71) : jamais OnZailonStarted.
    api.events.on('OnGameSelected', onGameSelected)
    api.events.on('OnGameStarted', onGameStarted)

    // Marqueur pour l'UI/diagnostic : le runtime est prêt à être détecté.
    api.storage.set('runtimeReady', true)
    api.storage.set('runtimeDetectionMode', 'official-only')
  },

  async deactivate() {
    // Aucun service en arrière-plan à arrêter — le Worker natif est arrêté
    // par le Core à la fermeture de l'espace Création, pas ici.
  },
}

export default addon
