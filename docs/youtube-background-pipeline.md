# Pipeline YouTube → cache local (Accueil)

## Principe

Un lien YouTube ne devient **jamais** le lecteur du launcher.

```text
Lien YouTube
     ↓
Validation (parseYouTubeUrl — whitelist youtube.com / youtu.be / shorts)
     ↓
Identification de la vidéo (videoId, 11 caractères)
     ↓
Téléchargement (yt-dlp, natif) → media/backgrounds/video_<id>.mp4
     ↓
Cache local ZAILON (+ vignette jpg)
     ↓
Vérification du fichier (existe + taille > 0)
     ↓
Ajout aux fonds (type=video, localPath=<fichier>)
     ↓
Lecture LOCALE — hors-ligne, jamais re-téléchargée à chaque lancement
```

## Cache

```text
ZAILON_DATA/media/backgrounds/
├── video_<id>.mp4
├── thumbnail_<id>.jpg
└── (manifeste géré par backgroundMediaCache.ts — pur, testé)
```

- `backgroundMediaCache.ts` fournit le manifeste (déduplication par videoId,
  taille totale, éviction LRU, validation) sans accès disque.
- `localPath` est prioritaire sur la vidéo de ressources dans l'Accueil et la
  configuration (`resolveMediaType` / `resourceUrl(localPath)`).

## Statuts natifs (`resolve_youtube_video`)

| statut          | signification                                           |
|-----------------|---------------------------------------------------------|
| `cached`        | fichier MP4 local produit → lecture hors-ligne          |
| `ytdlp_missing` | yt-dlp absent → repli lecteur YouTube embarqué          |
| `failed`        | échec de téléchargement → erreur lisible, rien appliqué |

## Dépendance optionnelle

- **yt-dlp** (https://github.com/yt-dlp/yt-dlp) : requis pour la lecture locale
  hors-ligne. Non bundlé — s'il est absent, ZAILON bascule honnêtement sur le
  lecteur embarqué (aucun bris de fonctionnalité).
- Aucune clé API : seul l'identifiant de la vidéo est utilisé.

## Étape suivante (non livrée ici)

Gestion complète du cache dans l'UI : suppression d'un fond, remplacement,
« télécharger à nouveau », « vérifier le fichier », taille occupée — appuyée sur
le manifeste `backgroundMediaCache.ts` déjà testé.
