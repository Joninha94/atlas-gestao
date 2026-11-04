# Painel web do escritório (Next.js standalone). O painel não depende dos pacotes internos,
# então é construído isolado (npm) — o server.js fica na raiz do standalone.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/web/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/web ./
ARG NEXT_PUBLIC_API_URL=http://localhost:3333
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN npx next build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
