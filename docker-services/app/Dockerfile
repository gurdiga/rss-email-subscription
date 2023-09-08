ARG NODE_VERSION=18.17.1-alpine3.17

# See the appropriate version here: https://nodejs.org/en/download/releases
ARG NPM_VERSION=9.6.7

### --- build
FROM node:${NODE_VERSION} as build
ARG NPM_VERSION

RUN apk update && apk upgrade --no-cache
RUN npm i -g "npm@${NPM_VERSION}"

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
ARG NPM_VERSION

VOLUME /data
WORKDIR /code

RUN apk update && apk upgrade --no-cache
RUN npm i -g "npm@${NPM_VERSION}"

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /code/dist ./dist
