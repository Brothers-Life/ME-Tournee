# ME Tournée

App de tournées de livraison de Maison Esclaire : un **panel admin** pour le bureau et une **app chauffeur** (web installable, puis APK Android).

## Contenu du dépôt

| Dossier | Rôle |
|---|---|
| `apps/api` | API Fastify : connexion, rôles et permissions, imports, tournées, livraisons, heures, GPS, audit, temps réel |
| `apps/worker` | Tâches de fond (BullMQ) : lecture des PDF de BL, purge GPS |
| `apps/panel` | Panel admin (React + shadcn/ui) |
| `apps/driver` | App chauffeur (Expo + React Native Reusables) : web (PWA) et Android |
| `packages/shared` | Types, permissions, arrondi des heures, partagés partout |
| `packages/db` | Schéma PostgreSQL (Drizzle), migrations, données de départ |
| `packages/bl-parser` | Lecture des BL du PDF quotidien |
| `packages/core` | Logique métier : import, tri par secteur, pointage |
| `tools/static-server.mjs` | Serveur des sites statiques (panel et app web) |

## Développement local

Prérequis : Node 22, pnpm 10, PostgreSQL 16 et Redis (ou `docker compose up -d`).

```bash
pnpm install
pnpm --filter "./packages/**" build
pnpm db:migrate
ADMIN_EMAIL=admin@exemple.fr ADMIN_PASSWORD=motdepasse123 ADMIN_PIN=0000 SEED_DEMO=1 pnpm db:seed
pnpm dev:api      # http://localhost:3000
pnpm dev:worker
pnpm dev:panel    # http://localhost:5173
pnpm dev:driver   # Expo (touche w pour le web)
```

Avec `SEED_DEMO=1`, le dépôt de démo `SOFRILOG` est créé avec 3 secteurs, 3 camions et les chauffeurs `CH01` à `CH03` (PIN `1234`).

Tests : `pnpm --filter @me/shared test` (arrondi des heures) et `pnpm --filter @me/bl-parser test` (lecture du PDF réel).

## Déploiement (Webgune)

Une seule image Docker (`Dockerfile` à la racine) pour les 4 services ; la variable `APP` choisit le service.

| Service | `APP` | Variables |
|---|---|---|
| api | `api` | `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS` (URL du panel et de l'app, séparées par des virgules), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PIN` (premier démarrage) |
| worker | `worker` | `DATABASE_URL`, `REDIS_URL` |
| panel | `panel` | `PUBLIC_API_URL` |
| driver | `driver` | `PUBLIC_API_URL` |

Plus la base `postgres` et le `redis` managés de Webgune. Au démarrage, l'API applique les migrations et crée les rôles par défaut.

Les photos et les PDF sont stockés dans PostgreSQL : ils sont donc compris dans les sauvegardes de la base.
