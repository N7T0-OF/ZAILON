# Détection des racines Cyberpunk et destinations FOMOD

Le Core ZAILON possède déjà un mapper par chemin de fichier. Les signatures reconnues incluent notamment `archive/pc/mod`, `r6/scripts`, `r6/tweaks`, `red4ext/plugins`, `bin/x64/plugins`, `mods`, `engine`, `tools` et d’autres racines de jeu existantes. La source (chemin dans l’archive) est examinée avant un repli par extension.

Le FOMOD apporte une destination explicite relative au jeu. L’analyseur la normalise, refuse `..`, chemins absolus, deux-points et composants de contrôle, puis la repasse au mapper existant et exige que le résultat ne change pas. Une destination comme `archive/pc/mod/file.archive` passe; un simple nom de fichier sans racine peut être rejeté comme ambigu au lieu d’être déplacé arbitrairement.

Pour `<file>`, `destination` est le répertoire cible et le nom de fichier source est conservé. Pour `<folder>`, les chemins sont relatifs au dossier source et leur structure est conservée sous la destination. Sans destination explicite, un dossier peut être mappé depuis ses chemins de contenu relatifs; un fichier est interprété à la racine du jeu, puis bloqué si cette cible ne correspond pas à une racine Cyberpunk reconnue. Le chemin de stockage ZIP avant le fichier/dossier source n’influence jamais la cible. Les sorties vont d’abord dans un staging temporaire; les données des options non sélectionnées ne sont pas mises dans le paquet de profil.

Les règles extension-seule, les `.xl` non enracinés, les layouts REDmod (`mods/<mod>/info.json`) et les répertoires CET sans chemin standard restent à valider avec fixtures dédiées avant toute inférence automatique plus large.
