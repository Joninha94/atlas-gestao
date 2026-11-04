# API HTTP e worker (mesma imagem; o comando muda). Build a partir da raiz do monorepo:
#   docker build -f docker/api.Dockerfile -t produtiva-api .
FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 make g++ postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @produtiva/api... --no-frozen-lockfile \
 && pnpm --filter @produtiva/core build \
 && pnpm --filter @produtiva/db build \
 && pnpm --filter @produtiva/api build \
 && pnpm deploy --filter @produtiva/api --prod /out

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
# Pasta de arquivos quando STORAGE_DRIVER=local (use um volume em /data)
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3333/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# migração: docker run ... produtiva-api node node_modules/@produtiva/db/scripts/migrate-offline.mjs deploy
#   (SQL de papéis e RLS em node_modules/@produtiva/db/prisma/{roles,rls}.sql)
# worker: docker run ... produtiva-api node dist/worker.js   (com SCHEDULER=on em UMA réplica)
CMD ["node", "dist/main.js"]
