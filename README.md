# Mass+

Mass+ est une PWA mobile-first pour organiser une prise de poids rapide et saine, sans compte en ligne.

## Principes

- Aucun email.
- Aucune inscription.
- Aucun serveur obligatoire.
- Données stockées localement dans IndexedDB.
- `localStorage` sert seulement à mémoriser des préférences simples comme le dernier écran ouvert.
- Fonctionne hors ligne après le premier chargement.
- Compatible GitHub Pages.

## Lancer en local

```bash
cd /Users/certideal/Documents/GitHub/mass-plus
python3 -m http.server 8080
```

Puis ouvrir :

```text
http://localhost:8080/?v=mass3
```

Le paramètre `?v=mass3` aide à contourner un ancien cache PWA pendant le développement.

## Installer sur Android

1. Ouvrir l’URL GitHub Pages dans Chrome.
2. Menu Chrome.
3. Choisir **Installer l’application** ou **Ajouter à l’écran d’accueil**.

## Installer sur iPhone

1. Ouvrir l’URL GitHub Pages dans Safari.
2. Bouton **Partager**.
3. **Sur l’écran d’accueil**.
4. **Ajouter**.

## Fonctionnement hors ligne

Le service worker met en cache :

- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- `foods.fr.json`
- `recipes.fr.json`
- `tips.fr.json`
- icônes PWA

Après un premier chargement, l’app peut fonctionner en mode avion. Open Food Facts reste optionnel : si le réseau est absent, la recherche utilise uniquement la base locale et les produits sauvegardés.

## Photo des plats

La photo est un mode assisté, pas une IA magique :

- photo avant repas ;
- photo après repas ;
- pourcentage mangé à corriger ;
- aliments ajoutés manuellement depuis la base locale ;
- mention d’estimation approximative.

## Confidentialité

Les données restent sur l’appareil. Mass+ n’utilise ni Supabase, ni compte, ni authentification distante, ni clé API. Une requête Open Food Facts n’est envoyée que si l’utilisateur clique volontairement sur le bouton de recherche Open Food Facts.

## Fichiers principaux

- `index.html` : shell de l’application
- `style.css` : design mobile-first
- `app.js` : logique IndexedDB, journal, onboarding, OFF optionnel
- `foods.fr.json` : base alimentaire locale
- `recipes.fr.json` : recettes hypercaloriques
- `tips.fr.json` : astuces du jour
- `manifest.json` : PWA
- `service-worker.js` : cache offline
- `SECURITY.md` : audit sécurité et limites
