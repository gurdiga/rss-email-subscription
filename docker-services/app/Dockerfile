FROM node:16.17.1-alpine3.16

RUN apk -U upgrade

VOLUME /data
WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN ./node_modules/.bin/tsc -p src/web-ui/tsconfig.json
RUN cp --target-directory=src/api/web-ui-scripts \
  ./node_modules/systemjs/dist/system.min.js* \
  ./src/web-ui/systemjs-resolve-patch.js
