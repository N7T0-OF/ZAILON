# Contrats des fournisseurs Explorer

## GameBanana

ZAILON utilise l’API publique `https://api.gamebanana.com/Core` sans simuler de résultats. La recherche de jeux et la recherche/filtration des mods ont des contrôleurs d’annulation et des numéros de requête distincts afin qu’une réponse ancienne ne remplace jamais une réponse plus récente.

Les champs de détails acceptés sont `name`, `Owner().name`, `downloads`, `likes`, `Preview().sSubFeedImageUrl()`, `Preview().sStructuredDataFullsizeUrl()`, `description`, `Nsfw().bIsNsfw()`, `Game().name`, `Url().sProfileUrl()` et `screenshots`. Le champ historique `Preview().aPreviewMedia()` a été supprimé car l’API le refuse.

Le parseur accepte les réponses indexées ou à clés, ainsi que `screenshots` sous forme de chaîne JSON. Les images complètes sont reconstruites depuis `_sFile` sur le CDN GameBanana. Les erreurs distinguent réseau, délai, HTTP, schéma et erreur API. Les jeux et pages sont mis en cache cinq minutes.

Le test contractuel réel `npm run test:gamebanana-api` interroge `List/Like`, `List/New` et `Item/Data`, vérifie l’identifiant 8722 de Cyberpunk 2077, les identifiants numériques des mods et la disponibilité des champs `screenshots` et URL source. Il effectue jusqu’à trois tentatives en cas de panne transitoire et fait partie de la vérification GitHub Actions.

## Galerie

La galerie déduplique les images, charge l’image courante et précharge ses voisines, fournit flèches, clavier, miniatures et compteur. Une image en erreur est retirée sans casser le dialogue. L’ancien zoom au pointeur est supprimé. La parallaxe utilise `requestAnimationFrame`, `perspective(1000px)`, une rotation maximale de 7°/5° et une échelle fixe de 1.005; elle revient au neutre à la sortie et est désactivée avec la préférence système de réduction des mouvements.
