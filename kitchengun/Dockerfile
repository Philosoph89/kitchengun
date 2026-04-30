ARG BUILD_FROM=ghcr.io/home-assistant/base:3.22

FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend
COPY app/frontend/package*.json ./
RUN npm ci
COPY app/frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-deps
WORKDIR /build/backend
RUN apk add --no-cache python3 make g++
COPY app/backend/package*.json ./
RUN npm ci --omit=dev

FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm sqlite-libs \
  && mkdir -p /app/backend /app/frontend/dist /data

WORKDIR /app/backend
COPY --from=backend-deps /build/backend/node_modules ./node_modules
COPY app/backend/ ./
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist
COPY run.sh /run.sh

RUN chmod a+x /run.sh

ENV NODE_ENV=production \
    APP_VERSION=1.2.0 \
    PORT=8099 \
    STATIC_DIR=/app/frontend/dist \
    DB_PATH=/data/kitchengun.sqlite \
    INGRESS_ONLY=true

EXPOSE 8099
CMD ["/run.sh"]
