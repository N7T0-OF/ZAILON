# Politique de rétention de l'historique

Documente la rétention des tâches (Téléchargements / Activité) et des notifications,
conformément au spec `docs/ui-cleanup-and-input-remap.md` (#3-#7).

## Tâches / Activité (Téléchargements)

- **En cours / En attente** : jamais supprimées automatiquement, jamais effacées par
  « Tout supprimer ».
- **Terminées** : conservées selon le réglage « Nettoyage des téléchargements » :
  - `À chaque démarrage` (défaut) — les terminées de la session précédente sont retirées ;
  - `Après 1 jour` / `Après 7 jours` ;
  - `Jamais`.
- **Erreurs** : conservées au moins 7 jours (visibilité des échecs), indépendamment de la rétention.
- **« Tout supprimer »** : efface uniquement l'historique terminé / en erreur, jamais une tâche
  active, jamais les mods installés, jamais les fichiers téléchargés encore utilisés
  (Collections hors ligne, rollbacks, archives).
- Le nettoyage s'exécute au démarrage (`BackgroundCleanupService`, action
  `cleanupBackgroundTasks`) sans bloquer le lancement. Les tâches viennent du backend Rust
  (`background_tasks`) et sont plafonnées à 500 dans le store.

## Notifications (toasts)

- Succès / information : ~2 s — avertissement : ~5 s — erreur : ~8 s — action requise : persistante.
- Minuteur suspendu au survol.
- **Toast ≠ événement d'historique** : un toast temporaire (« 109 mods analysés ») peut disparaître
  sans laisser de trace ; un événement important (déploiement échoué, suppression, migration,
  opération interrompue) reste dans l'historique.
- **Nombre maximum d'événements** (réglage « Activité », défaut 250, choix 100/250/500/1000) :
  au-delà, les plus anciens doublons sont retirés. Toujours préservés : erreurs non résolues,
  actions requises, migrations, événements épinglés.

## Ce qui n'est JAMAIS supprimé par le nettoyage

- Les mods installés et leurs paquets (store immuable) ;
- les snapshots / points de restauration ;
- les profils et leurs configurations ;
- les fichiers dont une Collection hors ligne, un rollback ou un profil dépend ;
- les téléchargements en cours ou en attente.
