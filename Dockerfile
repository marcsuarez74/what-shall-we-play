# syntax=docker/dockerfile:1

# ---- deps : dépendances isolées (cache) ----
FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 : compilation native si aucun binaire précompilé pour musl
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# ---- build : compilation Next.js (sortie standalone) ----
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- run : image finale minimaliste ----
FROM node:22-alpine AS run
WORKDIR /app
# tzdata : sans elle /usr/share/zoneinfo est absent et TZ=Europe/Paris retombe sur UTC
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    TZ=Europe/Paris
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# v4.7.4 (audit, point 9) : l'app ne tourne plus en root. Le volume data/ monté depuis
# l'hôte est rendu à l'utilisateur node par le déploiement (voir ci.yml).
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
# Sonde : serveur joignable et base lisible (wget de busybox, présent dans alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/sante >/dev/null || exit 1
CMD ["node", "server.js"]
