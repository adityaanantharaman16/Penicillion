FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
WORKDIR /game
COPY package.json package-lock.json ./

FROM base AS local-oidc
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY local-idp/ local-idp/
COPY server/config.mjs server/config.mjs
COPY web/fonts/pixelify-sans.ttf web/fonts/pixelify-sans.ttf
USER node
CMD ["node","local-idp/server.mjs"]

FROM local-oidc AS local-play
ENV NODE_ENV=development
COPY server/ server/
COPY content/release.json content/schedule.mjs content/match.mjs content/validate.mjs content/
COPY scripts/local.mjs scripts/migrate.mjs scripts/seed.mjs scripts/
COPY web/ web/
CMD ["node","server/app.mjs"]

FROM base AS production
ARG RELEASE_REVISION
ENV RELEASE_REVISION=$RELEASE_REVISION
ENV NODE_ENV=production
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server/ server/
COPY content/release.json content/schedule.mjs content/match.mjs content/validate.mjs content/
COPY scripts/migrate.mjs scripts/seed.mjs scripts/publish.mjs scripts/grants.mjs scripts/
COPY ops/runtime-grants.sql ops/runtime-grants.sql
COPY web/ web/
USER node
EXPOSE 4321
CMD ["node","server/app.mjs"]

FROM nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311 AS ingress
COPY ops/nginx.conf /etc/nginx/nginx.conf
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx","-g","daemon off;"]
