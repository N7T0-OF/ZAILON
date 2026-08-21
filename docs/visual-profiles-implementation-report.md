# Rapport d’implémentation — Visual Profiles

Date : 28 juillet 2026
État : implémentation expérimentale, validation matérielle Windows encore requise avant de retirer ce qualificatif.

## Résultat

Visual Profiles est un module local et gratuit séparé du gestionnaire de mods. Il enregistre ses données dans le répertoire applicatif ZAILON, jamais dans le dossier d’un jeu. Il n’injecte aucune DLL, n’ouvre pas la mémoire d’un jeu et ne traite aucune image en continu.

Fonctions livrées :

- éditeur de saturation, vibrance, luminosité, contraste, gamma, température, RGB, ombres, hautes lumières et netteté ;
- saisie précise, remise à zéro individuelle par bouton ou double-clic, et remise à zéro globale ;
- aperçu avant/après sur huit scènes ZAILON ou une image locale choisie par l’utilisateur ;
- presets standards, accessibilité et variantes Rust aux noms non compétitifs ;
- création, modification, duplication, suppression récupérable, favoris dans le modèle, historique, import et export déclaratif ;
- détection des écrans Windows, résolution, écran principal, HDR, profil ICC actif et capacité Gamma Ramp ;
- application Windows Gamma Ramp expérimentale avec lecture avant écriture, relecture de contrôle, limites et compte à rebours de 15 secondes ;
- backend `preview-only` sur toutes les plateformes ;
- association explicite à un jeu et à un profil ZAILON ;
- application avant le lancement du jeu et restauration après son arrêt ;
- restauration à la fermeture normale de ZAILON et tentative de récupération au démarrage après un arrêt inattendu ;
- raccourcis globaux configurables de restauration, activation, profil précédent et profil suivant ;
- politique Rust et détection en lecture seule de composants ReShade connus ;
- journal JSONL local sans capture d’écran ni contenu de jeu.

## Réglages réellement appliqués

Avec `windows-gamma-ramp` en SDR confirmé : luminosité logique, contraste, gamma, température et balances rouge/verte/bleue sont transformés dans une LUT 1D de 3 × 256 valeurs.

Saturation, vibrance, ombres, hautes lumières et netteté apparaissent dans l’aperçu, mais ne sont pas présentées comme appliquées au moniteur par cette LUT. Aucun faux backend NVIDIA, AMD, Intel ou ICC n’est simulé.

En HDR actif ou lorsque l’état HDR est inconnu, l’application Gamma Ramp est bloquée. ZAILON propose alors l’outil officiel d’étalonnage HDR Windows.

## Cycle par jeu

1. ZAILON prépare le déploiement normal des mods.
2. Il recherche une association visuelle exacte pour le jeu et le profil ZAILON.
3. S’il en existe une, il sauvegarde l’état d’affichage et tente l’application.
4. Une erreur visuelle est ajoutée au diagnostic mais ne bloque pas le lancement du jeu.
5. ZAILON surveille seulement le processus enfant qu’il a lui-même lancé.
6. À la fin du processus, il restaure l’état d’affichage sauvegardé.

## Activité et performances

L’architecture est événementielle : appliquer, vérifier, rester inactive, restaurer. Aucun rendu, encodage, capture ou traitement par image n’est effectué. Aucun chiffre FPS/CPU/GPU n’est annoncé, car aucune mesure matérielle reproductible n’a encore été réalisée.

## Vérifications réellement exécutées localement

- `npm run build` : réussi ;
- `npm run test:visual-safety` : réussi sur 13 fichiers ;
- `cargo fmt --all -- --check` : réussi ;
- `cargo check --tests` : lancé mais bloqué avant la compilation du projet, car la machine locale ne possède ni `link.exe` ni les bibliothèques Windows SDK.

Les compilations Rust Windows et Linux sont confiées au workflow GitHub existant. Les essais Windows 10/11, SDR/HDR, mono/multi-écran, veille, reconnexion et refus du pilote restent des validations matérielles à effectuer ; ils ne sont pas déclarés réussis dans ce rapport.

## Limites actuelles

- Gamma Ramp est expérimental et Windows ou le pilote peut le remplacer.
- L’API ne garantit pas un réglage réellement indépendant par moniteur.
- ICC est lu et affiché, mais son changement n’est pas automatisé.
- HDR renvoie vers l’outil Windows officiel.
- DDC/CI est diagnostiqué comme non activé tant qu’un flux d’autorisation et de restauration matérielle dédié n’est pas validé.
- Les événements veille, changement de résolution, redémarrage pilote et déconnexion écran sont récupérés par le fichier d’urgence au prochain démarrage, mais ne disposent pas encore chacun d’un observateur Windows spécialisé.
- La mini-fenêtre indépendante et la galerie communautaire sont préparées conceptuellement, mais non livrées dans cette version.
