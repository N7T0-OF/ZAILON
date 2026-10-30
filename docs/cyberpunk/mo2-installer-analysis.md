# Audit local MO2 — architecture d’installation

## Périmètre et précautions

Audit en lecture seule d’une installation portable MO2 locale, utilisée avec Cyberpunk 2077. Aucune modification de MO2, de ses profils, de ses téléchargements ou de ses mods n’a été faite. Les chemins personnels, noms de profils, clés et données de compte sont volontairement omis. Aucun binaire ni code de plugin MO2 n’a été copié dans ZAILON.

## Architecture observée

- MO2 sépare les exécutables/installateurs, les plugins d’installation, les mods extraits, les archives téléchargées, les métadonnées, les profils, les fichiers `modlist.txt`/`plugins.txt` et `overwrite`.
- Les profils expriment l’activation et l’ordre des mods. Les fichiers physiques des mods restent séparés; les priorités servent à résoudre les fichiers gagnants.
- Le déploiement virtuel MO2 s’appuie sur USVFS. Ce mécanisme n’est pas présent dans ZAILON et ne doit pas être décrit comme équivalent à sa projection temporaire.
- Le plugin FOMOD examine une définition XML et présente les étapes/options avant de produire les fichiers sélectionnés. L’archive seule ne décrit donc pas un dossier à recopier. Les installateurs C# et scripts représentent une autre classe de logique exécutable.

## Comparaison avec ZAILON

ZAILON possède déjà des profils, un store de paquets staged, une carte virtuelle de déploiement et un backend `TemporaryCopy` qui sauvegarde/restaure les fichiers du jeu. Cyberpunk sait déjà normaliser plusieurs racines par fichier (`archive`, `r6`, `red4ext`, `bin`, etc.). Ce n’est ni USVFS ni un montage persistant de tous les mods.

Le chemin d’import courant accepte surtout des dossiers. Un ZIP téléchargé est extrait sans étape d’installation FOMOD; sélectionner directement le ZIP dans l’importeur de dossiers risquait de le traiter comme un fichier ordinaire. Les contenus d’un FOMOD (configurations, images et variantes) pouvaient ainsi être pris pour le contenu du mod au lieu des sorties choisies.

## Ce que ZAILON peut reproduire

- Lecture d’une archive ZIP et de sa configuration FOMOD XML, sans lancer de code.
- Présentation des étapes, groupes, options, descriptions et petites images locales.
- Sélection de fichiers explicites et passage des destinations au mapper Cyberpunk existant.
- Sauvegarde des identifiants d’options dans le manifeste staged pour conserver une trace de configuration.
- Limites d’entrées/taille, contrôle des chemins, refus des symlinks et staging séparé.

## Ce qui doit être adapté ou réimplémenté

- Implémenter un moteur déclaratif propre à ZAILON et un dialogue d’options, sans dépendre de l’interface ou des DLL de MO2.
- Les destinations de sortie doivent être validées par les règles de racine Cyberpunk existantes; aucun chemin de mod ne doit être aplati.
- Les dépendances, leurs versions, les conflits et l’état runtime doivent être établis par des preuves locales; ils ne sont pas déduits d’un simple nom ou d’une extension.
- Les règles FOMOD conditionnelles complexes doivent être prises en charge séparément et testées avant de les déclarer supportées.

## Ce qui est spécifique à MO2 et ne doit pas être copié

USVFS, le format interne des profils, les plugins MO2, son système de priorité et son interface sont propres à MO2. ZAILON peut réimplémenter des comportements compatibles conceptuellement, mais ne doit ni embarquer les DLL/binaries MO2, ni exécuter ses plugins, ni importer son code sans examen de licence explicite.

## Licences et réutilisation

MO2 et ses composants ont leurs propres licences et notices. Cet audit ne conclut pas qu’un composant tiers est réutilisable dans ZAILON. Aucun composant, ressource, texte d’interface, DLL ou fichier de plugin MO2 n’a été copié. La première implémentation ZAILON utilise ses dépendances existantes/déclarées et une implémentation native, sans réutiliser le code MO2.

## Limites de l’audit

L’audit documente l’architecture et les signes locaux nécessaires à la migration, pas une comparaison exhaustive ligne par ligne du code source de chaque plugin MO2. L’installateur FOMOD est livré comme plugin compilé dans l’installation auditée; son binaire n’a pas été inspecté ni exécuté. Les données privées de profils/téléchargements ne sont pas reproduites dans ce rapport.
