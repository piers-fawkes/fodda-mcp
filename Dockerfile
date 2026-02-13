# Production Dockerfile for Fodda MCP
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Final image
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080

# Environment variables should be injected by Cloud Run
# FODDA_API_KEY is required

CMD ["node", "dist/index.js"]
