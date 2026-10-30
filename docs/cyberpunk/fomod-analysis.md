# FOMOD — analyse et périmètre de support

## Structure

Un FOMOD standard combine généralement `fomod/info.xml`, `fomod/ModuleConfig.xml`, des images locales et les fichiers des options. `ModuleConfig.xml` décrit les fichiers requis, les étapes, groupes/options, règles de sélection et destinations. Les dépendances/flags/conditions peuvent influer sur l’affichage et la liste de fichiers. Certains installateurs recourent à des scripts C# ou à une logique externe.

Le FOMOD est donc un plan d’installation déclaratif, pas une archive dont tous les membres doivent être copiés. Les chemins `source` pointent dans l’archive; `destination` indique l’emplacement dans le jeu. Les fichiers optionnels mutuellement exclusifs ne doivent pas être installés ensemble.

## Analyse du cas Mazda MX-5 local

L’archive Mazda locale examinée en lecture seule est une version historique 1.2.3, distincte de la version actuelle 1.2.4 mentionnée dans la demande. Elle contient un `fomod/ModuleConfig.xml` encodé en UTF-16LE, des ressources d’images, des sorties optionnelles dans plusieurs racines Cyberpunk (`archive/pc/mod`, `r6/tweaks`, chemins CET, etc.) et de nombreuses variantes. Le ZIP brut ne constitue pas un layout prêt à copier.

Le dossier installé par MO2 ne conserve pas de preuve exploitable des choix précis faits dans son assistant. Son `meta.ini` local n’apporte pas d’identifiants Nexus fiables. Il n’est donc pas possible de conclure quelles variantes l’utilisateur avait choisies ni de confirmer la cause runtime exacte de l’absence de voiture. Ce cas a servi d’observation de format uniquement : aucune règle, identité ou logique propre à Mazda/MX-5 n’est codée dans l’importeur.

## Première tranche ZAILON — expérimentale

Pour Cyberpunk 2077, l’analyseur natif reconnaît `fomod/ModuleConfig.xml` dans un ZIP, lit `info.xml`, décode UTF-8/BOM et UTF-16LE/BE, et expose dans l’assistant de `GamesView` les étapes, groupes, options statiques, valeurs par défaut, descriptions et images PNG/JPEG/WebP/GIF bornées. L’interface vérifie les contraintes de sélection; le backend les valide à nouveau et ne matérialise que les règles requises et les options sélectionnées. Les choix et l’empreinte du ZIP sont conservés dans le manifeste staged.

Les règles de fichiers/dossiers explicites sont résolues vers des racines Cyberpunk reconnues. Les chemins traversants, destinations ambiguës/non Cyberpunk, symlinks, doublons case-insensibles et collisions de même priorité sont refusés. Les collisions à priorité différente utilisent la priorité déclarée. Les scripts FOMOD ne sont jamais exécutés. Tout motif conditionnel, dépendance, structure ou règle que l’analyseur ne sait pas interpréter fait échouer fermé le plan : l’assistant affiche son statut non pris en charge et bloque l’installation au lieu de choisir implicitement toutes les options.

L’import générique bloque un ZIP Cyberpunk (avec ou sans FOMOD) et les dossiers FOMOD extraits, y compris leurs sous-dossiers/fichiers. Les archives téléchargées via le catalogue ou une Collection ne sont pas auto-extraites si elles contiennent un FOMOD. Les sources locales ne sont pas modifiées par l’analyse ou le staging; seuls les fichiers sélectionnés sont copiés dans un paquet temporaire ZAILON.

## Limites et sécurité

Cette tranche n’est pas une implémentation complète de la spécification FOMOD : l’évaluation de dépendances/flags/conditions, les dépendances de frameworks et versions, les règles conditionnelles, les scripts, le changement ultérieur des choix, la désinstallation par option et les archives RAR/7z restent hors périmètre. La validation runtime en jeu et la compatibilité avec MO2/Vortex ne sont pas établies; la présence d’un fichier `.archive` ne prouve pas qu’un véhicule est disponible en jeu. `TemporaryCopy` est le backend de déploiement actuel et ne doit pas être présenté comme USVFS.

Aucune DLL, bibliothèque, ressource, configuration ou code MO2 n’est réutilisé. Le parseur dépend de `quick-xml` déclaré directement dans le manifeste Rust; ZIP est traité avec la dépendance déjà présente. Les fixtures sont synthétiques et ne contiennent aucun asset du Mazda ni donnée utilisateur MO2. La compilation, les tests Rust et l’intégration runtime restent à vérifier avant de considérer cette tranche comme validée.
