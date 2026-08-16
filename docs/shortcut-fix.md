# Fix raccourci bureau (vrai .lnk système, vérifié)

## Principe

Le raccourci créé par ZAILON est un **vrai raccourci système**, jamais un
simple fichier `.url` ou un pseudo-raccourci.

```text
Bureau/
└── ZAILON - Cyberpunk 2077.lnk   (Windows : ShellLink MS-OSH binaire)
```

Le `.lnk` contient : **cible**, **arguments**, **répertoire de démarrage**,
**icône**, description. Double-clic → lancement direct.

## Deux méthodes (choix dans la micro-fenêtre)

| mode     | cible                                      | quand                                    |
|----------|--------------------------------------------|------------------------------------------|
| `zailon` | ZAILON.exe + `zailon://launch/game/<id>?profile=<pid>` | toujours (recommandé) — conserve profil, mods, session, clavier, visuel ET la **chaîne de lancement** (Frosty → plugin → jeu, FiveM → CitizenFX → GTA, NTE → UAC…) |
| `direct` | exécutable RÉEL du jeu (+ args + working dir)          | processus direct uniquement (pas de launcher) |

**Repli automatique** : si `direct` est demandé mais que l'exécutable est
introuvable ou que le jeu nécessite une chaîne de lancement, ZAILON crée le
raccourci **via ZAILON** et l'indique — jamais de raccourci cassé.

## Profil

Le raccourci embarque l'**identifiant interne du profil** (`?profile=<id>`),
pas seulement le nom du jeu : `Cyberpunk 2077 — Modded.lnk` lance le profil
Modded, `… — Default.lnk` lance Default.

## Icône (ordre, plus de raccourci blanc)

1. icône de l'exécutable (Windows l'extrait nativement) ;
2. icône enregistrée du jeu (PNG enveloppé en conteneur .ico 256×256) ;
3. icône ZAILON (dernier recours).

## Vérification post-création

Après écriture : fichier non vide, **cible résolvable**, **icône présente**.
En cas de problème → « Impossible de créer le raccourci » avec la raison exacte.

## Implémentation

- `src-tauri/src/lib.rs` : `create_desktop_shortcut(mode, …)` + `write_windows_shortcut_lnk`
  (format binaire MS-OSH, sans COM) + `verify_shortcut_file` ;
- `src/lib/shortcuts.ts` (pur, testé) : `shortcutModeFor` / `directShortcutViable`
  / `shortcutProfileId` — décision pure, jamais devinée ;
- `src/components/CreateShortcutDialog.tsx` : micro-fenêtre d'options + résultat vérifié.
