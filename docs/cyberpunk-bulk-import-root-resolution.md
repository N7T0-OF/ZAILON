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

## Limites / prochaines étapes (spec §33, §47)

- **Paquets déjà importés avec une racine incorrecte** : le re-staging
  automatique des anciens imports (bouton « Réparer cet import » dans
  Profils > Maintenance, avec snapshot) fera l'objet de la prochaine release.
- Graphe de dépendances global (spec §29-30) et capabilities frameworks
  (`cyberpunk.tweakxl`…) dans le manifeste (spec §28).
- Validators RED4ext/redscript hiérarchiques (spec §36-43) : cause primaire
  affichée en premier.
