# Recherche communautaire et feuille de route ZAILON

Mise à jour : 1er août 2026. Ce document transforme les tendances fournies autour de MO2, Vortex, Nexus Collections et Wabbajack en décisions propres à ZAILON. Il ne reproduit aucun commentaire intégral.

## Principes retenus

- Le déploiement, les profils, les sauvegardes et le diagnostic passent avant les effets visuels.
- Un paquet stocké est immuable. Un profil référence un `packageId`, un `versionId`, un éventuel `providerFileId` et un `contentHash` SHA-256.
- « Installé dans ZAILON » ne signifie jamais « chargé par le jeu ».
- Une heuristique est présentée comme possible ou probable, jamais comme une preuve.
- Les Collections créent un profil dédié ; les validations imposées par Nexus restent respectées.
- Les phases expérience, gestion avancée et extensibilité ne sont pas lancées en parallèle avec la phase critique.

## Sources de tendances

- [Comparaison Vortex/MO2 en 2025](https://www.reddit.com/r/skyrimmods/comments/1j9tklm/vortex_vs_mo2_in_2025/)
- [Dossiers et versions distincts entre profils](https://www.reddit.com/r/nexusmods/comments/1nj6txq/different_mod_download_folders_for_different/)
- [Perte de profils après mise à jour](https://www.reddit.com/r/nexusmods/comments/1b151pz/all_vortex_game_profiles_gone_after_a_vortex/)
- [Transparence des fichiers et conflits](https://www.reddit.com/r/skyrimmods/comments/f7g4sd/mod_manager_feature_comparison_mo2_vortex_kortex/)
- [Simplicité pour les débutants](https://www.reddit.com/r/skyrimmods/comments/1aq4lmz/would_you_guys_recommend_mo2_or_vortex_for_a/)
- [Téléchargement de Collections avec compte gratuit](https://www.reddit.com/r/nexusmods/comments/1fevdik/least_annoying_way_to_download_collections/)
- [Déploiement réversible et jeu propre](https://www.reddit.com/r/skyrimmods/comments/1e9d0rf/been_using_vortex_wants_to_try_mo2_is_it_really/)

## Tableau des 67 améliorations

Légende : **Livré** = implémenté et couvert par une vérification ; **Partiel** = socle utilisable mais critères incomplets ; **Planifié** = phase future ; **Différé** = volontairement hors de la phase active.

| # | Problème / utilisateur | Solution ZAILON | Priorité | Complexité · risque · dépendances | État et tests |
|---:|---|---|---|---|---|
| 1 | Trop simple ou trop technique · tous | Niveaux Simple/Avancé/Expert | Expérience | M · masquage d’erreurs · audit UI | Planifié |
| 2 | Premier démarrage confus · débutant | Assistant local, Nexus facultatif | Expérience | L · abandon de parcours · détection | Planifié |
| 3 | Statut « installé » ambigu · tous | États stockage/déploiement/runtime séparés | Critique | M · faux positif · adaptateurs | Partiel ; types et badges existants |
| 4 | Mod présent mais inactif · tous | Diagnostic ciblé avec preuves et confiance | Critique | M · diagnostic inventé · audit | **Livré 1.9.0** ; build TypeScript |
| 5 | Fichiers réellement vus inconnus · avancé | Vue ZAILON des gagnants/perdants | Critique | L · données volumineuses · carte virtuelle | **Livré 1.9.0** ; rendu limité à 500 lignes |
| 6 | Règles de conflit abstraites · débutant | Conséquence en langage naturel | Expérience | M · mauvais gagnant · priorités | **Livré 1.9.0** ; sélection explicite |
| 7 | Ordre opaque · régulier | Manuel + prévisualisation assistée | Expérience | L · réorganisation destructive · métadonnées | Planifié |
| 8 | Profil fonctionnel cassé · régulier | Profil stable verrouillé + snapshot au déverrouillage | Critique | M · faux sentiment de sécurité · transactions | Partiel 1.9.0 |
| 9 | Expérimentation risquée · expert | Branches copy-on-write | Expérience | XL · fusion · store immuable | Planifié |
| 10 | Différences de profils opaques · avancé | Comparaison à trois colonnes | Expérience | L · fusion incompatible · branches | Planifié |
| 11 | Mise à jour casse un autre profil · tous | Références version/hash immuables | Critique | L · migration · manifestes | **Livré 1.9.0** ; contrôle d’identité natif |
| 12 | Choix FOMOD perdus · avancé | Options d’installation persistantes | Gestion | L · reconstruction · moteur FOMOD | Partiel ; données présentes, UI future |
| 13 | Réinstallation duplique · tous | Rejouer avec snapshot et mêmes options | Gestion | L · doublon · #12 | Planifié |
| 14 | Collections mélangées · tous | Profil dédié et verrouillé par Collection | Critique | M · contamination · Nexus | Livré antérieurement |
| 15 | Collection incomplète invisible · régulier | Tableau de santé et réparation | Gestion | L · disponibilité distante · #14 | Partiel ; file et états disponibles |
| 16 | Profil non reproductible · expert | Export exact + score de reconstruction | Gestion | L · sources disparues · identités | Partiel ; export léger/complet existant |
| 17 | Profils lourds inutilisés · régulier | Archivage léger/hors ligne/complet | Gestion | XL · perte d’archive · snapshots | Planifié |
| 18 | Frameworks dispersés · Cyberpunk | Centre de dépendances | Expérience | L · versions de jeu · adaptateur | Partiel ; providers dans l’audit |
| 19 | Framework mis à jour silencieusement · régulier | Simulation + profil test | Gestion | XL · incompatibilité · branches | Planifié |
| 20 | Jeu mis à jour, profil inconnu · tous | Audit automatique post-version | Critique | L · détection version · adaptateur | Planifié |
| 21 | Dernier état fonctionnel perdu · régulier | Historique de compatibilité | Critique | L · volumétrie · snapshots | Planifié |
| 22 | Ouverture confondue avec succès · tous | Validation après durée et fermeture normale | Critique | M · faux succès · supervision processus | Planifié |
| 23 | Crash sans contexte · tous | Assistant comparatif non accusatoire | Critique | L · attribution erronée · #21 | Planifié |
| 24 | Recherche de fichier lente · expert | Index local persistant | Gestion | XL · index obsolète · base locale | Planifié |
| 25 | Mod entièrement remplacé · avancé | Détection prudente de redondance | Gestion | L · scripts non analysés · carte virtuelle | Planifié |
| 26 | Doublons renommés · tous | Hash complet + fusion des références | Critique | M · collision · SHA-256 | **Livré 1.9.0** ; test contenu identique/différent |
| 27 | Nouvelle version instable · régulier | Version préférée par profil | Gestion | M · confusion · #11 | Planifié |
| 28 | Compatibilité personnelle perdue · régulier | État et note locale exportable | Gestion | S · données personnelles · export | Partiel ; notes locales existantes |
| 29 | Catégories opaques · tous | Étiquette, source, confiance, verrouillage | Expérience | M · mauvaise classification · métadonnées | Livré antérieurement |
| 30 | Grande liste illisible · régulier | Groupes et séparateurs logiques | Expérience | M · ordre · profils | Partiel ; séparateurs MO2 importés |
| 31 | Filtres répétitifs · avancé | Vues enregistrées | Expérience | M · migration réglages · index | Planifié |
| 32 | Drag-and-drop aveugle · débutant | Analyse et plan avant import | Expérience | L · mauvais jeu · scanner | Partiel ; aperçu racine/sécurité existant |
| 33 | Téléchargements orphelins · tous | Boîte d’imports | Expérience | L · stockage · tâches | Planifié |
| 34 | Mauvaise racine silencieuse · tous | Détecteur et réparateur transactionnel | Critique | M · déplacement erroné · adaptateur | Livré pour Cyberpunk |
| 35 | Impossible de tester sans jouer · avancé | Construction/audit temporaire | Critique | L · pollution · backend | Partiel ; audit sans lancement disponible |
| 36 | Tester un seul mod · avancé | Profil temporaire isolé | Gestion | L · nettoyage · branches | Planifié |
| 37 | Inspection sans mutation · expert | Mode lecture seule | Expérience | M · mutation indirecte · permissions | Planifié |
| 38 | Deux gestionnaires concurrents · tous | Détection prudente et blocage | Critique | L · faux positif · OS | Planifié |
| 39 | Mise à jour ZAILON risquée · tous | Sauvegarde avant téléchargement | Critique | M · backup incomplet · updater | Livré antérieurement, renforcé 1.9.0 |
| 40 | Données manquantes après update · tous | Comparaison jeux/profils/mods | Critique | M · format ancien · #39 | **Livré 1.9.0** ; vérification native |
| 41 | Une seule sauvegarde · régulier | Générations quotidiennes/hebdo | Critique | L · espace disque · politique rétention | Planifié |
| 42 | Diagnostic partageable fuit des secrets · tous | Rapport anonymisé texte/archive | Expérience | L · secret exposé · redaction | Planifié |
| 43 | Erreur difficile à transmettre · débutant | Copier diagnostic sans secret | Expérience | M · chemins privés · #42 | Partiel ; diagnostic affiché |
| 44 | Aide externe trop longue · débutant | Aide contextuelle courte | Expérience | M · maintenance · écrans | Planifié |
| 45 | Action dangereuse peu claire · tous | Plan d’impact et confirmation | Critique | M · perte de données · snapshots | Partiel ; suppression détaillée existante |
| 46 | Notifications en rafale · tous | Regroupement et expiration | Expérience | M · erreur masquée · tâches | Partiel ; historique central existant |
| 47 | Images bloquent le lancement · tous | Priorités haute/normale/basse | Critique | L · famine de tâche · ordonnanceur | Planifié |
| 48 | ZAILON consomme pendant le jeu · joueur | Mode jeu automatique | Critique | M · pause incomplète · processus | Partiel ; raccourcis globaux suspendus |
| 49 | 1 000 mods saturent l’UI · expert | Virtualisation et limites ciblées | Critique | XL · régression UI · index | Partiel 1.9.0 ; vue fichiers plafonnée à 500 |
| 50 | Recherche locale appelle le réseau · tous | Recherche locale séparée | Expérience | L · index obsolète · #24 | Partiel ; recherche mémoire locale |
| 51 | Suggestions intrusives · tous | Conseils locaux discrets | Expérience | M · bruit · diagnostics | Planifié |
| 52 | Mise à jour sans résumé · régulier | Diff avant/après | Gestion | L · snapshots · transactions | Planifié |
| 53 | « Annuler » fictif · tous | Rollback seulement si snapshot existe | Critique | L · restauration partielle · transactions | Livré pour opérations groupées compatibles |
| 54 | Heuristique présentée comme certitude · tous | Confirmé/Probable/Possible/Inconnu | Critique | S · wording · diagnostic | **Livré 1.9.0** |
| 55 | Adaptateur lié au cœur · expert | Paquets d’adaptateur signés | Extensibilité | XL · exécution distante · signature | Différé |
| 56 | Adaptateur non testé · expert | Sandbox, tests et rollback | Extensibilité | XL · code non fiable · #55 | Différé |
| 57 | Jeu non supporté · avancé | Adaptateur générique limité | Extensibilité | L · promesse excessive · schéma | Partiel ; ajout manuel générique |
| 58 | Création d’adaptateur inaccessible · développeur | Assistant de génération de tests | Extensibilité | XL · paquet invalide · SDK | Différé |
| 59 | FiveM client/serveur mélangé · FiveM | Adaptateur client restrictif | Critique | L · règles serveur · scanner | Partiel avancé ; ressources serveur refusées |
| 60 | Cyberpunk composite · Cyberpunk | Racines, frameworks, MO2, runtime | Critique | XL · version du jeu · adaptateur | Partiel avancé ; phase actuelle renforcée |
| 61 | Dégradation silencieuse · régulier | Audit local périodique | Gestion | L · coût disque · planificateur | Planifié |
| 62 | Recherche non traçable · équipe | Ce document | Critique | S · obsolescence · rapports | **Livré 1.9.0** |
| 63 | Tout développer simultanément · équipe | Phases séquentielles | Critique | S · dérive · plan | **Appliqué** |
| 64 | Parcours non vérifiés · tous | Trois scénarios UX | Critique | M · absence de panel humain · build | Rapport créé ; validation humaine restante |
| 65 | Acceptation trop vague · équipe | Critères globaux suivis | Critique | M · faux « terminé » · tableau | En cours ; série non déclarée terminée |
| 66 | Blocages ignorés · équipe | Registre des limitations | Critique | S · communication · rapport | **Appliqué** |
| 67 | Rapport final superficiel · équipe | Rapport probant et limites | Critique | M · preuves · CI | Créé pour la phase critique |

## Décision de phase

La livraison 1.9.0 couvre le socle critique vérifiable : empreintes de contenu, références exactes, contrôle d’identité, carte des fichiers, diagnostic par mod, conflits explicites et audit post-mise à jour. Les branches, l’archivage, le moteur FOMOD, l’index plein texte et les adaptateurs téléchargeables restent hors de cette livraison.
