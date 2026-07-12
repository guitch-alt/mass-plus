# Mass+ V1 Stable

Mass+ est une PWA mobile-first gratuite pour suivre les repas, calories, protéines et l’évolution du poids. Elle fonctionne sur GitHub Pages, sans compte et sans backend obligatoire.

Application publique : https://guitch-alt.github.io/mass-plus/

## Fonctionnement

- Journal, profil, poids, favoris, aliments personnels et photos stockés localement dans IndexedDB.
- Banque alimentaire locale disponible hors ligne.
- Open Food Facts utilisé uniquement après une recherche en ligne ou un scan demandé par l’utilisateur.
- Scanner compatible iPhone et Android grâce à ZXing, avec caméra arrière et saisie manuelle de secours.
- PWA installable, cache hors ligne et interface adaptée aux safe areas iPhone.

## Photos et IA

Mass+ n’appelle aucune API d’intelligence artificielle et ne nécessite aucune clé API.

Le parcours est volontaire et contrôlé par l’utilisateur :

1. enregistrer une photo localement ;
2. toucher **Partager à mon IA** ;
3. choisir ChatGPT, Gemini ou une autre application dans la feuille de partage du téléphone ;
4. copier la réponse JSON ;
5. revenir dans Mass+ et toucher **Coller la réponse IA** ;
6. vérifier et corriger chaque valeur avant l’ajout au journal.

Le prompt est copié dans le presse-papiers lorsque le navigateur l’autorise. La photo n’est transmise qu’à l’application explicitement choisie dans la feuille de partage native. Si le partage de fichiers n’est pas disponible, Mass+ affiche le prompt pour une copie manuelle.

L’importeur accepte le JSON brut, les blocs Markdown `json` et un court texte autour du JSON. Le contenu est traité comme du texte avec `JSON.parse` : aucun code n’est exécuté. Les totaux sont toujours recalculés depuis les aliments.

## Développement

```bash
npm start
npm run check
```

Ouvrir ensuite `http://localhost:8080`.

Le projet est volontairement statique et sans framework. Les dépendances exécutées dans le navigateur sont conservées localement dans `vendor/` pour que les fonctions essentielles restent gratuites et disponibles hors ligne.

## Confidentialité

Consultez [SECURITY.md](./SECURITY.md). Ne commitez jamais de fichier `.env`, de token ou de clé. La V1 ne nécessite aucun secret.
