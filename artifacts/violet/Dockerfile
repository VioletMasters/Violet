# ── Stage 1: build ───────────────────────────────────────────────────────────
# Use Debian (glibc) for the build stage so @rollup/rollup-linux-x64-gnu works.
# The pnpm workspace overrides exclude the musl variant, so Alpine would fail.
FROM node:22-slim AS builder

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/violet/ ./artifacts/violet/

# Install deps, skip lifecycle scripts, then rebuild esbuild (required by Vite)
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm rebuild esbuild

# Build the frontend — PORT and BASE_PATH are required by vite.config.ts
RUN PORT=3000 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/violet run build

# ── Stage 2: nginx ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Non-root: nginx listens on port 8080 instead of 80
# (docker-compose maps host 80 → container 8080)
COPY docker/nginx.conf /etc/nginx/conf.d/violet.conf

# Copy built static assets
COPY --from=builder /build/artifacts/violet/dist/public /usr/share/nginx/html

# Run nginx as the built-in non-root nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
