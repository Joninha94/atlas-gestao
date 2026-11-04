# Robôs (Playwright + Chromium). Imagem oficial já traz o navegador e as dependências do sistema.
FROM mcr.microsoft.com/playwright:v1.48.0-noble
WORKDIR /app
COPY apps/rpa/package.json apps/rpa/tsconfig.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund
COPY apps/rpa/src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev
ENV NODE_ENV=production
USER pwuser
CMD ["node", "dist/worker.js"]
