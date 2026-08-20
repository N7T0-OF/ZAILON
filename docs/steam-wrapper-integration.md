# Steam Wrapper — intégration ZAILON

## Problème

Steam n'apprécie pas toujours les exécutables moddés ou de remplacement :

- le launcher crash ou se comporte mal lancé via Steam ;
- `%command%` dans les Options de lancement injecte des arguments que l'exe
  custom ne sait pas traiter ;
- l'exe d'origine a été remplacé mais Steam référence toujours l'ancien.

## Solution retenue

Un **wrapper Steam-safe** (binaire Windows autonome, sans console) agit en
intermédiaire silencieux :

1. il ignore tous les arguments injectés par Steam ;
2. il lit le chemin réel dans `launch_path.txt` (même dossier que l'exe) ;
3. il lance la cible sans arguments ;
4. il attend brièvement pour que Steam ne détecte pas un crash.

Sources :
- portage Rust intégré à ZAILON : `tools/steam-wrapper/` (zéro dépendance) ;
- projet d'origine (référence .NET) : `chdonncha/steam-wrapper-launcher` ;
- la même idée existe côté Aurora (`crates/steam-wrapper`), spécialisée NTE.

## Utilisation avec un jeu ZAILON

### Option A — Options de lancement Steam (recommandée, aucun fichier modifié)

1. Compilez le wrapper (`tools/steam-wrapper/README.md`) ou utilisez l'exe
   fourni par votre build.
2. Créez `launch_path.txt` à côté de `steam-wrapper.exe` avec le chemin de
   l'exécutable configuré dans ZAILON (ou d'un raccourci `zailon://launch/...`) :
   ```text
   C:\Jeux\NTE\NTEGlobalLauncher.exe
   ```
3. Dans Steam, Options de lancement du jeu :
   ```text
   "C:\Outils\steam-wrapper.exe" %command%
   ```

### Option B — Remplacer l'exe d'origine

Renommez `steam-wrapper.exe` avec le nom attendu par Steam (ex.
`Dungeon Keeper.exe`) et placez-le dans le dossier du jeu ; `launch_path.txt`
doit rester à côté.

## Pourquoi c'est utile pour ZAILON

- Un jeu lancé par ZAILON peut être aussi lancé depuis Steam (bibliothèque
  Steam, temps de jeu Steam) sans casser le lancement moddé.
- Pour NTE (Neverness to Everness), le launcher (`NTEGlobalLauncher.exe`…)
  peut exiger des arguments de distribution (Epic) que Steam ne fournit pas —
  le wrapper ignore ce que Steam ajoute et laisse le launcher faire son travail.
- Le wrapper ne remplace JAMAIS la chaîne ZAILON : il sert uniquement
  d'adaptateur Steam → exécutable.

## Cas d'échec

Si `launch_path.txt` manque, est vide, ou si la cible n'existe pas, le wrapper
écrit `wrapper_error.log` à côté de lui — diagnostiquez en ouvrant ce fichier.
