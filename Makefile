default: run

run:
	ts-node src/main.ts

logs-app:
	docker logs -f rss-email-subscription_app_1

run-email-sending:
	node_modules/.bin/ts-node src/email-sending/main.ts .tmp/data/

run-rss-checking:
	node_modules/.bin/ts-node src/rss-checking/main.ts .tmp/data/

.tmp/data: .tmp/data/feed.json .tmp/data/emails.json

.tmp/data/feed.json:
	echo '{"url": "http://localhost:4000/feed.xml", "hashingSalt": "1234567890123456", "fromAddress": "gurdiga@gmail.com"}' \
	> $@

.tmp/emails.csv:
	rm -f $@
	for email in vlad@homeschooling.md gurdiga@mail.ru; do \
		echo $$email >> $@; \
	done

.tmp/data/emails.json: .tmp/emails.csv .tmp/data/feed.json
	node_modules/.bin/ts-node src/email-storing/main.ts .tmp/data/

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

lint-dockerfile:
	find . -name Dockerfile | tee /dev/stderr | xargs hadolint

# The required configuration is expected in the environment
smtp-test:
	node_modules/.bin/ts-node src/email-sending/email-delivery.slow-test.ts

smtp:
	docker run --rm --name postfix \
		-v `pwd`/.tmp/opendkim-keys:/etc/opendkim/keys \
		--env-file smtp.env \
		--no-healthcheck \
		-p 1587:587 \
		boky/postfix

reset-last-post-timestamp:
	echo '{"lastPostTimestamp":"2021-01-12T16:05:00.000Z"}' > .tmp/data/lastPostTimestamp.json

APP_IMAGE_NAME=app
app:
	docker build \
		--progress=plain \
		-f docker-services/app/Dockerfile \
		--tag $(APP_IMAGE_NAME) \
		--ssh default \
		.

run-app:
	docker run --rm \
		--init \
		-v `pwd`/.tmp/data:/data \
		--env-file app.env \
		--name $(APP_IMAGE_NAME) \
		$(APP_IMAGE_NAME)

start:
	DATA_DIR=./.tmp/docker-data docker-compose up --remove-orphans --detach

stop:
	docker-compose down

restart: stop start
