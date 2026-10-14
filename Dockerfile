# Image unique pour les 4 services ; la variable APP choisit lequel démarrer.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "./packages/**" build \
 && pnpm --filter @me/api build \
 && pnpm --filter @me/worker build \
 && pnpm --filter @me/panel build \
 && pnpm --filter @me/driver build
RUN pnpm --filter @me/api deploy --legacy --prod /srv/api \
 && pnpm --filter @me/worker deploy --legacy --prod /srv/worker \
 && cp -r apps/panel/dist /srv/panel \
 && cp -r apps/driver/dist /srv/driver \
 && mkdir -p /srv/tools && cp tools/static-server.mjs /srv/tools/ \
 && cp docker/start.sh /srv/start.sh

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000 TZ=Europe/Paris
WORKDIR /srv
COPY --from=build /srv /srv
EXPOSE 3000
CMD ["/srv/start.sh"]
