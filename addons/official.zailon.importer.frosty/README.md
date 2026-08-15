# Frosty Importer

Import d'une installation **Frosty** existante dans ZAILON.

- Détecte le dossier de mods de **Frosty Mod Manager**
  (`%LOCALAPPDATA%\Frosty\Mods`, `%APPDATA%\Frosty\Mods`, à côté du runtime ou
  d'un chemin fourni) ;
- liste les `.fbmod` présents (nom, chemin, taille) ;
- crée un profil ZAILON « Frosty — `<dossier>` » en **références** : aucune
  copie, aucun lien recréé — Frosty Mod Manager reste l'unique gestionnaire.

ZAILON ne pilote pas Frosty : activer/ordonner les mods reste à faire dans
Frosty Mod Manager. L'import d'un `.fbmod` isolé est couvert par **Frosty
Support** (`frosty.backend`) ; cet add-on couvre l'import en masse du dossier
de mods existant.
