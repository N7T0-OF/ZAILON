# My Addon

> Template de départ pour un add-on ZAILON. Copiez ce dossier, puis adaptez.

## Structure

```
manifest.json          Métadonnées, permissions, compatibilité (obligatoire)
module/index.ts        Point d'entrée (manifest.entrypoint) — chargé à la demande
resources/             Données livrées avec l'add-on
locales/               Traductions
icon.svg               Icône affichée dans ZAILON
LICENSE / README.md    Informations légales et documentation
```

## Démarrage rapide

```bash
# 1. Copier le template (ou utiliser la CLI)
node .github/scripts/addon-cli.ts init my-addon --id community.you.myaddon --name "My Addon" --author "You"

# 2. Éditer manifest.json (ID immuable, permissions minimales)

# 3. Valider
node .github/scripts/addon-cli.ts validate my-addon

# 4. Empaqueter (.zailon-addon)
node .github/scripts/addon-cli.ts pack my-addon -o MyAddon.zailon-addon
```

L'archive produite s'installe dans ZAILON via **Add-ons → Importer**.

## Règles importantes

- L'**ID est immuable** (au moins 2 segments, ex. `community.you.myaddon`).
- Déclarez **exactement** les permissions nécessaires — rien n'est implicite.
- Le module n'est **jamais chargé au démarrage** : ne déclarez que des
  événements lazy (`OnGameStarted`, `OnProfileChanged`, …), jamais
  `OnZailonStarted`.
- Les données utilisateur vont dans `addon-data/<id>/` — jamais dans le code.
- Documentation complète : `docs/addon-development/` dans le dépôt ZAILON.
