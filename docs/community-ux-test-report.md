# Rapport des parcours UX communautaires

Date : 1er août 2026. Portée : phase critique 1.9.0.

## Méthode et limites

Les parcours ont été vérifiés par inspection des chemins de code, compilation TypeScript de production et tests natifs ciblés. Aucun panel humain externe n’a encore réalisé la séance ergonomique ; les hésitations ci-dessous sont donc des risques observés, pas des mesures de laboratoire. Le lancement physique de Cyberpunk avec une bibliothèque réelle reste à confirmer par l’utilisateur.

## Débutant

Parcours : sélectionner Cyberpunk, créer un profil vide, importer, diagnostiquer, jouer, restaurer.

| Étape | Résultat | Hésitation / correction |
|---|---|---|
| Créer un profil | Profil à zéro mod, sans héritage implicite | La différence créer/dupliquer doit rester visible |
| Importer | Aperçu de racine et sécurité avant staging | Les termes « stocké » et « déployé » restent à expliquer dans le futur mode Simple |
| Diagnostiquer | Bouton « Pourquoi ce mod ne fonctionne pas ? » avec preuves | La visibilité runtime reste inconnue avant lancement, ce qui est affiché explicitement |
| Jouer | Audit natif avant TemporaryCopy | Test matériel réel requis |
| Restaurer | Journal de déploiement et rollback existants | La liste graphique de tous les snapshots reste à créer |

## Utilisateur régulier

Parcours : importer une grande sélection, organiser, mettre à jour, réparer, utiliser une Collection.

| Étape | Résultat | Hésitation / correction |
|---|---|---|
| Import massif | Tâche de fond sans limite artificielle à 100 | Mesure de 1 000 mods à effectuer sur une machine cible |
| Doublons | SHA-256 du contenu, dossiers renommés reconnus | Le premier recalcul des anciens paquets peut être long |
| Conflits | Phrase de conséquence et gagnant explicite | Le bouton Comparer le contenu n’est pas encore livré |
| Collection | Profil dédié et file Nexus respectueuse du compte | Tableau de santé complet encore partiel |
| Vue fichiers | Recherche locale, 500 lignes maximum rendues | L’utilisateur doit filtrer pour les très grandes cartes |

## Expert

Parcours : import MO2, carte virtuelle, règle de fichier, diagnostic, rollback.

| Étape | Résultat | Hésitation / correction |
|---|---|---|
| Import MO2 | Copie transactionnelle ; source en lecture seule | Plusieurs versions issues d’archives identiques doivent être testées en CI |
| Identité | `packageId`, `versionId`, `providerFileId`, `contentHash` persistés | Les profils natifs anciens sans métadonnées sont enrichis lors du scan |
| Carte virtuelle | Gagnant, perdants, raison, SHA-256 et chemin physique replié | La donnée est « prévue » avant jeu, « runtime » uniquement après confirmation |
| Règle | Choix explicite par chemin | Fusion de règles entre branches non livrée |
| Mise à jour | Sauvegarde préalable puis comparaison jeux/profils/mods | Restauration graphique de la sauvegarde pré-update à livrer |

## Vérifications exécutées

- `npm run build` : réussi.
- `cargo fmt --check` : à exécuter après formatage final.
- Test natif ajouté : deux contenus identiques sous des noms différents ont la même empreinte ; une modification de même taille change l’empreinte.
- Compilation native locale : bloquée par l’absence de `link.exe` MSVC sur la machine de développement ; la CI Windows fait autorité.

## Prochaine séance humaine

1. Tester 100 à 500 mods Cyberpunk réels.
2. Demander à un débutant d’expliquer « stocké », « gagnant » et « visible runtime » sans aide.
3. Mesurer le temps jusqu’au diagnostic d’une mauvaise racine.
4. Vérifier les touches et le clic droit pendant une session Cyberpunk réelle.
5. Restaurer une configuration après une mise à jour simulée.
