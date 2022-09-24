#!/bin/bash

set -euo pipefail

BASE_URL=https://localhost.feedsubscription.com
EMAIL=test@gmail.com
# echo -n "${EMAIL}${FEED_HASHING_SALT}" | sha256sum
EMAIL_HASH=ea7f63853ce24fe12963ea07fd5f363dc2292f882f268c1b8f605076c672b4e9
FEED_ID=gurdiga
EMAIL_DATA_FILE=$DATA_DIR_ROOT/$FEED_ID/emails.json

function main {
	create_account
	create_account_verify
	unsubscribe
	unsubscribe_verify
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
	web_ui_scripts
	verify_allows_embedding_js
	verify_has_cors_enabled
}

function post {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body -X POST $BASE_URL"$@"
}

function get {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body $BASE_URL"$@"
}

function get_headers {
	# shellcheck disable=SC2145
	curl -ks --head $BASE_URL"$@"
}

ACCOUNT_PLAN=standard
ACCOUNT_EMAIL=blogger@test.com

function create_account {
	if post /create-account -d plan=$ACCOUNT_PLAN -d email=$ACCOUNT_EMAIL -d password=A-long-S3cre7-password; then
		print_success
	else
		print_failure "POST /create-account failed: exit code $?"
	fi
}

function create_account_verify {
	account_file=$(
		find "$DATA_DIR_ROOT/accounts" -name account.json |
			while read -r account_file_path; do
				if grep "\"email\":\"$ACCOUNT_EMAIL\"" "$account_file_path" >/dev/null; then
					echo "$account_file_path"
				fi
			done
	)

	file_count=$(wc -l <<<"$account_file")

	if [ "$file_count" -eq "0" ]; then
		print_failure "Account file not found"
	elif [ "$file_count" -gt "1" ]; then
		print_failure "Found more than one account files with for $ACCOUNT_EMAIL"
	fi

	snapshot='{"plan":"standard","email":"blogger@test.com","passwordHash":".+"}'

	if grep -E "$snapshot" "$account_file" >/dev/null; then
		print_success
	else
		echo -e "Expected: '$snapshot'\n"
		echo -e "Actual: '$(cat "$account_file")'\n"

		print_failure 'Account file contents does not match'
	fi

	rm -vfr "$(dirname "$account_file")"
}

function subscribe {
	if post /subscribe -d feedId=$FEED_ID -d email=$EMAIL; then
		print_success
	else
		print_failure "POST /subscribe failed: exit code $?"
	fi
}

function subscribe_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == false)" "$EMAIL_DATA_FILE"; then
		print_success
	else
		jq . "$EMAIL_DATA_FILE"
		print_failure "Email not saved in emails.json? ☝️🤔"
		exit 1
	fi
}

function confirm {
	if post /confirm-subscription -d id=$FEED_ID-$EMAIL_HASH; then
		print_success
	else
		print_failure "POST /confirm-subscription failed: exit code $?"
	fi
}

function confirm_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == true)" "$EMAIL_DATA_FILE"; then
		print_success
	else
		print_failure "Email does not have isConfirmed of true in emails.json"
		jq .$EMAIL_HASH "$EMAIL_DATA_FILE"
		exit 1
	fi
}

function unsubscribe {
	if post /unsubscribe -d id=$FEED_ID-$EMAIL_HASH; then
		print_success
	else
		print_failure "POST /unsubscribe failed: exit code $?"
	fi
}

function unsubscribe_verify {
	if jq --exit-status ".$EMAIL_HASH" "$EMAIL_DATA_FILE"; then
		print_failure "Email not removed from emails.json"
		jq . "$EMAIL_DATA_FILE"
		exit 1
	else
		print_success
	fi
}

function unsubscribe_1click {
	if post /unsubscribe/$FEED_ID-$EMAIL_HASH -d List-Unsubscribe=One-Click; then
		print_success
	else
		print_failure "POST /unsubscribe failed: exit code $?"
	fi
}

function resubscribe_failure_verify {
	if diff -u \
		<(post /subscribe -d feedId=$FEED_ID -d email=$EMAIL) \
		<(printf '{"kind":"InputError","message":"Email is already subscribed"}'); then
		print_success
	else
		print_failure
	fi
}

function unsubscribe_failure_verify {
	if diff -u \
		<(post /unsubscribe -d id=$FEED_ID-$EMAIL_HASH) \
		<(printf '{"kind":"Success","message":"Solidly unsubscribed."}'); then
		print_success
	else
		print_failure
	fi
}

function web_ui_scripts {
	if get /web-ui-scripts/web-ui/confirm-unsubscribe.js | head -5; then
		print_success
	else
		print_failure
	fi
}

function assert_header {
	local url="$1"
	local header="$2"

	if get_headers "$url" | grep "$header"; then
		print_success
	else
		print_failure "Header missing? \"$header\""
	fi
}

function verify_allows_embedding_js {
	assert_header /web-ui-scripts/web-ui/registration-form.js 'cross-origin-resource-policy: cross-origin'
}

function verify_has_cors_enabled {
	assert_header /subscribe 'access-control-allow-origin: *'
}

RED="\e[31m"
GREEN="\e[32m"
YELLOW="\e[33m"
ENDCOLOR="\e[0m"

function print_success {
	printf "\n${GREEN}%s${ENDCOLOR}\n\n" OK
}

function print_failure {
	local caller_name="${FUNCNAME[1]}"
	local prefix="${RED}FAILURE in $caller_name${ENDCOLOR}"

	if test -z "$@"; then
		# shellcheck disable=SC2059
		printf "$prefix\n\n"
	else
		printf "\n$prefix: ${YELLOW}%s${ENDCOLOR}\n\n" "$@"
	fi

	exit 1
}

main
