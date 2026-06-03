FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
  ffmpeg poppler-utils libreoffice p7zip-full \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 8787
CMD ["node", "dist/server.js"]
