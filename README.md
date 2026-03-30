# TrailPrep

Analyse de traces GPX pour le trail running — distribution des pentes, simulation d'allure et planification des ravitaillements.

## Fonctionnalités

- **Profil altimétrique** — visualisation colorée selon la pente, zoom par glissement
- **Distribution des pentes** — répartition kilométrique par tranche de pente (seuils configurables)
- **Course / Marche** — identification des sections courant/marche selon un seuil de pente ajustable
- **Simulateur VAP** — estimation du temps de course via le modèle énergétique de Minetti (grade-adjusted pace), par VAP cible ou durée cible
- **Ravitaillements** — placement interactif de points de ravitaillement sur le profil, estimation du temps par tronçon, tableau récapitulatif

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · SVG natif (pas de librairie de graphiques)

## Utilisation

```bash
bun install
bun dev
```

Charger un fichier `.gpx` pour commencer l'analyse.
