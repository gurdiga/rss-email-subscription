ARG NODE_VERSION=22.14-alpine3.21
ARG OPENSSL_VERSION=3.3.5-r0

### --- build
FROM node:${NODE_VERSION} AS build
ARG OPENSSL_VERSION

RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk add --no-cache --upgrade "openssl=${OPENSSL_VERSION}"

WORKDIR /code

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PROGRESS=false

COPY package.json package-lock.json ./
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

# Reduce runtime image install time: keep only prod deps in builder
RUN npm prune --omit=dev

### --- run
FROM node:${NODE_VERSION}
ARG OPENSSL_VERSION

ENV NODE_OPTIONS=--dns-result-order=ipv4first

VOLUME /data
WORKDIR /code

RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk add --no-cache --upgrade "openssl=${OPENSSL_VERSION}"

COPY --from=build /code/dist ./dist
COPY --from=build /code/node_modules ./node_modules
