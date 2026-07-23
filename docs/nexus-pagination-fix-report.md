# Correction de la pagination Nexus

Date du rapport : 23 juillet 2026

## Statut

La limite locale à environ vingt mods a été supprimée. Le catalogue utilise maintenant la pagination serveur Nexus et l’interface peut demander chaque page réelle. Le frontend de production compile. GitHub Actions a compilé et testé le backend Rust sur Windows et Linux.

## Cause exacte

L’ancien backend appelait l’un de ces flux REST v1 :

- `games/<domain>/mods/latest_added.json`
- `games/<domain>/mods/latest_updated.json`
- `games/<domain>/mods/trending.json`

Ces endpoints renvoyaient un lot borné sans métadonnées de pagination. Le frontend recevait seulement ce lot, appliquait ensuite recherche et tri localement, puis utilisait :

```text
pageSize = 9
pageCount = ceil(visibleMods.length / pageSize)
pageMods = visibleMods.slice((page - 1) * pageSize, page * pageSize)
```

Avec un lot réseau d’environ vingt éléments, ZAILON fabriquait donc deux ou trois pages locales alors que le compteur du jeu venait de `games.json` et annonçait plus de 22 000 mods. Le total global et le nombre réellement parcourable n’avaient pas la même source.

## Nouvelle méthode

Le backend utilise le service GraphQL Nexus v2 :

```text
POST https://api.nexusmods.com/v2/graphql
mods(filter, sort, offset, count)
```

Chaque changement de page, recherche, tri ou filtre envoie une nouvelle requête avec :

```text
offset = (page - 1) * pageSize
count = pageSize
```

Les champs sont séparés :

- `game.modCount` → total global du jeu ;
- `mods.totalCount` → total exact avec les filtres actifs ;
- `mods.nodes.length` → éléments reçus pour la page ;
- `totalPages = ceil(totalCount / pageSize)`.

La réponse exposée à React est `NexusPaginationMetadata` : page, taille, total filtré, total de pages, nombre chargé, total global, précédent, suivant et caractère exact du total.

## Interface

- Taille utilisée : 20 résultats par page.
- Navigation compacte : première page, pages voisines, ellipses et dernière page.
- Saisie « Aller à la page » validée entre 1 et la dernière page.
- Même pagination en grille et en liste.
- Recherche, tri et filtre adulte reviennent à la page 1.
- Changer de vue ne relance pas la requête.
- Cache par page de cinq minutes, indexé par fournisseur, jeu, requête, tri, filtre adulte, page et taille.
- Le numéro de requête courant empêche une ancienne réponse réseau de remplacer la dernière page demandée.
- L’état de navigation Nexus est restauré depuis la session locale, sans secret.

## Exemple réel vérifié

Test direct du service officiel effectué le 23 juillet 2026, sans consigner la clé API :

```text
Jeu : Cyberpunk 2077
Domaine : cyberpunk2077
Total filtré renvoyé : 22 603
Taille de page : 20
Pages calculées : 1 131
Pagination réseau : offsets distincts vérifiés
```

Le test pur ajouté au backend vérifie aussi le cas :

```text
Page : 50
Taille : 20
Offset envoyé : 980
```

Une requête de page supérieure à 2 n’est plus calculée à partir du lot déjà chargé.

## Tests réellement exécutés

- Requêtes GraphQL officielles : total Cyberpunk 2077 et changement d’offset vérifiés.
- `npm.cmd run build` : réussi, TypeScript et bundle Vite de production.
- `cargo fmt --check` : réussi avant le dernier ajout, puis `cargo fmt` réussi après celui-ci.
- `git diff --check` : réussi.
- Tests unitaires ajoutés et réussis pour les offsets Mods et Collections.
- GitHub Actions : frontend, contrat GameBanana et 29 tests Rust réussis sur Windows et Linux.
- `cargo check` local reste impossible sur ce poste ; `link.exe`, `kernel32.lib` et le Windows SDK sont absents.

## Limites restantes

- Le transport HTTP n’est pas interrompu physiquement lors d’une frappe rapide ; sa réponse est ignorée si elle n’est plus courante.
- La taille 40/60 et le défilement continu ne sont pas exposés dans les paramètres.
- L’état est conservé dans la session de l’application, pas encore dans une vraie route interne.
- Si Nexus retire `totalCount` de cette API encore en évolution, il faudra passer à une navigation progressive fondée sur `hasNext` au lieu d’inventer une dernière page.
- Les installateurs complets ne sont volontairement pas publiés depuis cette branche de validation ; ils restent produits par le workflow de release sur un tag versionné.

Documentation de référence : [Nexus Mods GraphQL API](https://graphql.nexusmods.com/) et [politique d’utilisation de l’API Nexus](https://help.nexusmods.com/article/114-api-acceptable-use-policy).
