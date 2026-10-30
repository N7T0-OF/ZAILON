# Correctif raccourcis bureau — icône réelle (spec §19-25, 47-48)

## Cause de l'icône blanche

Les raccourcis Windows étaient des fichiers `.url` (InternetShortcut) : Windows
les traite comme des liens web et affiche souvent une icône générique de fichier
blanc, même avec un `IconFile` renseigné — surtout quand l'icône est un PNG/WebP
non reconnu par le champ.

## Correctif

### Vrai `.lnk` Windows (format binaire MS-OSH, sans dépendance)

`create_desktop_shortcut` écrit désormais un `.lnk` complet :

- `TargetPath` : ZAILON.exe ;
- `Arguments` : `zailon://launch/game/{gameId}?profile={profileId}` — l'app
  intercepte l'URI en argument (`std::env::args()` / single-instance) et lance
  le jeu avec **profil, mods, session, clavier et visuel conservés** ;
- `WorkingDirectory` : dossier de ZAILON ;
- `IconLocation` : icône résolue (voir ci-dessous) ;
- `Description` : « ZAILON - <jeu> — lance le jeu via ZAILON (profil, mods,
  clavier, visuel) ».

Le générateur (`write_windows_shortcut_lnk`) écrit l'en-tête ShellLink (76
octets), le LinkInfo (VolumeID disque fixe + LocalBasePath ANSI) et le
StringData UTF-16 (nom, répertoire, arguments, emplacement d'icône) — zéro COM,
zéro dépendance. Test de structure natif (Windows) : CLSID, drapeaux
(Unicode/Arguments/IconLocation/LinkInfo), offsets LinkInfo, présence des
chaînes UTF-16.

### Résolution d'icône en cascade (§20, §23)

```
1. Icône personnalisée / Apparence :
   .ico/.exe/.dll  → utilisée telle quelle (IconLocation)
   .png            → enveloppée dans un conteneur .ico Vista+ (256×256)
                     écrit dans resources/games/<game-id>/shortcut.ico
   autres formats  → étape suivante (pas de décodeur d'images)
2. Exécutable du jeu (exe) → icône native extraite par Windows
3. ZAILON.exe en dernier recours
```

Jamais de raccourci sans `IconLocation` valide (critère bloquant §57).

### Linux `.desktop`

`Icon=` pointe vers l'image locale résolue (chemin absolu). macOS conserve le
`.webloc` (lancement via le protocole zailon://).

## Tests

- Natif (Windows) : `windows_shortcut_lnk_structure_is_valid` — structure
  binaire du `.lnk` vérifiée (CLSID, drapeaux, offsets, StringData).
- À valider sur machine réelle (§53) : jeu avec icône personnalisée / sans
  icône / EXE avec icône, raccourci profil spécifique, icône après redémarrage
  d'Explorer, lancement via le raccourci.

## Limites connues

- Conversion **multi-taille** (16→256 px) d'un PNG en `.ico` non réalisée : le
  PNG est enveloppé tel quel (256×256, format PNG accepté par Windows Vista+).
  Explorer redimensionne ; l'icône blanche disparaît sans décodeur.
- `LocalBasePath` du `.lnk` est encodé en ANSI (1 octet/caractère) : un chemin
  d'installation ZAILON non-ASCII peut ne pas être résolu par ce champ
  (limitation documentée du format sans IDList ; le lancement via le protocole
  reste fonctionnel).
