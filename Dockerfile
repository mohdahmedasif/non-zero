FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3210 \
    DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 3210

CMD ["npm", "start"]
