# ---- deps stage ----
FROM node:lts-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# ---- runtime stage ----
FROM node:lts-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
