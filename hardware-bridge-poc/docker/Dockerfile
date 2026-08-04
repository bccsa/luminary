# Builds the Hardware Bridge Electron app into a Linux binary and hosts it for
# download over HTTP. Cross-platform note: electron-builder can only produce
# macOS/Windows targets on those OSes — for a mac/windows build run
# `npm run dist` on that OS (or use a CI matrix). This container produces the
# Linux tar.gz and serves it so anyone can pull the artifact.
FROM node:20-bookworm-slim AS builder

# electron-builder needs these for the linux target.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY electron-service/package.json ./
RUN npm install
COPY electron-service/ ./
RUN npx electron-builder --linux tar.gz

# Serve the built artifact for download.
FROM python:3-alpine
COPY --from=builder /app/dist /dist
WORKDIR /dist
EXPOSE 8080
CMD ["python3", "-m", "http.server", "8080"]