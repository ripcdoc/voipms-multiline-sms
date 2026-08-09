# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# DB_PATH is left at its config default (./data/sms-app.db), which resolves
# to /app/data/sms-app.db against this WORKDIR — mount a volume there so the
# sqlite file survives container restarts/rebuilds instead of living in the
# image layer.

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist ./public

VOLUME ["/app/data"]
EXPOSE 3001

CMD ["node", "dist/index.js"]
