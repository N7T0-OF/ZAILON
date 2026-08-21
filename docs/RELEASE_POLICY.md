# Politique de publication des releases

Cette politique encadre quand et comment une release ZAILON est publiée sur
GitHub. Son objectif est d'éviter des releases trop fréquentes, de préserver la
stabilité du projet et de garantir que **chaque release possède des Release Notes
réelles et structurées**.

Règles courtes et permanentes pour les IA : voir `AGENTS.md` à la racine du dépôt.

## Principe général

Une release n'est publiée que lorsqu'un **lot cohérent de travail est réellement
terminé**. On ne publie jamais une release après une simple étape, un message
unique ou un changement isolé non validé. Plusieurs demandes terminées sont
regroupées dans une seule release.

## Release Notes obligatoires

Chaque Release GitHub doit contenir une description claire et structurée de tout
ce qui a changé depuis la version précédente. Il est interdit de publier une
release avec uniquement un numéro de version ou un changelog vague
(`v1.2.3`, `Update`, `Bug fixes`, `Various improvements`).

### Génération automatique

- Le générateur `.github/scripts/generate-release-notes.mjs` (via
  `npm run release:notes`) lit `CHANGELOG.md` et produit les notes structurées en
  français, en n'affichant que les catégories réellement concernées.
- Source unique de vérité : `CHANGELOG.md` > `[Unreleased]`. Les entrées sont
  écrites pendant le développement (règle `AGENTS.md`) puis la section est
  convertie en `## [X.Y.Z] - date` au moment de la release.
- Dans `.github/workflows/release.yml`, le job `release-notes` génère les notes en
  mode **strict** : si la section de la version n'existe pas ou ne contient rien,
  le workflow échoue et la release n'est pas publiée.

### Pipeline « draft → vérification → publication »

1. `release-notes` génère les notes depuis `CHANGELOG.md` (échec = pas de release).
2. `release` (matrice Windows/Linux/macOS) construit les installateurs et crée la
   release GitHub en **draft** avec les notes générées.
3. `checksums` publie `checksums-sha256.txt`.
4. `finalize` vérifie la présence des installateurs et des checksums, puis publie
   la release (`--draft=false`) et téléverse un rapport développeur
   `release-report-vX.Y.Z.md`.

Conséquence : si un build de plateforme échoue ou si les checksums manquent, la
release reste en draft et n'est jamais publiée.

## Critères obligatoires avant publication

1. **Travail terminé** — la demande en cours est entièrement traitée : aucune
   étape en suspens, aucun TODO volontairement laissé, aucun changement à moitié
   fait ou non commité.
2. **Lot significatif** — la somme des changements accumulés depuis la dernière
   release représente un jalon cohérent, pas un micro-changement.
3. **Validation verte** — l'ensemble des contrôles passe :
   - `npm run build` (tsc + vite)
   - `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
   - `cargo test --manifest-path src-tauri/Cargo.toml --lib`
   - les scripts de contrôle du dépôt (`.github/scripts/`)
4. **CHANGELOG à jour** — `[Unreleased]` converti en la version publiée avec sa
   date, nouvelle section `[Unreleased]` vide recréée.
5. **Notes générées et vérifiées** — le workflow génère les notes en mode strict ;
   elles correspondent réellement aux changements (aucune fonctionnalité inventée).
6. **Pas de work in progress** — l'arbre de travail est propre, les changements
   sont commités.
7. **Aucune donnée sensible** — pas de clé API ni de donnée privée dans les
   artefacts ; les migrations sont testées.

## Quand ne PAS publier

- La demande en cours n'est pas finie (même si elle est presque terminée).
- Les validations échouent ou sont douteuses.
- Le seul changement depuis la dernière release est mineur (texte, style,
  refactor interne sans impact utilisateur) — on attend d'accumuler davantage.
- Les Release Notes sont vides, vagues ou ne reflètent pas le travail réel.
- Un doute existe sur la stabilité d'un changement récent.

## Processus de publication

1. Incrémenter les versions ensemble : `package.json`,
   `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
2. Convertir `[Unreleased]` en `## [X.Y.Z] - AAAA-MM-JJ` dans `CHANGELOG.md` et
   recréer une section `[Unreleased]` vide.
3. Valider localement (critères ci-dessus), y compris
   `npm run release:notes -- --version vX.Y.Z --strict` pour vérifier les notes.
4. Commit + tag `vX.Y.Z` (sans pousser, sauf autorisation).
5. Push du tag : GitHub Actions génère les notes, construit les installateurs
   signés (Windows, Linux, macOS), publie les checksums puis la release — le tout
   gratuitement.

## Pré-releases

Les versions `alpha` / `beta` / `rc` utilisent `vX.Y.Z-alpha.N` etc. GitHub les
marque comme *Pre-release* ; les notes affichent que la version est destinée aux
tests. Elles ne sont pas proposées aux utilisateurs du canal Stable.

## Rythme visé

- Une release par lot de travail terminé, pas par conversation ni par étape.
- Si plusieurs demandes terminées s'accumulent, on les regroupe dans une seule
  release.
- En cas de doute sur la nécessité d'une release, on s'abstient et on attend.
