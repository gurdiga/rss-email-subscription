ARG NODE_VERSION=18.16.0-alpine3.17

### --- build
FROM node:${NODE_VERSION} as build

RUN apk update
RUN apk add --no-cache \
  openssl=3.0.9-r3
RUN apk upgrade --no-cache

RUN npm i -g npm@latest

WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY .git/refs/heads/main ./dist/api/version.txt

RUN ./node_modules/.bin/tsc -p tsconfig.json
RUN ./node_modules/.bin/tsc -p src/web-ui/tsconfig.json

RUN ./node_modules/.bin/esbuild \
  --minify \
  --sourcemap \
  src/web-ui/subscription-form.ts \
  --outfile=dist/api/web-ui-scripts/web-ui/subscription-form.js

RUN cp --target-directory=dist/api/web-ui-scripts \
  ./node_modules/systemjs/dist/system.min.js*
RUN cat ./src/web-ui/systemjs-resolve-patch.js >> dist/api/web-ui-scripts/system.min.js

### --- run
FROM node:${NODE_VERSION}

VOLUME /data
WORKDIR /code

RUN apk update
RUN apk add --no-cache \
  openssl=3.0.9-r3
RUN apk upgrade --no-cache

RUN npm i -g npm@latest

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /code/dist ./dist
