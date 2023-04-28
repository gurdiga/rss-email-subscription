# .ONESHELL only works for GNU Make 3.82+
.ONESHELL:

SHELL = bash
TIME=gtime -f '%e'

default: pre-commit

# make start-testblog first
testblog-local-test:
	@require=$${DATA_DIR_ROOT:?envar is missing}

	# This is necessary when sending through prod smtp-in
	export DOMAIN_NAME=feedsubscription.com

	rm -v $$DATA_DIR_ROOT/accounts/da772874f7963b4612ec6c59005c7fbe1b0264302a501568cfed1e5035080ef5/feeds/testblog/lastPostMetadata.json
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking testblog
	node_modules/.bin/ts-node src/app/cron-cli.ts email-sending testblog

email-sending:
	node_modules/.bin/ts-node src/app/cron-cli.ts email-sending testblog

rss-checking:
	@require=$${DATA_DIR_ROOT:?envar is missing}
	rm -v $$DATA_DIR_ROOT/accounts/da772874f7963b4612ec6c59005c7fbe1b0264302a501568cfed1e5035080ef5/feeds/{gurdiga,testblog,blogger}/lastPostMetadata.json

	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking testblog
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking gurdiga
	node_modules/.bin/ts-node src/app/cron-cli.ts rss-checking blogger

test:
	node_modules/.bin/ts-mocha -R dot 'src/**/*.spec.ts'

test-quiet:
	@printf "Test... "
	$(TIME) $(MAKE) test > /dev/null

t: test

tw:
	node_modules/.bin/ts-mocha -R dot --watch --watch-files src 'src/**/*.spec.ts'

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
	node_modules/.bin/tsc --project tsconfig.json --watch

pre-commit: lint-quiet compile-quiet test-quiet format-check-quiet
pc: pre-commit

lint: lint-mocha-only lint-require-strict-interpolation lint-docker-compose lint-dockerfile lint-shell-scripts lint-nginx-config
l: lint

lint-quiet:
	@printf "Lint... "
	$(TIME) $(MAKE) lint > /dev/null

# docker cp website:/etc/nginx/nginx.conf website/nginx/ # plus, comment out irrelevant pieces
# sudo cp -r ./.tmp/certbot/conf/live/feedsubscription.com /etc/letsencrypt/live/
lint-nginx-config:
	nginx -q -t -c `pwd`/website/nginx/nginx.conf

lint-docker-compose:
	docker-compose --file docker-compose.yml config

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
	xargs	grep --line-number --color=always -P '(?<!si)`[^;\]), ]' |
	tee /dev/stderr | ifne false

smtp-test:
	node_modules/.bin/ts-node src/app/email-sending/email-delivery.slow-test.ts

app:
	@function log_to() {
		local log_file=$$1

		ts '%Y-%m-%dT%T%z' |
		tee --append "$$log_file"
	}

	docker buildx build \
		--progress=plain \
		--tag app \
		-f docker-services/app/Dockerfile \
		. |&
	log_to .tmp/logs/feedsubscription/docker-build-app.log

delmon: app
	docker buildx build \
		--progress=plain \
		--tag delmon \
		docker-services/delmon

logger:
	docker buildx build \
		--progress=plain \
		--tag logger \
		docker-services/logger

logger-list-packages:
	docker exec -it logger apk list -a |
	grep -P "^(syslog-ng|logrotate|tini)-\d"

smtp-out:
	docker buildx build \
		--progress=plain \
		--tag smtp-out \
		docker-services/smtp-out

smtp-in:
	source .env
	docker buildx build \
		--no-cache \
	 	--build-arg SASL_PASSWORD="$${SMTP_IN_SASL_PASSWORD:?envar is missing}"\
		--progress=plain \
		--tag smtp-in \
		docker-services/smtp-in

# cron @reboot
start:
	docker-compose --project-name res up --remove-orphans --detach

start-app: app
	docker-compose --project-name res up --remove-orphans --detach \
		-- app

start-delmon: delmon
	docker-compose --project-name res up --remove-orphans --detach \
		-- delmon

start-logger: logger
	docker-compose --project-name res up --remove-orphans --detach \
		-- logger

start-api: website app
	export NODE_ENV="production"
	docker-compose --project-name res up --remove-orphans --force-recreate \
		-- logger website api > /dev/null &
	sleep 1
	docker-compose --project-name res logs --follow --since 10s --timestamps &
	wait

start-website: website start-api

start-testblog:
	@echo 'Run this:'
	echo '  cd ~/tmp/testblog'
	echo '  make start'

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
		echo "From: RES <reload-website@feedsubscription.com>"; \
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

# NOTE: Eleventy manages the website’s /dist/, so I’m puting the compiled
# scrips in its src/web-ui-scripts/ and let it take it from there. If I put
# them directly in /dist/, Eleventy removes them as extraneous.
WEB_UI_DEST_DIR=$(DOCUMENT_ROOT)/../src/web-ui-scripts/

web-ui-systemjs:
	mkdir -p $(WEB_UI_DEST_DIR)
	cp --target-directory=$(WEB_UI_DEST_DIR) \
		./node_modules/systemjs/dist/system.min.js* \
		./src/web-ui/systemjs-resolve-patch.js

web-ui:
	node_modules/.bin/tsc --project src/web-ui/tsconfig.json

web-ui-watch: web-ui-systemjs
	node_modules/.bin/tsc --watch --project src/web-ui/tsconfig.json --outDir $(WEB_UI_DEST_DIR) &

start-dev: web-ui-watch
	node_modules/.bin/nodemon src/api/server.ts

api-test:
	node_modules/.bin/ts-mocha --bail -R dot api-test.spec.ts

snyk:
	snyk test

# cron @reboot
watch-app:
	@function handle_ENOTFOUND {
		while read -r _getaddrinfo _ENOTFOUND server_name; do
			echo -e "\nserver_name: $$server_name\n"
			echo -e "Trying to resolve...\n"
			nslookup $$server_name
		done
	}

	tail -n0 --follow=name --retry .tmp/logs/feedsubscription/{app,api}.log |
	grep --line-buffered -E \
			-e '"severity":"(error|warning)"' \
			-e '"message":"Starting (cron|API server)' \
			-e '"message":"Sending report"' \
			-e '"message":"Blog RSS check"' \
			-e '"message":"(New unconfirmed subscriber|Subscriber confirmed email)"' \
			-e '"message":"(New feed added|Feed updated|Feed deleted)"' \
			-e '"message":"(Unsubscribed)"' \
			-e '"message":"(User registered|User confirmed registration|User logged in|Account deleted)"' \
		|
	while read -r _skip_timestamp _skip_namespace container_name_and_id json; do
		(
			container_name=$$(grep -Po '^[^[]+' <<<"$$container_name_and_id")
			severity=$$(jq -r .severity <<<"$$json")
			message=$$(jq -r .message <<<"$$json")
			reason=$$(jq -r .data.reason <<<"$$json")

			echo "Subject: RES $$container_name $$severity: $$message"
			echo "From: RES <watch-app@feedsubscription.com>"
			echo
			jq . <<<"$$json"

			if [[ $$reason == "getaddrinfo ENOTFOUND"* ]]; then handle_ENOTFOUND <<<"$$reason"; fi
		) |
		if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi;
	done \
	& disown

# cron @reboot
watch-website:
	@function url_decode {
		sed 's@+@ @g;s@%@\\x@g' |
		xargs -0 printf "%b"
	}

	tail -n0 --follow=name --retry .tmp/logs/feedsubscription/website.log |
	grep --line-buffered -F \
			-e 'GET /error?stack=' \
		|
	while read -r timestamp _2 _3 client_ip _5 _6 _7 _8 _9 url _11 _12 _13 referer rest; do
		(
			echo "Subject: RES website error-log"
			echo "From: watch-website@feedsubscription.com"; `# needs FromLineOverride=YES in /etc/ssmtp/ssmtp.conf`
			echo ""
			echo "User-Agent: $$rest"
			echo "Client IP: $$client_ip"
			echo "$$referer"
			echo "$$timestamp"
			echo "$$url" | url_decode | sed 's/^/    /'
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
			echo "From: RES <watch-smtp-out@feedsubscription.com>"
			echo ""
			echo "$$rest"

			if [[ "$$rest" =~ ^.*no\ MX\ host\ for\ ([-a-z.]+).*$$ ]]; then
				domain=$${BASH_REMATCH[1]}

				echo "--- DEBUG: google.com from host"
				nslookup google.com

				echo "--- DEBUG: A record from host"
				nslookup "$$domain"

				echo "--- DEBUG: MX record from host"
				nslookup -query=mx "$$domain"

				echo "--- DEBUG: A record from inside container"
				docker exec smtp-out nslookup "$$domain"

				echo "--- DEBUG: MX record from inside container"
				docker exec smtp-out nslookup -query=mx "$$domain"
			fi
		) |
		if [ -t 1 ]; then cat; else sleep 1m; ifne ssmtp gurdiga@gmail.com; fi
	done \
	& disown

# cron @reboot
watch-delmon:
	@tail -n0 --follow=name --retry .tmp/logs/feedsubscription/delmon.log |
	while read -r _skip_timestamp _skip_namespace container_name_and_id json; do
		(
			container_name=$$(grep -Po '^[^[]+' <<<"$$container_name_and_id")
			severity=$$(jq -r .severity <<<"$$json")
			message=$$(jq -r .message <<<"$$json")

			echo "Subject: RES $$container_name $$severity"
			echo "From: RES <watch-delmon@feedsubscription.com>"
			echo

			jq . <<<"$$json"
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
	docker exec --interactive app node dist/app/delivery-monitoring

# cron @daily
list-qid-index:
	@source .env
	require=$${DATA_DIR_ROOT:?envar is missing}

	ls -l $$DATA_DIR_ROOT/qid-index |
	grep -v "^total " |
	cat <(
		echo "Subject: RES list-qid-index"
		echo "From: RES <list-qid-index@feedsubscription.com>"
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
		echo "From: RES <backup@feedsubscription.com>"
		echo ""
		echo "$$DATA_DESTINATION"
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

	rm $$DATA_ARCHIVE

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

format-check-quiet:
	@printf "Format check... "
	$(TIME) $(MAKE) format-check > /dev/null

clean:
	rm -rf website/html/ src/api/web-ui-scripts/ dist/

clean-docker: stop
	docker image rm --force app

init-data-dir:
	@require=$${DATA_DIR_ROOT:?envar is missing}

	set -e
	mkdir $$DATA_DIR_ROOT/feeds
	mkdir $$DATA_DIR_ROOT/accounts
	echo "Initialized data dir: $$DATA_DIR_ROOT"

rsync-logs:
	rsync -avz root@feedsubscription.com:src/rss-email-subscription/.tmp/logs/ .tmp/logs/

sent-count: rsync-logs
	@gzcat -f .tmp/logs/feedsubscription/app.log* |
	grep '"Sending report"' |
	cut -d ' ' -f 4- | # skip timestamps and stuff to get to the JSON record
	jq -s 'map(.data.report.sent) | add' |
	numfmt --grouping

# cron @monthly
prune-docker-images:
	@docker image prune --force |
	cat <( \
		echo "Subject: RES prune-docker-images"; \
		echo "From: RES <prune-docker-images@feedsubscription.com>"; \
		echo; \
	) - \
	| if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

git-pre-commit-hook:
	echo "#!/bin/sh" > .git/hooks/pre-commit
	echo "" >> .git/hooks/pre-commit
	echo "bash -i -c 'make pre-commit'" >> .git/hooks/pre-commit

# cron @daily
list-sessions:
	@source .env
	require=$${DATA_DIR_ROOT:?envar is missing}

	ls -l $$DATA_DIR_ROOT/sessions |
	grep -v "^total " |
	cat <(
		echo "Subject: RES list-sessions"
		echo "From: RES <list-sessions@feedsubscription.com>"
		echo ""
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

# cron @daily
wathc-containers:
	@docker stats --all --no-stream |
	cat <( \
		echo "Subject: RES wathc-containers"; \
		echo "From: RES <wathc-containers@feedsubscription.com>"; \
		echo; \
	) - |
	if [ -t 1 ]; then cat; else ssmtp gurdiga@gmail.com; fi

# cron 59 23 * * *
404-report:
	@grep -P "^`date +%F`.+\" 404 \d+ \"https://feedsubscription.com/" .tmp/logs/feedsubscription/website.log |
	sed -E -e 's/^\S+ \S+ \S+ //' |
	grep -v -E -s 'GET /(robots.txt|favicon.ico|.git|.env|.well-known|.vscode|info.php|sitemap.xml)' |
	cat <( \
		echo "Subject: RES 404-report"; \
		echo "From: RES <404-report@feedsubscription.com>"; \
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
		echo "From: RES <unique-ips-report@feedsubscription.com>"; \
		echo; \
	) - |
	if [ -t 1 ]; then cat; else ifne ssmtp gurdiga@gmail.com; fi

# brew install goaccess
# geoip comes from https://www.maxmind.com/en/accounts/852003/geoip/downloads
access-report: rsync-logs
	zcat -f .tmp/logs/feedsubscription/website.log* |
	cut -d ' ' -f 4- |
	grep -P '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}' | # rows that start with an IP
	goaccess \
		-o .goaccess/report.html \
		--keep-last $${DAYS:-90} \
		--ignore-crawlers --unknowns-as-crawlers \
		--hide-referrer *feedsubscription.com \
		--hide-referrer feedsubscription.com. \
		--hide-referrer feedsubscription.com:80 \
		--hide-referrer 207.154.253.211 \
		--hide-referrer 207.154.253.211:80 \
		--hide-referrer 207.154.253.211:443 \
		--ignore-panel HOSTS \
		--ignore-panel ASN \
		--exclude-ip 95.65.96.65 \
		--geoip-database .goaccess/GeoLite2-Country.mmdb \
		--log-format=COMBINED -
	open .goaccess/report.html
