# Capacités des backends visuels

## Matrice

| Backend | Plateforme | Application réelle | Aperçu | HDR | Multi-écran | Restauration |
|---|---|---:|---:|---:|---:|---:|
| `windows-gamma-ramp` | Windows SDR | expérimentale | oui | non | ciblage demandé, indépendance pilote non garantie | oui |
| `preview-only` | toutes | non | oui | aperçu uniquement | non | sans objet |
| Gestion ICC Windows | Windows | lecture seulement | non | information | lecture par écran | ouverture de Color Management |
| HDR Windows | Windows 11 | outil officiel Windows | non | oui | géré par Windows | géré par Windows |
| DDC/CI | Windows | non activé | non | dépend du moniteur | potentiel | à implémenter avec consentement |
| NVIDIA/AMD/Intel | variable | non implémenté | non | inconnu | inconnu | non |

## Windows Gamma Ramp

APIs utilisées :

- `EnumDisplayMonitors` et `GetMonitorInfoW` pour les écrans ;
- `CreateDCW` / `DeleteDC` pour le contexte d’affichage ;
- `GetDeviceGammaRamp` pour sauvegarder et vérifier ;
- `SetDeviceGammaRamp` pour appliquer et restaurer ;
- `QueryDisplayConfig` et `DisplayConfigGetDeviceInfo` pour l’état Advanced Color/HDR ;
- `GetICMProfileW` pour le profil ICC actif.

Règles :

- application interdite en HDR actif ou inconnu ;
- valeurs bornées et LUT monotone ;
- rampe relue après application ;
- état original conservé avant la première modification ;
- changement extrême soumis à confirmation pendant 15 secondes ;
- restauration au jeu, à la fermeture et au redémarrage après crash ;
- aucune promesse de luminosité physique.

Microsoft déconseille `SetDeviceGammaRamp` pour la calibration générale et documente un comportement dépendant du pilote. L’interface l’indique comme expérimental.

## Réglages

| Réglage | Gamma Ramp | Aperçu |
|---|---:|---:|
| Luminosité logique | oui | oui |
| Contraste | oui | oui |
| Gamma | oui | oui |
| Température | approximation RGB globale | oui |
| Rouge / vert / bleu | oui | oui |
| Saturation | non | oui |
| Vibrance | non | oui |
| Ombres | non | oui |
| Hautes lumières | non | oui |
| Netteté | non | aperçu déclaré seulement |

Un réglage non supporté reste visible pour concevoir/exporter un profil, avec le badge « aperçu ». Il n’est jamais présenté comme appliqué à l’écran réel.
