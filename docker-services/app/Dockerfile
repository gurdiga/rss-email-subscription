FROM node:16.15-alpine3.15

RUN apk -U upgrade

VOLUME /data
WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN ./node_modules/.bin/tsc -p src/web-ui/tsconfig.json
RUN cp ./node_modules/systemjs/dist/system.min.js* /code/src/api/web-ui-scripts
RUN cp ./src/web-ui/systemjs-resolve-patch.js /code/src/api/web-ui-scripts
