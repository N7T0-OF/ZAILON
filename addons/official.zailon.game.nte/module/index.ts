// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on NTE Support
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19) : il est activé au premier besoin — ouverture de la
// configuration ou de la liste de mods d'un jeu NTE. Sans cet add-on installé
// ET activé (capacité `nte.modloader`), aucun jeu n'est classé NTE PAK : le
// backend PAK (.pak/.utoc/.ucas) de Neverness to Everness n'existe pas
// (feature removal §57).
//
// La détection de processus au lancement (ntegloballauncher.exe comme stage
// intermédiaire valide, session tracking) reste dans le Core — mécanique de
// lancement, spec « Séparation des responsabilités » §113.
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
    api.log('NTE Support activé — détection du backend PAK (Neverness to Everness) disponible.')
    // Marqueur pour l'UI/diagnostic : le backend NTE PAK est disponible.
    api.storage.set('nteBackendAvailable', true)
  },

  async deactivate(api) {
    // Le Core ne classe plus aucun jeu en NTE PAK sans la capacité. On retire
    // le marqueur : les jeux NTE retombent sur le dossier générique.
    api?.storage?.remove?.('nteBackendAvailable')
  },
}

export default addon
