# --- build frontend ---
FROM node:20-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# --- build backend (native module needs build tools) ---
FROM node:20-bookworm-slim AS server-build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build
COPY --from=web-build /app/server/public ./public

# --- runtime ---
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/public ./public
COPY --from=server-build /app/server/node_modules ./node_modules
COPY server/package.json ./package.json

VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/index.js"]
