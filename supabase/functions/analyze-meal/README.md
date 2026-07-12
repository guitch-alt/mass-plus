# Supabase Edge Function `analyze-meal`

Cette fonction reçoit une image encodée en data URL, appelle le fournisseur IA côté serveur et renvoie un JSON strict pour le parcours de confirmation Mass+.

Secrets à configurer dans Supabase, jamais dans le frontend ni dans Git :

```bash
supabase secrets set OPENAI_API_KEY=...
supabase secrets set OPENAI_VISION_MODEL=gpt-5.6
```

Déploiement :

```bash
supabase functions deploy analyze-meal
```

Sans `OPENAI_API_KEY`, la fonction retourne une réponse de démonstration marquée `demo: true`. Elle ne stocke pas l’image reçue.

Origines autorisées côté fonction : définissez `MASS_PLUS_ALLOWED_ORIGINS` avec les URLs séparées par des virgules, par exemple `https://guitch-alt.github.io,http://localhost:8080`.
