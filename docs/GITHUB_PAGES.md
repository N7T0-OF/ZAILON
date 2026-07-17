# Déploiement GitHub Pages

Le workflow `deploy.yml` publie automatiquement l'application à chaque push sur
la branche `main`. Il peut aussi être lancé manuellement depuis l'onglet
**Actions** de GitHub.

Lors du premier déploiement, ouvrez **Settings > Pages** dans le dépôt GitHub et
choisissez **GitHub Actions** comme source de publication. L'application sera
ensuite disponible à l'adresse :

`https://<proprietaire>.github.io/<depot>/`

Le chemin du dépôt est injecté pendant le build, de sorte que les fichiers
générés se chargent correctement pour un site Pages de projet.
