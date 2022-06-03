FROM node:17-alpine3.14

VOLUME /data
WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN ./node_modules/.bin/tsc -p src/web-ui/tsconfig.json
RUN cp ./node_modules/systemjs/dist/system.min.js* /code/src/api/web-ui-scripts
RUN cp ./src/web-ui/systemjs-resolve-patch.js /code/src/api/web-ui-scripts
