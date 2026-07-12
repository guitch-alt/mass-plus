# Mass+

Mass+ est une PWA mobile-first pour suivre simplement une prise de poids progressive : repas, calories, protéines, poids, favoris, recettes, astuces et photos de repas.

URL publique :
https://guitch-alt.github.io/mass-plus/

## État actuel

Version test fonctionnelle iPhone et Android via GitHub Pages.

- Installation iPhone : ouvrir l’URL dans Safari, puis Partager > Ajouter à l’écran d’accueil.
- Installation Android : ouvrir l’URL dans Chrome, puis Installer l’application ou Ajouter à l’écran d’accueil.
- Données locales par défaut : pas de compte obligatoire.
- Les photos sont stockées dans IndexedDB.
- Analyse photo optionnelle via une fonction backend sécurisée ; sans configuration, l’app indique clairement que l’analyse IA n’est pas configurée.
- Le journal, le profil, les favoris et les aliments personnalisés sont stockés localement.

## Fonctionnalités

- Profil avec calcul automatique calories/protéines.
- Suivi du poids.
- Journal alimentaire par repas.
- Recherche locale hors ligne.
- Recherche Open Food Facts déclenchée manuellement.
- Aliments personnalisés réutilisables.
- Favoris contenant plusieurs aliments.
- Recettes hypercaloriques filtrées selon intolérances et préférences.
- Astuces simples.
- Photo de repas avec parcours d’analyse assistée : vraie analyse via backend sécurisé quand il est configuré, sinon saisie manuelle.

## Confidentialité

Mass+ ne collecte pas les données utilisateur. Les données restent sur l’appareil. Open Food Facts est appelé uniquement lorsque l’utilisateur lance explicitement une recherche produit. L’analyse photo ne doit jamais appeler une API IA directement depuis le navigateur : configurez la fonction Supabase Edge avec une clé secrète côté backend uniquement.

## Limites

Les objectifs nutritionnels sont indicatifs et ne remplacent pas l’avis d’un médecin ou d’un diététicien.

## Prochaines améliorations prévues

- Courbe de poids plus lisible.
- Export des données.
- Meilleure édition des favoris.
- Plus de recettes adaptées.
- Tests mobiles réels réguliers iPhone Safari et Android Chrome.


## Analyse photo IA optionnelle

Le frontend reste statique. Sans configuration, l’écran photo indique que l’analyse IA n’est pas configurée et ne présente aucun résultat fictif.

Pour activer une vraie analyse :

1. Déployer `supabase/functions/analyze-meal` dans votre projet Supabase.
2. Ajouter le secret backend `OPENAI_API_KEY` dans Supabase Edge Functions.
3. Optionnel : définir `OPENAI_VISION_MODEL` côté Supabase.
4. Dans le navigateur de l’app, configurer l’URL publique de la fonction :

```js
localStorage.setItem("mass-plus-analysis-endpoint", "https://VOTRE-PROJET.supabase.co/functions/v1/analyze-meal");
localStorage.setItem("mass-plus-analysis-mode", "live");
```

La photo est envoyée uniquement au moment où l’utilisateur lance l’analyse. La fonction ne stocke pas l’image.

Origines autorisées côté fonction : définissez `MASS_PLUS_ALLOWED_ORIGINS` avec les URLs séparées par des virgules, par exemple `https://guitch-alt.github.io,http://localhost:8080`.

Sans `OPENAI_API_KEY`, la fonction retourne `missing_api_key` et ne produit aucun aliment simulé.
