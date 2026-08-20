# Politique de confiance des add-ons (spec §17-24)

## Problème corrigé

Un add-on officiel avec SHA-256 RÉEL mais sans signature cryptographique était
**refusé à l'installation**. La chaîne de signature (clés, signature automatique
du catalogue) n'étant pas encore déployée, cela bloquait tous les packages
pourtant valides.

## Nouvelle politique v1

### Add-on officiel — installable si

1. origine = repository officiel ZAILON (HTTPS) ;
2. manifeste valide ;
3. SHA-256 du catalogue **correspond au fichier téléchargé** (obligatoire) ;
4. ID, version, permissions, plateformes, dépendances valides.

La **signature cryptographique est recommandée mais PAS obligatoire** pour
l'instant.

### Niveaux de confiance

```ts
AddonTrustLevel {
  OfficialVerifiedHash,   // officiel + SHA-256 → installable
  OfficialSigned,         // officiel + signature (futur)
  CommunitySigned,        // import local + signature facultative
  CommunityUnsigned,      // import local, signature absente acceptée
}
```

### Refus d'installation — motifs valides uniquement

- hash SHA-256 incorrect ;
- manifeste invalide ;
- package corrompu / path traversal ;
- incompatibilité (version ZAILON, plateforme) ;
- permission interdite ;
- dépendance critique invalide.

**L'absence de signature n'est jamais un motif de refus à elle seule.**

## Diagnostic

`Intégrité : SHA-256 ✓` · `Signature : Non utilisée` — pas d'avertissement
principal pour un package officiel vérifié par hash.

## Évolution

Quand la chaîne de signature sera réellement déployée, bascule progressive via
`catalogSchema.requiresSignature = true` — sans casser les packages existants.

## Implémentation

- `addonSignaturePolicy(entry)` (`src/lib/addonsInstall.ts`) : `required` ne
  dépend plus de la seule présence de `signaturePublicKey` ;
- carte Add-ons : « Intégrité vérifiée (SHA-256) » affichée pour les packages
  officiels installés sans signature ;
- `test-addon-signature.ts` : le cas « officiel SHA réel sans signature »
  est maintenant `required: false` + `ok: true`.
