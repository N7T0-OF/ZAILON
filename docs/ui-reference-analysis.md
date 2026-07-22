# Analyse des références UI — ZAILON 1.6

## Références examinées

- `exemple managers/sts2-mod-manager/docs/screenshots/home-dark.png` : page d’accueil structurée autour du profil actif, actions de lancement et cartes récentes.
- `exemple managers/sts2-mod-manager/docs/screenshots/library-dark.png` : vraie barre de recherche/filtres/actions au-dessus d’une liste de mods lisible.
- `exemple managers/sts2-mod-manager/docs/screenshots/settings-dark.png` : navigation secondaire, cartes de réglages et informations de chemin regroupées.
- Pièce jointe « CB Servers Launcher » : rail gauche avec bibliothèque de jeux, héros horizontal, action principale et panneau d’actions contextuelles.
- Pièce jointe « DLSS Swapper » : rail compact, recherche et grille d’affiches à densité régulière.
- Pièce jointe « Themes » : palette d’accents, préréglages, contrôles de densité/rayon et aperçu immédiat dans une surface translucide.

## Structure et hiérarchie retenues

ZAILON conserve son rail principal, sa barre de titre native et sa barre d’état. La bibliothèque du jeu reste à gauche dans la vue Jeux, tandis que les onglets du jeu portent le contexte secondaire. Cette structure reprend la lisibilité du CB Launcher et de STS2 sans transformer ZAILON en copie visuelle.

L’ordre visuel recommandé est : contexte du jeu et du profil, action primaire, filtres/recherche, contenu réel, actions groupées contextuelles. Les panneaux décoratifs sans donnée réelle sont exclus. Les cartes d’activité, compteurs et états affichent uniquement des valeurs calculées par ZAILON.

## Navigation et actions

- Les actions globales restent dans le rail principal.
- Les actions du jeu restent dans son en-tête ou ses onglets.
- Les actions sur une sélection apparaissent dans une barre collante uniquement quand au moins un mod est sélectionné.
- « Créer vide » et « Dupliquer » restent deux actions distinctes et nommées sans ambiguïté.
- Les dossiers du profil, son verrouillage et son intégrité sont accessibles dans l’onglet Profils.

## Grilles, tailles et densité

La grille Explorer propose `Auto`, `2` ou `3` colonnes uniquement en mode grille. Le mode Auto revient à deux colonnes sur largeur intermédiaire et trois sur très grand écran. Une préférence explicite de trois colonnes se replie temporairement à deux quand la largeur ne permet plus une carte lisible ; la préférence enregistrée n’est pas modifiée.

Les textes visibles utilisent l’échelle centrale de ZAILON avec un minimum effectif de 14 px dans le plus petit réglage. Les contrôles ont au moins 32 px en mode compact et 38 px en mode confortable. Les actions principales utilisent la couleur d’accent ; les erreurs, avertissements et succès gardent leurs couleurs sémantiques.

## Éléments compatibles et adaptés

- Héros de jeu, rail de bibliothèque et cartes d’action du CB Launcher : adaptés aux vraies ressources et actions ZAILON.
- Barre recherche/filtres de DLSS Swapper et STS2 : adaptée à la bibliothèque de mods et à Explorer.
- Palette d’accents et aperçu de la référence Themes : adaptés aux variables CSS centrales et au diagnostic du matériau natif.
- Surfaces sombres, bordures discrètes et profondeur : conservées avec contraste renforcé.

## Éléments décoratifs ou impossibles exclus

- Aucune statistique fictive de joueur, aucun KDA, niveau, champion ou activité inventée.
- Aucun faux téléchargement, faux compte connecté ou faux état « chargé par le jeu ».
- Aucun effet DWM injecté, service tiers ou exigence administrateur.
- Aucun nombre de colonnes forcé qui rende les cartes illisibles sur petit écran.
- Aucun contenu généré de la référence Themes n’est repris comme donnée produit.

## Petits écrans et cohérence

Les listes et réglages défilent verticalement, les barres d’actions se replient, les modales gardent une largeur maximale et la galerie complète utilise tout l’espace disponible. La navigation ne dépend pas du survol. Les informations essentielles ont un libellé texte ou un nom accessible. Les références inspirent la disposition ; les composants, couleurs, données et comportements restent ceux de ZAILON.
