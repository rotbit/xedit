# ---- Install dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build stage needs no real secrets; placeholders suffice (the orchestrator injects them at runtime)
ENV AUTH_SECRET=build-placeholder
# NEXT_PUBLIC_* are inlined into the build output, so injecting them at runtime does nothing; hence a build arg.
# Self-hosters pass their own domain (no trailing slash); empty falls back to the default in src/lib/site.ts.
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npx prisma generate && npm run build

# ---- Run ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# prisma CLI runs migrate deploy on startup
RUN npm i -g prisma@6 --no-audit --no-fund

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Prisma engines and client (standalone tracing occasionally misses them, so copy explicitly)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY docker-entrypoint.sh ./

EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
