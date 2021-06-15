default: run

run:
	ts-node src/rss-checking.ts

test:
	ts-mocha -R dot src/**/*.spec.ts

w:
	ts-mocha -R dot --watch --watch-files src src/**/*.spec.ts

edit:
	code -n .

e: edit

check:
	tsc -p tsconfig.json

c: check

pre-commit: check test
pc: pre-commit
