# Cyberpunk Advanced — incrément moteur d’installation

## Architecture existante

Cyberpunk Advanced est principalement un gate de capacités. La logique d’import, de racines, de profils, de carte virtuelle et de déploiement temporaire reste centralisée dans le Core de ZAILON; cet incrément l’étend plutôt que de créer un gestionnaire parallèle.

## Pipeline FOMOD expérimental

1. Scanner un ZIP d’import Cyberpunk à la recherche de `fomod/ModuleConfig.xml`.
2. Lire les métadonnées XML et représenter les étapes, groupes et options statiques reconnues dans l’assistant de `GamesView`.
3. Montrer les cibles suggérées à partir des destinations/règles FOMOD et des racines Cyberpunk reconnues.
4. Vérifier les sélections dans l’interface, puis valider de nouveau identifiants, contraintes, chemins, sources et collisions côté Rust.
5. Matérialiser seulement les règles requises et les options choisies dans un répertoire temporaire, puis faire passer ce contenu par `stage_content`, l’analyse des fichiers sensibles et le staging ZAILON.
6. Enregistrer les identifiants d’options et l’empreinte du ZIP dans `manifest.json`.
7. Au lancement, continuer à utiliser `TemporaryCopy` (sauvegarde/déploiement/restauration); ne pas appeler cela USVFS.

Les choix conditionnels ou toute structure non reconnue font échouer fermé le plan. Les scripts/plug-ins embarqués ne sont jamais exécutés. L’import générique bloque les ZIP Cyberpunk et les sources situées dans un FOMOD extrait; les téléchargements catalogue/Collection refusent l’extraction automatique des ZIP contenant un FOMOD.

## Garanties visées

- Les sources locales (ZIP et dossiers extraits) ne sont pas modifiées par l’analyse et la préparation.
- Seuls les fichiers des règles requises et des options sélectionnées alimentent le paquet staged.
- Les chemins absolus/traversants/ambigus, les liens symboliques et les collisions de même priorité sont refusés.
- Le manifeste staged conserve les choix et l’empreinte de la source pour permettre une réparation ultérieure si l’archive d’origine existe toujours.
- Les diagnostics d’analyse/staging ne constituent pas une validation runtime.

## Hors périmètre et état

L’analyse des dépendances/flags/conditions avancées, les scripts, le résolveur de dépendances/version, le changement de sélection après installation, la désinstallation par option, RAR/7z, le rollback de toute transaction multi-profils, la vérification des logs de frameworks et la validation d’un véhicule en jeu ne sont pas pris en charge. Le parseur refuse les plans dont la sécurité ne peut pas être déterminée à partir des règles statiques connues.

Cette intégration reste expérimentale tant que le code Rust n’a pas été compilé et testé dans l’environnement du projet et que l’intégration avec le jeu, MO2 et Vortex n’a pas été vérifiée. Aucune parité avec un autre gestionnaire ni aucun chargement runtime n’est revendiqué.
