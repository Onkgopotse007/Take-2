# Game server: one bundled file on Node. Built for linux/arm64 (the VM).
FROM node:22-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter "@take2/server..."
COPY packages/engine packages/engine
COPY apps/server apps/server
RUN pnpm --filter @take2/server build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=2567
COPY --from=build /repo/apps/server/dist/server.mjs ./server.mjs
USER node
EXPOSE 2567
CMD ["node", "server.mjs"]
