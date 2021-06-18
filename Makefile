default: run

run:
	ts-node src/rss-checking/main.ts http://localhost:4000/feed.xml .

test:
	ts-mocha -R dot 'src/**/*.spec.ts'

w:
	ts-mocha -R dot --watch --watch-files src 'src/**/*.spec.ts'

edit:
	code -n .

e: edit

check:
	tsc -p tsconfig.json

c: check

pre-commit: check test
pc: pre-commit
