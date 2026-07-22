# Analyse de la référence Liquid Glass

Le dossier examiné est `G:\2_Logiciel\CLAUDE CODE\exemple managers\Liquid_Glass_UI_For_Window-Window`. Il contient notamment DWMBlurGlass 2.3.1, `DWMBlurGlass.exe`, `DWMBlurGlassExt.dll`, `dbghelp.dll`, `symsrv.dll`, des symboles et des ressources. Son fonctionnement documenté modifie DWM, peut demander des privilèges administrateur et télécharge des symboles. Le dossier indique une licence LGPLv3, mais il s’agit ici d’une distribution binaire de référence, pas d’une dépendance appropriée pour ZAILON.

Décision : aucun binaire n’est copié, chargé, injecté, installé ou requis. ZAILON ne modifie ni DWM ni le système.

L’abstraction `WindowEffectsBackend` est implémentée par `SimulatedCss`. Elle expose un diagnostic explicite (`nativeAvailable: false`), conserve séparément la préférence et l’état actif, respecte `prefers-reduced-motion`, réduit l’effet hors focus et le suspend avec l’économiseur ZAILON. Comme la fenêtre Tauri actuelle n’est pas transparente, l’effet agit sur les surfaces internes de l’application et ne prétend pas flouter le bureau Windows.

Les préréglages Désactivé, Léger, Normal, Intense et Personnalisé contrôlent opacité, flou, saturation, teinte, bordure, reflet, ombre et animations. Le préréglage par défaut reste Désactivé.
