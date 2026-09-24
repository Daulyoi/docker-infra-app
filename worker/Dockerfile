# ---- deps stage ----
FROM node:lts-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# ---- runtime stage ----
FROM node:lts-alpine AS runtime
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY worker.js ./

USER node
CMD ["npm", "run", "start"]
