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

Le frontend reste statique sur GitHub Pages. La clé OpenAI est lue uniquement par la fonction Supabase et ne doit jamais être ajoutée au JavaScript, au HTML, à `.env.example` ou à `localStorage`. Sans configuration, l’écran photo conserve la photo et ne présente aucun résultat fictif.

Pour activer une vraie analyse :

1. Créer une clé depuis le [tableau de bord OpenAI](https://platform.openai.com/api-keys).
2. Installer la CLI Supabase puis lier le dépôt : `supabase login` et `supabase link --project-ref VOTRE_PROJECT_REF`.
3. Ajouter les secrets serveur :

```bash
supabase secrets set OPENAI_API_KEY=VOTRE_CLE OPENAI_VISION_MODEL=gpt-5.4-mini MASS_PLUS_ALLOWED_ORIGINS=https://guitch-alt.github.io,http://localhost:8080
```

4. Déployer la fonction publique appelée par GitHub Pages : `supabase functions deploy analyze-meal --no-verify-jwt`.
5. Configurer dans le navigateur uniquement l’URL non secrète :

```js
localStorage.setItem("mass-plus-analysis-endpoint", "https://VOTRE_PROJECT_REF.supabase.co/functions/v1/analyze-meal");
localStorage.setItem("mass-plus-analysis-mode", "live");
```

Pour tester localement : lancer `npm start`, ouvrir `http://localhost:8080/#photo`, configurer l’URL ci-dessus dans la console du navigateur puis analyser une photo. Sur localhost, un volet diagnostic affiche la fonction appelée, le statut HTTP, la durée et l’erreur sans donnée sensible. La photo compressée est envoyée uniquement lors de l’analyse et n’est pas stockée par la fonction.

Avant tout commit, vérifier l’absence de secret avec `git grep -nE 'sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY=' -- ':!README.md' ':!.env.example'`. Sans `OPENAI_API_KEY`, la fonction retourne `missing_api_key` et ne produit aucun aliment simulé.
