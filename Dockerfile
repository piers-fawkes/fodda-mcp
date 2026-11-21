# Production Dockerfile for Fodda MCP
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Final image
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8080

# Environment variables should be injected by Cloud Run
# FODDA_API_KEY is required

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
