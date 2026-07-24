# --- deps ---
FROM node:22-slim AS deps
WORKDIR /app
# better-sqlite3 is native — needs build tooling to compile.
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install

# --- build ---
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Chromium for lib/scrape.ts (onboarding's site-scraping step). Adds ~300-400MB to the image —
# acceptable for a single-container self-host; correctness (rendering JS-heavy sites) over size.
RUN npx playwright install --with-deps chromium

# --- run ---
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Chromium's shared-library dependencies (fonts, libnss, etc.) — the browser binary itself is
# copied below, but this stage is a fresh node:22-slim and needs its OS deps installed too.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/scripts ./scripts
# The Chromium binary installed above — not part of node_modules, must be copied separately.
COPY --from=build /root/.cache/ms-playwright /root/.cache/ms-playwright
# data/ (the SQLite file) is a mounted volume — see docker-compose.yml

# Baked in at build time by .publish/docker-build.sh; read at runtime by lib/update-check.ts
# to show "update available" against Docker Hub tags. "dev" (the default) never triggers it.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000
CMD ["npm", "start"]
