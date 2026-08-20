# steam-wrapper — wrapper Steam-safe pour ZAILON

Un exécutable Windows léger, sans console, qui agit comme intermédiaire
« Steam-safe » : il lance le vrai launcher / exécutable de jeu moddé en
**ignorant tous les arguments** que Steam injecte (via `%command%` ou en
remplaçant l'exe d'origine). Idéal quand un exe moddé ou un launcher custom
crash avec les paramètres inattendus ajoutés par Steam.

Portage Rust (zéro dépendance) de
[`chdonncha/steam-wrapper-launcher`](https://github.com/chdonncha/steam-wrapper-launcher)
(.NET), dans l'esprit du steam-wrapper d'Aurora (Rust). Voir
[`docs/steam-wrapper-integration.md`](../../docs/steam-wrapper-integration.md)
pour l'utilisation avec ZAILON.

## Comportement

- Ignore tous les arguments de la ligne de commande (Steam ajoute souvent le
  chemin de l'exe d'origine ou d'autres paramètres documentés/non documentés).
- Lit le chemin du vrai launcher dans **`launch_path.txt`** (même dossier que
  l'exe).
- Démarre la cible **sans arguments**, dossier de travail = dossier de la cible.
- Aucune console (mode WinExe).
- Attend ~3 s après le lancement : Steam ne croit pas que le processus a crashé.
- Si `launch_path.txt` est absent, vide ou si la cible est introuvable : écrit
  **`wrapper_error.log`** à côté de l'exe.

## Build (Windows)

Prérequis : toolchain Rust stable (`rustup default stable`).

```bash
cd tools/steam-wrapper
cargo build --release
```

L'exécutable est produit dans :

```text
tools/steam-wrapper/target/release/steam-wrapper.exe
```

## Mise en place

1. Créez `launch_path.txt` à côté de `steam-wrapper.exe` :

   ```text
   C:\Jeux\NTE\NTEGlobalLauncher.exe
   ```

2. Deux façons de l'utiliser via Steam :

   - **Remplacer l'exe d'origine** : renommez `steam-wrapper.exe` avec le nom
     attendu par Steam (ex. `Dungeon Keeper.exe`) et placez-le dans le dossier
     du jeu.
   - **Options de lancement** (sans toucher aux fichiers du jeu) :

     ```text
     "C:\MesJeux\steam-wrapper.exe" %command%
     ```

   Avec `%command%`, Steam ajoute le chemin de l'exe d'origine comme argument ;
   le wrapper l'ignore.

## Notes

- Windows uniquement (le wrapper passe par `CreateProcess` du système).
- La cible doit exister au chemin indiqué dans `launch_path.txt`.
- Pour un jeu géré par ZAILON, pointez `launch_path.txt` vers l'exécutable du
  jeu configuré dans ZAILON — ou utilisez un raccourci bureau ZAILON
  (`zailon://launch/game/...`).
