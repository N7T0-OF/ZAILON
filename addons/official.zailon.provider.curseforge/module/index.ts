// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on CurseForge Provider
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19) : il est activé au premier besoin — Explorer est ouvert avec
// CurseForge sélectionné ou la configuration de clé est ouverte. Sans cet
// add-on installé ET activé (capacité `provider.curseforge`), CurseForge
// n'existe pas : aucune source Explorer, aucune saisie de clé partenaire,
// aucun appel au client CurseForge (spec §22-23, feature removal §57).
//
// Le client CurseForge et le coffre de clé vivent dans le Core mais ne sont
// accessibles QUE via l'UI gated par la capacité — le même modèle que
// Visual Profiles, Discord, GameBanana et Nexus.
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
    api.log('CurseForge Provider activé — Explorer : recherche et téléchargements CurseForge disponibles.')
    // Marqueur pour l'UI/diagnostic : le provider est disponible.
    api.storage.set('curseforgeAvailable', true)
  },

  async deactivate(api) {
    // Le Core ne touche plus au client CurseForge sans la capacité. On retire
    // le marqueur : Explorer et les Paramètres n'affichent plus CurseForge.
    api?.storage?.remove?.('curseforgeAvailable')
  },
}

export default addon
