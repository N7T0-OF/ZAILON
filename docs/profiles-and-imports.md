# Profils, imports et sécurité

ZAILON 1.3 conserve un seul catalogue de fichiers installés par jeu. Les profils ne stockent que l’activation, la priorité, les notes et les règles. La migration v3 convertit automatiquement les anciens profils qui contenaient chacun une copie complète de la liste de mods.

Les archives `.zailon-profile` sont des ZIP structurés :

- `manifest.json`
- `mods.json`
- `load-order.json`
- `rules.json`
- `settings.json`
- `notes.txt`
- `files/` uniquement pour un export complet

Un import ne remplace jamais un profil existant. Les fichiers sont extraits dans une zone temporaire, vérifiés, puis déplacés vers une destination unique. Les chemins absolus, traversées `..`, liens symboliques, noms Windows réservés, scripts/exécutables inattendus, archives de plus de 100 000 entrées et extractions de plus de 4 Gio sont refusés.

Le scanner reconnaît les structures génériques, Cyberpunk 2077 (`archive/pc/mod`, `r6/scripts`, `red4ext/plugins`, `bin/x64/plugins`, `mods`), Bethesda, Unreal Pak, XXMI et BepInEx. Un résultat faible n’est jamais associé automatiquement à une page distante.
