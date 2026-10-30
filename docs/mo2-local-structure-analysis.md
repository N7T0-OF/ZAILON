# Analyse locale de Mod Organizer 2

Date de l’audit : 27 juillet 2026  
Source analysée en lecture seule : `G:\2_Logiciel\MOD ORGANIZER`

## Résumé vérifié

- Type : instance portable (configuration, `mods`, `profiles`, `downloads` et `overwrite` à côté de `ModOrganizer.exe`).
- Version : Mod Organizer 2 `2.5.2`.
- USVFS : `0.5.6.1`, architectures x86 et x64.
- Jeu configuré : Cyberpunk 2077.
- Profils : 3.
- Entrées de mods par profil : 143 ou 144, dont 11 séparateurs.
- Mods actifs observés : 0, 132 et 133 selon le profil.
- Téléchargements : 150 archives et 150 fichiers `.meta`, 3 997 528 651 octets.
- Installation complète : 4 355 fichiers, 1 458 dossiers, 7 780 828 477 octets.

Les noms de profils, de mods, d’archives et les chemins externes ne sont pas consignés
dans ce dépôt. Les exemples sont anonymisés.

## Arborescence fonctionnelle

| Élément | Fichiers | Taille | Nature | Décision |
|---|---:|---:|---|---|
| `mods/` | 1 607 | 3,11 Go | mods personnels séparés et métadonnées | migration locale facultative uniquement |
| `downloads/` | 300 | 4,00 Go | archives et métadonnées fournisseur | migration locale facultative uniquement |
| `overwrite/` | 568 | 125 Mo | sorties générées (`bin`, `r6`, `red4ext`, `tools`) | importer vers un Overwrite ZAILON isolé |
| `profiles/` | 17 | 288 Ko | activation, ordre et réglages | convertir en profils ZAILON distincts |
| `plugins/` | 673 | 53,4 Mo | plugins Python/C++ et dépendances | analyser, ne pas charger ni copier |
| `dlls/` | 43 | 229,5 Mo | Qt/Python/bibliothèques tierces | ne pas copier |
| `stylesheets/` | 342 | 42,9 Mo | thèmes et ressources associées | ne pas copier |
| `translations/` | 698 | 10,0 Mo | traductions MO2/Qt | ne pas copier |
| `resources/` | 7 | 23,6 Mo | ressources compilées | ne pas copier |
| `webcache/` | 12 | 80 Ko | cache Web/session potentielle | toujours ignorer |
| `logs/` | 3 | 76 Ko | journaux MO2/USVFS | ne pas migrer par défaut |
| `crashDumps/` | 0 | 0 | dumps | toujours ignorer |

## Représentation d’un mod installé

Chaque mod réel est un sous-dossier indépendant de `mods/`. Un `meta.ini` facultatif
contient notamment :

- `modid`, `fileid`, `gameName`, `repository`, `url` ;
- `version`, `newestVersion`, `installationFile` ;
- `category`, `nexusCategory`, `notes`, `comments`, `color` ;
- `validated`, `converted`, `endorsed`, `tracked` ;
- dates de requêtes/mises à jour.

Le modèle ZAILON correspondant est un paquet immuable dans le store et un état par
profil. Les valeurs de métadonnées sont lues par liste blanche ; aucune clé inconnue
n’est recopiée.

## Profils et conversion de priorité

Chaque profil contient `modlist.txt`, `archives.txt`, `lockedorder.txt`,
`settings.ini`, `UserSettings.json` et parfois `initweaks.ini`.

Dans `modlist.txt` :

- `+Nom` signifie actif ;
- `-Nom` signifie inactif ;
- `*Nom` désigne un élément géré automatiquement/étranger ;
- les commentaires commencent par `#` ;
- les noms finissant par `_separator` sont des séparateurs logiques.

Le code officiel MO2 lit le fichier dans son ordre physique puis inverse les priorités :
la première entrée possède la priorité gagnante la plus haute. ZAILON convertit donc
explicitement `priorité = nombre_d’entrées - index - 1`, car son dernier fournisseur
actif gagne un conflit.

| Élément | Partagé | Spécifique au profil | Méthode ZAILON |
|---|---:|---:|---|
| paquet immuable | oui | non | store partagé |
| activation | non | oui | `modStates` |
| priorité | non | oui | priorité convertie |
| Overwrite | non | oui | `profiles/<id>/overwrite` |
| réglages | non | oui | dossier `settings` |
| sorties générées | non | oui | dossier `generated` |
| cache de téléchargement | oui | non | cache global facultatif |

MO2 possède ici un Overwrite global. L’assistant ZAILON ne l’attribue qu’au profil MO2
actif sélectionné, afin de ne pas le partager artificiellement entre tous les profils.

## Cyberpunk 2077

Le plugin local reconnaît `archive`, `engine`, `r6`, `mods`, `red4ext`, `bin`, `root`
et plusieurs corrections pour CET/RED4ext/REDmod. ZAILON conserve son propre adaptateur
Cyberpunk et ses chemins relatifs à la racine du jeu :

`archive/pc/mod`, `mods`, `r6/scripts`, `r6/tweaks`, `red4ext/plugins`,
`bin/x64/plugins`, `engine`, `tools`.

Le code Python local a été étudié comme référence de comportement ; il n’a pas été
copié.

## Secrets et données ignorées

`ModOrganizer.ini` a été examiné par noms de sections et de clés. Les valeurs relatives
à Nexus, API, authentification, compte, cookie, session et chemins personnels ont été
masquées et ne seront jamais retournées par l’API d’import. `webcache`, les logs,
les dumps, les fichiers de jeu et les sauvegardes personnelles sont exclus.

