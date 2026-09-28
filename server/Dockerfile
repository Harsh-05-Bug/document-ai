FROM node:20-slim

WORKDIR /app

# Installed before the app code so a code change doesn't reinstall
# every dependency. package-lock.json is copied too so the build uses
# the exact versions that were tested.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]