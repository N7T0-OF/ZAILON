# Vortex Importer

Import du déploiement **Vortex** dans ZAILON.

- Détecte `vortex.deployment.json` (ou `.manifest.json`) à la racine du jeu ;
- liste les mods actifs (source, nombre de fichiers déployés) et le dossier de
  staging `Vortex/mods/<instance>` ;
- crée un profil ZAILON « Vortex — `<instance>` » en **références** : aucune
  copie, aucun lien recréé — Vortex a déjà déployé (hardlink/symlink/move).

ZAILON ne pilote pas Vortex : gérer/purger les mods reste à faire dans Vortex.
