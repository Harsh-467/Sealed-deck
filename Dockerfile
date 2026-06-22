# Single image for the Sealed Deck monorepo (server + frontend share workspace deps).
# Multi-arch base — builds natively on Apple Silicon (arm64) and x86_64.
FROM node:20-bookworm-slim

# Build toolchain so optional native add-ons (e.g. ws's bufferutil/utf-8-validate)
# can compile via node-gyp. Without these, npm install fails on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install workspace deps first (better layer caching).
COPY package.json package-lock.json* ./
COPY packages/mental-poker/package.json packages/mental-poker/package.json
COPY packages/contracts-abi/package.json packages/contracts-abi/package.json
COPY server/package.json server/package.json
COPY frontend/package.json frontend/package.json
RUN npm install

# Copy the rest of the source (relay + frontend run from TS via tsx/vite).
COPY . .

# 8787 = relay (HTTP + WS), 5173 = frontend dev server.
EXPOSE 8787 5173

# Default command is overridden per-service in docker-compose.yml.
CMD ["node", "-e", "console.log('Set a command via docker-compose (server | web).')"]
