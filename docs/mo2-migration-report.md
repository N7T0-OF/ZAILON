# Rapport de migration MO2

## État

L’audit local est terminé. Aucun fichier de l’installation source n’a été modifié.
Aucune donnée personnelle n’a été ajoutée au dépôt.

## Correspondance implémentée

| MO2 | ZAILON |
|---|---|
| `mods/<nom>/` | paquet séparé du store |
| `mods/<nom>/meta.ini` | métadonnées par liste blanche |
| `profiles/<nom>/modlist.txt` | `Profile.modStates` |
| priorité inversée du fichier | priorité ZAILON explicite, nombre élevé gagnant |
| `_separator` | séparateur logique de profil |
| `.mohidden` | règle de fichier masqué |
| `overwrite/` | Overwrite du profil importé actif |
| `downloads/*.meta` | JSON facultatif filtré par liste blanche |
| `customExecutables` | exécutable géré validé |

## Données observées

- MO2 2.5.2 portable ;
- Cyberpunk 2077 ;
- 3 profils ;
- 143–144 entrées par profil ;
- 150 téléchargements ;
- aucun `.mohidden` présent lors de l’audit ;
- 568 fichiers dans Overwrite.

## Limites

- USVFS n’est pas intégré : le backend reste `TemporaryCopy`.
- Les plugins MO2 ne sont ni chargés ni rendus compatibles.
- FOMOD n’est pas copié depuis MO2 ; un interpréteur ZAILON devra rester déclaratif.
- L’Overwrite global MO2 ne permet pas de prouver l’origine de chaque fichier ; il est
  proposé uniquement au profil source actif.
- Une migration réelle n’est exécutée qu’après confirmation dans l’application.
