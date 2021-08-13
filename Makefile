default: app-service

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

pre-commit: check test
pc: pre-commit

# The required configuration is expected in the environment
smtp-test:
	node_modules/.bin/ts-node src/email-sending/email-delivery.slow-test.ts

# TODO: Set up DMARC?
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

APP_VERSION=00c87b1
app-service:
	docker build \
		-f docker-services/app/Dockerfile \
		--tag app:$(APP_VERSION) \
		--build-arg VERSION=$(APP_VERSION) \
		--ssh default \
		.

	docker run --rm \
		--name app \
		-v `pwd`/.tmp/data:/data \
		app:$(APP_VERSION)
