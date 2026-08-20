# Performance+

Applique **réellement** la priorité du processus du jeu au lancement, selon le
mode Performance choisi (Configuration → Performance du jeu) :

- **Automatique** : rien n'est touché (le système garde la main) ;
- **Normale / Supérieure à la normale / Haute** : appliquée au PID du jeu
  (`SetPriorityClass` sur Windows, `setpriority` sur Linux/macOS).

Sans cet add-on, la priorité reste une valeur affichée — jamais appliquée à
l'OS. **Jamais « Temps réel »** : réservé, il peut rendre le système instable.
