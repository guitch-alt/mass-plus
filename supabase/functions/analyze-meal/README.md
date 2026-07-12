# Supabase Edge Function `analyze-meal`

Cette fonction reçoit une image JPEG, PNG ou WebP compressée et encodée en data URL, appelle l’API OpenAI Responses côté serveur et renvoie un JSON nutritionnel strict. La clé ne quitte jamais Supabase.

## Configuration

Créer la clé sur https://platform.openai.com/api-keys, puis depuis la racine du dépôt :

```bash
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase secrets set OPENAI_API_KEY=...
supabase secrets set OPENAI_VISION_MODEL=gpt-5.4-mini
supabase secrets set MASS_PLUS_ALLOWED_ORIGINS=https://guitch-alt.github.io,http://localhost:8080
```

Le frontend GitHub Pages n’utilise pas de session Supabase. Déployer donc cette fonction sans vérification JWT, tout en conservant la restriction CORS configurée ci-dessus :

```bash
supabase functions deploy analyze-meal --no-verify-jwt
```

Configurer ensuite `mass-plus-analysis-endpoint` dans le navigateur comme indiqué dans le README principal. La fonction limite la requête à 4,5 Mo, applique un délai de 40 secondes, ne stocke pas l’image et ne renvoie jamais de détail OpenAI contenant une donnée sensible.

## Vérifications

- En local : `supabase functions serve analyze-meal --no-verify-jwt --env-file supabase/.env.local`.
- Ne jamais committer `supabase/.env.local`.
- Vérifier avant commit : `git grep -nE 'sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY=' -- ':!README.md' ':!.env.example'`.
- Sans `OPENAI_API_KEY`, la fonction retourne `missing_api_key` et aucun aliment simulé.
