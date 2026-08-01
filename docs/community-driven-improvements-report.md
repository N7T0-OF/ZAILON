# Rapport des améliorations communautaires — phase critique

Version cible : 1.9.0. Date : 1er août 2026.

## 1–4. Tendances, problèmes et choix

Les tendances retenues sont l’isolation réelle des profils, la transparence des fichiers, la sauvegarde avant mise à jour, le diagnostic non accusatoire et les conflits compréhensibles. Les fonctions sociales, recommandations sponsorisées et contournements de validations Nexus ont été rejetés. Les quatre phases n’ont pas été lancées simultanément : cette livraison se concentre sur le socle critique.

## 5–8. Fonctions, architecture, migration et profils

- L’empreinte faible fondée sur noms et tailles est remplacée par SHA-256 des chemins relatifs et contenus complets.
- Deux dossiers renommés mais identiques partagent la même identité ; deux contenus différents de même taille ne sont plus confondus.
- Les manifestes de paquet reçoivent `sourceFingerprint`, `contentHash` et `versionId`.
- Chaque état de mod dans un profil conserve `packageId`, `versionId`, `providerFileId`, `contentHash` et `sourceProvider` lorsqu’ils sont connus.
- Les anciens paquets reçoivent leur identité de contenu lors du premier inventaire natif.
- L’audit refuse comme déployable une version physique qui ne correspond plus au hash/version attendu par le profil.
- Un profil stable bloque les mutations ; son déverrouillage crée d’abord un point de restauration transactionnel.

## 9–11. Parcours débutant, régulier et expert

Les trois parcours et leurs hésitations sont consignés dans [community-ux-test-report.md](community-ux-test-report.md). La compilation web de production valide les nouveaux écrans. Une validation humaine et un lancement Cyberpunk physique restent nécessaires.

## 12. Performances

Avant : l’empreinte inspectait jusqu’à 50 000 chemins et tailles sans lire le contenu ; le risque de collision fonctionnelle existait. Après : la création/migration d’identité lit le contenu complet une fois, coût plus élevé mais exact. La vue de fichiers ne rend jamais plus de 500 lignes à la fois et exige un filtre au-delà. Un index persistant et une vraie virtualisation restent planifiés.

## 13–14. Mise à jour et restauration

Le système de sauvegarde pré-update existant est conservé. Après redémarrage sur la nouvelle version, ZAILON compare automatiquement les nombres de jeux, profils et mods avec la sauvegarde correspondant à la version cible. Le résultat est journalisé et affiché. Le bouton graphique de restauration de cette sauvegarde n’est pas encore livré ; aucune promesse « Annuler » n’est affichée pour ce cas.

## 15. Collections

Les Collections restent isolées dans un profil dédié verrouillé et suivent la file de validation officielle Nexus. Le tableau de santé complet, la reprise multi-révision et la comparaison de choix sont encore partiels.

## 16. Conflits

L’écran explique maintenant que plusieurs mods fournissent le même fichier et indique exactement quelle version remplacera les autres. La règle reste explicite et persistée par chemin. La comparaison binaire/texte n’est pas livrée.

## 17–18. Branches et archivage

Non livrés dans cette phase. Les paquets immuables et les transactions sont des prérequis disponibles, mais aucune fusion ou archive reconstructible n’est annoncée comme terminée.

## 19. Cyberpunk et FiveM

Cyberpunk bénéficie de la carte virtuelle, des providers de frameworks, du réparateur de racines, de l’import MO2 et du diagnostic par paquet. FiveM conserve la séparation client/serveur et refuse les manifestes de ressources serveur dans un profil client. Aucun mécanisme ne contourne les règles d’un serveur.

## 20. Limitations restantes

- Absence locale de l’éditeur de liens MSVC `link.exe` ; compilation native à confirmer par CI.
- Pas encore de mode Simple/Avancé/Expert.
- Pas de branches, archivage reconstructible, moteur FOMOD rejouable ou index plein texte.
- Pas de preuve `Loaded` générique : elle dépend des logs/adaptateurs du jeu.
- Pas de restauration graphique post-update.
- Pas encore de mesure réelle sur 1 000 mods ni de panel humain.

## Preuves et compteurs

- 67 idées répertoriées dans [community-feature-research.md](community-feature-research.md).
- 7 vérifications ciblées dans le diagnostic par mod : paquet, manifeste, identité, racine, profil, carte virtuelle, runtime.
- 5 informations par fichier gagnant : chemin, gagnant, remplacés, raison, état ; SHA-256 et chemin physique restent repliés.
- Rendu plafonné à 500 fichiers par recherche.
- Trois compteurs post-update : jeux, profils, mods.
- Tests et résultats finaux à compléter avec l’URL de CI avant publication.
