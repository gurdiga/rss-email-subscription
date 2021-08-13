FROM node:16.6-alpine3.14

ARG VERSION=main

VOLUME /code
VOLUME /data

RUN apk update
RUN apk add git openssh make

RUN mkdir -p -m 0600 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts
RUN --mount=type=ssh git clone --depth=2 git@github.com:gurdiga/rss-email-subscription.git /code

WORKDIR /code
RUN git checkout $VERSION
RUN npm install

# TODO:
# - Add crontab entry
# - make it “hang”

CMD [ "make", "pre-commit" ]
