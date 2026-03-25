FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY src ./src
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p /data/uploads /data/output /data/downloads /data/watch && \
    chown -R node:node /data
VOLUME ["/data"]
EXPOSE 4000
USER node
CMD ["node", "dist/index.js"]
