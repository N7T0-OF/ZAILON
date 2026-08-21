# Politique Visual Profiles pour Rust

## But

Rust est traité comme un cas strict. La page du jeu porte le nom « Visuels système », jamais « mod graphique Rust ».

## Autorisé par ZAILON

- lecture du profil ICC actif ;
- Gamma Ramp système en SDR lorsque Windows et le pilote le confirment ;
- ouverture de l’étalonnage HDR Windows ;
- profil appliqué avant le lancement depuis ZAILON ;
- attente standard de la fin du processus enfant ;
- restauration de l’affichage après l’arrêt.

## Interdit dans le module

- ReShade ou proxy DLL ;
- copie dans le dossier Rust ;
- injection ;
- overlay DirectX/Vulkan/OpenGL ;
- hook Present ou swap chain ;
- capture de profondeur ;
- lecture/écriture mémoire ;
- ouverture ou interaction avec EAC ;
- pilote noyau ;
- analyse de pixels, silhouettes ou scènes ;
- vision nocturne adaptative, contours, zoom ou réticule ;
- automatisation cachée de commandes du jeu.

## Détection en lecture seule

Le diagnostic recherche uniquement à la racine fournie :

- `dxgi.dll`
- `d3d11.dll`
- `ReShade.ini`
- `ReShadePreset.ini`
- `reshade-shaders`

S’ils sont présents, ZAILON affiche les composants et un lien vers les instructions Facepunch. Il ne supprime rien automatiquement et ne déduit pas qu’une DLL générique est forcément ReShade.

## Message utilisateur

> Rust interdit les outils d’injection graphique comme ReShade. Visual Profiles n’utilise jamais cette méthode. La décision finale sur les outils autorisés appartient toutefois à l’éditeur et peut évoluer.

Source : [Facepunch Studios — Failed to initialize: ReShade](https://support.facepunchstudios.com/hc/en-us/articles/24444483513373-Failed-to-initialize-Reshade).
