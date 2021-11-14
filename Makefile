SHELL = bash

default: pre-commit

email-sending:
	node_modules/.bin/ts-node src/cron-cli.ts email-sending test-feed

rss-checking:
	node_modules/.bin/ts-node src/cron-cli.ts rss-checking test-feed

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

smtp-out:
	docker build \
		--progress=plain \
		--tag smtp-out \
		docker-services/smtp-out

start:
	docker-compose --project-name res up --remove-orphans --detach

start-delivery-only:
	docker-compose --project-name res up --remove-orphans --detach \
		-- smtp-out app

start-app-only: app
	docker-compose --project-name res up --remove-orphans --detach \
		-- app

stop:
	docker-compose --project-name res down

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

api:
	node_modules/.bin/ts-node src/api/server.ts

# TODO: test unhappy paths too:
# - test one-click POST unsubscribe
# - registration when already registered
# - unregistration when not registered
api-test:
	@set -xuo pipefail \
	&& curl -s --fail-with-body -X POST http://0.0.0.0:3000/subscribe -d feedId=gurdiga -d email=test@gmail.com | jq . \
	&& ( \
		grep '"test@gmail.com"' ./.tmp/development-docker-data/gurdiga/emails.json > /dev/null \
		|| ( \
			echo "Email not saved in emails.json"; \
			jq . ./.tmp/development-docker-data/gurdiga/emails.json; \
			exit 1 \
		) \
	) \
	&& curl -s --fail-with-body -X POST http://0.0.0.0:3000/unsubscribe -d id=gurdiga-ea7f63853ce24fe12963ea07fd5f363dc2292f882f268c1b8f605076c672b4e9 | jq . \
	&& ( \
		grep -v '"test@gmail.com"' ./.tmp/development-docker-data/gurdiga/emails.json > /dev/null \
		|| ( \
			echo "Email not removed from emails.json"; \
			jq . ./.tmp/development-docker-data/gurdiga/emails.json; \
			exit 1 \
		) \
	) \
	&& echo

snyk:
	snyk test

watch-app:
	tail -n0 -f .tmp/logs/feedsubscription/app.log \
		| grep --line-buffered -P '("severity":"(error|warning)"|"message":"Sending report")' \
		| while read _skip_timestamp _skip_namespace _skip_app json; \
		do \
			( \
				echo "Subject: RES App $$(jq -r .severity <<<"$$json")"; \
				echo "From: wathc-app@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf` \
				echo; \
				jq . <<<"$$json";\
			) \
			| ssmtp gurdiga@gmail.com; \
		done \
		& disown

watch-smtp-out:
	tail -n0 -f .tmp/logs/feedsubscription/smtp-out.log \
		| grep --line-buffered -P '(warning|error|fatal|panic):' \
		| while read _1 _2 _3 timestamp level message; \
		do \
			( \
				echo "Subject: RES smtp-out $$level"; \
				echo "From: watch-smtp-out@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf` \
				echo; \
				echo "$$message";\
			) \
			| ssmtp gurdiga@gmail.com; \
		done \
		& disown

unsubscribe-report:
	@grep "^`date +%F`" .tmp/logs/feedsubscription/api.log \
		| grep '"message":"Unsubscription request"' \
		| grep -Po 'justaddlightandstir-[^"]+' | while read id; do grep $$id .tmp/logs/feedsubscription/website.log; done \
		| grep 'POST /unsubscribe' \
		| grep -Po '(?<=&email=)[^"]+' \
		| sort -u \
		| sed 's/%40/@/' \
		| ( \
				echo "Subject: RES unsubscriptions"; \
				echo ""; \
				cat; \
			) \
		| ifne ssmtp gurdiga@gmail.com
