FROM node:16.6-alpine3.14

VOLUME /data

RUN apk update \
  && apk add --no-cache make=4.3-r0

WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY . ./

# TODO:
# - Add crontab entry
