# One image runs the game server and serves the built website.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (cached unless a package.json or the lockfile changes).
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev

# Build the website (apps/web/dist), which the server serves.
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]
