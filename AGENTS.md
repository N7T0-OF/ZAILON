# AGENTS.md — Règles permanentes pour les assistants IA

Règles permanentes pour toute IA (ou contributeur) travaillant sur ZAILON.
Elles ne dépendent d'aucune conversation : elles sont enregistrées dans le dépôt.

## Release / Changelog rule

Every user-visible change MUST update `CHANGELOG.md` under `[Unreleased]`.

Use one of:
- Added
- Improved
- Performance
- Fixed
- Security
- Compatibility
- Experimental

Never claim a feature is completed unless it is implemented and tested.

Every GitHub Release must contain generated release notes describing the real changes
since the previous release. The release workflow refuses to publish a release without
notes.

## À la fin de chaque tâche significative

1. Mettre à jour `CHANGELOG.md` > `[Unreleased]` avec l'entrée appropriée
   (aucune entrée en double).
2. Ne jamais déclarer une fonction terminée si elle est partielle ou expérimentale :
   utiliser la catégorie `Experimental` dans ce cas.
3. Conserver une description compréhensible par un utilisateur normal ; déplacer le
   détail technique dans `Technical`.
4. Regrouper les petits changements similaires (ex. plusieurs retouches d'interface
   dans les Paramètres) au lieu d'une ligne par commit.

## Release Notes

- Les Release Notes sont générées automatiquement depuis `CHANGELOG.md` par
  `.github/scripts/generate-release-notes.mjs` (via `npm run release:notes`).
- Le workflow `.github/workflows/release.yml` génère les notes, garde la release en
  **draft** tant que toutes les plateformes et les checksums n'ont pas réussi, puis
  publie.
- Ne jamais créer une Release GitHub avec uniquement un numéro de version ou un
  changelog vague (`v1.2.3`, `Update`, `Bug fixes`, `Various improvements`).
- Ne jamais inventer une fonctionnalité : une fonctionnalité n'apparaît dans les notes
  que si le code existe, compile et est inclus dans la Release.
