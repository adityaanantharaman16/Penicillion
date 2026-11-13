FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base
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

FROM nginx:1.31.8-alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11 AS ingress
COPY ops/nginx.conf /etc/nginx/nginx.conf
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx","-g","daemon off;"]
