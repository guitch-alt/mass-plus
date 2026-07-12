# Sécurité et confidentialité

## Données locales

Mass+ stocke dans IndexedDB le profil, le journal, les poids, les favoris, les aliments personnels, le cache Open Food Facts et les photos. Une copie de secours de l’état applicatif reste dans `localStorage` pour préserver les anciennes installations.

L’application ne demande ni compte, ni email, ni mot de passe, ni moyen de paiement.

## Réseau

Les fonctions locales restent utilisables hors ligne après le premier chargement.

- Open Food Facts est contacté uniquement après une recherche en ligne ou un scan demandé par l’utilisateur.
- Mass+ n’appelle aucune API d’IA.
- Une photo n’est partagée qu’après l’action **Partager à mon IA**, via la feuille de partage native et vers l’application choisie par l’utilisateur.

## Import de réponse IA

La réponse collée est limitée en taille, extraite comme texte puis analysée avec `JSON.parse`. Mass+ n’utilise ni `eval`, ni exécution de script, ni interprétation HTML du contenu importé. Les noms et incertitudes sont échappés avant affichage. Les totaux fournis sont ignorés et recalculés depuis les lignes alimentaires.

## Protection du dépôt public

- Les fichiers `.env` sont ignorés par Git.
- La V1 ne nécessite aucune clé API, aucun token et aucun secret.
- Une Content Security Policy limite les scripts, connexions et contenus externes.
- ZXing est servi depuis le dépôt et Open Food Facts reste la seule connexion applicative externe active.

## Risques résiduels

La sécurité dépend aussi du navigateur, du téléphone et de l’application choisie lors du partage. Le contenu partagé quitte alors Mass+ selon les règles de confidentialité de cette application. Les données locales peuvent être effacées par le navigateur ou par l’utilisateur ; l’export local reste recommandé avant une suppression de données ou un changement de téléphone.
