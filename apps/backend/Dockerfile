# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: Build  
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun install --frozen-lockfile

# Stage 3: Production
FROM oven/bun:1-slim AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json /app/tsconfig.json ./
COPY --from=build /app/src/shared/db/migrations ./src/shared/db/migrations

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/ready').then(r => r.ok ? process.exit(0) : process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
