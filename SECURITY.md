# Sécurité et confidentialité

## Données locales

Mass+ stocke les données dans IndexedDB sur l’appareil :

- profil local ;
- journal alimentaire ;
- poids ;
- eau ;
- produits sauvegardés ;
- collations personnalisées ;
- recettes favorites.

`localStorage` ne stocke qu’une préférence simple : le dernier écran ouvert.

## Pas de compte

Mass+ ne demande pas :

- email ;
- mot de passe ;
- inscription ;
- authentification distante ;
- compte Supabase.

## Réseau

L’application fonctionne sans réseau après le premier chargement. La seule fonctionnalité réseau optionnelle est Open Food Facts :

- déclenchée uniquement par un bouton utilisateur ;
- utilisée pour chercher un produit par nom ou code-barres ;
- jamais nécessaire au fonctionnement de base ;
- les produits utiles peuvent être sauvegardés localement pour usage hors ligne.

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
