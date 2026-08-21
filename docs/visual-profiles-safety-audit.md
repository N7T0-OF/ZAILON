# Audit de sécurité — Visual Profiles

## Périmètre

Code audité :

- `src/visual-profiles/`
- `src-tauri/src/visual_profiles.rs`
- raccordement au lancement dans `src-tauri/src/lib.rs`

## Garanties techniques du module

Le backend déclaré rapporte :

| Propriété | Valeur |
|---|---:|
| Modifie des fichiers de jeu | non |
| Injecte du code | non |
| Accroche DirectX/Vulkan/OpenGL | non |
| Lit la mémoire du jeu | non |
| Écrit dans la mémoire du jeu | non |
| Utilise un pilote noyau | non |
| Crée un overlay | non |
| Modifie l’affichage système | oui, seulement avec un backend accepté |
| Modifie le matériel du moniteur | non dans cette version |

Le test `.github/scripts/check-visual-safety.mjs` échoue si le module importe ou mentionne des API connues d’injection, de mémoire de processus ou de hook graphique. Il vérifie aussi la présence du stockage d’urgence et des drapeaux de sécurité obligatoires. Le workflow CI l’exécute avant le build du frontend.

## Écriture disque

Les profils, historiques, associations, corbeille, journal et état d’urgence sont résolus à partir du répertoire de données applicatif Tauri :

`visual-profiles/`

Le backend ne reçoit aucun chemin de destination de jeu pour ses écritures. Le chemin d’installation d’un jeu est fourni uniquement au diagnostic Rust, qui vérifie en lecture seule l’existence de noms ReShade connus.

L’import accepte uniquement `.zailon-visual-profile`, refuse les champs JSON inconnus, limite le fichier à 1 Mio, borne chaque valeur et interdit tout backend non déclaré. Ce format ne contient aucun exécutable, DLL, script, token ou commande.

## Processus de jeu et anti-triche

Visual Profiles ne recherche pas les processus, ne scanne pas leurs modules et ne manipule pas EAC. L’intégration réutilise uniquement le processus enfant déjà lancé par ZAILON. La restauration est déclenchée après `wait()` sur ce processus.

Le badge utilisateur est « Mode affichage système ». Le produit n’affiche jamais « 100 % EAC Safe », « indétectable » ou « zéro perte FPS ».

## Sources de politique et d’API

- [Facepunch — Failed to initialize: ReShade](https://support.facepunchstudios.com/hc/en-us/articles/24444483513373-Failed-to-initialize-Reshade)
- [Microsoft — SetDeviceGammaRamp](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setdevicegammaramp)
- [Microsoft — Windows HDR Calibration](https://support.microsoft.com/en-us/windows/hardware/display-graphics/calibrate-your-hdr-display-using-the-windows-hdr-calibration-app)

## Conclusion

L’architecture respecte la séparation « affichage système » / « modification du jeu ». Cela ne constitue pas une garantie permanente d’autorisation par un éditeur : ses règles peuvent évoluer.
