# .ONESHELL only works for GNU Make 3.82+
.ONESHELL:

SHELL = bash

default: pre-commit

# make start-testblog first
testblog-local-test:
	# +++ Maybe rm -v .tmp/development-docker-data/testblog/lastPostMetadata.json
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking testblog
	node_modules/.bin/ts-node src/app/cron-cli.ts email-sending testblog

email-sending:
	node_modules/.bin/ts-node src/app/cron-cli.ts email-sending testblog

rss-checking:
	rm -v .tmp/development-docker-data/{gurdiga,testblog,blogger}/lastPostMetadata.json
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking testblog
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking gurdiga
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking blogger

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

pre-commit: lint check test format-check
pc: pre-commit

lint: lint-prevent-mocha-only lint-docker-compose lint-dockerfile lint-shell-scripts lint-nginx-config
l: lint

# docker cp website:/etc/nginx/nginx.conf website/nginx/ # + comment out irrelevant pieces
# sudo cp -r ./.tmp/certbot/conf/live/feedsubscription.com /etc/letsencrypt/live/
lint-nginx-config:
	@nginx -q -t -c `pwd`/website/nginx/nginx.conf

lint-docker-compose:
	docker-compose --file docker-compose.yml config

lint-dockerfile:
	find . -name Dockerfile | tee /dev/stderr | xargs hadolint

lint-shell-scripts:
	@find . \
		-not -path './node_modules/*' \
		-name '*.sh' \
	| xargs shellcheck

lsh: lint-shell-scripts

lint-prevent-mocha-only:
	@git status --porcelain | grep -E '.spec.ts$$' | cut -c4- | xargs grep --color=always -H --line-number -F ".only" | tee /dev/stderr | ifne false

smtp-test:
	node_modules/.bin/ts-node src/app/email-sending/email-delivery.slow-test.ts

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

start-delivery:
	docker-compose --project-name res up --remove-orphans --detach \
		-- smtp-out app

start-app: app
	docker-compose --project-name res up --remove-orphans --detach \
		-- app

start-api: website app
	docker-compose --project-name res up --remove-orphans --force-recreate \
		-- logger website api

start-website: website start-api

o: open
open:
	open http://localhost:3000/

start-testblog:
	cd ~/tmp/testblog && make start

stop:
	docker-compose --project-name res down

restart: stop start

hashing-salt:
	tr -dc A-Za-z0-9 </dev/urandom | head -c 16 ; echo ''

reload-app:
	docker kill --signal=SIGHUP app

# cron @weekly
reload-website:
	@docker kill --signal=SIGHUP website | \
	cat <( \
		echo "Subject: RES reload-website"; \
		echo "From: reload-website@feedsubscription.com"; \
		echo; \
	) - \
	| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

purge-smtp-queue:
	docker exec -it smtp postsuper -d ALL

# NOTE: When changing certificate domains, rm -rf ll ./.tmp/certbot/conf/ first.
ssl:
	docker-compose --project-name res run --rm --entrypoint "\
	  certbot certonly \
			--webroot --webroot-path /var/www/certbot \
			--domains feedsubscription.com \
			--domains www.feedsubscription.com \
			--domains localhost.feedsubscription.com \
			--expand \
			--rsa-key-size 4096 \
			--agree-tos \
			--non-interactive \
			--email gurdiga@gmail.com" certbot
	docker kill --signal=SIGHUP website

web-ui-systemjs:
	mkdir -p src/api/web-ui-scripts
	cp --target-directory=src/api/web-ui-scripts \
		./node_modules/systemjs/dist/system.min.js* \
		./src/web-ui/systemjs-resolve-patch.js

web-ui-watch:
	node_modules/.bin/tsc --watch --project src/web-ui/tsconfig.json &

start-dev: web-ui-systemjs web-ui-watch
	node_modules/.bin/nodemon dist/api/server.js

api-test:
	node_modules/.bin/ts-mocha api-test.spec.ts

snyk:
	snyk test

# cron @reboot
watch-app:
	tail -n0 --follow=name --retry .tmp/logs/feedsubscription/{app,api}.log |
	grep --line-buffered -E \
			-e '"severity":"(error|warning)"' \
			-e '"message":"Sending report"' \
			-e '"message":"(New unconfirmed subscriber|Subscriber confirmed email)"' \
			-e '"message":"(User registered|User confirmed registration|User logged in)"' \
		|
	while read -r _skip_timestamp _skip_namespace _skip_app json; do
		(
			echo "Subject: RES App $$(jq -r .severity <<<"$$json")"
			echo "From: watch-app@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf`
			echo
			jq . <<<"$$json"
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi;
	done \
	& disown

# cron @reboot
watch-smtp-out:
	tail -n0 --follow=name --retry .tmp/logs/feedsubscription/smtp-out.log |
	grep --line-buffered -P '(warning|error|fatal|panic|reject):' |
	while read -r _1 _2 _3 timestamp level message; do
		(
			echo "Subject: RES smtp-out $$level"
			echo "From: watch-smtp-out@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf`
			echo
			echo "$$message"
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi;
	done \
	& disown

# cron 59 23 * * *
unsubscribe-report:
	@TODAY=`date +%F`
	DATE="$${DATE:=$$TODAY}"

	grep "^$$DATE" .tmp/logs/feedsubscription/api.log |
	grep '"message":"unsubscribe"' |
	grep -Po 'justaddlightandstir-[^"]+' |
	while read id; do grep $$id .tmp/logs/feedsubscription/website.log; done |
	grep 'POST /unsubscribe' |
	grep -Po '(?<=&email=)[^"]+' |
	sort -u |
	sed 's/%40/@/' |
	cat <(
			echo "Subject: RES unsubscribe-report"
			echo "From: RES <unsubscribe-report@feedsubscription.com>"
			echo ""
	) - |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

# cron 59 23 * * *
subscribe-report:
	@TODAY=`date +%F`
	DATE="$${DATE:=$$TODAY}"

	grep "^$$DATE" .tmp/logs/feedsubscription/api.log |
	grep '"message":"Confirmed email"' |
	while read -r _timestamp _p_name _s_name json; do echo $$json; done |
	jq -r .data.email |
	sort -u |
	cat <(
		echo "Subject: RES subscribe-report"
		echo "From: RES <subscribe-report@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

# cron 59 23 * * *
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

# cron 59 23 * * *
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

.PHONY: website
website:
	( cd ../feedsubscription.com && source ~/.nvm/nvm.sh && nvm use && make build )
	rsync -avz --delete-after ../feedsubscription.com/dist/ website/html/

RCLONE_BINARY=$(shell which rclone || echo RCLONE_BINARY_NOT_FOUND)
RCLONE_CONFIG=~/.config/rclone/rclone.conf
# cron @daily
backup: ${RCLONE_BINARY} ${RCLONE_CONFIG}
	@rclone \
		--stats=0 \
		--verbose \
		copy $${DATA_DIR_ROOT:-.tmp/docker-data} gdrive-res:/RES-backups/`date +%F-%H-%M-%S` 2>&1 |
	cat <(
		echo "Subject: RES backup"
		echo "From: RES <backup@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

backup-purge:
	@rclone lsf gdrive-res:RES-backups |
	sort |
	head --lines=-31 | # exlude last 31
	xargs -I {} sh -c "echo {}; rclone purge gdrive-res:RES-backups/{} 2>&1" |
	cat <(
		echo "Subject: RES backup-purge"
		echo "From: RES <backup-purge@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

${RCLONE_BINARY}:
	curl https://rclone.org/install.sh | sudo bash

${RCLONE_CONFIG}:
	rclone config

npm-update:
	@npm outdated && echo "Yay!! Everything is up-to-date. 😎"

format-check:
	prettier --check 'src/**/*.ts'

clean: stop
	docker image rm --force app
	rm -rf website/html/

init-data-dir:
	@require=$${DATA_DIR_ROOT:?envar is missing}

	set -e
	mkdir $$DATA_DIR_ROOT/feeds
	mkdir $$DATA_DIR_ROOT/accounts
	echo "Initialized data dir: $$DATA_DIR_ROOT"

init-account-index:
	@require=$${DATA_DIR_ROOT:?envar is missing}

	echo '{"version":"1"}' > $$DATA_DIR_ROOT/accounts/index.json

reset-account-index:
	@require=$${DATA_DIR_ROOT:?envar is missing}

	if [[ "$$NODE_ENV" != "development" ]]; then
		echo "This is only for the development environment."
		false;
	fi

	find $$DATA_DIR_ROOT/accounts -mindepth 1 -type d | xargs rm -rfv
	echo '{"version":"1"}' > $$DATA_DIR_ROOT/accounts/index.json

sent-count:
	@quiet=true
	gzcat -f .tmp/logs/feedsubscription/app.log* |
	grep '"Sending report"' |
	cut -d ' ' -f 4- | # skip timestamps and stuff to get to the JSON record
	jq -s 'map(.data.report.sent) | add' |
	numfmt --grouping
