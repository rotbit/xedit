# ---- 依赖安装 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- 构建 ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 构建阶段不需要真实密钥，占位即可（运行时由编排平台注入）
ENV AUTH_SECRET=build-placeholder
# NEXT_PUBLIC_* 在构建期就被内联进产物，运行时再注入无效，故走 build arg。
# 自建部署传入自己的域名（不带结尾斜杠），留空则回落到 src/lib/site.ts 里的默认值。
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npx prisma generate && npm run build

# ---- 运行 ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# prisma CLI 用于启动时执行 migrate deploy
RUN npm i -g prisma@6 --no-audit --no-fund

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Prisma 引擎与客户端（standalone 追踪偶有遗漏，显式补齐）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY docker-entrypoint.sh ./

EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
