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
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
