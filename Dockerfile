# syntax=docker/dockerfile:1.7
# SplitScreen.Me site image. Built locally (never on the server), moved with docker save / docker load.
# docs/ARCHITECTURE.md section 9.2.

FROM node:24.21.0-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24.21.0-alpine3.24 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_ENV_VALIDATION=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && node scripts/build-scripts.mjs \
 && rm -rf .next/standalone/node_modules/sharp .next/standalone/node_modules/@img \
 && node scripts/check-no-native.mjs .next/standalone dist

FROM node:24.21.0-alpine3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=1001:33 /app/.next/standalone ./
COPY --from=build --chown=1001:33 /app/.next/static ./.next/static
COPY --from=build --chown=1001:33 /app/public ./public
COPY --from=build --chown=1001:33 /app/drizzle ./drizzle
COPY --from=build --chown=1001:33 /app/dist ./dist
# uid 1001, gid 33 (www-data on the host): with umask 027 nginx can read the packages the app writes.
USER 1001:33
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/api/v3/health || exit 1
CMD ["sh", "-c", "umask 027 && node dist/migrate.mjs && exec node server.js"]
