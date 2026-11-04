# App do cliente na versão web (o mesmo código do Android/iOS), servido como site estático.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/mobile/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/mobile ./
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_OFFICE_CNPJ
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL EXPO_PUBLIC_OFFICE_CNPJ=$EXPO_PUBLIC_OFFICE_CNPJ CI=1
RUN npx expo export -p web

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
