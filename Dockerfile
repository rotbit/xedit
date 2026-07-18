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
# 构建阶段不需要真实密钥，占位即可（运行时由 Dokploy 注入）
ENV AUTH_SECRET=build-placeholder
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
