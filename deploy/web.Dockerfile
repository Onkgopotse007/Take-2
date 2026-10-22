# Web front: Caddy serves the client and forwards /api (HTTP and WebSockets) to the game server.
FROM node:22-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter "@take2/client..."
COPY packages/engine packages/engine
COPY apps/server apps/server
COPY apps/client apps/client
RUN pnpm --filter @take2/client build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/client/dist /srv
