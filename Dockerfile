# Optional container image (~60 MB on top of node:alpine).
#   docker build -t trellis .
#   docker run -d --name trellis -p 3001:3001 -v trellis-data:/data \
#     -e ADMIN_PASSWORD='choose-a-password' trellis
# (Remove ADMIN_PASSWORD after the first start; it is hashed into /data.)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:client

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/data
COPY package.json package-lock.json* ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund
COPY server ./server
COPY presets ./presets
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3001
USER node
CMD ["node", "server/src/index.js"]
