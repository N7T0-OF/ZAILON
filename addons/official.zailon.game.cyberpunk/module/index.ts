// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Cyberpunk Advanced
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19) : il est activé au premier besoin — l'utilisateur ouvre les
// outils d'un jeu Cyberpunk. Sans cet add-on installé ET activé (capacité
// `cyberpunk.frameworks`), les outils avancés Cyberpunk n'existent pas :
// aucun bouton « Réparer les racines Cyberpunk », aucune réparation du
// déploiement MO2, aucune carte « Réparer RED4ext » (feature removal §57).
//
// La détection de frameworks (RED4ext, redscript, TweakXL, ArchiveXL…) et le
// backend virtuel de lancement vivent dans le Core (adaptateur jeu — spec
// « Séparation des responsabilités » §113) ; les OUTILS de réparation sont
// gated par cette capacité — même modèle que Discord, Visual Profiles et les
// providers.
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
  deactivate?: (api: MinimalApi) => void | Promise<void>
}

const addon: AddonModule = {
  async activate(api) {
    api.log('Cyberpunk Advanced activé — outils de réparation (structure, MO2, RED4ext) disponibles pour les jeux Cyberpunk.')
    // Marqueur pour l'UI/diagnostic : les outils avancés sont disponibles.
    api.storage.set('cyberpunkToolsAvailable', true)
  },

  async deactivate(api) {
    // Le Core ne propose plus aucun outil de réparation Cyberpunk sans la
    // capacité. On retire le marqueur : boutons et cartes disparaissent.
    api?.storage?.remove?.('cyberpunkToolsAvailable')
  },
}

export default addon
