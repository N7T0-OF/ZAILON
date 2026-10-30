# Intégration OPEN//77 dans ZAILON

Date d’analyse : 30 octobre 2026. Statut : **expérimental**, parce qu’un parcours réel avec compte Alpha et serveur OPEN//77 reste à exécuter.

## Sources officielles analysées

- [Guide officiel du launcher](https://open2077.net/docs/launcher)
- [Guide officiel des mods](https://open2077.net/docs/mods)
- [Mods exigés par un serveur](https://open2077.net/docs/server-mods)
- [Contrat du launcher pour les propriétaires de serveurs](https://open2077.net/docs/launcher-for-server-owners)
- [Présentation et prérequis de la plateforme](https://open2077.net/docs/platform)

## Ce que ZAILON adapte

OPEN//77 conserve un store adressé par hash, un journal de projection par fichier et des couches `stack`/`world`. Il refuse aussi les conflits de propriété avec un autre gestionnaire. Ces principes correspondent à l’architecture de profils et de paquets immuables de ZAILON.

L’intégration ajoute donc une passerelle locale et auditable :

1. détection prudente de l’exécutable portable `Open77Launcher.exe`, avec sélection manuelle si nécessaire ;
2. validation minimale du binaire Windows (`MZ`, nom exact) et calcul SHA-256 ;
3. résolution explicite de l’installation Cyberpunk utilisée par le profil actif ;
4. lecture tolérante de `%LOCALAPPDATA%\Open77\modstore\state\projection.json` ;
5. comparaison des chemins projetés avec les fichiers du profil ZAILON actif ;
6. affichage des couches, fichiers présents/absents et conflits de propriété ;
7. lancement limité aux commandes officielles documentées : accueil, `--mods`, `--detect-only` et `--game-dir` ;
8. accès au journal officiel `%LOCALAPPDATA%\Open77\launcher.log` et à la documentation.

## Limites de sécurité

- ZAILON ne collecte ni e-mail, ni mot de passe, ni jeton, ni fichier de session OPEN//77.
- ZAILON ne télécharge, ne redistribue et ne remplace aucun paquet OPEN//77.
- ZAILON ne conclut jamais qu’un build est compatible à partir du seul hash local : le verdict officiel reste celui du launcher et de la plateforme.
- Un conflit de propriété n’est jamais résolu silencieusement. L’utilisateur choisit quel gestionnaire garde le chemin.
- Le deep link `open77://` n’est pas réimplémenté : OPEN//77 enregistre et traite lui-même son protocole.
- L’interface n’annonce pas que le client a été chargé en jeu sans preuve runtime.

## Validation automatisée

Les tests natifs vérifient :

- la lecture des couches `stack` et `world` ;
- la normalisation Windows des chemins ;
- la déduplication déterministe d’un même chemin ;
- le refus d’un fichier renommé `Open77Launcher.exe` qui n’est pas un exécutable PE.

La compilation TypeScript garantit le contrat entre l’interface et les commandes Tauri. La validation réelle restante exige Windows, Cyberpunk 2077 compatible, Phantom Liberty, un compte Alpha et un serveur accessible.

## Suite recommandée

1. exécuter `--detect-only` sur l’installation réelle et archiver le rapport ;
2. appliquer puis retirer le stack OPEN//77 et vérifier les compteurs du journal ;
3. provoquer volontairement un conflit RED4ext/redscript avec un profil de test ZAILON ;
4. confirmer que les deux interfaces nomment le chemin contesté sans l’écraser ;
5. rejoindre un monde, revenir au profil Solo et vérifier qu’aucun fichier `world` ne fuit ;
6. ajouter ensuite une preuve runtime par lecture de logs, sans injection dans le jeu.
