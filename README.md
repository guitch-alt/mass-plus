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
http://localhost:8080/?v=mobile-v2
```

Le paramètre `?v=mobile-v2` aide à contourner un ancien cache PWA pendant le développement.

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
- `data/aliments-fr.json`
- `data/recettes-fr.json`
- `data/astuces-fr.json`
- `foods.fr.json`, `recipes.fr.json`, `tips.fr.json` comme chemins compatibles historiques
- icônes PWA

Après un premier chargement, l’app peut fonctionner en mode avion. La recherche alimentaire V1 utilise la base locale et les produits sauvegardés sur l’appareil.

## Photo des plats

La photo est un mode assisté, pas une IA magique :

- photo avant repas ;
- photo après repas ;
- pourcentage mangé à corriger ;
- aliments ajoutés manuellement depuis la base locale ;
- favoris ajoutables ;
- calories recalculées selon le pourcentage mangé.

## Confidentialité

Les données restent sur l’appareil. Mass+ n’utilise ni Supabase, ni compte, ni authentification distante, ni clé API. La version actuelle ne dépend d’aucune API externe.

## Fichiers principaux

- `index.html` : shell de l’application
- `style.css` : design mobile-first
- `app.js` : logique IndexedDB, journal, onboarding, recherche locale, photo, favoris
- `data/aliments-fr.json` : base alimentaire locale de 156 entrées
- `data/recettes-fr.json` : 52 recettes hypercaloriques
- `data/astuces-fr.json` : 30 astuces du jour
- `foods.fr.json`, `recipes.fr.json`, `tips.fr.json` : copies compatibles historiques
- `manifest.json` : PWA
- `service-worker.js` : cache offline
- `SECURITY.md` : audit sécurité et limites
