# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
# Optional: pass an npmrc with a corporate CA or registry mirror via
#   docker build --secret id=npmrc,src=$HOME/.npmrc .
# Optional: pass a CA bundle via --secret id=ca_cert,src=/path/to/ca-bundle.pem
RUN --mount=type=secret,id=npmrc,required=false \
    --mount=type=secret,id=ca_cert,required=false \
    if [ -f /run/secrets/npmrc ]; then cp /run/secrets/npmrc /root/.npmrc; fi && \
    if [ -f /run/secrets/ca_cert ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/ca_cert; \
      export SSL_CERT_FILE=/run/secrets/ca_cert; \
      export npm_config_cafile=/run/secrets/ca_cert; \
    fi && \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/node_modules ./node_modules

RUN chmod +x /app/scripts/mock-harness.mjs \
    && mkdir -p /data \
    && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/dist/index.js"]
