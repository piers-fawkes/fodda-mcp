FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY index.ts ./
RUN npx tsc
ENV PORT=8081
EXPOSE 8081
CMD ["node", "dist/index.js"]
