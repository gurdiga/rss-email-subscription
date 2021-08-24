default: app

run-email-sending:
	node_modules/.bin/ts-node src/email-sending/main.ts data/

run-rss-checking:
	node_modules/.bin/ts-node src/rss-checking/main.ts data/

data: data/feed.json data/emails.json

data/feed.json:
	echo '{"url": "http://localhost:4000/feed.xml", "hashingSalt": "1234567890123456", "fromAddress": "gurdiga@gmail.com"}' \
	> $@

.tmp/emails.csv:
	rm -f $@
	for email in vlad@homeschooling.md gurdiga@mail.ru; do \
		echo $$email >> $@; \
	done

data/emails.json: .tmp/emails.csv data/feed.json
	node_modules/.bin/ts-node src/email-storing/main.ts data/

test:
	node_modules/.bin/ts-mocha -R dot 'src/**/*.spec.ts'

t: test

tw:
	node_modules/.bin/ts-mocha -R dot --watch --watch-files src 'src/**/*.spec.ts'

edit:
	code -n .

e: edit

check:
	node_modules/.bin/tsc -p tsconfig.json

c: check
cw:
	node_modules/.bin/tsc -p tsconfig.json --watch

pre-commit: check test lint
pc: pre-commit

lint: lint-docker-compose lint-dockerfile

lint-docker-compose:
	docker-compose --file docker-compose.yml config

# TODO: Fix lintint errors
lint-dockerfile:
	find . -name Dockerfile | tee /dev/stderr | xargs hadolint

lint-docker-files:
	echo TODO

# The required configuration is expected in the environment
smtp-test:
	node_modules/.bin/ts-node src/email-sending/email-delivery.slow-test.ts

smtp:
	docker run --rm --name postfix \
		-v `pwd`/.tmp/opendkim-keys:/etc/opendkim/keys \
		-e "ALLOWED_SENDER_DOMAINS=feedsubscription.com" \
		-e "DKIM_AUTOGENERATE=yes" \
		-e "INBOUND_DEBUGGING=yes" \
		--no-healthcheck \
		-p 1587:587 \
		boky/postfix

reset-last-post-timestamp:
	echo '{"lastPostTimestamp":"2021-01-12T16:05:00.000Z"}' > data/lastPostTimestamp.json

app: app-build app-run

APP_IMAGE_NAME=app
app-build:
	docker build \
		--progress=plain \
		-f docker-services/app/Dockerfile \
		--tag $(APP_IMAGE_NAME) \
		--ssh default \
		.

app-run:
	docker run --rm \
		-it \
		-v `pwd`/.tmp/data:/data \
		-e "NODE_ENV=production" `#See https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md` \
		--name $(APP_IMAGE_NAME) \
		$(APP_IMAGE_NAME)

compose:
	docker-compose up --remove-orphans --detach

decompose:
	docker-compose down

recompose: decompose compose
