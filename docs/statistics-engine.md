# Statistiques — page et moteur

Spec « Accueil modulaire » §25-52, §90-91, §96-100. Livré en **1.88.0** (phase 1).

## Page Statistiques

Ouverte depuis le widget « Vos statistiques » de l'Accueil (`Voir toutes les
statistiques`, §28). **Pas d'entrée permanente dans la Sidebar** (§29). Vue
`statistics`, rendue par `StatisticsView.tsx`.

- **Totaux** (§30) : temps total suivi, sessions (cette exécution), jeu le plus
  joué, cette semaine.
- **Par jeu** (§31) : temps, dernière session, nombre de sessions de
  l'exécution, bouton vers la page jeu.
- **Par profil** (§32, §49) : barre de répartition `Default / Photo /
  Performance…` avec durée et pourcentage réel. L'UI résout les noms actuels ;
  un profil supprimé apparaît sous son nom sauvegardé (§99-100).
- **Apps** (§33) : les applications ajoutées à la Bibliothèque (`software`)
  sont listées comme les jeux.

## Moteur

Sources : playtimes persistés par jeu (`game.totalPlaytime`, minutes) et par
profil (`profile.playtime`), `game.lastPlayed`, et les sessions de l'exécution
courante (`gameSessions`, ms).

- **Cette semaine / compteur de sessions** : calculés sur les sessions de
  l'exécution courante — honnêteté affichée en pied de page (« les sessions de
  l'exécution courante alimentent… »). L'historique persistant complet des
  sessions est une phase suivante.
- **Total global** : somme des playtimes persistés — jamais recalculé depuis
  des millions de sessions à chaque ouverture (§46).
- **Confidentialité** (§51) : données 100 % locales, aucun serveur, aucun
  compte, aucune télémétrie.
- **Temps tiers** (§96) : jamais fusionné silencieusement — un add-on Steam
  afficherait « Suivi ZAILON : 128 h / Steam : 342 h » séparément.

## Limites actuelles (phase 1)

- Pas encore : graphiques 7/30 jours (§47), heatmap (§48), export CSV/JSON
  (§50), réinitialisation par jeu (§52), `launchSource` (Zailon/Steam/Externe,
  §36), tracking hors-ZAILON en arrière-plan (§34-45, 114-118).

## Notes d'implémentation

- Le widget Accueil lit uniquement un résumé agrégé (§90) ; la page complète
  est calculée à l'ouverture (§91).
- `formatTime` prend des MINUTES (pas des timestamps) — `formatElapsedDuration`
  pour les durées de session en ms.
