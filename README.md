# Mass+ V1.2.1

Mass+ est une PWA mobile-first gratuite pour suivre les repas, calories, protéines et l’évolution du poids. Elle fonctionne sur GitHub Pages, sans compte et sans backend obligatoire.

Application publique : https://guitch-alt.github.io/mass-plus/

## Fonctionnement

- Journal, profil, poids, favoris, aliments personnels et photos stockés localement dans IndexedDB.
- Banque alimentaire locale enrichie disponible hors ligne, avec valeurs nutritionnelles génériques moyennes.
- Repas enregistrés regroupés dans **Recettes > Mes favorites**, avec portions, modification et ajout direct au journal.
- Sauvegarde JSON versionnée et restauration validée avec transaction locale et rollback.
- Journal fiabilisé avec dates locales, journées non suivies, calories restantes et écritures IndexedDB sérialisées.
- Ajout central simplifié : dictée express prioritaire, photo ou saisie manuelle, avec scanner et repas enregistrés en options secondaires.
- Open Food Facts utilisé uniquement après une recherche en ligne ou un scan demandé par l’utilisateur.
- Scanner compatible iPhone et Android grâce à ZXing, avec caméra arrière et saisie manuelle de secours.
- PWA installable, cache hors ligne et interface adaptée aux safe areas iPhone.
- Aucune carte bancaire, clé API ou API IA payante.

## Banque alimentaire locale

La base locale contient des aliments français courants : légumes, fruits, condiments, boissons, protéines, féculents, légumineuses, produits sucrés et collations. Les valeurs sont des estimations génériques pour 100 g ou 100 ml, pas des valeurs exactes de produits de marque.

La Banque n’affiche jamais tout le catalogue au chargement : elle montre seulement les aliments favoris et récemment utilisés, puis jusqu’à 20 résultats après une recherche. La recherche locale ignore accents, majuscules, apostrophes, singulier/pluriel, accepte les recherches partielles et quelques fautes simples. Exemples : `oeufs`, `tomates`, `concom`, `balsamique`, `haricot rouge`.

Lors d’un import IA, Mass+ réutilise un aliment local correspondant sans écraser la quantité ni les valeurs estimées pour le repas. Un aliment inconnu reste temporaire tant que l’utilisateur ne choisit pas explicitement de l’ajouter à sa banque personnelle.

## Dictée express

Depuis l’action centrale **Ajouter**, **Dicter mon repas** démarre la reconnaissance vocale native en français lorsqu’elle est disponible. La transcription apparaît en direct et reste modifiable avant le partage.

Mass+ n’enregistre pas la dictée et n’appelle aucune API payante. La reconnaissance dépend du service vocal fourni par le navigateur. Si ce service est absent ou si l’accès au microphone est refusé, le même écran propose immédiatement le champ **Décris ton repas**.

Le bouton **Analyser avec mon IA** ouvre la feuille de partage avec un prompt texte prêt à envoyer. Mass+ ne peut pas ouvrir automatiquement une application IA connectée, envoyer le message ou récupérer sa réponse : l’utilisatrice choisit son application, envoie le prompt, puis revient coller le JSON dans Mass+.

## Photos et IA

Mass+ n’appelle aucune API d’intelligence artificielle et ne nécessite aucune clé API.

Le parcours est volontaire et contrôlé par l’utilisateur :

1. enregistrer une photo localement ;
2. toucher **Partager à mon IA** ;
3. choisir entre partager la photo, copier le prompt, ouvrir ChatGPT, ouvrir Gemini ou coller une réponse ;
4. joindre volontairement la photo dans l’application IA choisie ;
5. coller le prompt ;
6. copier la réponse ;
7. revenir dans Mass+ et toucher **Coller la réponse IA** ;
8. vérifier et corriger chaque valeur avant l’ajout au journal.

Le prompt est optimisé pour obtenir un bloc `json` facile à copier. La photo n’est transmise qu’à l’application explicitement choisie. iOS peut ne pas proposer ChatGPT ou Gemini dans la feuille de partage : ce n’est pas un bug de Mass+, il faut alors ouvrir l’app ou le site manuellement.

L’importeur accepte le JSON brut, les blocs Markdown `json`, du texte avant/après le JSON, des clés françaises/anglaises, des nombres avec virgule décimale et un fallback texte prudent. Le contenu est traité comme du texte avec `JSON.parse` : aucun code n’est exécuté. Les totaux sont toujours recalculés depuis les aliments.

## Limites connues

- Les photos et réponses IA restent des estimations à vérifier.
- Les valeurs de la base locale sont génériques.
- Le partage vers une IA dépend d’iOS/Android et des applications installées.
- Les données locales peuvent être supprimées par le navigateur ; utilisez l’export JSON avant un changement de téléphone.

## Développement

```bash
npm start
npm run check
```

Ouvrir ensuite `http://localhost:8080`.

Le projet est volontairement statique et sans framework. Les dépendances exécutées dans le navigateur sont conservées localement dans `vendor/` pour que les fonctions essentielles restent gratuites et disponibles hors ligne.

## Confidentialité

Consultez [SECURITY.md](./SECURITY.md). Ne commitez jamais de fichier `.env`, de token ou de clé. La V1 ne nécessite aucun secret.
