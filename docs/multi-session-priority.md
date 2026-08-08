# X de session + multi-apps actives + priorité d'activité

> Spec : « Bouton X de session + multi-apps actives + priorité d'activité ».
> Livré dans la **1.23.0**.

## Ce qui est implémenté

### 1. Plusieurs sessions actives simultanément

Le store gère déjà `gameSessions[]` (plusieurs jeux/apps en cours). Ce lot
ajoute la notion de **session prioritaire** parmi elles.

### 2. Session prioritaire (`src/lib/sessionPriority.ts`, pur + 6 tests)

`pickPrioritySession(sessions, pinnedGameId)` :

1. la session **épinglée** si elle est encore active (priorité manuelle) ;
2. sinon la session **GameRunning la plus récente** ;
3. sinon la session active la plus récente ;
4. sinon aucune.

`arbitrateInputProfiles(sessions, priorityGameId)` : **un seul mapping clavier
actif à la fois** — seule la session prioritaire en GameRunning garde son entrée
(`inputProfileActive`), toutes les autres sont désactivées (pas de superposition
QWERTY/mapping).

### 3. Bouton X sur chaque session

- **Header** (TitleBar) : indicateur **« N en cours »** — au clic, mini-liste
  des sessions actives : nom, état (Recherche / En cours), durée, étoile
  prioritaire (pin/unpin), X.
- **Accueil** : X sur les blocs de session (En cours → confirmation de sortie ;
  Recherche → arrêt de recherche ; Jeu non démarré → ferme la session).

### 4. Confirmation obligatoire (`SessionStopModal`)

- **Jeu réellement actif** : « X est en cours. Voulez-vous vraiment quitter le
  jeu ? Toute progression non sauvegardée peut être perdue. » [Annuler]
  [Quitter le jeu] — pas de fermeture brutale au premier clic.
- **Encore en recherche** : « X est en cours de lancement. Voulez-vous arrêter
  la recherche et annuler cette session ZAILON ? Le launcher externe peut rester
  ouvert. » [Annuler] [Arrêter] → `cancelSession` (ne touche JAMAIS Steam / le
  launcher officiel : il restaure le déploiement et termine le suivi).

### 5. Quick Panel cible la session prioritaire

`Ctrl+Alt+Z` actionne le clavier de la session prioritaire (plus « la première
session trouvée »).

## Ce qui reste (dépend de la machine réelle / du backend fenêtres)

- **Priorité automatique par premier plan** : aujourd'hui automatique = la plus
  récente ; le passage automatique à la fenêtre au premier plan utilisera le
  watcher de fenêtres natif (champ `foreground` déjà scanné).
- **Visual Profiles multi-apps** : un seul profil au premier plan (règle déjà
  respectée côté session — à confirmer sur machine).
- **Rich Presence Discord** : utilise la session lancée (native) — le recalcul
  vers la session prioritaire à la fermeture est documenté, pas encore câblé.
- **Indicateur dans la barre de statut** : le header porte l'indicateur
  « N en cours » (spec) ; la barre de statut peut l'afficher aussi en option.

## Tests

`test-session-priority.ts` (6 tests) : aucune session, Running la plus récente,
épinglée vs automatique, arbitrage un-seul-mapping, recherche vs jeu détecté,
exclusion des états terminaux.
