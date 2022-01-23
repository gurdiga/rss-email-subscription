.ONESHELL:
SHELL = bash

default: pre-commit

email-sending:
	node_modules/.bin/ts-node src/cron-cli.ts email-sending testblog

rss-checking:
	node_modules/.bin/ts-node src/cron-cli.ts rss-checking testblog

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

start-api: app
	docker-compose --project-name res up --remove-orphans \
		-- logger website api

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

node-api:
	node_modules/.bin/ts-node src/api/server.ts

# TODO: Maybe run these through the website (add -k -H 'Host: feedsubscription.com')
api-test:
	@set -exuo pipefail

	EMAIL=test@gmail.com
	EMAIL_HASH=ea7f63853ce24fe12963ea07fd5f363dc2292f882f268c1b8f605076c672b4e9
	FEED_ID=gurdiga
	DATA_FILE=.tmp/development-docker-data/$$FEED_ID/emails.json
	BASE_URL=http://0.0.0.0:3000

	function main {
		subscribe
		subscribe_verify
		confirm
		confirm_verify
		unsubscribe
		unsubscribe_verify
		subscribe
		unsubscribe_1click
		unsubscribe_verify
		subscribe
		resubscribe_failure_verify
		unsubscribe
		unsubscribe_failure_verify
	}

	function subscribe {
		curl -s --fail-with-body -X POST $$BASE_URL/subscribe -d feedId=$$FEED_ID -d email=$$EMAIL \
		| jq .
	}

	function subscribe_verify {
		if jq --exit-status ".$$EMAIL_HASH | select(.isConfirmed == false)" $$DATA_FILE; then
			echo OK
		else
			echo "Email not saved in emails.json"
			jq . $$DATA_FILE
			exit 1
		fi
	}

	function confirm {
		curl -s --fail-with-body -X POST $$BASE_URL/confirm-subscription -d id=$$FEED_ID-$$EMAIL_HASH \
		| jq .
	}

	function confirm_verify {
		if jq --exit-status ".$$EMAIL_HASH | select(.isConfirmed == true)" $$DATA_FILE; then
			echo OK
		else
			echo "Email does not have isConfirmed of true in emails.json"
			jq .$$EMAIL_HASH $$DATA_FILE
			exit 1
		fi
	}

	function unsubscribe {
		curl -s --fail-with-body -X POST $$BASE_URL/unsubscribe -d id=$$FEED_ID-$$EMAIL_HASH \
		| jq .
	}

	function unsubscribe_verify {
		if jq --exit-status ".$$EMAIL_HASH" $$DATA_FILE; then
			echo "Email not removed from emails.json"
			jq . $$DATA_FILE
			exit 1
		else
			echo OK
		fi
	}

	function unsubscribe_1click {
		curl -s --fail-with-body -X POST $$BASE_URL/unsubscribe/$$FEED_ID-$$EMAIL_HASH -d List-Unsubscribe=One-Click \
		| jq .
	}

	function resubscribe_failure_verify {
		diff -u \
			<(curl -s -X POST $$BASE_URL/subscribe -d feedId=$$FEED_ID -d email=$$EMAIL) \
			<(printf '{"kind":"InputError","message":"Email is already subscribed"}') \
			&& echo OK
	}

	function unsubscribe_failure_verify {
		diff -u \
			<(curl -s -X POST $$BASE_URL/unsubscribe -d id=$$FEED_ID-$$EMAIL_HASH) \
			<(printf '{"kind":"InputError","message":"Email is not subscribed, or, you have already unsubscribed. — Which one is it? 🤔"}') \
			&& echo OK
	}

	main

snyk:
	snyk test

watch-app:
	tail -n0 -f .tmp/logs/feedsubscription/{app,api}.log \
		| grep --line-buffered -P '("severity":"(error|warning)"|"message":"Sending report")' \
		| while read -r _skip_timestamp _skip_namespace _skip_app json;
		do
			(
				echo "Subject: RES App $$(jq -r .severity <<<"$$json")"
				echo "From: wathc-app@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf`
				echo
				jq . <<<"$$json"
			) \
			| ssmtp gurdiga@gmail.com;
		done \
		& disown

watch-smtp-out:
	tail -n0 -f .tmp/logs/feedsubscription/smtp-out.log \
		| grep --line-buffered -P '(warning|error|fatal|panic):' \
		| while read -r _1 _2 _3 timestamp level message;
		do
			(
				echo "Subject: RES smtp-out $$level"
				echo "From: watch-smtp-out@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf`
				echo
				echo "$$message"
			) \
			| ssmtp gurdiga@gmail.com; \
		done \
		& disown

unsubscribe-report:
	@function send_report() {
		(
			echo "Subject: RES unsubscribe-report"
			echo "From: RES <unsubscribe-report@feedsubscription.com>"
			echo ""
			cat
		) \
		| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi
	}

	export -f send_report

	grep "^`date +%F`" .tmp/logs/feedsubscription/api.log \
		| grep '"message":"unsubscribe"' \
		| grep -Po 'justaddlightandstir-[^"]+' | while read id; do grep $$id .tmp/logs/feedsubscription/website.log; done \
		| grep 'POST /unsubscribe' \
		| grep -Po '(?<=&email=)[^"]+' \
		| sort -u \
		| sed 's/%40/@/' \
		| ifne bash -c send_report

delivery-report:
	@function send_report() {
		(
			echo "Subject: RES Delivery report"
			echo "From: RES <delivery-report@feedsubscription.com>"
			echo ""
			cat
		) \
		| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi
	}

	export -f send_report

	( \
		grep -P "^`date +%F`" .tmp/logs/feedsubscription/smtp-out.log \
		| ( tee /dev/stderr 2> >(grep -P "status=(deferred|bounced)" > /dev/stderr) ) \
		| grep -Po '(?<= status=)\S+' \
		| sort | uniq -c \
	) 2>&1 \
	| ifne bash -c send_report

mailq-report:
	@function send_report() {
		(
			echo "Subject: RES mailq report"
			echo "From: RES <mailq-report@feedsubscription.com>"
			echo ""
			cat
		) \
		| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi
	}

	export -f send_report

	docker exec smtp-out mailq \
	| ifne bash -c send_report
