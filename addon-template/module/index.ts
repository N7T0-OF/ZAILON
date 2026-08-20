// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on (manifest.entrypoint)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// §19) : il est activé uniquement au premier besoin — événement auquel
// l'add-on s'abonne, emplacement UI rendu, ou action explicite de
// l'utilisateur. Un add-on défectueux ne bloque jamais le lanceur (crash
// guard, spec §21).
//
// Contrat : exporte par défaut un objet AddonModule :
//   { activate(api), deactivate?() }
//
// `api` (ZailonAddonApi) est fourni par ZAILON au moment de l'activation.
// Les permissions du manifest sont vérifiées par la gate à chaque appel de
// service — déclarez exactement ce dont vous avez besoin (spec §11).
// ─────────────────────────────────────────────────────────────────────────────

// Le typage réel (ZailonAddonApi, GameService…) est fourni par ZAILON au
// runtime. Déclarez ici la forme minimale utilisée, ou générez les types
// depuis le SDK (voir docs/addon-development).
interface MinimalApi {
  apiVersion: string
  manifest: { id: string; name: string }
  log: (message: string) => void
  events: {
    on: (event: string, handler: (payload?: unknown) => void) => void
  }
  storage: {
    get: (key: string) => unknown
    set: (key: string, value: unknown) => void
  }
  services: {
    games: { list: () => Array<{ id: string; name: string }> }
  }
}

interface AddonModule {
  activate: (api: MinimalApi) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

const addon: AddonModule = {
  async activate(api) {
    api.log('Add-on activé.')

    // Exemple : observer un événement lazy (jamais au démarrage).
    api.events.on('OnGameStarted', payload => {
      const game = (payload as { gameId?: string } | undefined)?.gameId
      api.log(`Jeu démarré : ${game ?? 'inconnu'}`)
    })

    // Exemple : lire les jeux (permission `game.read` requise).
    const games = api.services.games.list()
    api.log(`Jeux configurés : ${games.length}`)
  },

  async deactivate() {
    // Nettoyage : aucun service ne doit rester actif après désactivation.
  },
}

export default addon
