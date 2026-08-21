# Lancement asynchrone et récupération transactionnelle

Depuis ZAILON 1.7.3, la préparation `TemporaryCopy` ne s’exécute plus sur le thread
qui sert l’interface Tauri. La construction de la carte virtuelle, le hachage, les
sauvegardes, les copies et leur vérification utilisent une tâche bloquante dédiée.
L’interface reçoit une progression typée et reste utilisable pendant tout le travail.

Chaque session contient :

- `session.json`, écrit atomiquement avec les états `preparing`, `prepared`,
  `active`, `cleaning`, `recovery-required` ou `recovered` ;
- `journal.jsonl`, synchronisé sur disque avant chaque remplacement ;
- `backup/`, qui contient l’original de chaque fichier remplacé ;
- `resolved-files.json`, produit uniquement après la préparation complète.

Au prochain lancement, une session interrompue est restaurée avant tout nouveau
déploiement. Un fichier qui existait est recopié depuis `backup/`. Un fichier créé
par ZAILON n’est retiré que si sa signature correspond encore à celle inscrite dans
le journal. Une session `active` dont le processus existe toujours bloque un nouveau
lancement au lieu de modifier les fichiers utilisés par le jeu.

Si le nettoyage normal rencontre une erreur, ZAILON garde le dossier de session et
ses sauvegardes, puis le marque `recovery-required`. Les tests natifs couvrent la
restauration des originaux, le retrait sûr des fichiers ajoutés et la conservation
des sauvegardes lorsque la restauration ne peut pas aboutir.
