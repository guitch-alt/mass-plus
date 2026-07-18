# Sécurité et confidentialité

## Données locales

Mass+ stocke dans IndexedDB le profil, le journal, les poids, les favoris, les aliments personnels, le cache Open Food Facts et les photos. Une copie de secours de l’état applicatif reste dans `localStorage` pour préserver les anciennes installations.

L’application ne demande ni compte, ni email, ni mot de passe, ni moyen de paiement.

## Réseau

Les fonctions locales restent utilisables hors ligne après le premier chargement.

- Open Food Facts est contacté uniquement après une recherche en ligne ou un scan demandé par l’utilisateur.
- Mass+ n’appelle aucune API d’IA, OpenAI, Gemini ou Supabase.
- Une photo n’est partagée qu’après l’action volontaire **Partager à mon IA**, via la feuille de partage native ou l’application/site choisi par l’utilisateur.
- Mass+ ne force l’ouverture d’aucune IA et ne promet pas qu’une application particulière sera disponible dans la feuille de partage.

## Import de réponse IA

La réponse collée est limitée en taille, extraite comme texte puis analysée avec `JSON.parse`. Le parseur accepte plusieurs formats réels, mais n’utilise jamais `eval`, `Function()` ou une exécution de script. Les noms et incertitudes sont échappés avant affichage. Les totaux fournis sont ignorés et recalculés depuis les lignes alimentaires.

Si le JSON n’est pas reconnu, Mass+ propose un fallback texte prudent ou une correction manuelle. Le texte saisi reste dans le champ tant que la modal est ouverte.

## Protection du dépôt public

- Les fichiers `.env` sont ignorés par Git.
- La V1 ne nécessite aucune clé API, aucun token et aucun secret.
- Une Content Security Policy limite les scripts, connexions et contenus externes.
- ZXing est servi depuis le dépôt et Open Food Facts reste la seule connexion applicative externe active.
- La Web Share API, le presse-papiers et la caméra ne sont utilisés qu’après une action utilisateur.
- Les images sont limitées en taille et compressées localement lorsque le navigateur le permet.

## Risques résiduels

Mass+ est une PWA publique : elle réduit les risques raisonnables côté frontend, mais ne peut pas garantir la sécurité du téléphone, du navigateur ni des applications tierces. Le contenu partagé quitte Mass+ selon les règles de confidentialité de l’application choisie. Les données locales peuvent être effacées par le navigateur ou par l’utilisateur ; l’export local reste recommandé avant une suppression de données ou un changement de téléphone.

## Sauvegarde et restauration

Les sauvegardes JSON sont versionnées et validées avant toute écriture. La restauration permet une fusion ou un remplacement dans une transaction IndexedDB unique. Avant un remplacement, une copie de sécurité est enregistrée localement ; l’opération est annulée si cette copie n’est pas possible. L’état précédent reste aussi en mémoire pour permettre un rollback en cas d’échec. Les fichiers image ne sont pas inclus dans le JSON afin d’éviter des sauvegardes trop volumineuses ; leurs métadonnées restent exportées.
