# Sécurité et confidentialité

## Données locales

Mass+ stocke les données dans IndexedDB sur l’appareil :

- profil local ;
- journal alimentaire ;
- poids ;
- eau ;
- produits sauvegardés ;
- collations personnalisées ;
- recettes favorites ;
- photos avant/après associées aux repas.

`localStorage` ne stocke qu’une préférence simple : le dernier écran ouvert.

## Pas de compte

Mass+ ne demande pas :

- email ;
- mot de passe ;
- inscription ;
- authentification distante ;
- compte Supabase.

## Réseau

L’application fonctionne sans réseau après le premier chargement. La V1 mobile ne dépend d’aucune API externe pour la recherche alimentaire, les favoris, les photos ou le journal.

Une recherche en ligne de type Open Food Facts peut être ajoutée plus tard comme option secondaire, mais elle ne doit pas devenir obligatoire pour utiliser Mass+.

## Photo

Les photos de repas sont utilisées localement dans le navigateur pour aider l’utilisateur à composer le repas. Aucune photo n’est envoyée à un serveur par Mass+.

## XSS et entrées utilisateur

Les données saisies par l’utilisateur sont échappées avant affichage. Les champs libres servent au suivi personnel et ne doivent pas contenir de données médicales sensibles inutiles.

## Suppression et export

L’app contient :

- un bouton **Exporter mes données** ;
- un bouton **Supprimer toutes mes données**.

## Limites

Mass+ fournit des estimations nutritionnelles. L’application ne remplace pas un avis médical ou diététique. En cas de maigreur importante, symptômes persistants, perte de poids involontaire ou troubles digestifs, un suivi professionnel est recommandé.
