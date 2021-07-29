default: data/emails.json

run-email-sending:
	ts-node src/email-sending/main.ts data/

run-rss-checking:
	ts-node src/rss-checking/main.ts data/

data: data/feed.json data/emails.json

data/feed.json:
	echo '{"url": "http://localhost:4000/feed.xml", "hashingSalt": "1234567890123456"}' \
	> $@

.tmp/emails.csv:
	rm -f $@
	for email in a@test.com b@test.com c@test.com; do \
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
