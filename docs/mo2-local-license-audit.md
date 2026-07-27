# Audit de licence de l’installation MO2 locale

ZAILON déclare actuellement `MIT` dans `src-tauri/Cargo.toml`, mais le dépôt ne possède
pas encore de fichier `LICENSE` racine. Cette absence doit être corrigée par le
propriétaire du projet avant une distribution intégrant un composant copyleft.

| Chemin/composant | Origine officielle | Licence vérifiée | Obligations principales | Compatible | Décision |
|---|---|---|---|---:|---|
| `ModOrganizer.exe`, `uibase.dll`, plugins MO2 officiels | `ModOrganizer2/modorganizer` | GPL-3.0 | notices, GPL, source correspondant pour un dérivé distribué | sous conditions | ne pas copier ; réimplémentation indépendante |
| `usvfs_x64.dll`, `usvfs_x86.dll`, proxies | `ModOrganizer2/usvfs` | GPL-3.0-or-later avec permissions FOSS section 7 | projet FOSS, notice USVFS, licence, lien dépôt ; source pour modifications | sous conditions | ne pas copier dans cette phase |
| `plugins/basic_games/**` | `ModOrganizer2/modorganizer-basic_games` | MIT | conserver copyright et licence | oui | concepts étudiés ; aucun fichier copié |
| plugin Cyberpunk Python local | `modorganizer-basic_games` | MIT | notice MIT si code copié | oui | réimplémentation originale, pas de copie |
| `plugins/*.dll` | dépôts MO2 variés ou tiers | mélange/inconnu localement | audit composant par composant | inconnu | refusé |
| `dlls/**`, Qt, Python, OpenSSL, Boost, 7-Zip, etc. | bibliothèques tierces | licences multiples dans `licenses/` | obligations variables | non requis | refusé |
| `stylesheets/**`, `resources/**`, `translations/**` | MO2, Qt et auteurs de thèmes | attribution exacte non démontrée par fichier | inconnue par asset | inconnu | refusé |
| `explorer++/**` | Explorer++ | GPL (fichier local) | copyleft/source | non requis | refusé |
| `mods/**`, `downloads/**` | auteurs de mods et Nexus/autres sources | propre à chaque mod | permissions individuelles | inconnu | jamais copié au dépôt |
| `profiles/**`, `overwrite/**`, `ModOrganizer.ini` | données utilisateur | données de l’utilisateur | confidentialité | migration locale | jamais copié au dépôt |

## Sources officielles consultées

- https://github.com/ModOrganizer2/modorganizer
- https://github.com/ModOrganizer2/modorganizer/blob/master/LICENSE
- https://github.com/ModOrganizer2/usvfs
- https://github.com/ModOrganizer2/usvfs/blob/master/LICENSE
- https://github.com/ModOrganizer2/modorganizer-basic_games
- https://github.com/ModOrganizer2/modorganizer-basic_games/blob/master/LICENSE

## Conclusion

Aucun binaire, DLL, source, thème, traduction ou asset MO2 n’est nécessaire à
l’assistant d’import. ZAILON peut lire les formats de données de l’utilisateur et
reconstruire son propre store sans redistribuer MO2. Cette option évite d’imposer la
GPL à une partie liée ou dérivée de ZAILON et limite le risque de chaîne
d’approvisionnement.

