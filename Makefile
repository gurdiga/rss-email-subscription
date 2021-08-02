default: data/emails.json

run-email-sending:
	ts-node src/email-sending/main.ts data/

run-rss-checking:
	ts-node src/rss-checking/main.ts data/

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
	ts-node src/email-storing/main.ts data/

test:
	ts-mocha -R dot 'src/**/*.spec.ts'

t: test

tw:
	ts-mocha -R dot --watch --watch-files src 'src/**/*.spec.ts'

edit:
	code -n .

e: edit

check:
	tsc -p tsconfig.json

c: check
cw:
	tsc -p tsconfig.json --watch

pre-commit: check test
pc: pre-commit

# The required configuration is expected in the environment
smtp-test:
	ts-node src/email-sending/email-delivery.slow-test.ts


# TODO: Get this to send emails.
smtp:
	docker run --rm --name postfix \
		-v `pwd`/.tmp/opendkim-keys:/etc/opendkim/keys \
		-e "ALLOWED_SENDER_DOMAINS=gurdiga.com" \
		-e "DKIM_AUTOGENERATE=yes" \
		-p 1587:587 \
		boky/postfix

reset-last-post-timestamp:
	echo '{"lastPostTimestamp":"2021-01-12T16:05:00.000Z"}' > data/lastPostTimestamp.json
