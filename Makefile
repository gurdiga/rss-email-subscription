default: pre-commit

logs-app:
	docker logs -f app

logs-smtp:
	docker logs -f smtp

logs-smtp-in:
	docker logs -f sm-in_1

run-email-sending:
	node_modules/.bin/ts-node src/cron-cli.ts email-sending feed

run-rss-checking:
	node_modules/.bin/ts-node src/cron-cli.ts rss-checking feed

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

pre-commit: check test lint snyk
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
	docker-compose up --remove-orphans --detach

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

snyk:
	snyk test
