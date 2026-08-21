# Plan et état des tests de restauration d’affichage

## Tests automatisés présents

- une transformation neutre conserve exactement la rampe ;
- une transformation maximale reste bornée et monotone ;
- un backend inconnu et une valeur hors plage sont refusés ;
- le rapport Rust conserve tous les drapeaux d’injection, mémoire, hook et overlay à `false` ;
- l’audit statique refuse les symboles d’API interdits ;
- TypeScript et le bundle de production sont compilés.

## Scénarios fonctionnels à exécuter sur matériel

| Scénario | Résultat attendu | État |
|---|---|---|
| Windows 10 SDR | lecture, application légère, relecture, restauration identique | à tester |
| Windows 11 SDR | idem | à tester |
| Windows 11 HDR actif | application Gamma Ramp refusée, lien HDR disponible | à tester |
| Deux écrans | écran stable détecté, cible choisie, avertissement sur limites pilote | à tester |
| Écran déconnecté | erreur claire, aucune écriture ailleurs | à tester |
| Pilote ignorant Gamma Ramp | relecture différente, erreur et restauration | à tester |
| Valeur extrême | dialogue 15 s, restauration automatique sans confirmation | à tester |
| Fermeture du jeu | état précédent restauré après `wait()` | à tester |
| Fermeture ZAILON | restauration dans `CloseRequested` | à tester |
| Crash ZAILON | fichier d’urgence lu et restauration tentée au démarrage | à tester |
| Raccourci d’urgence | restauration immédiate même hors de la page | à tester |
| Veille/reprise | état sûr récupéré ou avertissement au retour | à tester |
| Changement HDR/résolution | refus ou récupération sans écran illisible | à tester |

## Procédure de sécurité

1. Commencer avec le preset Neutre.
2. Noter l’écran, le mode HDR et le profil ICC affichés.
3. Appliquer une variation de gamma inférieure à 5 %.
4. Vérifier visuellement puis utiliser « Restaurer maintenant ».
5. Comparer la rampe relue à celle sauvegardée.
6. Tester ensuite le compte à rebours avec un réglage marqué extrême.
7. Fermer ZAILON pendant un profil actif, puis relancer.
8. Ne tester HDR qu’après validation complète du chemin SDR.

## Limite de la session actuelle

La machine de développement utilisée le 28 juillet 2026 ne contient ni Visual Studio Build Tools ni Windows SDK (`link.exe` et `kernel32.lib` absents). Le formatage Rust est validé, mais les tests natifs locaux ne peuvent pas être liés. Le workflow GitHub Windows/Linux doit valider la compilation avant publication. Aucun écran physique n’a été modifié pendant cette session.
