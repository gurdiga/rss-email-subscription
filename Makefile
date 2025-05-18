# .ONESHELL only works for GNU Make 3.82+
.ONESHELL:

SHELL = bash
TIME=gtime -f '%es'

RED='\e[0;31m'
NC='\033[0m' # No Color
ERROR="${RED}ERROR${NC}"
YELLOW='\e[38;5;82m'
DEBUG="${YELLOW}DEBUG${NC}"

default: pre-commit

local-test:
	@require=$${DATA_DIR_ROOT:?envar is missing}
	feed_id=$${FEED_ID:-testblog}

	# This is necessary when sending through prod smtp-in
	export DOMAIN_NAME=feedsubscription.com

	rm -v $$DATA_DIR_ROOT/accounts/da772874f7963b4612ec6c59005c7fbe1b0264302a501568cfed1e5035080ef5/feeds/$${feed_id}/lastPostMetadata.json
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking $${feed_id}
	node_modules/.bin/ts-node src/app/cron-cli.ts email-sending $${feed_id}

email-sending:
	node_modules/.bin/ts-node src/app/cron-cli.ts email-sending testblog

rss-checking:
	@require=$${DATA_DIR_ROOT:?envar is missing}
	rm -v $$DATA_DIR_ROOT/accounts/da772874f7963b4612ec6c59005c7fbe1b0264302a501568cfed1e5035080ef5/feeds/{gurdiga,testblog,blogger}/lastPostMetadata.json

	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking testblog
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking gurdiga
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking blogger

test:
	@export TS_NODE_TRANSPILE_ONLY=true
	node_modules/.bin/mocha \
		--require ts-node/register \
		--reporter dot \
		'src/**/*.spec.ts'

test-quiet:
	@printf "Test... "
	$(TIME) $(MAKE) test > /dev/null

t: test

tw:
	@export TS_NODE_TRANSPILE_ONLY=true
	node_modules/.bin/mocha \
		--require ts-node/register \
		--reporter dot \
		--watch \
		--watch-files src \
		'src/**/*.spec.ts'

edit:
	code -n .

e: edit

compile:
	node_modules/.bin/tsc --project tsconfig.json && \
	node_modules/.bin/tsc --project src/web-ui/tsconfig.json

compile-quiet:
	@printf "Compile... "
	$(TIME) $(MAKE) compile check-no-node-in-web-ui > /dev/null

check-no-node-in-web-ui:
	@grep --line-number --color=always -RF 'node:' dist/api/web-ui-scripts/ |
	tee /dev/stderr | ifne false

c: compile
cw:
	node_modules/.bin/tsc --watch --project tsconfig.json &
	node_modules/.bin/tsc --watch --project src/web-ui/tsconfig.json

pre-commit: lint-quiet compile-quiet test-quiet format-check-quiet
pc: pre-commit

lint: lint-mocha-only lint-require-strict-interpolation lint-docker-compose lint-dockerfile lint-shell-scripts lint-nginx-config lint-dnsmasq-conf
l: lint

lint-quiet:
	@printf "Lint... "
	$(TIME) $(MAKE) lint > /dev/null

# docker cp website:/etc/nginx/nginx.conf website/nginx/ # plus, comment out irrelevant pieces
# sudo cp -r ./.tmp/certbot/conf/live/feedsubscription.com /etc/letsencrypt/live/
lint-nginx-config:
	@nginx_image=`yq -r .services.website.image docker-compose.yml`

	docker run --rm \
		-v $$PWD/website/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
		-v $$PWD/website/nginx/conf.d/website.conf:/etc/nginx/conf.d/website.conf:ro \
		-v $$PWD/.tmp/certbot/conf/live/feedsubscription.com/fullchain.pem:/etc/letsencrypt/live/feedsubscription.com/fullchain.pem:ro \
		-v $$PWD/.tmp/certbot/conf/live/feedsubscription.com/privkey.pem:/etc/letsencrypt/live/feedsubscription.com/privkey.pem:ro \
		-e NGINX_ENTRYPOINT_QUIET_LOGS=1 \
		"$$nginx_image" \
		nginx -q -t -c /etc/nginx/nginx.conf

lint-docker-compose:
	docker compose --file docker-compose.yml config

lint-dnsmasq-conf:
	@command="dnsmasq --test -C docker-services/resolver/etc/dnsmasq.conf"
	if ! $$command &> /dev/null; then
		$$command
	fi

lint-dockerfile:
	find . -name Dockerfile |
	# tee /dev/stderr | # DEBUG
	xargs hadolint

lint-shell-scripts:
	@find . \
		-not -path './node_modules/*' \
		-name '*.sh' \
	| xargs shellcheck

lsh: lint-shell-scripts

lint-mocha-only:
	@function changed_files {
		# List staged files if any, or changed if not
		git diff-index --cached --name-only HEAD | ifne -n \
		git diff-index --name-only HEAD |
		while read file; do if [ -f "$$file" ]; then echo "$$file"; fi; done
	}

	changed_files | grep -E '.spec.ts$$' | xargs grep --color=always -H --line-number -F ".only" | tee /dev/stderr | ifne false

lint-require-strict-interpolation:
	find src -name '*.ts' |
	grep -v src/web-ui/subscription-form.ts | # exceptions
	xargs grep --line-number --color=always -P '(?<!si)`[^;\]), ]' |
	tee /dev/stderr | ifne false

smtp-test:
	node_modules/.bin/ts-node src/app/email-sending/email-delivery.slow-test.ts

app:
	@$(call include_log_to)

	set -euo pipefail
	docker build \
		--no-cache \
		--progress=plain \
		--tag app \
		-f docker-services/app/Dockerfile \
		. |&
	log_to .tmp/logs/feedsubscription/docker-build-app.log

delmon: app
	docker build \
		--no-cache \
		--progress=plain \
		--tag delmon \
		docker-services/delmon

# This is targeted after the log rotation in logger, which happens around 01:02, but sometimes later
delmon-restart:
	@docker restart delmon |
	cat <(
		echo "Subject: RES delmon-restart"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

logger:
	docker build \
		--no-cache \
		--progress=plain \
		--tag logger \
		docker-services/logger

resolver:
	docker build \
		--no-cache \
		--progress=plain \
		--tag resolver \
		docker-services/resolver

resolver-check:
	@set -euo pipefail

	docker exec -it resolver dig @localhost feedsubscription.com
	docker exec -it resolver dig @localhost feedsubscription.com |
	grep -E "^;; Query time: [0-4] msec"

# cron @reboot
watch-resolver:
	@tail -n0 --follow=name --retry .tmp/logs/feedsubscription/resolver.log |
	grep --line-buffered -E \
			-e ' (exiting|started,|using|read) ' \
			-e ' is NODATA-' \
	|
	while read -r timestamp _skip_namespace _skip_container_name_and_id _skip_process_name record; do
		(
			date_and_hour=`echo $$timestamp | cut -d: -f1`

			echo "From: RES <system@feedsubscription.com>"
			echo "Subject: RES resolver $$date_and_hour"
			echo ""
			echo "$$timestamp $$record"
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi
	done \
	& disown

logger-list-packages:
	docker exec -it logger apk list -a |
	grep -P "^(syslog-ng|logrotate|tini)-\d"

smtp-out:
	docker build \
		--no-cache \
		--progress=plain \
		--tag smtp-out \
		docker-services/smtp-out

smtp-in:
	source .env
	docker build \
		--no-cache \
		--secret id=SMTP_IN_SASL_PASSWORD \
		--progress=plain \
		--tag smtp-in \
		docker-services/smtp-in

# cron @reboot
start:
	docker compose --project-name res up --remove-orphans --detach

start-resolver:
	docker compose --project-name res up --remove-orphans --detach \
		-- resolver

start-app: app
	docker compose --project-name res up --remove-orphans --detach \
		-- app

start-delmon: delmon
	docker compose --project-name res up --remove-orphans --detach \
		-- delmon

start-logger: logger
	docker compose --project-name res up --remove-orphans --detach \
		-- logger

start-api: compile test build-website website app
	export NODE_ENV="production"
	docker compose --project-name res up --remove-orphans --force-recreate \
		-- resolver logger website api > /dev/null &
	sleep 1
	docker compose --project-name res logs --follow --since 10s --timestamps &
	wait

start-website: build-website start-api

start-testblog:
	@echo 'Run this:'
	echo '  cd ~/tmp/testblog'
	echo '  make start'

stop:
	docker compose --project-name res down

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
		echo "From: RES <system@feedsubscription.com>"; \
		echo; \
	) - \
	| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

restart-smtp-in:
	@docker restart smtp-in | \
	cat <( \
		echo "Subject: RES restart-smtp-in"; \
		echo "From: RES <system@feedsubscription.com>"; \
		echo; \
	) - \
	| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

purge-smtp-queue:
	docker exec -it smtp postsuper -d ALL

certbot:
	@$(call include_log_to)

	docker build \
		--no-cache \
		--progress=plain \
		--tag certbot \
		-f docker-services/certbot/Dockerfile \
		. |&
	log_to .tmp/logs/feedsubscription/docker-build-certbot.log

start-certbot: certbot
	docker compose --project-name res up --remove-orphans --detach \
		-- certbot

# NOTE: When changing certificate domains, rm -rf ll ./.tmp/certbot/conf/ first.
ssl:
	docker compose --project-name res run --rm --entrypoint "\
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

# NOTE: Eleventy manages the website’s /dist/, so I’m puting the compiled
# scrips in its src/web-ui-scripts/ and let it take it from there. If I put
# them directly in /dist/, Eleventy removes them as extraneous.
WEB_UI_DEST_DIR=$(DOCUMENT_ROOT)/../src/web-ui-scripts/

web-ui-systemjs:
	mkdir -p $(WEB_UI_DEST_DIR)
	cp --target-directory=$(WEB_UI_DEST_DIR) \
		./node_modules/systemjs/dist/system.min.js*
	cat ./src/web-ui/systemjs-resolve-patch.js >> $(WEB_UI_DEST_DIR)/system.min.js

web-ui:
	node_modules/.bin/tsc --project src/web-ui/tsconfig.json

web-ui-watch: web-ui-systemjs
	node_modules/.bin/tsc --watch --project src/web-ui/tsconfig.json --outDir $(WEB_UI_DEST_DIR) &

start-dev: web-ui-watch
	node_modules/.bin/nodemon src/api/server.ts

api-test:
	@export TS_NODE_TRANSPILE_ONLY=true
	node_modules/.bin/mocha \
		--require ts-node/register \
		--reporter dot \
		--bail -R dot api-test.spec.ts

snyk:
	snyk test

# cron @reboot
watch-app:
	@function handle_ENOTFOUND {
		while read -r _getaddrinfo _ENOTFOUND server_name; do
			echo "DEBUG: Trying to resolve $$server_name..."

			echo "DEBUG: nslookup from inside container"
			docker exec app nslookup $$server_name

			echo "DEBUG: nslookup from outside container"
			nslookup $$server_name
		done
	}

	tail -n0 --follow=name --retry .tmp/logs/feedsubscription/{app,api}.log |
	grep --line-buffered -E \
			-e '"severity":"(error|warning)"' \
			-e '"message":"Starting (cron|API server)' \
			-e '"message":"Sending report"' \
			-e '"message":"sendSampleEmail"' \
			-e '"message":"Blog RSS check"' \
			-e '"message":"heartbeat"' \
			-e '"message":"(New unconfirmed subscriber|Subscriber confirmed email)"' \
			-e '"message":"(New feed added|Feed updated|Feed deleted)"' \
			-e '"message":"(Unsubscribed)"' \
			-e '"message":"Deleted confirmation secrets' \
			-e '"message":"(User registered|User confirmed registration|User (requested|confirmed) password change|User logged in|Account deleted)"' \
		|
	while read -r _skip_timestamp _skip_namespace container_name_and_id json; do
		(
			container_name=$$(grep -Po '^[^[]+' <<<"$$container_name_and_id")
			severity=$$(jq -r .severity <<<"$$json")
			message=$$(jq -r .message <<<"$$json")
			reason=$$(jq -r .data.reason <<<"$$json")

			echo "Subject: RES $$container_name $$severity: $$message"
			echo "From: RES <system@feedsubscription.com>"
			echo
			jq . <<<"$$json"

			if [[ $$reason == "getaddrinfo ENOTFOUND"* ]]; then handle_ENOTFOUND <<<"$$reason"; fi

			if [[ $$message == "Feed updated" ]]; then
				echo "DIFF:"
				jq -r .data.diff <<<"$$json"
			fi
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi;
	done \
	& disown

# cron @reboot
watch-website:
	@function url_decode {
		while read line; do
			line=$${line//%/\\x}
			line=$${line//+/ }
			echo -e $$line
		done
	}

	tail -n0 --follow=name --retry .tmp/logs/feedsubscription/website.log |
	grep -v -E '(bingbot|Googlebot)' |
	grep --line-buffered -F \
			-e 'GET /error?stack=' \
		|
	grep -v 'chrome-extension' |
	while read -r timestamp _2 _3 client_ip _5 _6 _7 _8 _9 url _11 _12 _13 referrer rest; do
		(
			echo "Subject: RES website error-log"
			echo "From: watch-website@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf`
			echo ""
			echo "User-Agent: $$rest"
			echo "Client IP: $$client_ip"
			echo "Referrer: $$referrer"
			echo "Timestamp: $$timestamp"
			echo "URL: $$url" | url_decode
			echo "Whois:"
			whois $$client_ip | grep -iE '^(Address|StateProv|PostalCode|Country):' | sort -u | head -10 | sed 's/^/    /'
			echo "https://whois.com/whois/$$client_ip"
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi;
	done \
	& disown

# cron @reboot
watch-smtp-out:
	@tail -n0 --follow=name --retry .tmp/logs/feedsubscription/smtp-out.log |
	grep --line-buffered -E \
			-e '(warning|error|fatal|panic|reject):' \
			-e ' POSTFIX STARTING UP ' \
			-e ' INFO (stopped|spawned): ' \
			-e ' (WARN|CRIT|ERR) ' \
		|
	while read -r timestamp rest; do
		(
			echo "Subject: RES smtp-out $$timestamp"
			echo "From: RES <system@feedsubscription.com>"
			echo ""
			echo "$$rest"

			no_mx_regex="^.*no\ MX\ host\ for\ ([-a-z.]+).*$$"
			ns_error_regex="^.*Name\ service\ error\ for\ name=([-a-z.]+)\.*$$"

			if [[ $$rest =~ $$no_mx_regex ]] || [[ $$rest =~ $$ns_error_regex ]] ; then
				domain=$${BASH_REMATCH[1]}

				echo "--- DEBUG: A record from inside container"
				docker exec smtp-out nslookup "$$domain"

				echo "--- DEBUG: MX record from inside container"
				docker exec smtp-out nslookup -query=mx "$$domain"

				echo "--- DEBUG: A record from host"
				nslookup "$$domain"

				echo "--- DEBUG: MX record from host"
				nslookup -query=mx "$$domain"

			fi
		) |
		if [ -t 1 ]; then cat; else sleep 1m; ifne ssmtp gurdiga@gmail.com; fi
	done \
	& disown

# cron @weekly
certbot-report:
	@(
		echo "Subject: RES weekly-certbot"
		echo "From: RES <system@feedsubscription.com>"
		echo

		ls -1t .tmp/logs/feedsubscription/certbot.log{,-*.gz} |
		head -2 |
		sort -r |
		xargs zcat -f |
		tail -12
	) 2>&1 |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

# cron @reboot
watch-delmon:
	@tail -n0 --follow=name --retry .tmp/logs/feedsubscription/delmon.log |
	while read -r _skip_timestamp _skip_namespace _skip_container_name_and_id json; do
		(
			echo "From: RES <system@feedsubscription.com>"

			if jq --exit-status <<<"$$json" &> /dev/null; then
				severity=$$(jq -r .severity <<<"$$json")
				message=$$(jq -r .message <<<"$$json")

				echo "Subject: RES delmon $$severity: $$message"
				echo

				jq . <<<"$$json"
			else
				echo "Subject: RES delmon non-JSON log record"
				echo

				wc --bytes <<<"$$json" | ts "bytes:"
				echo "$$json"
			fi
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi
	done \
	& disown

# This is to be run when delmon container died for some reason, and
# there are unprocessed qid-index entries.
delmon-catch-up:
	@source .env
	require=$${DATA_DIR_ROOT:?envar is missing}

	ls -1 $$DATA_DIR_ROOT/qid-index/ |
	while read qid; do
		grep -P "INFO    postfix/smtp.+ $$qid: .+ status=" .tmp/logs/feedsubscription/smtp-out.log
	done |
	tee /dev/stderr | # so that I can see that something is happening
	docker exec --interactive delmon node dist/app/delivery-monitoring

# cron @daily
list-qid-index:
	@source .env
	require=$${DATA_DIR_ROOT:?envar is missing}

	ls -1 $$DATA_DIR_ROOT/qid-index |
	grep -v "^total " |
	ifne -n echo '(empty)' |
	cat <(
		echo "Subject: RES list-qid-index"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

delmon-dev:
	@DATA_DIR_ROOT=.tmp/docker-data ts-node ./src/app/delivery-monitoring

# cron 59 23 * * *
delivery-report:
	@function send_report() {
		(
			echo "Subject: RES delivery report"
			echo "From: RES <system@feedsubscription.com>"
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
	) 2>&1 |
	ifne -n echo '(empty)' |
	send_report

# cron 59 23 * * *
mailq-report:
	@function send_report() {
		(
			echo "Subject: RES mailq report"
			echo "From: RES <system@feedsubscription.com>"
			echo ""
			cat
		) \
		| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi
	}

	export -f send_report

	docker exec smtp-out mailq |
	ifne -n echo '(empty)' |
	send_report

.PHONY: website
website:
	@$(call include_log_to)

	set -o pipefail
	docker build \
		--no-cache \
		--output type=docker \
		--progress=plain \
		--tag website \
		-f docker-services/website/Dockerfile \
		. |&
	log_to .tmp/logs/feedsubscription/docker-build-website.log

build-website:
	( cd ../feedsubscription.com && source ~/.nvm/nvm.sh && nvm use && make build-prod )
	rsync -avz --delete-after ../feedsubscription.com/dist/ website/html/

RCLONE_BINARY=$(shell which rclone || echo RCLONE_BINARY_NOT_FOUND)
RCLONE_CONFIG=~/.config/rclone/rclone.conf

# cron 50 23 * * * cd
backup: ${RCLONE_BINARY} ${RCLONE_CONFIG}
	@REMOTE="gdrive-res:/RES-backups"
	DATA_DESTINATION="$$REMOTE/`date +%F-%H-%M-%S`"
	DATA_ARCHIVE="./data.tgz"
	DATA_DIR=".tmp/docker-data"
	LOGS_DIR=".tmp/logs/feedsubscription"
	LOGS_DESTINATION="$$REMOTE/logs"

	function upload_data() {
		echo ""
		echo "--- upload_data ---"
		echo ""

		tar -czf $$DATA_ARCHIVE $$DATA_DIR
		du -sh $$DATA_DIR $$DATA_ARCHIVE

		rclone \
			--local-no-check-updated \
			--stats=0 \
			--verbose \
			copy $$DATA_ARCHIVE $$DATA_DESTINATION \
			--exclude=postfix/** \
			--exclude=sessions/**
	}

	function upload_logs() {
		echo ""
		echo "--- upload_logs ---"
		echo ""

		du -sh $$LOGS_DIR

		rclone \
			--stats=0 \
			--verbose \
			copy --no-traverse $$LOGS_DIR $$LOGS_DESTINATION
	}

	{
		time upload_data
		time upload_logs
	} 2>&1 |
	cat <(
		echo "Subject: RES backup"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
		echo "$$DATA_DESTINATION"
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

	rm $$DATA_ARCHIVE

backup-purge:
	@rclone lsf gdrive-res:RES-backups |
	sort |
	head --lines=-31 | # exlude last 31
	xargs --no-run-if-empty -I {} sh -c "echo {}; rclone purge gdrive-res:RES-backups/{} 2>&1" |
	cat <(
		echo "Subject: RES backup-purge"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

${RCLONE_BINARY}:
	curl https://rclone.org/install.sh | sudo bash

${RCLONE_CONFIG}:
	rclone config

npm-update:
	@npm outdated && echo -e "✅ Everything is up-to-date.\n"

format-check:
	prettier --check 'src/**/*.ts'

format-check-quiet:
	@printf "Format check... "
	$(TIME) $(MAKE) format-check > /dev/null

clean:
	rm -rf website/html/ src/api/web-ui-scripts/ dist/

clean-docker: stop
	docker image rm --force app delmon smtp-out smtp-in website certbot logger

init-data-dir:
	@require=$${DATA_DIR_ROOT:?envar is missing}

	set -e
	mkdir $$DATA_DIR_ROOT/feeds
	mkdir $$DATA_DIR_ROOT/accounts
	echo "Initialized data dir: $$DATA_DIR_ROOT"

rsync-logs:
	rsync -avz root@feedsubscription.com:src/rss-email-subscription/.tmp/logs/ .tmp/logs/

sent-count: rsync-logs
	@$(MAKE) --no-print-directory sent-count-last-week |
		tail -1 |
		tee >( numfmt --grouping | ts "last week:  " | cat <(echo) - > /dev/stderr ) |
	cat - <(
		grep -Po "\d+(,\d+)+(?= \(updated on Mondays\))" "../feedsubscription.com/src/includes/my-footer.njk" |
		sed 's/,//g'
	) |
	paste -sd+ - | bc |
	numfmt --grouping |
	ts "grand total:"

sent-count-last-week: rsync-logs
	@ls -1t .tmp/logs/feedsubscription/app.log-*.gz |
	head -1 |
	xargs zcat -f |
	grep '"Sending report"' |
	cut -d ' ' -f 4- | # skip timestamps and stuff to get to the JSON record
	jq -s 'map(.data.report.sent) | add'

# cron @monthly
docker-prune:
	@docker system prune --all --force |
	cat <(
		echo "Subject: RES prune-docker-images"
		echo "From: RES <system@feedsubscription.com>";
		echo
		docker system df
		echo
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

git-pre-commit-hook:
	echo "#!/bin/sh" > .git/hooks/pre-commit
	echo "" >> .git/hooks/pre-commit
	echo "bash -i -c 'make pre-commit'" >> .git/hooks/pre-commit

# cron @weekly
list-sessions:
	@source .env
	require=$${DATA_DIR_ROOT:?envar is missing}

	ls -1 $$DATA_DIR_ROOT/sessions |
	grep -v "^total " |
	ifne -n echo '(empty)' |
	cat <(
		echo "Subject: RES list-sessions"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

# cron @daily
watch-containers:
	@docker stats \
		--all \
		--no-stream \
		--format "table
			<tr>
			<td style='white-space: nowrap'>{{.ID}}
			<td style='white-space: nowrap'>{{.Name}}
			<td style='white-space: nowrap'>{{.CPUPerc}}
			<td style='white-space: nowrap'>{{.MemUsage}}
			<td style='white-space: nowrap'>{{.MemPerc}}
			<td style='white-space: nowrap'>{{.NetIO}}
			<td style='white-space: nowrap'>{{.BlockIO}}
			<td style='white-space: nowrap'>{{.PIDs}}
		" |
	cat <(
		echo "Subject: RES watch-containers"
		echo "From: RES <system@feedsubscription.com>"
		echo "Content-Type: text/html"
		echo ""
		echo "<table border="1" cellspacing="0" cellpadding="3">"
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

# cron 59 23 * * *
404-report:
	@grep -P "^`date +%F`.+\" 404 \d+ \"https://feedsubscription.com/" .tmp/logs/feedsubscription/website.log |
	sed -E -e 's/^\S+ \S+ \S+ //' |
	grep -v -E -s 'GET /(robots.txt|favicon.ico|.git|.env|.well-known|.vscode|info.php|sitemap.xml)' |
	grep -v -E -s 'Googlebot' |
	ifne -n echo '(empty)' |
	cat <( \
		echo "Subject: RES 404-report"; \
		echo "From: RES <system@feedsubscription.com>"; \
		echo; \
	) - |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

deno-notes:
	# Sat Dec 24 16:36:11 EET 2022
	# Gave Deno a quick shot
	# 1. fix imports:
	#     ls -1 src/**/*.ts | xargs sed -i -E -e "s/(import .* '\.[^']+).*/\1.ts';/" -e "s/(import .* ')([^.]+[^']+).*/\1npm:\2/" -e "s/(^} from '\.[^']+).*/\1.ts';/" -e "s|npm:node:|https://deno.land/std@0.170.0/node/|; s/(.+deno.land.+)';/\1.ts';/"
	#
	# 2. try running and fix everthing else:
	#     deno run -A --config tsconfig.json src/app/cron.ts # -- worked with a few fixes
	#     deno run -A --config tsconfig.json src/api/server.ts # -- failed because session-file-store
	#
	# Easy fixes: process.env, process.exit, process.argv, process.on

# cron @daily
unique-ips-report:
	@zcat -f .tmp/logs/feedsubscription/website.log* |
	grep -vF '[error]' | # skip error records
	grep -vP ' "[^"]+" \d+ \d+ "[^"]+" "[^"]*([Bb]ot|nmap).*"' | # skip bots
	grep -P ' "GET [^"]+" 200 ' | # only GET 200
	cut -d' ' -f4 | # ip
	sort -u |
	wc -l |
	cat <( \
		echo "Subject: RES unique-ips-report"; \
		echo "From: RES <system@feedsubscription.com>"; \
		echo; \
	) - |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

# brew install goaccess
# geoip comes from https://www.maxmind.com/en/accounts/852003/geoip/downloads
access-report: rsync-logs bot-list.txt
	bot_list_re="($$(cat bot-list.txt | paste -sd '|'))"

	zcat -f .tmp/logs/feedsubscription/website.log* |
	grep -vPi ".*$$bot_list_re.*" | # exclude some bots
	cut -d ' ' -f 4- |
	grep -P '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}' | # rows that start with an IP
	grep -P '"GET /web-ui-scripts/web-ui/navbar.js HTTP/(1.1|2.0)" 200 \d+ "https://feedsubscription.com' | # greater probability of being a REAL user browser
	goaccess \
		-o .goaccess/report.html \
		--keep-last $${DAYS:-90} \
		--ignore-crawlers --unknowns-as-crawlers \
		--ignore-panel HOSTS \
		--ignore-panel ASN \
		--exclude-ip 95.65.96.65 \
		--exclude-ip 212.56.195.182 \
		--geoip-database .goaccess/GeoLite2-Country.mmdb \
		--log-format=COMBINED -
	open .goaccess/report.html

# cron 59 23 * * *
tracking-report: bot-list.txt
	@function url_decode {
		while read line; do
			line=$${line//%/\\x}
			line=$${line//+/ }
			echo -e $$line
		done
	}

	function debug_piepeline {
		if [ -v DEBUG ]; then
			tee /dev/stderr
		else
			cat
		fi
	}

	function debug_log() {
		local message=$$1

		if [ -v DEBUG ]; then
			echo "++ DEBUG $$message" > /dev/stderr
		fi
	}

	bot_list_re="($$(cat bot-list.txt | paste -sd '|'))"
	debug_log "bot_list_re: $$bot_list_re"

	date=$${DATE:-`date +%F`}
	debug_log "date: $$date"

	ls -t1r .tmp/logs/feedsubscription/website.log* |
	xargs zcat -f |
	grep -P "^$$date" |
	grep -vPi ".*$$bot_list_re.*" | # exclude some bots
	grep -vP ': (95.65.96.65) ' | # exclude some IPs
	grep -vP ': 40\.9[2-4]\.\d+\.\d+ - - ' | # exclude Office 365 IP ranges mail.protection.outlook.com 40.92.0.0/15
	grep -vF ' "https://feedsubscription.com/dW5zdWJzY3?id=' | # exclude reqs w/ obfuscated referrer, cause they ain’t humans
	grep -vF ' "https://feedsubscription.com/?from=fzbvy-abbgfe' | # exclude reqs w/ obfuscated referrer, cause they ain’t humans
	grep -P "(?<=GET /track\?data=)\S+" |
	cut --delimiter=' ' --fields=1,4,10,14 | # select: timestamp, ip, request, referrer
	sed \
		-e 's|/track?data=||' \
		-e 's|https://feedsubscription.com||' \
		-e 's|https://www.feedsubscription.com||' \
		-e 's/00:00 //' \
		-e "s/^$${date}T//" \
	| # remove noise
	url_decode |
	grep -v '"vid":"vlad"' | # exclude myself
	grep -v '"referrer":"http://baidu.com/"' | # baidu crawler?
	(
		tee \
			>( wc -l | ts "total events" ) \
			>( grep -Po '(?<="vid":")[^"]+' | sort -u | wc -l | ts "uniq vids" ) \
			>( grep -Po '(?<="referrer":)".*?"' | grep -vE '^"/' | sort | uniq -c | ts "referrer") \
			>( grep -Po '(?<="vid":")[^"]+' | sort | uniq -c ) \
			>( grep -Po '(?<="tid":")[^"]+' | sort | ts "click" | uniq -c ) \
			>( grep -Po '(?<="tid":")(b-homepage-create-account|l-(free|ppu)-link)' | sort | ts "click" | uniq -c ) \
			>( grep -Po '(?<="event":")[^"]+' | sort | uniq -c )
	) 2>&1 |
	cat <(
		echo "Subject: RES tracking-report $$date"
		echo "From: RES <system@feedsubscription.com>"
		echo
	) - |
	if [ -t 1 ] || [ -v MAKE_DEBUG ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

bot-list.txt: .tmp/logs/feedsubscription/website.log*
	@base_re='\w*(bot|crawler|spider)\w*'

	zcat -f $^ |
	grep -Eoi '" [0-9]+ [0-9]+ ".*'"$$base_re" | # only lines with something-BOT-something in the UA string (or referrer)
	grep -Eoi "$$base_re" |
	cat <(
		# Known non-humans
		echo "Chrome-Lighthouse"
		echo "Google-InspectionTool"
		echo "GoogleImageProxy"
		echo "HeadlessChrome"
		echo "scaninfo@paloaltonetworks.com"
		echo "Feedly"
		echo "Go-http-client"
		echo "Nmap Scripting Engine"
		echo "facebookexternalhit"
		echo "facebookcatalog"
		echo "YahooMailProxy"
		echo "InternetMeasurement"
		echo "zgrab"
		echo "baidu.com"
		echo "CFNetwork"
	) - |
	sort --unique --ignore-case > $@

# cron @reboot
ufw-config:
	# This is necessary for the app and api containers to be able to
	# access host’s external IP, which is needed when checking our own RSS
	# feed.

	ufw allow 80/tcp
	ufw allow 443/tcp

delivery-duration:
	@echo $${DELIVERY_DIR:?Missing envar}

	ls -1 "$$DELIVERY_DIR"/*/*.json | wc -l | ts 'items:'

	jq -r '.logRecords[].timestamp' "$$DELIVERY_DIR"/*/*.json |
	sort -u |
	(
		tee \
			>( head -1 | ts 'begin:' > /dev/stderr ) \
			>( tail -1 | ts 'end:  ' > /dev/stderr )
	) > /dev/null

# #auth #users #logge
logins-in-last-month:
	@from_date="$$(date '+%F' --date='1 month ago')T00:00:00+00:00"

	zcat -f .tmp/logs/feedsubscription/api.log* |
	grep '"User logged in"' |
	while read timestamp _1 _2 json; do
		if [[ "$$timestamp" > "$$from_date" ]]; then
			jq -r .data.email <<<"$$json";
		fi;
	done |
	sort -u |
	grep -vE '(gurdiga|woffca)' |
	tee >(
		wc -l | ts "
		total:"
	)

# run weekly in dev env
docker-image-check:
	@yq -r '.services[].image' docker-compose.yml |
	sort -u |
	if [ -v ONLY ]; then
		grep -E "$${ONLY}";
	elif [ -v SKIP ]; then
		grep -vE "$${SKIP}";
	else
		cat;
	fi |
	while read image; do
		echo "====================== $$image ======================"

		if ! docker scout cves --exit-code "$$image"; then
			exit 1
		fi
	done

all-images: app certbot delmon logger smtp-in smtp-out website resolver

user-list:
	@counter=1
	ls -1t .tmp/docker-data/accounts/*/account.json |
	while read account_json; do
		if ! jq --exit-status .confirmationTimestamp $$account_json > /dev/null; then
			continue
		fi

		dir=$$(dirname $$account_json)

		if ! ls $$dir/feeds/*/deliveries/* &> /dev/null; then continue; fi;

		account_id=$$(basename $$dir)

		skip_accounts="
			5a7c0ad6adc03c53b13a5903535c79df8aa0d3706bb9a60a1408331bab7abd30 gurdiga@gmail.com
		"

		if grep -F "$$account_id" <<<"$$skip_accounts" > /dev/null; then continue; fi

		jq -r \
			--arg counter "$$counter" \
			--arg account_id "$$account_id" \
			'. | [$$counter, .confirmationTimestamp, .email, $$account_id] | @tsv' \
			$$account_json

		ls -1 $$dir/feeds |
		while read feed; do
			if ! ls $$dir/feeds/$$feed/deliveries/* &> /dev/null; then continue; fi

			delivery_count=$$(ls -1 $$dir/feeds/$$feed/deliveries | wc -l)
			last_delivery_date=$$(ls -1t $$dir/feeds/$$feed/deliveries | head -1 | cut -d'-' -f1)
			last_delivery_date_pretty=$$(/bin/date -jf '%Y%m%d' '+%Y-%m-%d' $$last_delivery_date)

			echo "$$feed: $$delivery_count $$last_delivery_date_pretty"
		done

		counter=$$((counter+1))

		echo
	done

docker-registry:
	docker run --detach -p 127.0.0.1:5000:5000 --restart=always --name registry registry:2

update-docker-scout:
	@latest_tag=$$(curl --silent https://api.github.com/repos/docker/scout-cli/tags | jq -r '.[].name' | sort | tail -1)
	echo "latest_tag: $$latest_tag"

	export DOCKER_HOME=/Applications/Docker.app/Contents/Resources
	echo "installing to $$DOCKER_HOME"

	curl -sSfL https://raw.githubusercontent.com/docker/scout-cli/$$latest_tag/install.sh | sudo sh -s --

decode-ua:
	@: $${UA:?Missing envar}

	node -p 'require("ua-parser-js")(process.env.UA)'

hash-email:
	@: $${FEED_ID:?Missing envar} $${EMAIL:?Missing envar}

	feed_hashing_salt=$$(jq -r .hashingSalt .tmp/docker-data/accounts/*/feeds/$$FEED_ID/feed.json)

	if [ -z "$$feed_hashing_salt" ]; then
		echo -e "\n${ERROR}Feed not found?\n"
		exit 1
	fi

	echo "feed_hashing_salt: $$feed_hashing_salt"
	echo "email: $$EMAIL"

	ts-node -pe "import {hash} from './src/shared/crypto'; hash('$$EMAIL', '$$feed_hashing_salt')"

# cron @weekly
purge-demo-feeds:
	@: quiet
	grep -l .tmp/docker-data/accounts/*/account.json -e '"email": "demo@feedsubscription.com",' |
	xargs --no-run-if-empty dirname |
	xargs --no-run-if-empty -I{} rm -rfv {}/feeds |
	sed 's|.tmp/docker-data/accounts/fe95d2f305d7ba5dcd955a9f2083d7faab76e42d98f52d2e6583380c4600cd0e/||' |
	ifne -n echo '(empty)' |
	cat <( \
		echo "Subject: RES purge-demo-feeds"; \
		echo "From: RES <system@feedsubscription.com>"; \
		echo; \
	) - |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

show-certificate-date:
	echo | openssl s_client -connect feedsubscription.com:443 | openssl x509 -noout -dates

extend-trial:
	@: quiet
	: $${SUB_ID:?Missing envar as sub_longBlahBlah}
	: $${TRIAL_END:?Missing envar as %F date string}

	trial_end_timestamp=`date -d "$${TRIAL_END}T00:00:00+00:00" +"%s"`

	curl https://api.stripe.com/v1/subscriptions/$$SUB_ID \
		-u $$STRIPE_SECRET_KEY: \
		-d "trial_end"="$$trial_end_timestamp" \
		-d "metadata[extended_trial_on]"="`date`"

# This presumes the local app running the latest code, and will compare
# the bundle with the prod version.
check-for-bundle-change:
	@set -euo pipefail
	wget \
		https://feedsubscription.com/web-ui-scripts/web-ui/subscription-form.js \
		https://localhost.feedsubscription.com/web-ui-scripts/web-ui/subscription-form.js

	diff -u subscription-form.js* | ifne -n echo -e '\n✅ No change in the output bundle.\n'

	rm subscription-form.js*

esbundle-upgrade-check: check-for-bundle-change

gurdiga-com-visits-per-month:
	@bot_list_re="($$(cat bot-list.txt | paste -sd '|'))"

	zcat -f .tmp/logs/feedsubscription/website.log* |
	grep -P '"GET /web-ui-scripts/web-ui/subscription-form.js HTTP/(1.1|2.0)" 200 \d+ "https://gurdiga.com' |
	grep -vPi ".*$$bot_list_re.*" |
	grep -Po '\d{4}-\d{2}' |
	sort |
	uniq -c

# NOTE: This exists because some of *.olc.protection.outlook.com fail to
# resolve as per dnsmasq.log:
#
# dnsmasq[1]: query[A] hotmail-com.olc.protection.outlook.com from 10.5.5.9
# dnsmasq[1]: forwarded hotmail-com.olc.protection.outlook.com to 8.8.8.8
# dnsmasq[1]: reply hotmail-com.olc.protection.outlook.com is NODATA-IPv4
#
# The output is to be appended to ./.tmp/resolver/etc/hosts
# NOTE: Run `docker restart resolver` for the update to take effect
resolver-hosts:
	@: quiet

	domains='
		outlook-com.olc.protection.outlook.com
		hotmail-com.olc.protection.outlook.com
		live-com.olc.protection.outlook.com
	'

	for domain in $$domains; do
		host -4T $$domain |
		cut -d' ' -f4 |
		sed "s/$$/\t"$$domain"/"
	done

# cron @daily
open-ports-report:
	@: quiet
	netstat -tnlp |
	sort |
	tee >(
		grep '^tcp' |
		wc -l | ts "
		total:"
	) |
	cat <(
		echo "Subject: RES open-ports-report"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

compare-subscription-form-bundle-after-esbundle-update:
	@(
		set -euo pipefail
		wget \
			https://feedsubscription.com/web-ui-scripts/web-ui/subscription-form.js \
			https://localhost.feedsubscription.com/web-ui-scripts/web-ui/subscription-form.js && \
		diff -u subscription-form.js* |&
		ifne -n echo '✅ No change in the bundle'
	)

	echo
	rm -fv ./subscription-form.js*
	echo

# Helper functions

define include_log_to
	function log_to() {
		local log_file=$$1

		ts '%Y-%m-%dT%T%z' |
		tee --append "$$log_file"
	}

	export -f log_to
endef

# cron @monthly
archive-old-deliveries:
	@set -euo pipefail

	# When run on Jan 1, we’ll get Nov
	month=$${MONTH:-`date --date='32 days ago' +%Y%m`}

	find .tmp/docker-data/accounts/*/feeds/*/deliveries -type d -name "$$month*" |
	sort |
	while read dir; do
		echo "$${dir/.tmp\/docker-data\/accounts\/''}"
		tar czf "$$dir.tgz" "$$dir" && printf "...archived" || printf "...failed"
		rm -rf "$$dir" && printf "...deleted" || printf "...failed"
		echo ""
	done |
	cat <(
		echo "Subject: RES $@"
		echo "From: RES <system@feedsubscription.com>"
		echo ""
		echo "month $$month"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

rsync-certbot:
	rsync -avz root@feedsubscription.com:src/rss-email-subscription/.tmp/certbot/ .tmp/certbot/
