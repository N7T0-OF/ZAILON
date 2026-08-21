# Import Cyberpunk — résolution de racines par fichier

Statut : **implémenté et validé** (release 1.41.0)

## Cause du « TweakXL requis » / « ArchiveXL requis »

L'import Cyberpunk construisait **une destination globale unique** par paquet
(`cyberpunk_relative_destination` : premier match de signature gagnant). Or un
framework fournit souvent **plusieurs racines** :

```
TweakXL/
  r6/tweaks/…          → doit être exposé sous  r6/tweaks/…
  red4ext/plugins/…    → doit être exposé sous  red4ext/plugins/…
```

Avec une seule destination, le contenu restant était empilé sous la première
racine (ou sous `mods/`) → le validator `validateCyberpunkFrameworkDeps`
cherchait `red4ext/plugins/TweakXL` dans le déploiement, ne le trouvait pas, et
affichait « TweakXL est requis » alors que les fichiers existaient.

## Nouveau : `cyberpunk_map_file` (spec §23-27)

Pour chaque fichier relatif à la racine du paquet, la destination jeu est
calculée individuellement :

- **racine connue en tête** (`archive`, `r6`, `red4ext`, `bin`, `mods`,
  `tools`, `engine`, `plugins`, `config`) → chemin tel quel ;
- **`plugins` en tête** → `red4ext/plugins/…` (mods RED4ext ; `bin/x64/plugins`
  reste sous `bin/…` car `bin` matche en premier) ;
- **conteneurs inutiles en tête** (« TweakXL », « ArchiveXL », « Cyberpunk
  2077 », « SomeFolder »…) → suppression jusqu'à la première racine connue —
  le **nom du dossier n'est jamais une partie du chemin jeu** (spec §27) ;
- **aucune racine** → `None` : l'appelant décide (extension `.archive` →
  `archive/pc/mod`, `.reds` → `r6/scripts`, sinon fallback `mods/<nom>`).

Exemples (tests natifs) :

```
TweakXL/r6/tweaks/x.yaml                  → r6/tweaks/x.yaml
TweakXL/red4ext/plugins/init.lua          → red4ext/plugins/init.lua
ArchiveXL/red4ext/plugins/ArchiveXL/x.xl  → red4ext/plugins/ArchiveXL/x.xl
SomeFolder/red4ext/plugins/ArchiveXL/x.xl → red4ext/plugins/ArchiveXL/x.xl
core_01/plugins/TweakXL/init.lua          → red4ext/plugins/TweakXL/init.lua
Cyberpunk 2077/r6/scripts/x.reds          → r6/scripts/x.reds
README.txt                                → None
```

## Intégration dans le staging

La branche « structure ambiguë » de `stage_content` copie désormais
**fichier par fichier** (`CyberpunkMappedByFile`) : chaque fichier rejoint sa
destination calculée (conteneurs supprimés), avec la copie sécurisée
(`copy_sensitive_aware_file` + validation des chemins) et l'annulation propre.

## Validation

- `cargo fmt` ✅ (syntaxe) ; **Verify native** (Windows + Linux) compile et
  exécute les 4 nouveaux tests natifs (`cyberpunk_map_file_*`).
- Aucun changement frontend : le validator existant fonctionne sur les fichiers
  projetés — avec le mapping corrigé, TweakXL/ArchiveXL sont projetés à la
  bonne racine.

## Réparer les imports existants (spec §33, §47) — livré

Commande native `repair_staged_imports` + bouton **« Réparer les racines des
imports »** dans l'onglet Mods :

1. Pour chaque paquet staged disposant d'un `sourcePath` enregistré :
   backup du contenu actuel (`content.repair-backup-<timestamp>`),
   **re-staging depuis la source** avec la résolution par fichier
   (`stage_content` → `CyberpunkMappedByFile` pour les multi-racines),
   reconstruction du manifeste (`package_manifest_entries`).
2. En cas d'échec à mi-chemin : **rollback** — le contenu d'origine est
   restauré, jamais perdu.
3. Rapport par paquet : fichiers avant/après, layout retenu, chemin de backup,
   erreur éventuelle (source absente → inviter à réimporter ; manifeste
   illisible → paquet staged corrompu).
4. Le store est rafraîchi (`scanMods`) après la réparation.

Validation : `tsc` ✅, build ✅, 78/78 tests, **Verify native ✅ + Verify
ZAILON ✅** (la commande réutilise `stage_content`/`package_manifest_entries`
déjà couverts par les tests natifs).

## Capabilities frameworks + graphe de dépendances (spec §28-31) — livré

**Frontend** (`src/lib/frameworkValidator.ts`) : chaque capacité
(`cyberpunk.red4ext`, `cyberpunk.redscript`, `cyberpunk.tweakxl`,
`cyberpunk.archivexl`, `cyberpunk.codeware`, `cyberpunk.cet`) est fournie par
un paquet actif via **dossier canonique OU signature de fichier** — le nom du
dossier ne fait jamais foi (spec §31) :

- `red4ext/plugins/TweakXL/…` ou `tweakxl.dll`/`tweak_xl.dll` → `cyberpunk.tweakxl` ;
- `red4ext/plugins/ArchiveXL/…` ou `archivexl.dll` → `cyberpunk.archivexl` ;
- `red4ext/plugins/Codeware/…` ou `codeware.dll` → `cyberpunk.codeware` ;
- cores exacts pour RED4ext / redscript / CET.

Le validateur pré-lancement agrège les capacités sur **tous les mods actifs**
(graphe global, spec §29-30) avant de résoudre les besoins
(`r6/tweaks/` → TweakXL, `.xl` → ArchiveXL, plugins → RED4ext, `r6/scripts/` →
redscript). **Correctif du faux « TweakXL requis »** : l'ancien contrôle
comparait le chemin de dossier `red4ext/plugins/TweakXL` par égalité exacte de
fichier — toujours faux même quand TweakXL était stagé correctement.

**Rust** (`framework_providers_from_entries`) : TweakXL, ArchiveXL et Codeware
sont désormais détectés (dossier canonique OU signature) et apparaissent dans
l'audit, le manifeste et le « Comparer avec la racine attendue » — les 6
frameworks y figurent.

## Limites / prochaines étapes

- Validators RED4ext/redscript hiérarchiques (spec §36-43) : cause primaire
  affichée en premier (RED4ext avant TweakXL/ArchiveXL).
