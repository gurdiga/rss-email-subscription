FROM node:16.6-alpine3.14

VOLUME /data
WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

CMD ["node_modules/.bin/ts-node", "src/cron.ts"]
