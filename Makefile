default: run-email-sending

run-email-sending:
	ts-node src/email-sending/main.ts


run-rss-checking:
	ts-node src/rss-checking/main.ts http://localhost:4000/feed.xml data/

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
