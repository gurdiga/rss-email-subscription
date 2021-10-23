SHELL = bash

default: pre-commit

run-email-sending:
	node_modules/.bin/ts-node src/cron-cli.ts email-sending justaddlightandstir

run-rss-checking:
	node_modules/.bin/ts-node src/cron-cli.ts rss-checking justaddlightandstir

.tmp/data/feed: .tmp/data/feed/feed.json .tmp/data/feed/emails.json

.tmp/data/feed/feed.json:
	echo '{"url": "http://localhost:4000/feed.xml", "hashingSalt": "1234567890123456", "fromAddress": "gurdiga@gmail.com"}' \
	> $@

.tmp/emails.csv:
	rm -f $@
	for email in vlad@homeschooling.md gurdiga@mail.ru; do \
		echo $$email >> $@; \
	done

.tmp/data/feed/emails.json: .tmp/emails.csv .tmp/data/feed/feed.json
	node_modules/.bin/ts-node src/email-storing/main.ts feed

reset-last-post-timestamp:
	echo '{"lastPostTimestamp":"2020-10-12T16:05:00.000Z"}' > .tmp/data/feed/lastPostTimestamp.json

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

app:
	docker build \
		--progress=plain \
		-f docker-services/app/Dockerfile \
		--tag app \
		.

logger:
	docker build \
		--progress=plain \
		--tag logger \
		docker-services/logger

start:
	docker-compose --project-name res up --remove-orphans --detach

start-delivery-only:
	docker-compose --project-name res up --remove-orphans --detach \
		-- smtp-out app

stop:
	docker-compose down

restart: stop start

hashing-salt:
	tr -dc A-Za-z0-9 </dev/urandom | head -c 16 ; echo ''

reload:
	docker kill --signal=SIGHUP app

purge-smtp-queue:
	docker exec -it smtp postsuper -d ALL

ssl:
	docker-compose run --rm --entrypoint "\
	  certbot certonly --webroot -w /var/www/certbot \
			--domains feedsubscription.com \
			--rsa-key-size 4096 \
			--agree-tos \
			--non-interactive \
			--email gurdiga@gmail.com" certbot

.PHONY: website
website:
	(cd website/html && ~/src/nginx-server/nginx-server.py)

website-reload:
	docker exec website nginx -s reload

subscription:
	node_modules/.bin/ts-node src/subscription/server.ts

# TODO: Is there a way to signup to receive an email when someting is found?
snyk:
	snyk test

watch-app:
	tail -n0 -f src/rss-email-subscription/.tmp/logs/feedsubscription/app.log \
		| grep -P '"severity":"(error|warning)"' \
		| while read line; do (echo "Subject: RES App error"; echo "From: wathc-app@feedsubscription.com"; echo; jq . <<<"$$line";) \
		| ssmtp gurdiga@gmail.com; done \
		& disown
