#!/bin/sh
# Point d'entrée unique : APP choisit le service (api, worker, panel, driver).
set -e
case "$APP" in
  api)
    node /srv/api/node_modules/@me/db/dist/migrate.js
    node /srv/api/node_modules/@me/db/dist/seed.js
    exec node /srv/api/dist/server.js
    ;;
  worker)
    exec node /srv/worker/dist/index.js
    ;;
  panel)
    exec node /srv/tools/static-server.mjs /srv/panel
    ;;
  driver)
    exec node /srv/tools/static-server.mjs /srv/driver
    ;;
  *)
    echo "Variable APP manquante ou inconnue : api, worker, panel ou driver" >&2
    exit 1
    ;;
esac
