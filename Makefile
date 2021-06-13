default: run

run:
	node src/main.js

test:
	mocha -R dot src/**/*.spec.js

edit:
	code -n .

e: edit

check:
	tsc -p tsconfig.json

c: check

pre-commit: check test
pc: pre-commit
