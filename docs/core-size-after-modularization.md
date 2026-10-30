# Poids du Core après modularisation (spec §58-59)

## Objectif

Mesurer l'impact réel de la modularisation — les bibliothèques/fonctions qui ne
sont plus utilisées que par des add-ons doivent sortir du package Core.

## Métriques à comparer (avant / après chaque migration d'add-on)

- taille de l'installeur ;
- taille installée ;
- RAM à froid (fenêtre ouverte, aucun add-on) ;
- temps de démarrage ;
- nombre de dépendances.

## Méthode

1. Générer un rapport `docs/core-dependency-audit.md` : scanner les imports et
   lister les dépendances qui ne sont référencées que par du code destiné à un
   add-on (ex. un client Nexus n'utilisé que par le provider Nexus).
2. Pour chaque add-on migré, re-mesurer Core seul (0 add-on installé) et vérifier
   le « feature removal test » (§57) : la fonctionnalité disparaît réellement.
3. Comparer les métriques et documenter le delta dans ce fichier.

## État actuel (baseline)

Core : ZAILON seul (0 add-on) — aucune fonctionnalité migrée n'est encore retirée
du bundle ; les premières migrations (Discord, providers, Visual Profiles,
Cyberpunk, NTE, Performance+) feront l'objet des mesures ci-dessus. Le gating UI
est déjà en place (un add-on non installé n'apparaît nulle part et ne charge
rien) ; il reste à retirer le code du bundle.
