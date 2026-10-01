FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_BACKEND_URL
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["bun", "./build/index.js"]
