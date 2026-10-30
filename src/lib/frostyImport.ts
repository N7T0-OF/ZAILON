/**
 * Import d'une installation Frosty — logique pure (spec « Finalisation des
 * add-ons » §36).
 *
 * Frosty Mod Manager stocke ses mods dans un dossier de mods (fichiers `.fbmod`)
 * géré par l'utilisateur. ZAILON ne re-déploie RIEN et ne pilote PAS Frosty :
 * il détecte ce dossier, liste les `.fbmod` présents et crée un profil de
 * RÉFÉRENCES (jamais de copie, jamais de lien recréé). Les mods restent gérés
 * dans Frosty Mod Manager.
 */

/**
 * Nom de profil ZAILON proposé pour une installation Frosty, déduit du dossier
 * de mods détecté. Dédupliqué face aux profils existants.
 */
export function frostyProfileName(modsDir: string, existing: string[]): string {
  const label = /[\\/]/.test(modsDir)
    ? (modsDir.split(/[\\/]/).filter(Boolean).pop() || 'Frosty')
    : modsDir
  const name = `Frosty — ${label || 'Frosty'}`
  const lower = new Set(existing.map(profile => profile.toLocaleLowerCase()))
  if (!lower.has(name.toLocaleLowerCase())) return name
  let suffix = 2
  while (lower.has(`${name} (${suffix})`.toLocaleLowerCase())) suffix += 1
  return `${name} (${suffix})`
}
