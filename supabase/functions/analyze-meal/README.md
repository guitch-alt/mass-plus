# Supabase Edge Function `analyze-meal`

Cette fonction reçoit une image encodée en data URL, appelle le fournisseur IA côté serveur et renvoie un JSON strict de reconnaissance visuelle. Elle ne calcule pas les calories : Mass+ associe ensuite les aliments reconnus à sa banque locale.

Secrets à configurer dans Supabase, jamais dans le frontend ni dans Git :

```bash
supabase secrets set OPENAI_API_KEY=...
supabase secrets set OPENAI_VISION_MODEL=gpt-5.6
supabase secrets set MASS_PLUS_ALLOWED_ORIGINS=https://guitch-alt.github.io,http://localhost:8080
```

Déploiement :

```bash
supabase functions deploy analyze-meal
```

Sans `OPENAI_API_KEY`, la fonction retourne `missing_api_key` et ne produit aucun aliment simulé. Elle ne stocke pas l’image reçue.
