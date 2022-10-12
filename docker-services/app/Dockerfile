### --- build
FROM node:16.17.1-alpine3.16 as build

RUN apk -U upgrade

WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY .git/refs/heads/main ./dist/api/api-version.txt

RUN ./node_modules/.bin/tsc -p tsconfig.json
RUN ./node_modules/.bin/tsc -p src/web-ui/tsconfig.json
RUN cp --target-directory=dist/api/web-ui-scripts \
  ./node_modules/systemjs/dist/system.min.js* \
  ./src/web-ui/systemjs-resolve-patch.js

### --- run
FROM node:16.17.1-alpine3.16

VOLUME /data
WORKDIR /code

RUN apk -U upgrade

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /code/dist ./dist
